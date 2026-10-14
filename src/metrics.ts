// A very small request counter, shown on /metrics in the Prometheus text format.
// Prometheus (or any scraper) can read it without extra libraries.
export class Metrics {
  private counts = new Map<string, number>()
  readonly startedAt = new Date()

  record(method: string, route: string, status: number): void {
    const key = `method="${method}",route="${route}",status="${status}"`
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1)
  }

  totalRequests(): number {
    let total = 0
    for (const n of this.counts.values()) total += n
    return total
  }

  uptimeSeconds(now = Date.now()): number {
    return Math.floor((now - this.startedAt.getTime()) / 1000)
  }

  toPrometheus(): string {
    const lines = [
      '# HELP pulse_http_requests_total Number of HTTP requests handled.',
      '# TYPE pulse_http_requests_total counter',
    ]
    for (const [labels, n] of [...this.counts.entries()].sort()) {
      lines.push(`pulse_http_requests_total{${labels}} ${n}`)
    }
    lines.push(
      '# HELP pulse_uptime_seconds Seconds since the app started.',
      '# TYPE pulse_uptime_seconds gauge',
      `pulse_uptime_seconds ${this.uptimeSeconds()}`,
    )
    return lines.join('\n') + '\n'
  }
}
