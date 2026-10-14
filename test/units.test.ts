import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'
import { parseHistory } from '../src/deployments.ts'
import { Metrics } from '../src/metrics.ts'

describe('loadConfig', () => {
  it('uses safe defaults when nothing is set', () => {
    const c = loadConfig({})
    expect(c).toMatchObject({ port: 3000, version: 'dev', commit: 'local', environment: 'development' })
  })

  it('reads values from the environment', () => {
    expect(loadConfig({ PORT: '8080', APP_ENV: 'production' })).toMatchObject({ port: 8080, environment: 'production' })
  })
})

describe('parseHistory', () => {
  it('skips broken and incomplete lines', () => {
    const text = [
      '{"time":"t1","tag":"sha-1","status":"success","previous":""}',
      'not json',
      '{"time":"t2","tag":"sha-2"}',
      '{"time":"t3","tag":"sha-3","status":"exploded","previous":null}',
      '',
    ].join('\n')
    expect(parseHistory(text)).toEqual([{ time: 't1', tag: 'sha-1', status: 'success', previous: null }])
  })

  it('keeps only the newest entries', () => {
    const lines = Array.from({ length: 30 }, (_, i) => JSON.stringify({ time: `t${i}`, tag: `sha-${i}`, status: 'success', previous: null }))
    const result = parseHistory(lines.join('\n'), 5)
    expect(result).toHaveLength(5)
    expect(result[0]?.tag).toBe('sha-29')
  })
})

describe('Metrics', () => {
  it('adds up requests and reports uptime', () => {
    const m = new Metrics()
    m.record('GET', '/health', 200)
    m.record('GET', '/health', 200)
    m.record('GET', 'not_found', 404)
    expect(m.totalRequests()).toBe(3)
    expect(m.uptimeSeconds(m.startedAt.getTime() + 65_000)).toBe(65)
  })
})
