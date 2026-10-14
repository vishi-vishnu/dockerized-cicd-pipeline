// All settings come from environment variables, so the same image runs anywhere.
// APP_VERSION, GIT_SHA and BUILD_TIME are baked into the image by the Dockerfile.
export interface Config {
  port: number
  version: string
  commit: string
  buildTime: string
  environment: string
  historyFile: string
  repoUrl: string
  // Demo switch: make /health fail in production, to show the automatic rollback.
  simulateBadRelease: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    version: env.APP_VERSION ?? 'dev',
    commit: env.GIT_SHA ?? 'local',
    buildTime: env.BUILD_TIME ?? 'unknown',
    environment: env.APP_ENV ?? 'development',
    historyFile: env.DEPLOY_HISTORY_FILE ?? '/data/deployments.log',
    repoUrl: env.REPO_URL ?? 'https://github.com/vishi-vishnu/dockerized-cicd-pipeline',
    simulateBadRelease: env.SIMULATE_BAD_RELEASE === 'true',
  }
}
