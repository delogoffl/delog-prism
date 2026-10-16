/**
 * Where scripts run: a worker of their own.
 *
 * A worker has no window, no document and no `window.prism` — none of the
 * app's controls, files or settings exist here. The page it is served from
 * carries a policy (see main.cjs) that allows this file and its own modules
 * and nothing else: no network, no code from outside the app. On top of that,
 * the network objects are removed before a script runs, and the host stops
 * the worker if a script runs too long.
 *
 * One worker per script, thrown away after, so nothing one script leaves
 * behind is seen by the next.
 */
import { runScript } from '../lib/script-runtime.js'

for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'BroadcastChannel', 'indexedDB', 'caches']) {
  try {
    Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false })
  } catch {
    /* not defined in this build: nothing to remove */
  }
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

/** The script's code as the body of a function that sees only what it is given. */
const evaluate = (code, globals) => new AsyncFunction(...Object.keys(globals), code)(...Object.values(globals))

self.onmessage = async (event) => {
  const out = await runScript({ ...event.data, evaluate })
  self.postMessage(out)
}
