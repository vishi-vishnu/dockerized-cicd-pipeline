import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'

let historyFile: string

beforeAll(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pulse-'))
  historyFile = path.join(dir, 'deployments.log')
  await writeFile(
    historyFile,
    [
      '{"time":"2026-10-14T09:00:00Z","tag":"sha-aaaaaaa","status":"success","previous":null}',
      '{"time":"2026-10-15T09:00:00Z","tag":"sha-bbbbbbb","status":"rolled_back","previous":"sha-aaaaaaa"}',
    ].join('\n'),
  )
})

function makeApp(file = historyFile) {
  return createApp(
    loadConfig({ APP_VERSION: '1.2.3', GIT_SHA: 'abc1234', APP_ENV: 'test', DEPLOY_HISTORY_FILE: file }),
  )
}

describe('GET /health', () => {
  it('reports ok with the running version and commit', async () => {
    const res = await request(makeApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok', version: '1.2.3', commit: 'abc1234' })
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })
})

describe('simulated bad release', () => {
  const env = { GIT_SHA: 'abc1234', SIMULATE_BAD_RELEASE: 'true' }

  it('still passes in CI, where APP_ENV is not production', async () => {
    const res = await request(createApp(loadConfig({ ...env, APP_ENV: 'ci' }))).get('/health')
    expect(res.status).toBe(200)
  })

  it('fails the health check on the production server', async () => {
    const res = await request(createApp(loadConfig({ ...env, APP_ENV: 'production' }))).get('/health')
    expect(res.status).toBe(503)
    expect(res.body.status).toBe('unhealthy')
  })
})

describe('GET /api/info', () => {
  it('describes the running build', async () => {
    const res = await request(makeApp()).get('/api/info')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Pulse', version: '1.2.3', environment: 'test' })
    expect(res.body.node).toMatch(/^v\d+/)
  })
})

describe('GET /api/deployments', () => {
  it('returns the history newest first', async () => {
    const res = await request(makeApp()).get('/api/deployments')
    expect(res.status).toBe(200)
    expect(res.body.map((d: { tag: string }) => d.tag)).toEqual(['sha-bbbbbbb', 'sha-aaaaaaa'])
    expect(res.body[0].status).toBe('rolled_back')
  })

  it('returns an empty list when no deploy has happened yet', async () => {
    const res = await request(makeApp('/no/such/file.log')).get('/api/deployments')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('answers 500 without leaking details when the file cannot be read', async () => {
    // A folder instead of a file makes readFile fail with EISDIR
    const res = await request(makeApp(os.tmpdir())).get('/api/deployments')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Something went wrong' })
  })
})

describe('GET /metrics', () => {
  it('counts requests in Prometheus format', async () => {
    const app = makeApp()
    await request(app).get('/health')
    await request(app).get('/health')
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.text).toContain('pulse_http_requests_total{method="GET",route="/health",status="200"} 2')
    expect(res.text).toContain('pulse_uptime_seconds')
  })
})

describe('pages and errors', () => {
  it('serves the status page with security headers', async () => {
    const res = await request(makeApp()).get('/')
    expect(res.status).toBe(200)
    expect(res.text).toContain('<h1>Pulse</h1>')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toContain("script-src 'self'")
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('answers unknown paths with a JSON 404', async () => {
    const res = await request(makeApp()).get('/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })
})
