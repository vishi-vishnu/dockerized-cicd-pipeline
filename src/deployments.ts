import { readFile } from 'node:fs/promises'

// One line per deploy, written by scripts/deploy.sh on the EC2 server, for example:
// {"time":"2026-10-15T10:00:00Z","tag":"sha-1a2b3c4","status":"success","previous":"sha-9f8e7d6"}
export type DeployStatus = 'success' | 'rolled_back' | 'failed'

export interface Deployment {
  time: string
  tag: string
  status: DeployStatus
  previous: string | null
}

function isDeployment(value: unknown): value is Deployment {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Record<string, unknown>
  return (
    typeof d.time === 'string' &&
    typeof d.tag === 'string' &&
    ['success', 'rolled_back', 'failed'].includes(d.status as string) &&
    (d.previous === null || typeof d.previous === 'string')
  )
}

// Turns the log text into a list, newest first. Bad lines are skipped, not fatal.
export function parseHistory(text: string, limit = 20): Deployment[] {
  const out: Deployment[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (isDeployment(parsed)) out.push({ ...parsed, previous: parsed.previous || null })
    } catch {
      // ignore a half-written or broken line
    }
  }
  return out.reverse().slice(0, limit)
}

// Reads the history file. A missing file (for example on a laptop) means "no deploys yet".
export async function readHistory(file: string, limit = 20): Promise<Deployment[]> {
  try {
    return parseHistory(await readFile(file, 'utf8'), limit)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}
