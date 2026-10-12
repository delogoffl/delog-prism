# Unreleased — redesign and save fixes

## Saving, fixed

- **Import no longer hijacks Save.** Importing a Postman collection, a HAR or a
  dataset recorded that file as the open workspace; after a restart, Ctrl+S
  overwrote it with a Prism workspace. Only a file that is a Prism workspace
  can become the Save target now, and one remembered by an older build is
  dropped.
- **Collection and flow auth and headers are saved.** They were never written,
  so a token set once on the collection vanished on the first save.
  GraphQL variables were dropped the same way.
- **Every edit is noticed.** Assertion and capture fields, dragging a node and
  sending a request changed the workspace without saying so. Unsaved state is
  now worked out by comparing what is on screen with what was last written,
  so typing a value back clears it and opening a file no longer marks it
  unsaved.
- **Every way of closing saves.** Alt+F4, the taskbar and Cmd+Q now get the
  same flush and the same "save changes first?" as the close button.
- Run history and hand-placed node positions come back on open.
- An edit made while a save was in flight is no longer marked saved.
- `prism-run` applies collection and flow auth and headers, as the app does.

## Fixed

- The save-response button did nothing until Copy had been clicked once.
- The bar's Export opened a blank or broken page.
- Flow export to a code target printed a placeholder, and collection export
  exported only the first flow. Exports and Copy as cURL now include inherited
  auth, and a stray backslash no longer breaks the exported cURL.
- A collection's auth and headers sheet now updates as you edit it.
- Running a flow against production no longer hangs on stacked confirms, and
  the ten-times and dataset runs now ask before sending to production.
- Proxy and certificate paths survive a restart; the passphrase is never
  written to storage.
- Postman collection and folder auth is imported and inherited.
- Duplicating a flow or collection keeps its auth and headers.
- Dropping a table on the Data tab no longer leaves the import overlay up.
- Deleting a request removes its baseline from the saved workspace.

## The plane

- The mouse wheel zooms around the pointer instead of sliding the graph down.
  Shift+wheel pans sideways, a trackpad still pans with two fingers and zooms
  with a pinch, and Settings → Appearance can make the wheel pan again.
- Canvas shortcuts: Ctrl = / Ctrl − / Ctrl 0 to zoom, Shift 1 to fit, Up and
  Down to step through requests, Ctrl D to duplicate, Ctrl N for a new
  request, Delete to delete (after asking).
- Right-click a node for its actions, or empty space for new request, run,
  zoom and tidy. Double-click a node to edit its endpoint; double-click empty
  space to fit.
- The zoom buttons zoom around the middle of the view, Fit centres the graph
  above the toolbar, and Ctrl with the wheel no longer zooms the whole window.

## A pure API testing tool

- **Recording is gone.** No recorded-calls panel, no "turn into a test", no
  recorded statuses on nodes, and Rebind workspace and flow files are no
  longer an import format. Postman, OpenAPI, HAR and cURL import as before;
  a HAR's requests still start with assertions proposed from the responses.
- **A first start is empty**, on the welcome screen, rather than opening a
  recorded demo.
- **Fixed: a deleted collection appeared to come back.** Deleting the last
  collection and reopening brought the demo back, because an empty saved
  workspace was treated as "nothing saved". It now reopens empty.
- **Environments** redesigned: the name with an Active badge and a summary
  line; a strip of counts; one "Needs attention" card with a fix beside each
  item (and "Add all"); and the variables as a table edited in place, with a
  filter that never loses the caret, Paste .env, and a reveal button on
  secrets.
- **Settings → About** redesigned: the product, four principles, what it will
  not do, and the licence. It no longer claims your work lives in memory.

## Pages, rebuilt

- **No more blinking.** Flipping a setting or picking an export format used to
  tear the page down and fade a new one in, jumping back to the top. The page
  now updates in place and keeps its scroll position.
- **Full width.** Pages no longer sit in a narrow centred column; content
  fills the window beside the sidebar.
- **One header per page**: a breadcrumb and Back on top, then the title and
  the page's main actions (Save file, Clear history, Run every flow) in a band.
