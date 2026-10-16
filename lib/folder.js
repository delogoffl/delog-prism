/**
 * A workspace as a folder of small files, for Git.
 *
 * One .prism.json is easy to keep and hard to review: change one header and
 * the diff is a line somewhere in a thousand. As a folder, each request is
 * its own file, so a pull request shows exactly which request changed and
 * how, and two people editing different requests never conflict.
 *
 *   prism.workspace.json            name, environments, layout, schedules,
 *                                   and the order of the collections
 *   collections/<collection>/
 *     collection.json               its auth, headers, spec, and flow order
 *     <flow>/
 *       flow.json                   its auth, headers, and request order
 *       <request>.json              one request
 *   .prism-local/measurements.json  history and run timeline — not for Git
 *
 * Order lives in the parent's list rather than in file names, so moving a
 * request is a one-line change, not a rename. Secrets are left out exactly
 * as in a workspace file. Pure: reading and writing the disk is main.cjs.
 */
export const ROOT_FILE = 'prism.workspace.json'
export const LOCAL_DIR = '.prism-local'
export const MEASUREMENTS = `${LOCAL_DIR}/measurements.json`

const json = (v) => `${JSON.stringify(v, null, 2)}\n`

/** A name as a file or folder name: lower-case words, nothing a file system minds. */
export function slugName(name, taken = new Set(), fallback = 'untitled') {
  const base =
    String(name ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || fallback
  // Names Windows reserves are kept off the disk.
  const safe = /^(con|prn|aux|nul|com\d|lpt\d)$/.test(base) || base === ROOT_FILE.replace('.json', '') ? `${base}-1` : base
  let out = safe
  for (let i = 2; taken.has(out); i += 1) out = `${safe}-${i}`
  taken.add(out)
  return out
}

/**
 * A serialised workspace (lib/workspace.js serialise) as files.
 * @returns {Record<string, string>} relative path → text
 */
export function toFiles(doc) {
  const files = {}
  const { collections = [], history = [], runs = [], savedAt: _savedAt, ...rest } = doc
  const colTaken = new Set()
  const colDirs = []
  for (const col of collections) {
    const dir = slugName(col.name, colTaken, 'collection')
    colDirs.push(dir)
    const { flows = [], ...colRest } = col
    const flowTaken = new Set(['collection'])
    const flowDirs = []
    for (const flow of flows) {
      const fdir = slugName(flow.name, flowTaken, 'flow')
      flowDirs.push(fdir)
      const { requests = [], ...flowRest } = flow
      const reqTaken = new Set(['flow'])
      const reqFiles = []
      for (const req of requests) {
        const file = `${slugName(req.name, reqTaken, 'request')}.json`
        reqFiles.push(file)
        files[`collections/${dir}/${fdir}/${file}`] = json(req)
      }
      files[`collections/${dir}/${fdir}/flow.json`] = json({ ...flowRest, requests: reqFiles })
    }
    files[`collections/${dir}/collection.json`] = json({ ...colRest, flows: flowDirs })
  }
  files[ROOT_FILE] = json({ ...rest, collections: colDirs })
  files[MEASUREMENTS] = json({ history, runs })
  return files
}

/**
 * Files back into a serialised workspace, ready for parse().
 * @param files relative path → text, as read from the folder
 * @returns {{ ok: true, doc } | { ok: false, error }}
 */
export function fromFiles(files) {
  const read = (path) => {
    if (!(path in files)) throw new Error(`${path} is missing`)
    try {
      return JSON.parse(files[path])
    } catch (err) {
      throw new Error(`${path} is not valid JSON — ${err.message}`)
    }
  }
  try {
    const root = read(ROOT_FILE)
    const collections = (Array.isArray(root.collections) ? root.collections : []).map((dir) => {
      const col = read(`collections/${dir}/collection.json`)
      const flows = (Array.isArray(col.flows) ? col.flows : []).map((fdir) => {
        const flow = read(`collections/${dir}/${fdir}/flow.json`)
        const requests = (Array.isArray(flow.requests) ? flow.requests : []).map((file) => read(`collections/${dir}/${fdir}/${file}`))
        return { ...flow, requests }
      })
      return { ...col, flows }
    })
    let measured = { history: [], runs: [] }
    if (MEASUREMENTS in files) {
      try {
        measured = JSON.parse(files[MEASUREMENTS])
      } catch {
        // Measurements are a convenience; a broken file of them loses only trends.
      }
    }
    return { ok: true, doc: { ...root, savedAt: '', collections, history: measured.history ?? [], runs: measured.runs ?? [] } }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/** Whether a relative path is one this format writes, so pruning never touches anything else. */
export function ownsPath(path) {
  return path === ROOT_FILE || path === MEASUREMENTS || /^collections\/[^/]+\/(collection\.json|[^/]+\/[^/]+\.json)$/.test(path)
}

/** A path from a folder listing, made safe: relative, forward slashes, no way out. */
export function safeRelative(path) {
  const p = String(path ?? '').replace(/\\/g, '/')
  if (!p || p.startsWith('/') || /^[a-z]:/i.test(p) || p.split('/').some((seg) => seg === '..' || seg === '')) return null
  return p
}
