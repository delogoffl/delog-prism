/**
 * The whole surface the page is allowed to touch.
 *
 * Nothing is passed through generically — every call below is a named
 * capability with a fixed shape, so widening what the renderer can do means
 * editing this file and main.cjs together.
 */
const { contextBridge, ipcRenderer, webFrame } = require('electron')

contextBridge.exposeInMainWorld('prism', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    /** Told when the window is asked to close by any route, not only the button. */
    onCloseRequested: (fn) => {
      const handler = () => fn()
      ipcRenderer.on('window:closeRequested', handler)
      ipcRenderer.invoke('window:ready')
      return () => ipcRenderer.off('window:closeRequested', handler)
    },
    /** Closes for real, once the page has saved what it needs to. */
    closeNow: () => ipcRenderer.invoke('window:closeNow'),
    onState: (fn) => {
      const handler = (_e, state) => fn(state)
      ipcRenderer.on('window:state', handler)
      return () => ipcRenderer.off('window:state', handler)
    }
  },
  file: {
    open: (filters) => ipcRenderer.invoke('file:open', filters),
    save: (payload) => ipcRenderer.invoke('file:save', payload),
    saveBytes: (payload) => ipcRenderer.invoke('file:saveBytes', payload)
  },
  workspace: {
    autosave: (text) => ipcRenderer.invoke('workspace:autosave', text),
    /** Opens a .prism.json as the document, so Save writes back to it. */
    open: () => ipcRenderer.invoke('workspace:open'),
    restore: () => ipcRenderer.invoke('workspace:restore'),
    forget: () => ipcRenderer.invoke('workspace:forget'),
    saveAs: (payload) => ipcRenderer.invoke('workspace:saveAs', payload),
    /** The workspace as a folder of small files, for Git. */
    saveAsFolder: (payload) => ipcRenderer.invoke('workspace:saveAsFolder', payload),
    openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
    /** Writes back to an already-chosen file, so Save needs no dialog. */
    write: (payload) => ipcRenderer.invoke('workspace:write', payload),
    reveal: (path) => ipcRenderer.invoke('workspace:reveal', path),
    reread: (path) => ipcRenderer.invoke('workspace:reread', path)
  },
  /** Automatic backups, in Prism's own folder. Names are checked in main. */
  ai: {
    ask: (payload) => ipcRenderer.invoke('ai:ask', payload),
    hasKey: () => ipcRenderer.invoke('ai:hasKey'),
    setKey: (key) => ipcRenderer.invoke('ai:setKey', key),
    clearKey: () => ipcRenderer.invoke('ai:clearKey')
  },
  grpc: {
    describe: (payload) => ipcRenderer.invoke('grpc:describe', payload),
    call: (payload) => ipcRenderer.invoke('grpc:call', payload)
  },
  stream: {
    open: (options) => ipcRenderer.invoke('stream:open', options),
    send: (payload) => ipcRenderer.invoke('stream:send', payload),
    close: (id) => ipcRenderer.invoke('stream:close', id),
    onEvent: (fn) => {
      const handler = (_e, event) => fn(event)
      ipcRenderer.on('stream:event', handler)
      return () => ipcRenderer.off('stream:event', handler)
    }
  },
  mock: {
    start: (options) => ipcRenderer.invoke('mock:start', options),
    update: (options) => ipcRenderer.invoke('mock:update', options),
    stop: () => ipcRenderer.invoke('mock:stop'),
    status: () => ipcRenderer.invoke('mock:status'),
    onHit: (fn) => {
      const handler = (_e, hit) => fn(hit)
      ipcRenderer.on('mock:hit', handler)
      return () => ipcRenderer.off('mock:hit', handler)
    }
  },
  backup: {
    keep: (payload) => ipcRenderer.invoke('backup:keep', payload),
    list: () => ipcRenderer.invoke('backup:list'),
    read: (name) => ipcRenderer.invoke('backup:read', name),
    remove: (name) => ipcRenderer.invoke('backup:remove', name),
    reveal: () => ipcRenderer.invoke('backup:reveal')
  },
  cookies: {
    list: () => ipcRenderer.invoke('cookies:list'),
    clear: () => ipcRenderer.invoke('cookies:clear'),
    remove: (which) => ipcRenderer.invoke('cookies:remove', which)
  },
  http: {
    send: (spec) => ipcRenderer.invoke('http:send', spec)
  },
  shell: {
    open: (url) => ipcRenderer.invoke('shell:open', url)
  },
  /** How large the whole interface is drawn — fitted to the window on a laptop. */
  ui: {
    zoom: () => webFrame.getZoomFactor(),
    setZoom: (factor) => webFrame.setZoomFactor(Math.min(1.4, Math.max(0.6, Number(factor) || 1)))
  }
})
