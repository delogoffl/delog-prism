/**
 * Logic for a step in a flow: run it only if, wait first, repeat it for each
 * item, poll it until, and stop the flow if it fails.
 *
 * Conditions are written in a small language of their own, parsed here and
 * never handed to eval:
 *
 *   json.status == "done"
 *   status < 300 and json.items.length > 0
 *   var.role == "admin" or not var.trial
 *   header.content-type contains "json"
 *   json.id exists
 *   json.email matches "^[^@]+@"
 *
 * Names: status, time, size, attempt, json.<path>, header.<name>,
 * var.<name>, item, item.<path>. Comparisons are loose where it helps —
 * "200" equals 200 — as Prism's assertions are.
 */

/* ------------------------------------------------------------- the parser */

const OPS = ['==', '!=', '>=', '<=', '>', '<']
const WORD_OPS = ['contains', 'matches']

function tokenize(text) {
  const out = []
  let i = 0
  const s = String(text ?? '')
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) {
      i += 1
      continue
    }
    if (c === '(' || c === ')') {
      out.push({ t: c, at: i })
      i += 1
      continue
    }
    const op = OPS.find((o) => s.startsWith(o, i))
    if (op) {
      out.push({ t: 'op', v: op, at: i })
      i += op.length
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      let v = ''
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\' && j + 1 < s.length) {
          v += s[j + 1]
          j += 2
        } else {
          v += s[j]
          j += 1
        }
      }
      if (j >= s.length) throw new Error(`A string starting at ${i + 1} is never closed`)
      out.push({ t: 'str', v, at: i })
      i = j + 1
      continue
    }
    const num = /^-?\d+(\.\d+)?/.exec(s.slice(i))
    if (num && !/[\w.]/.test(s[i + num[0].length] ?? '')) {
      out.push({ t: 'num', v: Number(num[0]), at: i })
      i += num[0].length
      continue
    }
    const word = /^[A-Za-z_][\w.\-[\]]*/.exec(s.slice(i))
    if (word) {
      const w = word[0]
      const lower = w.toLowerCase()
      if (lower === 'and' || lower === 'or' || lower === 'not' || lower === 'exists') out.push({ t: lower, at: i })
      else if (WORD_OPS.includes(lower)) out.push({ t: 'op', v: lower, at: i })
      else if (lower === 'true' || lower === 'false') out.push({ t: 'lit', v: lower === 'true', at: i })
      else if (lower === 'null') out.push({ t: 'lit', v: null, at: i })
      else out.push({ t: 'name', v: w, at: i })
      i += w.length
      continue
    }
    throw new Error(`Unexpected “${c}” at ${i + 1}`)
  }
  return out
}

