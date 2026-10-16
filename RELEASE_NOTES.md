# Unreleased — redesign and save fixes

## Popups, as tickets

- Confirmations and one-field prompts — clear history, discard changes,
  restore a backup, send to production, rename — are a compact card the
  size of the question instead of a page-wide sheet: a line in the
  decision's colour along the top (red for what cannot be undone, amber for
  a caution, green for an ordinary yes), a station mark, the question, and
  the answers under a perforated ticket tear. Cancel is focused, so a stray
  Enter never confirms something destructive.
- The delete confirm wears the same dress, and a request's path on it stays
  on one line.
- "All 1 runs" now reads "The one run".

## AI assistant (optional, off by default)

- **Settings → AI** turns on an assistant with the provider you choose:
  **Anthropic** (Claude, `claude-sonnet-5-5` by default) or any
  **OpenAI-compatible** service with your own API key, or **Ollama** running
  on this machine, where nothing leaves it.
- **Explain**, on a failed result's Tests tab (and in the command palette):
  why it most likely failed, and what to do next.
- **Suggest with AI**, beside Generate: checks in Prism's own terms. Anything
  that is not a Prism check is dropped, every suggestion is run against the
  last response first, the passing ones are ticked, and you add the ones you
  want.
- **You see everything it is sent** before you press Ask. Credential headers
  and secret-looking fields are masked, every secret variable's value is
  replaced wherever it appears, URLs are sent as written, and long bodies are
  cut. The API key is kept in the operating system's encrypted store and
  used by Prism's main process — never in settings, a workspace or a backup.

## Logic in a flow

- A request's new **Logic** tab makes it a step that thinks:
  - **Run only if** a condition holds — otherwise it is skipped and the flow
    goes on;
  - **Wait first**, for a job to start or a rate limit;
  - **Repeat for each** item of a list — a JSON list, or a variable holding
    one — with `{{item}}`, and `{{item.id}}` for an object's fields;
  - **Repeat until** the response says so — `json.status == "done"` — every
    so many ms, up to so many tries: polling a job, waiting for an index;
  - **If it fails**, carry on or **stop the flow**.
- **Conditions** are a small language of their own, checked as you type and
  never run as code: `status`, `time`, `json.…`, `header.…`, `var.…`,
  `item`, compared with `== != < > <= >= contains matches exists`, joined
  with `and`, `or`, `not` and parentheses. Comparisons are loose where it
  helps (`"200"` equals `200`).
- What happened becomes checks under **Logic** — "json.status == "done"
  held after 3 tries", "3 items — 3 passed" — and polling that gives up says
  what it last saw.
- **On the canvas**, a step shows its logic as small marks — `if`, a wait,
  `each`, `until`, `stop` — and a skipped step reads Skipped, on the board too;
  steps after a stop read Not run.
- Run flow, Run all, the Runner, Schedules, Compare and `prism-run` all follow
  the rules; a load test sends plainly. A captured list or object is now kept
  as JSON, so a for-each can walk it.

## gRPC

- **gRPC requests**, from the method picker's *Other protocols*. Load the
  service's **.proto** file and Prism lists its services and methods and
  fills in an example message — nested messages, enums, maps and Google's
  well-known types included. The address bar holds `host:port`
  (`grpcs://host:port`, or port 443, for TLS); headers go as metadata.
- **Unary calls and server streaming** (the stream's messages come back as a
  list). Client and bidirectional streaming say plainly they are not
  supported yet.
- **A gRPC call is a response like any other.** Its status is mapped to the
  HTTP status that means the same — NOT_FOUND to 404, UNAUTHENTICATED to
  401 — with the gRPC name as its status text and the trailers as headers,
  so the Payload tab, assertions, captures, scripts, flows, the Runner,
  reports and `prism-run` all work with it. Variables work in the message.
- The `.proto` is saved with the request, so the workspace needs no other
  file. `@grpc/grpc-js` and `@grpc/proto-loader` (Apache-2.0) are now
  dependencies.

## WebSocket and Server-Sent Events

- **Live connections**, from the method picker's *Live connections*: **WS**
  for a WebSocket, **SSE** for a stream of Server-Sent Events. Send becomes
  **Connect** and **Disconnect**.
- The address and headers are built as a send builds them: variables,
  inherited headers and the request's auth all apply. A
  `Sec-WebSocket-Protocol` header picks the subprotocol.
