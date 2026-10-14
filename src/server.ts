import { createApp } from './app.ts'
import { loadConfig } from './config.ts'

const config = loadConfig()
const app = createApp(config)

const server = app.listen(config.port, () => {
  // One JSON line per event, easy to search in CloudWatch Logs.
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'server started',
      port: config.port,
      version: config.version,
      commit: config.commit,
      environment: config.environment,
    }),
  )
})

// `docker stop` sends SIGTERM. Finish the open requests, then exit cleanly.
function shutdown(signal: string) {
  console.log(JSON.stringify({ level: 'info', message: 'shutting down', signal }))
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
