// Fills the status page from the app's own API and refreshes every 10 seconds.
const $ = (id) => document.getElementById(id)

function duration(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${seconds % 60}s`
  return `${seconds}s`
}

function when(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

function cell(text, className) {
  const td = document.createElement('td')
  if (className) td.className = className
  td.textContent = text
  return td
}

async function loadInfo() {
  try {
    const info = await (await fetch('/api/info', { cache: 'no-store' })).json()
    $('status').dataset.state = 'ok'
    $('status-text').textContent = 'Healthy'
    $('version').textContent = info.version
    const short = String(info.commit).slice(0, 7)
    if (/^[0-9a-f]{7,40}$/.test(info.commit)) {
      const a = document.createElement('a')
      a.href = `${info.repoUrl}/commit/${info.commit}`
      a.textContent = short
      $('commit').replaceChildren(a)
    } else {
      $('commit').textContent = short
    }
    $('uptime').textContent = duration(info.uptimeSeconds)
    $('requests').textContent = info.requestsServed.toLocaleString()
    $('env').textContent = info.environment
    $('host').textContent = info.host
    $('node').textContent = info.node
    $('built').textContent = info.buildTime === 'unknown' ? 'local build' : when(info.buildTime)
    $('started').textContent = when(info.startedAt)
    $('repo').href = info.repoUrl
  } catch {
    $('status').dataset.state = 'down'
    $('status-text').textContent = 'Not reachable'
  }
}

async function loadHistory() {
  const body = $('history')
  try {
    const rows = await (await fetch('/api/deployments', { cache: 'no-store' })).json()
    if (!rows.length) {
      const tr = document.createElement('tr')
      const td = cell('No deployments recorded yet. They appear here after the first deploy to EC2.', 'empty')
      td.colSpan = 4
      tr.append(td)
      body.replaceChildren(tr)
      $('refreshed').textContent = `Updated ${new Date().toLocaleTimeString()}`
      return
    }
    body.replaceChildren(
      ...rows.map((d) => {
        const tr = document.createElement('tr')
        const result = document.createElement('td')
        const chip = document.createElement('span')
        chip.className = `chip ${d.status}`
        chip.textContent = { success: 'Deployed', rolled_back: 'Rolled back', failed: 'Failed' }[d.status] ?? d.status
        result.append(chip)
        tr.append(cell(when(d.time)), cell(d.tag, 'mono'), result, cell(d.previous ?? '–', 'mono'))
        return tr
      }),
    )
  } catch {
    // keep the last good table
  }
  $('refreshed').textContent = `Updated ${new Date().toLocaleTimeString()}`
}

function refresh() {
  loadInfo()
  loadHistory()
}
refresh()
setInterval(refresh, 10_000)
