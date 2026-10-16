/**
 * Draws Prism's app icon — the mark from the top-left of the app, a stop on
 * an orange line — and writes it as build/icon.png (window and taskbar),
 * build/icon.ico (the Windows executable and installer) and icon/Prism.png
 * (the master).
 *
 *   npx electron scripts/make-icon.cjs
 *
 * It is drawn per size rather than scaled down from the master: at 16 and 24
 * pixels the ring and the line are thickened so they stay crisp instead of
 * blurring into the tile.
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')

// The colours of the mark in the app: ink ring, paper fill, line 1 orange.
const PAPER = '#f4f1ea'
const CARD = '#ffffff'
const INK = '#111111'
const LINE = '#e35a12'

/** The mark on a paper tile, as SVG, tuned for the size it will be shown at. */
function svg(size) {
  const small = size <= 32
  const s = 1024
  // A rounded tile with a hairline edge, so it holds its shape on a dark taskbar.
  const inset = small ? 16 : 40
  const radius = small ? 200 : 220
  // The ring: in the app it is 30px across with a 5px border; the line is 8px
  // tall and runs 14px past it on each side.
  const d = small ? 540 : 470
  const ring = small ? d * 0.2 : (d * 5) / 30
  const bar = small ? d * 0.3 : (d * 8) / 30
  const run = small ? 440 : (d / 2) * (58 / 30)
  const c = s / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <rect x="${inset}" y="${inset}" width="${s - inset * 2}" height="${s - inset * 2}" rx="${radius}" fill="${PAPER}"/>
  <rect x="${inset + 6}" y="${inset + 6}" width="${s - inset * 2 - 12}" height="${s - inset * 2 - 12}" rx="${radius - 6}" fill="none" stroke="${INK}" stroke-opacity="0.1" stroke-width="12"/>
  <rect x="${c - run}" y="${c - bar / 2}" width="${run * 2}" height="${bar}" rx="${bar / 2}" fill="${LINE}"/>
  <circle cx="${c}" cy="${c}" r="${d / 2 - ring / 2}" fill="${CARD}" stroke="${INK}" stroke-width="${ring}"/>
</svg>`
}

/** A Windows .ico holding PNG images, which every Windows since Vista reads. */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const dir = Buffer.alloc(16 * images.length)
  let offset = 6 + dir.length
  images.forEach(({ size, png }, i) => {
    const at = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, at)
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1)
    dir.writeUInt8(0, at + 2)
    dir.writeUInt8(0, at + 3)
    dir.writeUInt16LE(1, at + 4)
    dir.writeUInt16LE(32, at + 6)
    dir.writeUInt32LE(png.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...images.map((x) => x.png)])
}

async function render(win, size) {
  const page = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg(size)}</body></html>`
  win.setContentSize(size, size)
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
  await new Promise((r) => setTimeout(r, 120))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  // capturePage works in device pixels; bring it back to exactly size × size.
  return image.resize({ width: size, height: size, quality: 'best' }).toPNG()
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  win.webContents.setZoomFactor(1)

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const images = []
  for (const size of sizes) images.push({ size, png: await render(win, size) })
  const master = await render(win, 1024)
  const window512 = await render(win, 512)

  mkdirSync(join(ROOT, 'build'), { recursive: true })
  mkdirSync(join(ROOT, 'icon'), { recursive: true })
  writeFileSync(join(ROOT, 'build', 'icon.ico'), ico(images))
  writeFileSync(join(ROOT, 'build', 'icon.png'), window512)
  writeFileSync(join(ROOT, 'icon', 'Prism.png'), master)
  console.log(`wrote build/icon.ico (${sizes.join(', ')}), build/icon.png (512), icon/Prism.png (1024)`)
  app.exit(0)
})