/** Parses a condition. `{ ok, ast }` or `{ ok: false, error }`. */
export function parseCondition(text) {
  if (!String(text ?? '').trim()) return { ok: false, error: 'Empty' }
  let tokens
  try {
    tokens = tokenize(text)
  } catch (err) {
    return { ok: false, error: err.message }
  }
  let i = 0
  const peek = () => tokens[i]
  const take = () => tokens[i++]
  const fail = (msg) => {
    throw new Error(msg)
  }
  const operand = () => {
    const tk = take()
    if (!tk) fail('The condition ends too soon')
    if (tk.t === '(') {
      const inner = or()
      if (take()?.t !== ')') fail('A “(” is never closed')
      return inner
    }
    if (tk.t === 'name') return { k: 'name', v: tk.v }
    if (tk.t === 'str' || tk.t === 'num' || tk.t === 'lit') return { k: 'value', v: tk.v }
    fail(`Expected a name or a value at ${tk.at + 1}`)
  }
  const compare = () => {
    const left = operand()
    const next = peek()
    if (next?.t === 'exists') {
      take()
      return { k: 'exists', of: left }
    }
    if (next?.t === 'op') {
      take()
      return { k: 'cmp', op: next.v, left, right: operand() }
    }
    return { k: 'truthy', of: left }
  }
  const not = () => {
    if (peek()?.t === 'not') {
      take()
      return { k: 'not', of: not() }
    }
    return compare()
  }
  const and = () => {
    let left = not()
    while (peek()?.t === 'and') {
      take()
      left = { k: 'and', left, right: not() }
    }
    return left
  }
  const or = () => {
    let left = and()
    while (peek()?.t === 'or') {
      take()
      left = { k: 'or', left, right: and() }
    }
    return left
  }
  try {
    const ast = or()
    if (i < tokens.length) fail(`Unexpected “${tokens[i].v ?? tokens[i].t}” at ${tokens[i].at + 1}`)
    return { ok: true, ast }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/* ---------------------------------------------------------- the evaluator */

/** A dotted path into a value: a.b[0].c, with .length on lists and strings. */
export function dig(value, path) {
  let at = value
  for (const part of String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (at === null || at === undefined) return undefined
    if (part === 'length' && (Array.isArray(at) || typeof at === 'string')) at = at.length
    else at = at[part]
  }
  return at
}

function resolve(name, ctx) {
  const [head, ...rest] = String(name).split('.')
  const tail = rest.join('.')
  switch (head) {
    case 'status':
      return ctx.status
    case 'time':
      return ctx.time
    case 'size':
      return ctx.size
    case 'attempt':
      return ctx.attempt
    case 'json':
      return tail ? dig(ctx.json, tail) : ctx.json
    case 'header': {
      const key = Object.keys(ctx.headers ?? {}).find((k) => k.toLowerCase() === tail.toLowerCase())
      const v = key === undefined ? undefined : ctx.headers[key]
      return Array.isArray(v) ? v.join(', ') : v
    }
    case 'var':
      return ctx.vars?.[tail]
    case 'item':
      return tail ? dig(ctx.item, tail) : ctx.item
    default:
      throw new Error(`“${name}” is not something a condition can read — use status, time, json.…, header.…, var.… or item`)
  }
}

const numeric = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : NaN)
function looseEqual(a, b) {
  if (a === b) return true
  const na = numeric(a)
  const nb = numeric(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b)
  if (a && typeof a === 'object') return JSON.stringify(a) === (typeof b === 'string' ? b : JSON.stringify(b))
  return a !== undefined && b !== undefined && a !== null && b !== null && String(a) === String(b)
}

function evaluate(node, ctx) {
  switch (node.k) {
    case 'value':
      return node.v
    case 'name':
      return resolve(node.v, ctx)
    case 'and':
      return Boolean(evaluate(node.left, ctx)) && Boolean(evaluate(node.right, ctx))
    case 'or':
      return Boolean(evaluate(node.left, ctx)) || Boolean(evaluate(node.right, ctx))
    case 'not':
      return !evaluate(node.of, ctx)
    case 'exists': {
      const v = evaluate(node.of, ctx)
      return v !== undefined && v !== null && v !== ''
    }
    case 'truthy': {
      const v = evaluate(node.of, ctx)
      return !(v === undefined || v === null || v === false || v === '' || v === 0 || v === 'false' || v === '0')
    }
    case 'cmp': {
      const a = evaluate(node.left, ctx)
      const b = evaluate(node.right, ctx)
      switch (node.op) {
        case '==':
          return looseEqual(a, b)
        case '!=':
          return !looseEqual(a, b)
        case 'contains':
          return Array.isArray(a) ? a.some((x) => looseEqual(x, b)) : String(a ?? '').includes(String(b ?? ''))
        case 'matches':
          try {
            return new RegExp(String(b)).test(String(a ?? ''))
          } catch {
            throw new Error(`“${b}” is not a valid pattern`)
          }
        default: {
          const na = numeric(a)
          const nb = numeric(b)
          if (Number.isNaN(na) || Number.isNaN(nb)) return false
          return node.op === '>' ? na > nb : node.op === '>=' ? na >= nb : node.op === '<' ? na < nb : na <= nb
        }
      }
    }
    default:
      return false
  }
}

/** Whether a condition holds. `{ ok: true, value }` or `{ ok: false, error }`. */
export function check(text, ctx) {
  const parsed = parseCondition(text)
  if (!parsed.ok) return parsed
  try {
    return { ok: true, value: Boolean(evaluate(parsed.ast, ctx)) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/** What a response looks like to a condition. */
export function contextOf(res = {}, extra = {}) {
  return { status: res.status ?? 0, time: res.timing?.total ?? 0, size: res.bytes ?? 0, json: res.json, headers: res.headers ?? {}, ...extra }
}

/** The names a condition reads, for showing what it last saw. */
export function namesIn(text) {
  const parsed = parseCondition(text)
  const out = []
  const walk = (n) => {
    if (!n) return
    if (n.k === 'name') out.push(n.v)
    for (const k of ['left', 'right', 'of']) walk(n[k])
  }
  if (parsed.ok) walk(parsed.ast)
  return [...new Set(out)]
}

/* ----------------------------------------------------------- the rules */

export const LIMITS = { tries: 100, everyMs: 100, waitMs: 600000, items: 500 }

/** A step's rules, filled and clamped; `null` when it has none. */
export function rulesOf(req) {
  const l = req?.logic
  if (!l || typeof l !== 'object') return null
  const rules = {
    when: String(l.when ?? '').trim(),
    waitMs: Math.max(0, Math.min(LIMITS.waitMs, Math.round(Number(l.waitMs) || 0))),
    each: String(l.each ?? '').trim(),
    until: String(l.until ?? '').trim(),
    everyMs: Math.max(LIMITS.everyMs, Math.round(Number(l.everyMs) || 1000)),
    tries: Math.max(1, Math.min(LIMITS.tries, Math.round(Number(l.tries) || 10))),
    onFail: l.onFail === 'stop' ? 'stop' : 'continue'
  }
  const any = rules.when || rules.waitMs || rules.each || rules.until || rules.onFail === 'stop'
  return any ? rules : null
}

/**
 * The list a "for each" walks: a JSON array, a variable holding one (or a
 * comma-separated list), or json.… is not allowed — there is no response yet.
 */
export function itemsOf(source, vars = {}) {
  const s = String(source ?? '').trim()
  if (!s) return { ok: true, items: [] }
  let raw = s
  if (/^var\.[\w.-]+$/.test(s)) {
    raw = vars[s.slice(4)]
    if (raw === undefined) return { ok: false, error: `${s} is not set` }
  } else if (/^\{\{[\w.-]+\}\}$/.test(s)) {
    raw = vars[s.slice(2, -2)]
    if (raw === undefined) return { ok: false, error: `${s} is not set` }
  }
  if (Array.isArray(raw)) return { ok: true, items: raw.slice(0, LIMITS.items) }
  const text = String(raw).trim()
  if (text.startsWith('[')) {
    try {
      const list = JSON.parse(text)
      if (Array.isArray(list)) return { ok: true, items: list.slice(0, LIMITS.items) }
    } catch {
      return { ok: false, error: 'That list is not valid JSON' }
    }
  }
  return { ok: true, items: text.split(',').map((x) => x.trim()).filter(Boolean).slice(0, LIMITS.items) }
}

/** An item as variables: {{item}}, and {{item.key}} for each field of an object. */
export function itemVars(item, index) {
  const out = { item: item && typeof item === 'object' ? JSON.stringify(item) : String(item), item_index: String(index) }
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    for (const [k, v] of Object.entries(item)) out[`item.${k}`] = v && typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

/** The rules as a few words, for a badge or a tooltip. */
export function describeRules(rules) {
  if (!rules) return []
  const out = []
  if (rules.when) out.push({ kind: 'when', short: 'if', text: `Only if ${rules.when}` })
  if (rules.waitMs) out.push({ kind: 'wait', short: rules.waitMs >= 1000 ? `${+(rules.waitMs / 1000).toFixed(1)}s` : `${rules.waitMs}ms`, text: `Waits ${rules.waitMs} ms first` })
  if (rules.each) out.push({ kind: 'each', short: 'each', text: `For each item in ${rules.each}` })
  if (rules.until) out.push({ kind: 'until', short: 'until', text: `Repeats every ${rules.everyMs} ms, up to ${rules.tries} times, until ${rules.until}` })
  if (rules.onFail === 'stop') out.push({ kind: 'stop', short: 'stop', text: 'Stops the flow if it fails' })
  return out
}

/**
 * Runs a step under its rules.
 * @param send (vars) => Promise<result> — one plain send
 * @param o { rules, vars, sleep, now, stopped } — sleep and now injectable for tests
 * @returns the final result, with `logic` describing what happened and checks for it
 */
export async function runRules(send, { rules, vars = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), stopped = () => false }) {
  const started = now()
  const notes = []
  const checks = []
  const mark = (ok, name, detail) => checks.push({ ok, name, detail })

  if (rules.when) {
    const c = check(rules.when, { vars })
    if (!c.ok) return { skipped: true, error: `Its condition cannot be read — ${c.error}`, failed: 1, checks: [], logic: { skipped: 'error' } }
    if (!c.value) return { skipped: true, error: `Skipped: ${rules.when} is false`, failed: 0, checks: [], logic: { skipped: 'when' } }
  }
  if (rules.waitMs) {
    notes.push(`waited ${rules.waitMs} ms`)
    await sleep(rules.waitMs)
  }

  const once = async (extra, label) => {
    if (!rules.until) return { res: await send({ ...vars, ...extra }), tries: 1 }
    let res
    let attempt = 0
    while (attempt < rules.tries) {
      if (stopped()) break
      attempt += 1
      res = await send({ ...vars, ...extra })
      if (!res.error) {
        const c = check(rules.until, contextOf(res, { vars: { ...vars, ...extra }, attempt, item: extra.__item }))
        if (!c.ok) {
          mark(false, `Polling${label}`, `Its condition cannot be read — ${c.error}`)
          return { res, tries: attempt }
        }
        if (c.value) {
          mark(true, `${rules.until}${label}`, `held after ${attempt} ${attempt === 1 ? 'try' : 'tries'}, ${((now() - started) / 1000).toFixed(1)} s`)
          return { res, tries: attempt }
        }
      }
      if (attempt < rules.tries) await sleep(rules.everyMs)
    }
    const seen = res && !res.error ? namesIn(rules.until).map((n) => `${n} = ${JSON.stringify(safeResolve(n, contextOf(res, { vars, attempt })))}`).join(', ') : res?.error ?? ''
    mark(false, `${rules.until}${label}`, `never held in ${attempt} ${attempt === 1 ? 'try' : 'tries'}${seen ? ` — last saw ${seen}` : ''}`)
    return { res, tries: attempt }
  }

  let final
  if (rules.each) {
    const list = itemsOf(rules.each, vars)
    if (!list.ok) return { skipped: true, error: `Its list cannot be read — ${list.error}`, failed: 1, checks: [], logic: { skipped: 'error' } }
    if (!list.items.length) return { skipped: true, error: `Skipped: ${rules.each} is empty`, failed: 0, checks: [], logic: { skipped: 'empty' } }
    const items = []
    for (let i = 0; i < list.items.length; i += 1) {
      if (stopped()) break
      const item = list.items[i]
      const { res, tries } = await once({ ...itemVars(item, i), __item: item }, ` — item ${i + 1}`)
      const bad = Boolean(res.error) || (res.failed ?? 0) > 0
      items.push({ item, status: res.status ?? 0, ms: res.timing?.total ?? 0, failed: bad, tries, error: res.error ?? '' })
      final = res
    }
    const failedItems = items.filter((x) => x.failed).length
    mark(failedItems === 0, `For each item in ${rules.each}`, `${items.length} item${items.length === 1 ? '' : 's'} — ${items.length - failedItems} passed, ${failedItems} failed`)
    notes.push(`ran for ${items.length} items`)
    final = { ...final, logic: { items } }
  } else {
    const { res, tries } = await once({}, '')
    final = { ...res, logic: { tries } }
  }

  const extra = checks.map((c) => ({ ...c }))
  const failed = (final.failed ?? 0) + extra.filter((c) => !c.ok).length
  return { ...final, failed, logicChecks: extra, logic: { ...final.logic, notes, stop: rules.onFail === 'stop' && (failed > 0 || Boolean(final.error)) } }
}

function safeResolve(name, ctx) {
  try {
    return resolve(name, ctx)
  } catch {
    return undefined
  }
}