- The **Messages** tab is the live log — sent ↑ and received ↓, with
  milliseconds, JSON pretty-printed, an SSE event's type on its own chip —
  and, for a WebSocket, a box to send a message (Ctrl+Enter). Connects and
  closes go to the Console too.
- Connections are opened from the main process, with TLS verification as
  set in Settings; the log is for the session only. A WS or SSE request is
  saved with its kind; flows and the Runner pass over it, as a connection is
  held open by hand rather than run to an end.

## Workspaces as folders, for Git

- **Save as a folder, for Git…** (the Save menu, or the command palette)
  keeps the workspace as a folder of small files — one per request, under
  its collection and flow — so a pull request shows exactly which request
  changed, and two people editing different requests never conflict.
- Order is kept in each parent's list, not in file names, so moving a
  request is a one-line change. Files end with a newline; unchanged files
  are not rewritten.
- Save and Ctrl+S write back to the folder; a renamed or deleted request
  removes its file. Only Prism's own files are ever written or removed — a
  README or `.git` beside them is left alone.
- The run history and timeline go in `.prism-local/`, which is added to
  `.gitignore`. Secret values are left out, as in a workspace file.
- **Open a workspace folder…** opens one; Prism reopens it on start like a
  file. `prism-run <folder>` runs it on the command line.

## Schedules

- **Runner → Schedules** runs a collection or flow on a timer — every
  minute up to once a day — against an environment of its own, while Prism
  is open (minimised counts). A schedule never changes the environment you
  are working in.
- Every scheduled run goes into the history and the run timeline. A
  **desktop notification** says when one fails — or after every run, or
  never.
- Each schedule shows how its last runs went, when the next one is, Run
  now, pause and delete. Schedules are saved with the workspace; their
  results are measurements and never mark the file as changed.
- Runs missed while Prism was closed are not made up when it opens: there is
  no server.

## Test data from a schema

- **Runner → Data → Generate test data from a schema…** builds the rows for
  testing a request's input validation. Each row is the request's body with
  one thing changed: a string empty, at its length limit or one past it, in
  other scripts, only spaces, or the wrong format; a number at its bounds and
  one beyond, a fraction where an integer is expected, a number as a string;
  each enum value and one outside the list; true, false and "true"; null;
  and each field left out.
- The rules come from the collection's **OpenAPI spec** when it describes
  the body, or are inferred from the body as written.
- **Whether the API should accept each row is worked out from the schema**,
  not guessed, and the run judges each send by it: accepted with a 2xx, or
  refused with a 4xx. A 5xx always fails. The rest of the flow — signing in,
  say — runs as usual each iteration, and the request itself is not changed.

## Run timeline

- **History → Run timeline** keeps every run of a flow — from Run flow, Run
  all, a collection run, or a single pass of the Runner — the newest 60, saved
  with the workspace.
- Each run is listed with its time, environment, duration and a dot per
  request. **Pick any two** (A and B) and Prism says what changed between
  them: what broke, what was fixed, statuses that moved, what got slower or
  faster, checks that started or stopped failing, and fields that appeared,
  vanished or changed type.
- A run keeps measurements and shapes only — statuses, times, which checks
  passed, each body's structure as types — never a value, so it is as safe
  to save and share as the history. It is not counted as an unsaved edit.

## Load test

- **Runner → Load test** sends a flow's requests with several users at
  once — up to 50, for up to five minutes — with a ramp-up and a think time
  between a user's requests. Scripts, captures and checks run as they do in
  a run.
- A live board — users, requests, per second, p50, p95, errors — a chart of
  requests per second with errors and the p95 over the run, the status codes
  seen, and every request's count, errors, p50, p95, p99 and max, slowest
  first.
- **Budget**: set a p95 and an error rate, and the run says plainly whether
  it stayed within them. A failed send, a 4xx or 5xx, or a failed check
  counts as an error.
- Load sends are counted, not written one by one into the history, the
  canvas or the console. **Copy as Markdown** for a ticket. Meant for your
  own API, or one you have permission to test.

## Comparison results, restyled

- Compare environments lists its results the way the collection runner does
  — one ruled list, a dot per pair, the reason under the name in mono — and
  names the environments in its reasons ("Staging is 3.7× slower"). A send
  that fails in both environments now counts as a break.

## Mock server