- **Settings** is one page: every group in turn, a sidebar that follows the
  scroll, and a search that narrows to any setting by name or by what it does.
- **History** is an activity dashboard: an "All runs" view with runs, pass
  rate, median, p95 and slowest; a timeline of every run drawn as bars by
  time and outcome; and a runs table filterable by failed and slowest, with
  each request's own view scoped the same way.
- **Environments**: counts as stat cards and the variables as a full-width
  table.
- **Export** works like an editor: the file fills the page under a tab, with
  scope, Copy and Save file in the header.
- **Help** reads like documentation: the article, an "On this page" list of
  its headings, and Previous / Next at the foot.

## The workspace

- **Nodes** are larger and readable at the size a flow opens at: method,
  name and a status pill in the header, the path under it, needs and gives
  in two labelled columns, and a footer with auth, body, timing and the
  assertion score. Wires attach to handles on the card's edge. A failing
  node is outlined red.
- **Lanes** group each flow's nodes, with its name, request count, how its
  last run went and a Run button.
- **Minimap** in the corner of the plane; click or drag in it to move.
- A workspace **opens on its flow** at a readable zoom; Fit still frames
  everything.
- **Overview** page (the house in the rail): requests, flows, pass rate,
  median time and environments at a glance, every flow with its pass bar and
  Run and Open buttons, recent activity, and quick actions.
- **Workspace switcher** in the bar: the workspace name with where you are
  under it, opening rename, save, open, import and export.
- **Command palette** rebuilt: requests and commands grouped, icons and
  shortcuts on every row, more commands (Overview, Fit, toggle the sidebar,
  switch theme).
- The inspector's tabs are an underlined strip that scrolls rather than
  wraps; key–value editors are table cards with an empty state; the
  response's status, time, size and assertion score are chips.
- Request rows in the tree show how each one last went.
- A new canvas shows four ways to start.
- Dialogs, menus and toasts restyled; a flow run reports once instead of a
  toast per request; primary buttons use the accent everywhere.

## Pages

Environments, History, Export, Settings and Help are full pages in the app
rather than boxes floating over it. Each has a sidebar of its sections, a
breadcrumb, a large heading and its content in a centred column of cards; the
rail marks which one is open. Escape, Back to workspace, the breadcrumb, the
Collections icon or clicking the page's icon again returns to the plane as it
was left, and dialogs and the command palette still open on top. Export has
its own rail icon. Settings rows are grouped into one card per section,
switches use the accent colour, environment variables sit in a table card,
and Help's shortcuts are drawn as a key table.

## Redesigned

An activity rail (collections, environments, history, help, settings), a
foldable sidebar, a quieter command bar with one accent action, a floating
canvas toolbar, a segmented-tab inspector and a status line. Wire labels no
longer print over each other, and the recorded-calls card folds to a chip.

---

# Rebind Prism 0.1.0

First release. **MIT licensed** — no account, no licence key, and no feature held
back for a paid tier. Everything the app does, it does for everyone.

Prism is a desktop workspace for API **workflows**. A request is rarely
interesting on its own; what breaks is the join between two steps — log in, take
the token, fetch the profile, take the id, place an order. So the middle of the
screen is a plane with your requests laid out on it and the variables drawn
travelling between them, with a timeline underneath saying where the
milliseconds went.

It is a program in its own right. It shares no code with Rebind Engine, does not
read its database, and does not need it installed — the two meet at a file and
nowhere else.

---

## Download

**Rebind Prism Setup 0.1.0.exe** — Windows 10/11, 64-bit · 91 MB
*(about 325 MB installed)*

Installs per-user, so it needs no administrator rights.

**Rebind Prism-0.1.0-win.zip** — 126 MB · portable, no installer
Unzip and run `Rebind Prism.exe`. For locked-down machines and CI images.

### Verify the download

```
SHA-256  c02e0e9687406a122941e0d321f719d88998e463bd4af698510d15ffc53515f0
```

