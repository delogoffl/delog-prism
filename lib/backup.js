/**
 * Backups.
 *
 * A backup is everything Prism needs to put a working setup back: the whole
 * workspace — collections, flows, environments, the canvas arrangement,
 * baselines and run history — and this machine's settings, in one file.
 *
 * What is never in one is the same as for a workspace file: the value of a
 * secret variable, and a secret setting such as a certificate passphrase.
 * Backups are kept on disk and get copied to other machines; a live token in
 * one would outlive every rotation of it. After a restore, Prism names the
 * secrets to refill, exactly as when a workspace file is opened.
 *
 * Restoring also accepts a plain workspace file, so a .prism.json saved
 * months ago can be brought back the same way.
 */
import { serialise, parse, FORMAT as WORKSPACE_FORMAT } from './workspace.js'

export const FORMAT = 'prism.backup'
export const VERSION = 1

/** How many automatic backups are kept; the oldest go first. */
export const KEEP = 30

/** Why a backup was taken, in the words the list shows. */
export const REASONS = {
  manual: 'Backed up by you',
  start: 'When Prism started',
  hourly: 'Hourly while you worked',
  restore: 'Before a restore',
  open: 'Before opening another workspace',
  import: 'Before an import replaced it',
  revert: 'Before discarding changes',
  forget: 'Before the saved workspace was deleted'
}

/** What is in a workspace, counted for the list. */
export function summarise(doc) {
  const collections = doc?.collections ?? []
  const flows = collections.flatMap((c) => c.flows ?? [])
  return {
    collections: collections.length,
    flows: flows.length,
    requests: flows.reduce((n, f) => n + (f.requests?.length ?? 0), 0),
    environments: (doc?.environments ?? []).length,
    runs: (doc?.history ?? []).length
  }
}

/**
 * The content of a backup, without the moment it was taken: two backups of
 * the same work have the same fingerprint, so an hourly backup of a
 * workspace nobody touched is not taken again.
 */
export function fingerprint(doc, settings) {
  const { savedAt, ...rest } = doc ?? {}
  void savedAt
  const text = JSON.stringify({ rest, settings: settings ?? {} })
  // FNV-1a: not for security, only to tell two backups apart cheaply.
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * A backup of the state the app holds.
 *
 * @param {object} state     what `serialise` reads: collections, environments, …
 * @param {object} options   name, settings (secret ones already removed), reason, app
 */
export function makeBackup(state, { name, settings = {}, reason = 'manual', app = '' } = {}) {
  const workspace = serialise(state, { name })
  return {
    prism: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    reason,
    app,
    summary: summarise(workspace),
    fingerprint: fingerprint(workspace, settings),
    workspace,
    settings
  }
}

/**
 * Reads a backup — or a plain workspace file — for restoring.
 *
 * Returns `{ ok, workspace, settings, createdAt, reason, summary, kind }`,
 * where `workspace` is already in the app's own shape, or `{ ok: false,
 * error }` saying what is wrong with the file in words a person can act on.
 */
export function readBackup(text, fileName = '') {
  let doc
  try {
    doc = JSON.parse(String(text))
  } catch (err) {
    return { ok: false, error: `${fileName || 'That file'} is not valid JSON — ${err.message}` }
  }
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'That file holds a value, not a backup.' }

  // A workspace file restores as a backup with no settings in it.
  if (doc.prism === WORKSPACE_FORMAT) {
    const parsed = parse(text, fileName)
    if (!parsed.ok) return parsed
    return { ok: true, kind: 'workspace', workspace: parsed.workspace, settings: null, createdAt: doc.savedAt ?? '', reason: '', summary: summarise(doc) }
  }
  if (doc.prism !== FORMAT) {
    return { ok: false, error: 'That is not a Prism backup or workspace. Use Import for a Postman collection, an OpenAPI document or a HAR file.' }
  }
  if (Number(doc.version) > VERSION) {
    return { ok: false, error: `That backup was made by a newer Prism (format ${doc.version}, this build reads ${VERSION}). Update Prism to restore it.` }
  }
  const parsed = parse(JSON.stringify(doc.workspace ?? {}), fileName)
  if (!parsed.ok) return { ok: false, error: `The workspace inside that backup cannot be read — ${parsed.error}` }
  return {
    ok: true,
    kind: 'backup',
    workspace: parsed.workspace,
    settings: doc.settings && typeof doc.settings === 'object' ? doc.settings : null,
    createdAt: doc.createdAt ?? '',
    reason: doc.reason ?? '',
    summary: doc.summary ?? summarise(doc.workspace)
  }
}

/** The file name an automatic backup is kept under: sortable, readable, safe. */
export function backupFileName(backup) {
  const stamp = String(backup.createdAt).replace(/[:.]/g, '-').replace('Z', '')
  return `${stamp}-${String(backup.reason || 'manual').replace(/[^a-z]/gi, '')}.prism-backup.json`
}

/** Which backups to delete so only the newest `keep` remain. Names sort by time. */
export function toPrune(names, keep = KEEP) {
  return [...names].sort().reverse().slice(keep)
}
