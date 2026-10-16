# Prism

A workflow-first API testing workspace. Build requests, chain the values one
captures into the next, assert on every response, and run the whole sequence
on your desktop or in CI. It imports Postman collections, OpenAPI documents,
HAR files and cURL commands, and takes it from there.

MIT licensed. No account, no licence key, no gated features: everything the app
does, it does for everyone.

```bash
git clone https://github.com/delogdev/rebind-prism
cd rebind-prism
npm install
npm start
```

```bash
npm test          # 791 tests. No Electron, no browser, no display needed.
npm run dist      # installers for the current platform

# and in CI
npx prism-run checkout.prism.json --env CI --reporter junit --out results.xml
npx prism-run checkout.prism.json --env CI --reporter html --out report.html
npx prism-run checkout.prism.json --env CI --data users.csv   # one iteration per row
npx prism-run ./shop-workspace --env CI                       # a workspace saved as a folder
```

Requests can carry **pre-request and test scripts** in JavaScript with
Postman's `pm` object (`prism` is the same object), so Postman scripts run as
they are. In the app they run in a worker with no network, no files and none
of the app's controls, stopped after 5 seconds; on the command line each runs
in a fresh VM context with the same limit.

The application is plain ES modules and Node built-ins — no framework, no
bundler, no build step. Its only runtime dependencies are `@grpc/grpc-js` and
`@grpc/proto-loader`, for gRPC; js-yaml is vendored in `lib/vendor` for
YAML OpenAPI documents. Electron and electron-builder are dev-only.

## Beyond a single request

- **Runner** — a collection or flow end to end, once per row of a CSV or JSON
  data file, with reports (Prism HTML, JUnit, JSON). **Generate test data
  from a schema** builds rows that probe input validation, each judged by
  whether the API should accept or refuse it.
- **Logic in a flow** — run a step only if, wait, repeat for each item, poll
  until `json.status == "done"`, stop the flow on failure. Conditions are a
  small language of their own, never run as code.
- **OpenAPI contract** — a spec kept with its collection checks every
  response (status, content type, schema, required headers); **Spec
  coverage** shows which documented operations are exercised.
- **Compare environments** — the same requests in Staging and Production,
  graded Breaks / Differs / Same by contract, not by values.
- **Mock server** — Prism answers at `127.0.0.1` from baselines, last
  responses and spec examples, for front ends whose back end is not ready.
- **Load test** — up to 50 users through a flow, with p50/p95/p99, errors and
  a budget.
- **Schedules** — a flow every few minutes against its own environment, with
  a desktop notification on failure; every run lands on the **Run timeline**,
  where any two runs can be compared.
- **WebSocket, Server-Sent Events and gRPC** alongside HTTP.
- **Console** — every request as it went out and came back, script logs and
  errors, credentials masked.
- **Workspaces as folders** — a file per request, for readable pull requests.
- **AI assistant** — optional and off by default: explain a failure, suggest
  checks; with your own key, or Ollama on this machine. You see everything it
  is sent.

`npm test` runs on a bare Node install, which is why CI needs nothing but
`actions/setup-node` and `npm install`.

---

## Collections, flows, requests

Three levels, because that is what a Postman file and an OpenAPI document
both actually are. Flattening them lost where a flow came from and made a re-export
produce a file shaped differently from the one you opened.

Every level can be created, and every level can be deleted — with a dialog that
says what goes with it, because deleting a flow takes its requests and a count
is the difference between a decision and a surprise.

## The layout

Four columns under a command bar, and a status line below:

- **Rail** — Collections (folds the sidebar away for a bigger plane),
  Environments, History, and Help and Settings at the foot. Each icon names
  itself on hover.
- **Collections** — the three-level tree, with a filter.
- **Plane** — the requests and the values travelling between them. Each
  flow sits in a lane with its name, its last result and a Run button; a
  minimap in the corner shows the whole plane and moves you around it; one
  floating toolbar holds zoom, fit and tidy.
