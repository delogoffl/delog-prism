/**
 * Reading and writing a workspace folder on disk (lib/folder.js says which
 * files it is). Shared by the app's main process and the command line.
 *
 * Only files that format owns are ever written or removed, so a README, a
 * .git folder or anything else beside them is left alone; files whose text
 * is unchanged are not touched, so Git and editors see only real changes.
 * Node only — the window never imports this.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { toFiles, fromFiles, ownsPath, safeRelative, LOCAL_DIR, ROOT_FILE } from './folder.js'

const MAX_FILES = 20000
const MAX_BYTES = 20 * 1024 * 1024

export const isWorkspaceFolder = (dir) => {
  try {
    return statSync(dir).isDirectory() && existsSync(join(dir, ROOT_FILE))
  } catch {
    return false
  }
}

/** Every file the workspace folder holds, as relative path → text. */
export function readFolder(dir) {
  const files = {}
  let count = 0
  const walk = (rel) => {
    const abs = rel ? join(dir, ...rel.split('/')) : dir
    if (!existsSync(abs)) return
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (path === 'collections' || path.startsWith('collections/') || path === LOCAL_DIR) walk(path)
      } else if (ownsPath(path)) {
        if ((count += 1) > MAX_FILES) throw new Error(`more than ${MAX_FILES} files — is this the right folder?`)
        if (statSync(join(abs, entry.name)).size > MAX_BYTES) throw new Error(`${path} is too large to be a request`)
        files[path] = readFileSync(join(abs, entry.name), 'utf8')
      }
    }
  }
  walk('')
  return files
}

/** The folder, put back together as one workspace document's text. */
export function folderText(dir) {
  const back = fromFiles(readFolder(dir))
  if (!back.ok) throw new Error(back.error)
  return JSON.stringify(back.doc)
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.writing`
  writeFileSync(tmp, text, 'utf8')
  renameSync(tmp, path)
}

/**
 * Writes a workspace document's text as the folder: changed files written,
 * files it no longer has removed, emptied folders under collections/ gone,
 * and the measurements kept out of Git.
 * @returns {{ written: string[], removed: string[] }}
 */
export function writeFolder(dir, text) {
  const files = toFiles(JSON.parse(String(text)))
  const before = existsSync(dir) ? Object.keys(readFolder(dir)) : []
  const written = []
  const removed = []
  for (const [rel, body] of Object.entries(files)) {
    const safe = safeRelative(rel)
    if (!safe || !ownsPath(safe)) continue
    const target = join(dir, ...safe.split('/'))
    if (existsSync(target) && readFileSync(target, 'utf8') === body) continue
    writeAtomic(target, body)
    written.push(safe)
  }
  for (const rel of before) {
    if (!(rel in files) && ownsPath(rel) && safeRelative(rel)) {
      rmSync(join(dir, ...rel.split('/')), { force: true })
      removed.push(rel)
    }
  }
  const prune = (rel) => {
    const abs = join(dir, ...rel.split('/'))
    if (!existsSync(abs)) return
    for (const e of readdirSync(abs, { withFileTypes: true })) if (e.isDirectory()) prune(`${rel}/${e.name}`)
    if (rel !== 'collections' && readdirSync(abs).length === 0) rmSync(abs, { recursive: true, force: true })
  }
  prune('collections')
  const ignore = join(dir, '.gitignore')
  const line = `${LOCAL_DIR}/`
  const had = existsSync(ignore) ? readFileSync(ignore, 'utf8') : ''
  if (!had.split(/\r?\n/).some((l) => l.trim() === line)) {
    writeFileSync(ignore, `${had}${had && !had.endsWith('\n') ? '\n' : ''}# Prism's run history and timeline, kept on this machine\n${line}\n`)
  }
  return { written, removed }
}
