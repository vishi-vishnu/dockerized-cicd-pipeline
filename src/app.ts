import os from 'node:os'
import { fileURLToPath } from 'node:url'
import express, { type NextFunction, type Request, type Response } from 'express'
import type { Config } from './config.ts'
import { readHistory } from './deployments.ts'
import { Metrics } from './metrics.ts'

const publicDir = fileURLToPath(new URL('../public', import.meta.url))

export function createApp(config: Config, metrics = new Metrics()) {
  const app = express()
  app.disable('x-powered-by')

  // Basic security headers. The page loads its script from this server only.
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'",
    })
    next()
  })

  // Count every request once it has finished (method, route and status code).
  app.use((req, res, next) => {
    res.on('finish', () => {
      const route = req.route?.path ?? (res.statusCode === 404 ? 'not_found' : 'static')
      metrics.record(req.method, String(route), res.statusCode)
    })
    next()
  })

  // Used by Docker HEALTHCHECK, the deploy script and the pipeline.
  app.get('/health', (_req, res) => {
    // Demo only: a "bad release" passes CI but fails on the production server,
    // like a real release that is missing a production setting.
    if (config.simulateBadRelease && config.environment === 'production') {
      console.error(JSON.stringify({ level: 'error', message: 'health check failed: simulated bad release' }))
      res.status(503).json({ status: 'unhealthy', reason: 'simulated bad release', commit: config.commit })
      return
    }
    res.json({
      status: 'ok',
      version: config.version,
      commit: config.commit,
      uptimeSeconds: metrics.uptimeSeconds(),
    })
  })

  app.get('/api/info', (_req, res) => {
    res.json({
      name: 'Pulse',
      version: config.version,
      commit: config.commit,
      buildTime: config.buildTime,
      environment: config.environment,
      repoUrl: config.repoUrl,
      host: os.hostname(),
      node: process.version,
      startedAt: metrics.startedAt.toISOString(),
      uptimeSeconds: metrics.uptimeSeconds(),
      requestsServed: metrics.totalRequests(),
    })
  })

  app.get('/api/deployments', async (_req, res, next) => {
    try {
      res.json(await readHistory(config.historyFile))
    } catch (err) {
      next(err)
    }
  })

  app.get('/metrics', (_req, res) => {
    res.type('text/plain; version=0.0.4').send(metrics.toPrometheus())
  })

  app.use(express.static(publicDir, { maxAge: '1h', index: 'index.html' }))

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Never show stack traces to users; log them for CloudWatch instead.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(JSON.stringify({ level: 'error', message: err.message }))
    res.status(500).json({ error: 'Something went wrong' })
  })

  return app
}