- **Runner → Mock server** answers in your API's place at
  `http://127.0.0.1:<port>`, from what Prism holds: each request's frozen
  baseline or last response, and — for anything never sent — an example
  built from the collection's OpenAPI document. Operations the spec declares
  that no request covers are served too.
- Routes follow the requests as written: `{{base_url}}/users/:id` answers
  `/users/42`, and the most literal route wins.
- **Use it in an environment** makes a *Mock* environment whose base URL is
  the server, so flows, the Runner and Compare run against it.
- A delay before each answer, CORS for front ends on another port (on by
  default), a choice of baseline-first or last-response-first, a live list of
  calls (also in the Console), and a *Mock :port* light in the status bar.
- Bound to 127.0.0.1 only: nothing else on the network can reach it. It
  stops when Prism closes.

## Checked against the OpenAPI spec

- **An OpenAPI or Swagger document stays with its collection.** Importing
  one keeps it; any collection — from Postman, say — can **Attach OpenAPI
  spec…** from its menu, JSON or YAML.
- **Every response is checked against it** on every send: the operation is
  found by method and path, and the status, content type, body schema and
  required headers are compared with what the spec documents. Each break is
  a failed check — in Tests, on the board, in the Runner and in reports —
  under **Contract**. Fields the spec does not mention are listed, not failed.
- **Contract** tab on the response: the operation, its documented statuses
  with the one that came back lit, and every finding. A switch turns the
  failing off and keeps the findings.
- **Runner → Spec coverage**: which documented operations the requests call
  and which statuses were seen, every request's findings, and **Send and
  check** to send them all first.
- The command-line runner checks the same way and fails the run on a break;
  `--no-spec` turns that off.
- **YAML imports**: OpenAPI documents written in YAML now import (js-yaml,
  MIT, is bundled).

## Compare environments

- **Runner → Compare environments** runs the same requests in two
  environments — Staging and Production, say — and grades each pair side by
  side: **Breaks** (another status class, a field missing or of another type,
  another content type, a check passing on one side only, a failed send),
  **Differs** (another status in the same class, a field only in B, twice as
  slow) or **Same**.
- Values — ids, names, timestamps — are expected to differ between
  environments, so they are counted rather than failed.
- Each row shows both statuses and times with a time bar, and opens to the
  reasons and a field-by-field table of what is missing, retyped or extra.
- **Copy as Markdown** for a release note or a ticket. Production is
  confirmed before anything is sent. Also in the command palette.

## Console