- **Inspector** — the picked request: endpoint, request tabs, response tabs.

The bar holds the command finder (Ctrl K), the environment, Save, Import and
Export, and **Run flow** — the one accent-coloured button. The status line says
whether the work is saved and where, how much is in the workspace, and which
environment it runs against.

## Why it is not laid out like an API client

A request is rarely interesting on its own. What people are actually testing is
a *sequence* — log in, take the token, fetch the profile, take the id, place an
order — and the thing that breaks is usually the join between two steps rather
than either step by itself.

So the middle of the screen is a plane with the requests laid out on it and the
variables drawn travelling between them. Everything else serves that: the rail
lists flows rather than folders, the inspector reads whichever response is
selected, and the timeline underneath says where the milliseconds went.

The beams are **derived, never stored**. One exists where a request captures a
value that another one actually mentions, so you make a connection by making
the test work. There is no separate wiring step to fall out of step with
reality.

### A node is a label, not an editor

Nodes used to open into the whole request form, which made them a different
size at every zoom and unreadable at half of them. A node now shows only what
you need to *read the graph*:

- the method, as a colour down its left edge
- the endpoint
- **needs** — every variable it wants, outlined in cyan on the left, and turning
  red when nothing anywhere provides it
- **gives** — every variable it captures, filled magenta on the right
- how it went last time, and a button to send it

Everything editable is in the workbench on the right, in one fixed place. The
beams leave and arrive at the same edges the ports are drawn on, so a line
lands where the name is.

Nodes are stacked by their *measured* height, not a fixed row gap — a node with
four ports is half as tall again as one with none — and a node you drag stays
exactly where you put it.

### What a node tells you

- The **method**, as a colour down the left edge
- The **endpoint**, with a `{{base_url}}` prefix dimmed so the path reads first
- A **spec strip** — how it authenticates, whether it carries a body and of what
  kind, how many query, path and header rows ride along, and the host when that
  is a literal
- **Needs** and **gives**
- The **last result** — status, time and the assertion score — or *Not run*

### The colour system

The mark is a prism: one beam in, a spectrum out, and the interface takes that
literally.

| | |
| --- | --- |
| **Spectrum** — cyan, indigo, magenta | values in motion, and nothing else |
| **Outcomes** — green, amber, red | pass, warn, fail. Never on the spectrum |
| **Selection** — white | light and weight, not a hue |

On a graph screen you read three kinds of thing at once — structure, data flow
and results — and they must never share a colour.

### Themes

Dark, light, or follow the system — in Settings → Appearance. Following the
system means exactly that: no attribute is stamped on the document, so the
`prefers-color-scheme` block stays in charge and the app switches while it is
open. An explicit choice wins over the machine in both directions.

The light theme is not an inversion. The greys keep their blue cast, the
spectrum moves to darker versions of the same three hues so it still reads as
one family on a pale ground, and selection swaps from light to ink — same role,
opposite value.

## Settings

**Every switch changes what Prism does**, and each one prints the name of the
function that reads it. A settings page full of controls that are read nowhere
is worse than no settings page, so the claim is made checkable — and a test
fails the build if a setting names a home that does not exist.

| | |
| --- | --- |
| **Appearance** | Theme; beam labels; ports on nodes |
| **Sending** | Timeout; follow redirects; verify TLS; response size to keep |
| **Safety** | Confirm before sending to production; mask credentials in the inspector |
| **Data** | History length; clear history; reset preferences |

These are per-machine preferences. Your work itself — collections,
environments, layout, baselines and run history — is kept separately; see
*Your work is kept* below. The certificate passphrase is never written.

## Help

Press **F1**, or the **?** in the bar. Eight sections covering getting started,
the three levels, how to read a node, chaining, every assertion subject and
operator, the export targets, the keyboard shortcuts, and exactly what leaves
the machine.

---

## Your work is kept

Collections, environments, node positions and baselines are written to this
machine as you go, and come back next time. **Save workspace** writes a
`.prism.json` file you can commit beside your code, and the CLI runs that same
file in CI.

