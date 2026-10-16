/**
 * Comparing two runs of the same requests, one per environment.
 *
 * The release-day question — does staging behave like production? — is not
 * "are the bodies equal". Values differ between environments by design: other
 * ids, other users, other timestamps. What should match is the *contract*:
 * the status, the shape of the body, the content type, which checks pass.
 * So a difference is graded by what it means:
 *
 *   breaks  — the status class differs, a field is missing on one side or has
 *             another type, the content type differs, or a check passes on
 *             one side only
 *   differs — the status differs within its class, a field exists on one side
 *             only as an addition, or it is much slower
 *   same    — the contract matches; values may still differ, and are counted
 */
import { diff } from './schema.js'

/** Slower by this factor, and by at least this many ms, counts as a difference. */
export const SLOW_RATIO = 2
export const SLOW_MS = 150

const statusClass = (s) => (s ? Math.floor(s / 100) : 0)

function contentType(headers = {}) {
  const raw = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1]
  const text = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '')
  return text.split(';')[0].trim().toLowerCase()
}

/** The bits of a result a comparison reads, so either side may be a full result or a slim one. */
export function slim(result) {
  if (!result) return null
  return {
    status: result.status ?? 0,
    error: result.skipped ? '' : result.error ?? '',
    skipped: Boolean(result.skipped),
    ms: result.timing?.total ?? result.ms ?? 0,
    bytes: result.bytes ?? 0,
    type: contentType(result.headers),
    json: result.json,
    checks: (result.checks ?? []).map((c) => ({ name: c.name ?? c.assertion?.label ?? '', ok: Boolean(c.ok) }))
  }
}

/**
 * One request, as it went in environment A and in environment B.
 * `nameOf` names a check: the app passes describe(), the tests a plain field.
 */
export function compareOne(a, b, { nameOf = (c) => c.name, names = {} } = {}) {
  const A = slim(a)
  const B = slim(b)
  const na = names.a || 'A'
  const nb = names.b || 'B'
  const reasons = []
  let grade = 'same'
  const raise = (to, why) => {
    reasons.push({ grade: to, why })
    if (to === 'breaks' || (to === 'differs' && grade === 'same')) grade = to
  }

  if (!A || !B) return { grade: 'breaks', reasons: [{ grade: 'breaks', why: `Not run in ${A ? nb : na}` }], fields: [], values: 0, a: A, b: B }

  if (A.skipped || B.skipped) {
    if (A.skipped !== B.skipped) raise('differs', `Skipped in ${A.skipped ? na : nb} only`)
    return { grade, reasons, fields: [], values: 0, a: A, b: B }
  }
  if (A.error || B.error) {
    // A send that fails is broken whichever side it is on; failing in both
    // means nothing could be compared, which is no reason to call it the same.
    if (Boolean(A.error) !== Boolean(B.error)) raise('breaks', `Failed to send in ${A.error ? na : nb}: ${A.error || B.error}`)
    else if (A.error === B.error) raise('breaks', `Failed to send in both: ${A.error}`)
    else raise('breaks', `Failed to send — ${na}: ${A.error}; ${nb}: ${B.error}`)
    return { grade, reasons, fields: [], values: 0, a: A, b: B }
  }

  if (statusClass(A.status) !== statusClass(B.status)) raise('breaks', `Status ${A.status} in ${na}, ${B.status} in ${nb}`)
  else if (A.status !== B.status) raise('differs', `Status ${A.status} in ${na}, ${B.status} in ${nb}`)

  if (A.type !== B.type) raise('breaks', `Content type ${A.type || 'none'} in ${na}, ${B.type || 'none'} in ${nb}`)

  // Shape: what is missing, retyped or extra. Values are only counted.
  const changes = A.json !== undefined || B.json !== undefined ? diff(A.json, B.json) : []
  const fields = changes.filter((c) => c.kind !== 'changed')
  const values = changes.filter((c) => c.kind === 'changed' && !c.path.endsWith('.length')).length
  const missing = fields.filter((c) => c.kind === 'removed')
  const retyped = fields.filter((c) => c.kind === 'retyped')
  const added = fields.filter((c) => c.kind === 'added')
  if (missing.length) raise('breaks', `${missing.length} field${missing.length === 1 ? '' : 's'} missing in ${nb}`)
  if (retyped.length) raise('breaks', `${retyped.length} field${retyped.length === 1 ? '' : 's'} of another type`)
  if (added.length) raise('differs', `${added.length} field${added.length === 1 ? '' : 's'} only in ${nb}`)

  // Checks that pass on one side and fail on the other.
  const okB = new Map(B.checks.map((c, i) => [nameOf(c, i), c.ok]))
  const flipped = A.checks.filter((c, i) => okB.has(nameOf(c, i)) && okB.get(nameOf(c, i)) !== c.ok)
  if (flipped.length) raise('breaks', `${flipped.length} check${flipped.length === 1 ? '' : 's'} pass in one and fail in the other`)

  const slow = Math.max(A.ms, B.ms)
  const fast = Math.max(1, Math.min(A.ms, B.ms))
  if (slow / fast >= SLOW_RATIO && slow - fast >= SLOW_MS) raise('differs', `${A.ms > B.ms ? na : nb} is ${(slow / fast).toFixed(1)}× slower`)

  return {
    grade,
    reasons,
    fields,
    values,
    flipped: flipped.map((c, i) => ({ name: nameOf(c, i), a: c.ok, b: !c.ok })),
    a: A,
    b: B
  }
}

/** Totals over every compared request, for the header. */
export function compareSummary(rows = []) {
  const out = { total: rows.length, same: 0, differs: 0, breaks: 0, slowerA: 0, slowerB: 0 }
  for (const r of rows) {
    out[r.grade] += 1
    if (r.a && r.b && !r.a.error && !r.b.error) {
      if (r.a.ms > r.b.ms) out.slowerA += 1
      else if (r.b.ms > r.a.ms) out.slowerB += 1
    }
  }
  return out
}

/** The comparison as Markdown, to paste into a ticket or a release note. */
export function compareMarkdown({ target, a, b, rows }) {
  const sum = compareSummary(rows)
  const mark = { same: '✅ same', differs: '⚠️ differs', breaks: '❌ breaks' }
  const lines = [
    `## ${target}: ${a} vs ${b}`,
    '',
    `${sum.same} same · ${sum.differs} differ · ${sum.breaks} break`,
    '',
    `| Request | ${a} | ${b} | Result | Why |`,
    '|---|---|---|---|---|'
  ]
  for (const r of rows) {
    const side = (x) => (!x ? '—' : x.skipped ? 'skipped' : x.error ? 'error' : `${x.status} · ${x.ms} ms`)
    const why = r.reasons.map((x) => x.why).join('; ') || (r.values ? `${r.values} value${r.values === 1 ? '' : 's'} differ` : '')
    lines.push(`| ${r.method} ${r.name} | ${side(r.a)} | ${side(r.b)} | ${mark[r.grade]} | ${why.replace(/\|/g, '\\|')} |`)
  }
  return lines.join('\n')
}
