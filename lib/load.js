/**
 * Load mode: how an API holds up when several users go through a flow at
 * once — throughput, latency percentiles and errors — summarised from the
 * samples a run collects.
 *
 * Deliberately modest. Prism runs on one machine and sends through the same
 * engine as a single request, so a run is capped (LIMITS): enough to find
 * the endpoint that falls over at twenty users, not a tool for flooding a
 * service. Pure: the run loop lives in the app.
 */
import { percentile } from './trend.js'

export const LIMITS = { users: 50, seconds: 300, rampSeconds: 120, thinkMs: 10000 }

/** Settings, clamped to what Prism will run. */
export function loadPlan({ users = 5, seconds = 30, rampSeconds = 0, thinkMs = 0 } = {}) {
  const clampInt = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(Number(v)) ? Number(v) : d)))
  const plan = {
    users: clampInt(users, 1, LIMITS.users, 5),
    seconds: clampInt(seconds, 5, LIMITS.seconds, 30),
    rampSeconds: clampInt(rampSeconds, 0, LIMITS.rampSeconds, 0),
    thinkMs: clampInt(thinkMs, 0, LIMITS.thinkMs, 0)
  }
  plan.rampSeconds = Math.min(plan.rampSeconds, plan.seconds - 1)
  return plan
}

/** When user `i` (0-based) of `users` starts, in ms, spread evenly over the ramp. */
export function startAt(i, users, rampSeconds) {
  if (!rampSeconds || users <= 1) return 0
  return Math.round((i / (users - 1)) * rampSeconds * 1000)
}

const ok = (s) => !s.error && s.status > 0 && s.status < 400 && !s.failed

function stats(list) {
  const ms = list.filter((s) => !s.error).map((s) => s.ms)
  const errors = list.filter((s) => !ok(s)).length
  return {
    count: list.length,
    errors,
    errorRate: list.length ? errors / list.length : 0,
    min: ms.length ? Math.min(...ms) : 0,
    max: ms.length ? Math.max(...ms) : 0,
    mean: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0,
    p50: percentile(ms, 50),
    p90: percentile(ms, 90),
    p95: percentile(ms, 95),
    p99: percentile(ms, 99)
  }
}

/**
 * Everything a load run says.
 * @param samples [{ at (ms since start), id, name, method, ms, status, error?, failed? }]
 * @param elapsedMs how long the run went on
 * @param budget optional { p95, errorRate } the run should stay within
 */
export function loadSummary(samples = [], elapsedMs = 0, budget = {}) {
  const all = stats(samples)
  const seconds = Math.max(1, Math.ceil(elapsedMs / 1000))
  const rps = elapsedMs > 0 ? samples.length / (elapsedMs / 1000) : 0

  // One bucket per second, for the chart: throughput, the slow end, errors.
  const buckets = Array.from({ length: seconds }, (_, i) => ({ second: i, count: 0, errors: 0, p95: 0, ms: [] }))
  for (const s of samples) {
    const b = buckets[Math.min(seconds - 1, Math.max(0, Math.floor(s.at / 1000)))]
    b.count += 1
    if (!ok(s)) b.errors += 1
    if (!s.error) b.ms.push(s.ms)
  }
  for (const b of buckets) {
    b.p95 = percentile(b.ms, 95)
    delete b.ms
  }

  // Per request, slowest first: which stop gives way.
  const byId = new Map()
  for (const s of samples) {
    if (!byId.has(s.id)) byId.set(s.id, { id: s.id, name: s.name, method: s.method, list: [] })
    byId.get(s.id).list.push(s)
  }
  const requests = [...byId.values()].map((r) => ({ id: r.id, name: r.name, method: r.method, ...stats(r.list) })).sort((a, b) => b.p95 - a.p95)

  // Within budget, when one was set.
  const breaches = []
  if (Number(budget.p95) > 0 && all.p95 > Number(budget.p95)) breaches.push(`p95 ${all.p95} ms is over the ${budget.p95} ms budget`)
  if (budget.errorRate !== undefined && budget.errorRate !== '' && all.errorRate > Number(budget.errorRate)) breaches.push(`${(all.errorRate * 100).toFixed(1)}% errors is over the ${(Number(budget.errorRate) * 100).toFixed(1)}% budget`)
  const statuses = {}
  for (const s of samples) {
    const key = s.error ? 'error' : String(s.status)
    statuses[key] = (statuses[key] ?? 0) + 1
  }
  return { ...all, rps: Math.round(rps * 10) / 10, seconds, buckets, requests, statuses, breaches, passed: breaches.length === 0 }
}

/** The run as Markdown, for a ticket. */
export function loadMarkdown({ target, plan, summary }) {
  const lines = [
    `## Load: ${target}`,
    '',
    `${plan.users} users for ${plan.seconds} s${plan.rampSeconds ? `, ramping over ${plan.rampSeconds} s` : ''}${plan.thinkMs ? `, ${plan.thinkMs} ms between requests` : ''}`,
    '',
    `**${summary.count} requests · ${summary.rps}/s · p50 ${summary.p50} ms · p95 ${summary.p95} ms · p99 ${summary.p99} ms · ${(summary.errorRate * 100).toFixed(1)}% errors**`,
    ...(summary.breaches.length ? ['', ...summary.breaches.map((b) => `- ❌ ${b}`)] : []),
    '',
    '| Request | Count | Errors | p50 | p95 | Max |',
    '|---|---|---|---|---|---|'
  ]
  for (const r of summary.requests) lines.push(`| ${r.method} ${r.name} | ${r.count} | ${r.errors} | ${r.p50} ms | ${r.p95} ms | ${r.max} ms |`)
  return lines.join('\n')
}