A value marked **secret** is never written to either. The name is kept, so
opening a shared workspace tells you what to refill — and in CI you supply it
as `PRISM_<NAME>` in the process environment, where it is never committed.

## Baselines and drift

The Diff tab compares against the previous run, which answers *did anything
change since I last pressed send*. **Freeze** a response as a baseline and the
Drift tab answers the useful one: has this endpoint moved away from the shape
we agreed on?

Findings are split by how much they should worry you. A field that vanished or
changed type breaks whoever consumes it; a new field almost never does; a
changed value is usually just the data being data. Baselines live in the
workspace file, so a drift is reviewable in a pull request.

## Data-driven runs

Attach a CSV or JSON table on the **Data** tab and the request runs once per
row, each row's columns shadowing the environment for that send only. Prism
says which columns the request never mentions — usually a stale export or a
typo, and cheaper to hear than to watch sixty identical results.

## Asking a question of the response

Every scalar in the response body is a click target: capture it as a variable
for the next request, or assert on what it says now. The path comes from the
printer that laid the body out, so it is the path the assertion engine will
follow — not one read off the screen and retyped.

## Is it getting slower, does it fail sometimes

Runs are kept with the workspace, so History can answer both. A sparkline per
request, a median and a p95, and a verdict that only speaks when the change is
real — a fifth either way and at least 20ms, because a 2ms endpoint drifting to
3ms is not a regression and saying so trains people to ignore the badge.

**Run it ten times** in a request's menu looks for a flake directly. A 4xx or
5xx counts as a failure even with nothing asserting on it.

## GraphQL

The query and its variables are two fields; the envelope is assembled at send
time and the operation name is read out of the query. Errors that arrive inside
a 200 — the failure a REST-shaped tool misses entirely — are surfaced with the
server's own message. **Fetch the schema** lists what the endpoint can do and
writes a runnable stub for whatever you pick.

## On the command line

```bash
prism-run <workspace.json> [options]

  -e, --env <name>        environment to use, by name
  -f, --flow <name>       run only this flow
  -r, --reporter <kind>   text | json | junit | html
  -o, --out <path>        write the report to a file
  -d, --data <file>       CSV or JSON: one iteration per row
  -n, --iterations <n>    how many iterations to run
      --bail              stop at the first failure
      --insecure          do not verify TLS certificates
      --no-spec           do not check responses against a collection's OpenAPI document
```

The workspace may be a `.prism.json` file or a folder saved for Git. Scripts,
step logic, gRPC requests and OpenAPI contract checks run as they do in the
app.

Exits 0 when every assertion passed and 1 otherwise, which is the only thing a
CI runner reads. Chaining, cookies, datasets and assertions all behave exactly
as they do in the app, because it is the same `lib/` under the same tests.

## The graph is the plan

The plane draws an edge from the request that captures a value to the ones that
spend it, and **Run flow** follows those edges rather than the order things
happen to be listed in. Dependencies first; anything genuinely independent at
the same time. A request sitting above the one that provides its token still
runs after it — that used to be a 401 with nothing wrong on the server.

A flow whose requests each wait for something another produces has no valid
order, so Prism refuses to run it and names the loop instead of guessing.

## Auth set once

A collection or a flow can hold auth and headers, and a request set to
**Inherit** picks up the nearest one. The nearest setting wins, the way it does
in every config file. **No auth** is a decision rather than an absence, which
is what a login endpoint needs when it must not carry the token it is about to
go and fetch.

**OAuth 2** is a grant, not a field to paste a token into: client credentials,
password and refresh-token, fetched before a send when the held token is
missing or about to expire. The token and the client secret stay in memory.

## What it imports



Drop a file anywhere on the window, or use **Import**. Both go through the same
front door, so what works one way works the other.

