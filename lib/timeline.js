/**
 * The run timeline: every run of a flow kept as a small record, so any two
 * can be laid side by side — what broke since, what was fixed, what got
 * slower, which fields appeared, vanished or changed type.
 *
 * A record holds measurements and shapes, never values: statuses, times,
 * which checks passed, and each response's shape as types alone (lib/schema
 * sketch). That is what lets it be saved with the workspace safely, the same
 * way the history is.
 */
import { sketch, diff } from './schema.js'

export const RUNS_KEPT = 60
const SHAPE_LIMIT = 24000

/** Only the types of a body, and only when it is small enough to keep. */
export function shapeOf(json) {
  if (json === undefined) return null
  const s = sketch(json)
  return JSON.stringify(s).length <= SHAPE_LIMIT ? s : null
}

/** A run, reduced to what the timeline keeps. */
export function runRecord({ id, at, source = 'run', target = {}, env = '', ms = 0, results = [] }) {
  return {
    id: String(id ?? `run-${Number(at || Date.now()).toString(36)}`),
    at: Number(at) || Date.now(),
    source: String(source),
    target: { kind: String(target.kind ?? 'flow'), id: String(target.id ?? ''), name: String(target.name ?? '') },
    env: String(env ?? ''),
    ms: Math.round(Number(ms) || 0),
    results: results.slice(0, 500).map((r) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? 'Untitled'),
      method: String(r.method ?? 'GET').toUpperCase(),
      status: Number(r.status) || 0,
      ms: Math.round(Number(r.ms) || 0),
      error: r.error ? String(r.error).slice(0, 300) : '',
      skipped: Boolean(r.skipped),
      checks: (r.checks ?? []).slice(0, 100).map((c) => ({ name: String(c.name ?? '').slice(0, 200), ok: Boolean(c.ok) })),
      shape: r.shape ?? null
    }))
  }
}

const failedOf = (r) => Boolean(r.error) || r.checks.some((c) => !c.ok)

/** Totals for one run, as its row in the list says them. */
export function runTotals(run) {
  const ran = run.results.filter((r) => !r.skipped)
  const failed = ran.filter(failedOf).length
  return { requests: ran.length, failed, passed: ran.length - failed, checks: ran.reduce((n, r) => n + r.checks.length, 0) }
}

/** Slower by this factor and this many ms is worth saying. */
export const SLOWER = { ratio: 1.5, ms: 100 }

/**
 * What changed from one run to a later one, request by request.
 * Each change is `{ kind, text }`, kind one of: broke, fixed, status,
 * slower, faster, shape, check-broke, check-fixed, new, gone.
 */
export function compareRuns(before, after) {
  const was = new Map(before.results.map((r) => [r.id, r]))
  const now = new Map(after.results.map((r) => [r.id, r]))
  const rows = []
  for (const r of after.results) {
    const b = was.get(r.id)
    const changes = []
    if (!b) {
      changes.push({ kind: 'new', text: 'Not in the earlier run' })
    } else if (!r.skipped && !b.skipped) {
      const bf = failedOf(b)
      const af = failedOf(r)
      if (!bf && af) changes.push({ kind: 'broke', text: r.error ? `Now fails to send: ${r.error}` : 'Passed before, fails now' })
      if (bf && !af) changes.push({ kind: 'fixed', text: 'Failed before, passes now' })
      if (b.status && r.status && b.status !== r.status) changes.push({ kind: 'status', text: `Status ${b.status} → ${r.status}` })
      const slow = Math.max(b.ms, r.ms)
      const fast = Math.max(1, Math.min(b.ms, r.ms))
      if (!r.error && !b.error && slow / fast >= SLOWER.ratio && slow - fast >= SLOWER.ms) {
        changes.push(r.ms > b.ms ? { kind: 'slower', text: `${b.ms} → ${r.ms} ms, ${(r.ms / Math.max(1, b.ms)).toFixed(1)}× slower` } : { kind: 'faster', text: `${b.ms} → ${r.ms} ms, ${(b.ms / Math.max(1, r.ms)).toFixed(1)}× faster` })
      }
      if (b.shape && r.shape) {
        // The sketches are type trees, so a diff of them is a diff of the shape.
        for (const c of diff(b.shape, r.shape)) {
          const field = c.path.replace(/(^|\.)(properties|items)(?=\.|$)/g, '').replace(/^\.+|\.+$/g, '').replace(/\.{2,}/g, '.').replace(/\.type$/, '') || 'body'
          if (c.kind === 'removed') changes.push({ kind: 'shape', text: `${field} is gone` })
          else if (c.kind === 'added') changes.push({ kind: 'shape', text: `${field} is new` })
          else if (c.kind === 'changed' && c.path.endsWith('type')) changes.push({ kind: 'shape', text: `${field} was ${c.before}, now ${c.after}` })
          else if (c.kind === 'retyped') changes.push({ kind: 'shape', text: `${field} changed shape` })
        }
      }
      const okBefore = new Map(b.checks.map((c) => [c.name, c.ok]))
      for (const c of r.checks) {
        if (!okBefore.has(c.name)) continue
        if (okBefore.get(c.name) && !c.ok) changes.push({ kind: 'check-broke', text: `${c.name} — now fails` })
        if (!okBefore.get(c.name) && c.ok) changes.push({ kind: 'check-fixed', text: `${c.name} — now passes` })
      }
    }
    rows.push({ id: r.id, name: r.name, method: r.method, before: b ?? null, after: r, changes })
  }
  for (const b of before.results) {
    if (!now.has(b.id)) rows.push({ id: b.id, name: b.name, method: b.method, before: b, after: null, changes: [{ kind: 'gone', text: 'Not in the later run' }] })
  }
  const count = (k) => rows.filter((x) => x.changes.some((c) => k.includes(c.kind))).length
  return {
    rows,
    summary: {
      broke: count(['broke']),
      fixed: count(['fixed']),
      slower: count(['slower']),
      faster: count(['faster']),
      shape: count(['shape']),
      changed: rows.filter((x) => x.changes.length).length,
      total: rows.length
    }
  }
}

/** Keeps a new run at the front, the newest RUNS_KEPT in all. */
export function keepRun(runs = [], run) {
  return [run, ...runs.filter((x) => x.id !== run.id)].slice(0, RUNS_KEPT)
}