- **Console** drawer under the canvas (Ctrl+`, the Console button in the
  left strip, or the command palette): every request as it actually went out
  — method, resolved URL, status, time and size — newest last.
- Open a request to see the request headers and body sent, and the response
  headers and body that came back, each with Copy. Script `console.log`
  lines sit under the request that ran them, and errors are kept too,
  including those only shown as a notice.
- Filter to Requests, Logs or Errors, or search by URL, name or text. Unseen
  errors are counted on the Console button.
- Credentials are masked — authorisation, cookie, key and token headers, and
  secret-looking fields in bodies — until **Show secrets**. Drag the top edge
  to resize; the height is remembered. Kept for the session, last 500 entries.

## Method picker

- The method is now a button in the method's colour that opens Prism's own
  picker: each method with what it is for, the current one ticked.
- Arrow keys and Enter, or press a method's letter (G, P, U, A, D, H, O) to
  pick it at once. A custom method such as `PURGE` or `PROPFIND` can be typed
  at the foot.

## Wider inspector

- **Maximise** the request inspector (the button beside ⋯, Ctrl+Shift+M, or
  double-click its left edge): it grows leftwards over the canvas up to the
  collections. The same again restores it.
- **Drag its left edge** to any width in between, or focus the edge and use
  the arrow keys; the width is remembered.
- Wide enough, request and response sit **side by side**, with the handle
  between them dragged left and right.
- The zoom dock moves aside rather than slipping under a widened inspector.

## Expandable sidebar

- The left strip unfolds into a sidebar with each place named beside its
  icon, and folds back: the Collapse/Expand button at its foot, or Ctrl+B.
  The collections, pages and canvas move over with it, and the choice is
  remembered.

## Collection runner

- **Runner** in the left strip: pick a collection or a flow, choose which of
  its requests to include, an environment, a number of iterations, a delay
  between requests, stop-at-first-failure, and whether variable changes are
  kept afterwards.
- **Data files**: drop or choose a CSV or JSON file and each row becomes one
  iteration, its columns `{{variables}}` and `pm.iterationData`. A preview
  shows the rows, and which columns the selected requests actually use.
- **Results as it runs**: iterations, requests, passed, failed, checks and
  duration on a board, a pass/fail bar, and every iteration with its data
  row and each request's status, time, checks and what failed. Filter to the
  failures; stop a run part-way.
- **Save report** from a run — the Prism report, JUnit XML or JSON — with one
  section per iteration.
- The command-line runner gains `--data <file>` and `--iterations <n>`.

## Scripts

- **Pre-request and test scripts** on every request, in JavaScript with
  Postman's `pm` object (`prism` is the same), so scripts copied from Postman
  run as they are: `pm.test`, `pm.expect` (chai-style), `pm.response`,
  `pm.request`, `pm.environment`, `pm.variables`, `pm.iterationData`,
  `pm.info`, `pm.execution.skipRequest`, and the older `tests[…]`,
  `responseBody` and `postman.*` forms.
- **Scripts tab** with an editor — line numbers, Tab to indent, Enter keeps
  the indent — and snippets for the common cases.
- Script tests are reported beside the assertions everywhere: the Tests tab,
  the departure board, the Runner and reports. `console.log` output shows in
  a new **Console** tab on the response.
- **Sandboxed**: in the app a script runs in a worker of its own with no
  network, no files, none of the app's controls and no code from outside the
  app, and is stopped after 5 seconds.
- **Postman**: a collection's pre-request and test scripts are imported as
  scripts and run, rather than half-translated into assertions; exporting to
  Postman writes them back. Scripts are saved with the workspace, run by the
  command-line runner, and carried in backups.

## Backup and restore

- **Automatic backups** of the whole workspace — collections, flows,
  environments, the canvas arrangement, baselines and run history — and this
  machine's settings. Taken a few seconds after Prism starts, every hour
  while you work, and before anything replaces the workspace: opening another
  one, discarding changes, deleting the saved workspace, or a restore. An
  hourly backup of untouched work is skipped; the newest 30 are kept. Can be
  turned off in Settings → Data.
- **Backups** (workspace menu, Settings → Data, or Ctrl K → *Restore a
  backup*) lists them newest first with what each holds and why it was
  taken. Restore any of them, save a copy, or delete one.
- **Back up to a file** and **Restore from a file**, to keep a backup
  elsewhere or move a setup to another machine. Restore also accepts a plain
  `.prism.json` workspace file.
- **Every restore is undoable**: the workspace open at the time is backed up
  first.
- **No secrets in backups.** Secret values are never written, as with
  workspace files. A restore keeps the secrets open at the time where the
  environment and name match, and names any left to fill in.

## Exported code carries every assertion

- **Every assertion is written out**, not only status, time and a few JSON
  checks. Types, formats, lengths, ranges, patterns, uniqueness, order,
  headers, cookies and schemas all reach the export, so a suite generated in
  Prism arrives whole.
- **JavaScript (fetch, axios, undici) and Python (requests)** exports end in
  a small check runner: each check printed as passed or failed, and a failing
  exit code when any failed, so the file runs in CI as-is.
- **pytest, Playwright and Postman** get every check as a test; **REST
  Assured** gets every check Hamcrest can express, and names the rest.
- **Java, C#, Go, PHP and cURL** list the checks in a comment and verify the
  expected status.
- The exported checks follow Prism's own rules — loose equality, paths with
  wildcards, formats — and are tested to pass and fail exactly where Prism
  does.

## Run reports

- **Save report** on the departure board when a run finishes: an HTML report
  to read and share, JUnit XML for CI, or JSON. Run all and a collection run
  make one report covering every flow.
- **The Prism report** is a single self-contained page in Prism's own look,
  with its typefaces embedded:
  - a departure board — departures, on time, delayed, cancelled, not run,
    checks and duration — and a ring for the share of checks that passed;
  - a **network map** of the run: each flow a line, each request a stop,
    coloured by how it went;
  - **Needs attention**: every failure first, with what was expected and
    what came back, each linking to its request;
  - **Coverage** of checks by part of the response, and **Timing** —
    median, 95th percentile, slowest, bytes transferred;
  - **Journeys**: a timeline per flow, then every request with its URL,
    status, time, size and content type, what it arrives and leaves with,
    every check, and a response sample with credentials masked;
  - All / Failed / Passed filters, light and dark, and clean printing —
    with no scripts at all.
- Also from the command palette: *Save the last run report*.
- The command-line runner gains `--reporter html`, and its JSON and JUnit
  come from the same code as the app's.
- Reports show URLs as written, `{{variables}}` unresolved, so a token
  never travels with a shared report.
- Result wording is past tense throughout: *8 passed*, *1 failed*.

## Metro

The workspace redrawn as a transit map. (Neon Glass is kept, untouched, in
`rebind-prism-neon-glass-backup` beside this folder.)

- **Every flow is a line** in its own colour, drawn through its requests as
  stops, with level runs and 45° bends like a printed map. The same colour
  marks the flow in the sidebar and on the stop card.
- **Stops say how they went at a glance:** ringed in the line's colour, a
  green centre once run clean, filled red when a check failed, amber for a
  client error, and the ring turning while it sends. The picked stop grows.
- **Interchanges:** a value captured on one flow and used on another is a
  dotted transfer between the two stops, with the value's name on a tag.
- **A flat, ruled shell:** paper ground, 3px ink rules between the bar, the
  strip of places, the sidebar and the stop card; outlined controls and black
  pills for the primary action. Night (dark) and Pure black versions.
- **The stop card** is docked on the right by default, headed by its line and
  where it sits on it ("Checkout line · stop 4 of 5").
- **Runs report on a departure board:** black and amber, one row per request
  with the time it left, its status, its time and a remark — On time,
  Delayed, Cancelled — laid across the foot of the open map.
- **Familjen Grotesk and Space Mono are bundled** (SIL Open Font License).

## A new look

- **Canvas first, like an automation tool.** The flow canvas takes the whole
  workspace. Each flow is a row and its requests run left to right, so a
  flow reads in the order it runs. The inspector is a drawer that slides in
  when a request is picked and slides away with ✕, Esc or a click on the
  empty canvas; the canvas frames itself around it.
- **Steps, not boxes.** Each request is a rounded card led by a large icon
  for what it does — download for GET, send for POST, rewrite for PUT, pencil
  for PATCH, bin for DELETE — with its name, method and path beside it. How
  it went is a badge on the corner: a green check, a red cross, or a spinner
  while it runs, with a light that travels round the card's edge.
- **Build where the flow ends.** A "+" after each flow's last step adds the
  next request; a big Run flow button sits on the canvas itself.
- **Floating workspace.** The collections, the canvas and the drawer are
  rounded panels over an aurora backdrop, and the icon rail is a dock with
  every place named under its icon. Pages use the same panels. Wires glow,
  and the ones touching the picked or running request animate in the
  direction the value travels.
- **Suite health** at the foot of the sidebar: how many requests passed their
  last run, and Run all.
- **Inter and JetBrains Mono are bundled** (SIL Open Font License, in
  `renderer/fonts`), so the app looks the same on every machine.
- **A new design system.** Deeper, layered surfaces lit from the top edge, a
  violet accent with a soft glow on the one primary action, and display type
  for headings. Every method has its own hue — GET, POST, PUT, PATCH and
  DELETE read the same in the tree, on the plane, in the inspector and in the
  palette. Dark and light were both redrawn, and both pass the contrast rules.
- **The stylesheet was rewritten** as one layer per surface instead of a base
  plus override layers, so a rule means what it says where it is written.
- Nodes carry a hairline under the footer that fills with the share of
  assertions that passed. The Tests tab's count turns green or red with the
  last run.

## Assertions, rebuilt

- **Eleven subjects and over forty operators.** New: JSON Schema, cookies
  (value and flags), redirects and transport. JSON paths gain `[*]` wildcards
  that check every item, `[-1]`, a leading `$.`, formats (email, UUID, ISO
  date and date-time, URL, IPv4/6, JWT, semver and more), ranges, one-of
  lists, sorted, unique, null, true and false.
- **The Tests tab is a studio.** A score ring, then each assertion as two
  readable lines — what is checked, and how — with what the last response
  said underneath. Values from a fixed list (types, formats, classes, flags)
  are picked, not typed.
- **Generate** proposes a suite read off the last response — types, formats
  and shape rather than today's values — and every suggestion is checked
  against that response before it is offered.
- **The library** holds 55 ready-made checks across status codes,
  performance, headers, body, JSON fields, schema and security headers.
- **The Result tab is a report**: failures first, each written as the
  sentence it checks and what was seen. Response headers and body values
  offer one-click assertions on their type and format as well as their value.

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