| File | What Prism does with it |
| --- | --- |
| **Postman** collection v2.1 / v2.0 | Folders become flows; auth, query rows and test scripts come across |
| **Postman** environment | Just the variables |
| **OpenAPI** 3 / Swagger 2 | Tags become flows; examples and enums fill the rows |
| **Prism** workspace | Everything, including baselines and layout |
| **HAR** capture | Assets and duplicates dropped, the shared host becomes a variable |
| **cURL** command | Pasted from the clipboard with <kbd>Ctrl Shift V</kbd> |

Postman test scripts are JavaScript, so Prism reads the handful of shapes that
make up most real scripts and **leaves the rest**. A collection that imports
with two of its five checks is honest; one that imports with five checks it does
not actually perform is not.

---

## What actually works

Everything below is wired end to end, not mocked:

- **Sending**, from the main process, with real DNS / TCP / TLS / wait /
  download phase timings taken from Node's own socket events. Anything measured
  in the renderer would be one number with a guess split across it.
- **Assertions** — eleven subjects (status, time, size, content type,
  headers, body, JSON paths, JSON Schema, cookies, redirects, transport) and
  over forty operators, each reporting what it actually saw. JSON paths take
  `[*]` wildcards with every-item semantics, `[-1]` and a leading `$.`;
  formats cover email, UUID, ISO dates, URLs, IPs, JWTs and semver. A
  **library** of 55 ready-made checks and a **generator** that proposes a suite
  from a real response — types, formats and shape rather than today's values,
  each checked against that response before it is offered.
- **Chaining.** A captured value lands in the environment, so the next request
  in the flow uses it without anyone copying anything.
- **Insights** — see below.
- **Schema tree**, **response diff** against the previous run of the same
  request, **history**, **flow runs** with a progress ring.
- **Export** to 15 targets with a live preview.

## Insights is not a model

Every finding is a rule over the response that just came back, and each one
carries the evidence that produced it. That is deliberate: a checklist that is
always right about six things beats a paragraph that is usually right about
twenty, and on a screen full of red and green the one thing that must never be
guessed is *why* something failed.

It reads status class, timing, truncation, empty bodies, JSON that claims to be
JSON and is not, null fields, empty collections, credential-shaped values,
missing content types, HSTS, cache headers, and which assertions failed. A 401
is explained differently depending on whether an `Authorization` header was
even sent.

## The one rule about credentials

**No credential is ever inlined in an export.** A `{{token}}` in a request comes
out as a read of an environment variable, in every one of the fifteen targets.
Exported code gets committed, pasted into tickets and put on screen shares.

The Postman export declares variable *names* with empty values for the same
reason — writing the live token into a collection file is precisely the leak the
rule exists to prevent.

This is enforced by a test that hands every generator a loaded environment
containing real-looking secrets and fails if any of them reaches any file.

Request headers shown in the inspector are masked on the same grounds.

---

## Layout

```
rebind-prism/
  main.cjs          window, HTTP with phase timings, file dialogs
  preload.cjs       the entire surface the page can touch
  lib/              pure, all of it directly tested
    collection.js     import: Postman, and the front door for every format
    request.js        request as edited -> request as sent
    assert.js         assertions and what they saw
    insights.js       the rules over a response
    schema.js         tree, type sketch, diff
    codegen.js        fifteen export targets
  renderer/
    index.html  styles.css  app.js  demo.js
  test/             110 tests, node:test
```

The renderer is sandboxed with no Node access; every capability it has is a
named handler in `main.cjs`. If it is not in that file, the page cannot do it.

`lib/` is pure on purpose. Sending is a handful of lines in the main process,
and every decision worth being wrong about — how a URL is assembled, whether an
assertion passed, what changed since last time, what lands in an exported file
— is a function that can be called from a test.

---

## Deliberately not built

- **Recording.** Prism is an API testing tool, not a traffic recorder. A
  browser's network tab can export a HAR file, and Prism imports that.
- **Attack tooling.** Prism tests the APIs you build and own; it does not
  generate exploit payloads.
- **Client and bidirectional gRPC streaming.** Unary calls and server
  streaming are supported.
- **Binary bodies.** Export the request to send one.
