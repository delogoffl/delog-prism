/**
 * An AI assistant, off unless it is turned on, with the provider you choose:
 * Anthropic or any OpenAI-compatible service with your own key, or a model
 * running on this machine through Ollama, in which case nothing leaves it.
 *
 * Two things it does: explain why a request failed, and suggest checks for a
 * response. What it is sent is built here, shown in full before it goes,
 * and scrubbed first: credential headers masked, secret-looking fields in the
 * body masked, and every secret variable's value replaced wherever it
 * appears. Suggested checks are read back strictly — only subjects and
 * operators Prism has — and run against the real response before any is kept.
 *
 * Pure: the network call is main.cjs.
 */

export const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', model: 'claude-sonnet-5-5', needsKey: true, baseUrl: 'https://api.anthropic.com' },
  openai: { label: 'OpenAI-compatible', model: '', needsKey: true, baseUrl: 'https://api.openai.com/v1' },
  ollama: { label: 'Ollama, on this machine', model: 'llama3.1', needsKey: false, baseUrl: 'http://127.0.0.1:11434' }
}

const SECRET_NAME = /authorization|cookie|api[-_]?key|token|secret|password|session|signature/i

/** Every secret value replaced wherever it appears in a text. */
export function scrub(text, secrets = []) {
  let out = String(text ?? '')
  for (const s of secrets.map(String).filter((v) => v.length >= 4).sort((a, b) => b.length - a.length)) out = out.split(s).join('••••')
  return out
}

const maskHeaders = (headers = {}) => Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, SECRET_NAME.test(k) ? '••••' : Array.isArray(v) ? v.join(', ') : String(v)]))

/** A body for a prompt: masked by name, trimmed to a size a model reads well. */
export function bodyFor(text, { mask = (t) => t, limit = 6000 } = {}) {
  const masked = mask(String(text ?? ''))
  return masked.length > limit ? `${masked.slice(0, limit)}\n… (${masked.length - limit} more characters not sent)` : masked
}

const SYSTEM = 'You are the assistant inside Prism, an API testing tool. Be concise and concrete. Refer to fields by their JSON paths. Do not invent details that are not in what you were given; say what you would need to know instead.'

/** Why did this fail? The request as written, what came back, what was checked. */
export function failurePrompt({ req, res, mask, secrets = [] }) {
  const failed = (res.checks ?? []).filter((c) => !c.ok)
  const lines = [
    `Request: ${req.method} ${req.url}`,
    `Request headers: ${JSON.stringify(maskHeaders(res.request?.headers ?? {}))}`,
    res.request?.body ? `Request body:\n${bodyFor(res.request.body, { mask, limit: 3000 })}` : 'Request body: none',
    '',
    res.error ? `It failed to send: ${res.error}` : `Response: ${res.status} ${res.statusText ?? ''} in ${res.timing?.total ?? 0} ms`,
    res.error ? '' : `Response headers: ${JSON.stringify(maskHeaders(res.headers ?? {}))}`,
    res.error ? '' : `Response body:\n${bodyFor(res.body, { mask })}`,
    '',
    failed.length ? `Checks that failed:\n${failed.map((c) => `- ${c.name}: ${c.detail}`).join('\n')}` : 'No check failed.',
    '',
    'Explain in a few sentences why this most likely failed, then list concrete next steps — what to change in the request, the test, or what to ask the API owner. If a check expects the wrong thing, say so.'
  ].filter((l) => l !== '')
  return { system: SYSTEM, prompt: scrub(lines.join('\n'), secrets) }
}

/**
 * Checks worth having for a response, asked for as JSON in Prism's own terms.
 * @param subjects [{ id, label, ops: [..] }] — what Prism can check
 */
export function testsPrompt({ req, res, subjects, mask, secrets = [] }) {
  const catalog = subjects.map((s) => `${s.id}${s.path ? ' (needs path)' : ''}: ${s.ops.join(', ')}`).join('\n')
  const lines = [
    `Request: ${req.method} ${req.url}`,
    `Response: ${res.status} in ${res.timing?.total ?? 0} ms`,
    `Response headers: ${JSON.stringify(maskHeaders(res.headers ?? {}))}`,
    `Response body:\n${bodyFor(res.body, { mask })}`,
    '',
    'Suggest between 4 and 10 checks that would catch this API breaking: its contract and important values, not values that change on every call (ids, timestamps, tokens).',
    'Answer with only a JSON array, no prose, of objects {"subject","op","path","value","why"} using exactly these subjects and operators:',
    catalog,
    'path is a JSON path like data.items[0].id for json subjects, or a header name for header subjects; value is a string.'
  ]
  return { system: SYSTEM, prompt: scrub(lines.join('\n'), secrets) }
}

/**
 * The checks out of a reply: the first JSON array in it, each item kept only
 * when its subject and operator are Prism's.
 * @param allowed Map(subject → Set(ops))
 */
export function parseSuggestions(text, allowed) {
  const s = String(text ?? '')
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start < 0 || end <= start) return { ok: false, error: 'The reply had no list of checks in it', items: [] }
  let list
  try {
    list = JSON.parse(s.slice(start, end + 1))
  } catch (err) {
    return { ok: false, error: `The list of checks is not valid JSON — ${err.message}`, items: [] }
  }
  if (!Array.isArray(list)) return { ok: false, error: 'The reply was not a list', items: [] }
  const items = []
  const dropped = []
  for (const x of list.slice(0, 20)) {
    const subject = String(x?.subject ?? '')
    const op = String(x?.op ?? '')
    if (!allowed.has(subject) || !allowed.get(subject).has(op)) {
      dropped.push(`${subject} ${op}`.trim() || 'an item with no subject')
      continue
    }
    items.push({ subject, op, path: String(x.path ?? ''), value: x.value === undefined || x.value === null ? '' : String(x.value), why: String(x.why ?? '') })
  }
  return { ok: true, items, dropped }
}

/**
 * The HTTP request a provider wants for one question.
 * @returns {{ url, headers, body }}
 */
export function providerRequest({ provider, model, baseUrl, key, system, prompt, maxTokens = 1200 }) {
  const p = PROVIDERS[provider]
  if (!p) throw new Error('Choose an AI provider in Settings → AI')
  const base = String(baseUrl || p.baseUrl).replace(/\/+$/, '')
  const m = String(model || p.model)
  if (!m) throw new Error('Name the model to use in Settings → AI')
  if (p.needsKey && !key) throw new Error('Add your API key first')
  if (provider === 'anthropic') {
    return {
      url: `${base}/v1/messages`,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: { model: m, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }
    }
  }
  if (provider === 'openai') {
    return {
      url: `${base}/chat/completions`,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: { model: m, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }
    }
  }
  return {
    url: `${base}/api/chat`,
    headers: { 'content-type': 'application/json' },
    body: { model: m, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }
  }
}

/** The text of a provider's reply, or the error it gave. */
export function readReply(provider, status, json) {
  if (status >= 400 || json?.error) {
    const msg = json?.error?.message ?? (typeof json?.error === 'string' ? json.error : '') ?? ''
    return { ok: false, error: `${status} — ${msg || 'the provider refused the request'}` }
  }
  let text = ''
  if (provider === 'anthropic') text = (json?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
  else if (provider === 'openai') text = json?.choices?.[0]?.message?.content ?? ''
  else text = json?.message?.content ?? ''
  return text ? { ok: true, text } : { ok: false, error: 'The reply was empty' }
}