```powershell
certutil -hashfile "Rebind Prism Setup 0.1.0.exe" SHA256
```

### Windows will warn you

This build is **not code-signed**, so SmartScreen shows *"Windows protected your
PC"* and the publisher reads *Unknown*. **More info → Run anyway**.

That is about the absence of a certificate, not about anything found in the
file. The hash above is the real check.

---

## What works

Wired end to end, not mocked:

- **Sending** from the main process, with real DNS / TCP / TLS / wait / download
  timings taken from Node's own socket events. A number measured in the renderer
  would be one figure with a guess split across it.
- **Assertions** — 7 subjects (status, response time, size, content type,
  header, body, JSON path) each reporting what it actually saw. A red row that
  will not say what it found is a row people delete.
- **Chaining.** A captured value lands in the environment, so the next request
  uses it without anyone copying anything.
- **Schema tree**, **response diff** against the previous run of the same
  request, **history**, and **flow runs** with a progress ring.
- **Baselines and drift**, **data-driven runs**, **GraphQL**, and auth set once
  and inherited.
- **Insights** — every finding is a rule over the response that just came back,
  carrying the evidence that produced it. Not a model: a checklist that is
  always right about six things beats a paragraph that is usually right about
  ten.
- **Export to 15 targets** with a live preview — cURL, Python, pytest, fetch,
  axios, Node, Playwright, Java, REST Assured, C#, Go, PHP, Postman, OpenAPI
  and canvas.

## The one rule about credentials

**No credential is ever inlined in an export.** A `{{token}}` comes out as a
read of an environment variable in every one of the fifteen targets, because
exported code gets committed, pasted into tickets and put on screen shares. The
Postman export declares variable *names* with empty values for the same reason.

This is enforced by a test that hands every generator an environment full of
real-looking secrets and fails if any of them reaches any file. Request headers
in the inspector are masked on the same grounds.

## What it imports

Drop a file on the window or use **Import** — both go through the same front
door, so what works one way works the other.

| File | Result |
| --- | --- |
| Rebind **workspace** export | A collection, with its recorded calls and environments |
| Rebind **flow** export | One flow |
| **Postman** collection v2.1 / v2.0 | Folders become flows; auth, query rows and test scripts come across |
| **Postman** environment | The variables |
| **OpenAPI** 3 / Swagger 2 | Tags become flows; examples and enums fill the rows |
| **Prism** workspace | Everything, including baselines and layout |
| **HAR** capture | Assets and duplicates dropped, the shared host becomes a variable |
| **cURL** command | Pasted from the clipboard with `Ctrl+Shift+V` |

Postman test scripts are JavaScript, so Prism reads the handful of shapes that
make up most real scripts and **leaves the rest**. A collection that imports
with two of its five checks is honest; one that imports with five checks it does
not actually perform is not.

---

## Deliberately not built

Listed because a missing feature you were told about is a decision, and one you
discover is a bug:

- **Replay.** That is Rebind Engine's job.
- **Network recording.** Prism has no browser. It receives recordings from
  Engine.
- **Postman pre-request scripts.** Read as text, not executed.
- **Performance analytics across runs.** History holds a session; there is no
  P95 or latency heatmap, because there is nothing durable to compute one from.
- **Binary request bodies.** Export the request to send one.

## Known limitations

- **Windows only** in this release. macOS and Linux targets are configured but
  not produced yet — each needs a machine of its own to build on.
- **Unsigned**, as above.
- **No auto-update.** Prism has no update mechanism at all; watch this
  repository's releases.
- **`prism-run`, the CI runner, is not on npm yet.** The command ships inside
  the app, but the `npx prism-run` invocation needs the npm package published —
  that is a separate release step and has not happened. Until then, run it from
  a source checkout.
- **0.1.0 is a first cut.** The version says so on purpose.

---

## For the curious

No framework, no bundler, no build step — the app is plain ES modules and Node
built-ins. Electron and electron-builder are its only dependencies and both are
dev-only, so there are **zero runtime dependencies**. The test suite is **399
tests** that run on a bare Node install: no Electron, no browser, no display.
