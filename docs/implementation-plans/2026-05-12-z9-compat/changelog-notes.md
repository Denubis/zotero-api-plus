# Phase 1 changelog-review notes

Required deliverable per phase_01.md (Tasks 1–3, Step 1) and design DoD item 5. Findings read 2026-05-28 from GitHub release notes.

## zotero-types: `^4.1.0-beta.4` → `^4.1.2`

Versions in range: beta.8 (no significant changes), 4.1.1, 4.1.2.

- 4.1.1: Menu-manager API (additive); epubjs/pdfjs swapped for Zotero's fork; npm-release fixes.
- 4.1.2: `Zotero.File` type update; `collectionTreeRow` retyped to `_ZoteroTypes.CollectionTree`.

**Relevant to this plugin?** No. Nothing touches `Zotero.Server`, `Server.LocalAPI.Schema`, `Zotero.Search`, `Zotero.Items`, or `Zotero.Translate` — the surfaces our endpoints and `typings/global.d.ts` augmentation depend on. The `collectionTreeRow` retype is adjacent to `getActiveZoteroPane().getSelectedCollection()` but is a different symbol. **Risk: low.** Verify with `tsc --noEmit` after the bump.

## zotero-plugin-toolkit: `^5.1.0-beta.13` → `^5.1.2`

Versions in range: beta.14 (npm-release fix), 5.1.1, 5.1.2 (build-step fix).

- 5.1.1 **Breaking change:** `extraField` — duplicate keys, unified parser option, `save` moved to `options`, `__nonStandard__` handling. Features: `SettingsDialogHelper`, `AddStaticRow`. Fix: "Updates from Zotero 8."

**Relevant to this plugin?** `src/addon.ts` imports only `ColumnOptions` and `DialogHelper` from the toolkit (and `createZToolkit` in utils). It does **not** use `extraField` or `SettingsDialogHelper`, so the lone breaking change does not reach our code; the imported symbols remain exported. The "Updates from Zotero 8" fix is favourable for Z8/Z9 compat. **Risk: low.** Verify with `tsc --noEmit` + `build` after the bump; watch for any `ColumnOptions`/`DialogHelper` signature drift.

## zotero-plugin-scaffold: `^0.8.2` → `^0.8.6`

Versions in range: 0.8.3, 0.8.4, 0.8.5, 0.8.6.

- 0.8.3: remove node-style-text; `await buildInProduction()` fix; dep bumps (chokidar v5, hookable v6).
- 0.8.4: `grey`→`gray` (Node compat); detect user manifest before read; dep bumps.
- 0.8.5: **test-runner:** unresolved-placeholders fix.
- 0.8.6: dep bumps (bumpp v11); **test-runner: exit process when test awaiting timeout.**

**Relevant to this plugin?** The startup test exercises the `waitForPlugin` → mocha path; the 0.8.6 "exit process on await timeout" change alters failure behaviour (a hung `waitForPlugin` now exits rather than hanging) — benign/beneficial, but if the startup test regresses after this bump it is the prime suspect (this is why scaffold is bumped last and alone, DR1). **Crucially, no local-API / `httpServer` test-server feature exists in 0.8.x** — scaffold will not enable Zotero's HTTP server for us. **Consequence for Phase 2 Task 0:** the HTTP dispatch test must enable the server programmatically in test setup (`Zotero.Prefs.set("httpServer.enabled", true)` + re-init `Zotero.Server`, with a readiness poll) rather than via a scaffold config option. **Risk: low for the startup test; the HTTP-test enablement is bespoke and remains the plan's main execution uncertainty (AC9.0).**

## permitBookmarklet Z9 source pin (Phase 1 Task 4, Step 1)

Checked 2026-05-28 against `zotero/zotero` (latest Z9 tag **9.0.4**; search run on the default branch, which is ahead of the 9.0.x line). A repo-wide code search for `permitBookmarklet` returns occurrences in **only** the connector/integration server files — `chrome/content/zotero/xpcom/server/server_connector.js`, `server_connectorIntegration.js`, `server_integration.js` — all as `permitBookmarklet: true` property declarations on connector endpoints. It appears in **no** LocalAPI file. Our `/api/plus*` endpoints register on `Zotero.Server.Endpoints` and are dispatched via the LocalAPI path, not the connector/bookmarklet path, so the property is never consulted for them.

**Confidence:** the negative is well-supported (the property is structurally connector-only; absent from LocalAPI). The exact consumer line (`endpoint.permitBookmarklet` read in the connector request flow) could not be pinned via GitHub's tokenised code search (the `.permitBookmarklet` token returned nothing), so this is "structurally source-verified (connector-only), specific read-line not quoted" rather than a single file:line citation. This is sufficient for the removal: even if Z9's connector flow reads the property, our endpoints are not reached through that flow. (Note: the HTTP dispatch test that was to provide automated backstop on the LocalAPI dispatch surface was **re-scoped** during Phase 2 — see the AC9 finding below. Manual UAT curl on the normal install (Phase 3) carries the dispatch-surface coverage instead.)

## AC9 re-scoped: in-process `Zotero.HTTP.request` cannot reach the self-loopback local API (Phase 2 finding)

**Decision (2026-05-30):** the two automated HTTP dispatch `it`s (AC9.1 GET, AC9.2 POST) are **dropped**. Phase 2 target falls from 10 to **8 passing**. The plan's documented re-scope fallback is now active. The dispatch surface stays in scope via the manual UAT curl on the normal install (Phase 3 / uat-requirements AC1.3).

**What was observed:**

- During the initial Phase 2 test run with `test/http-dispatch.test.ts` present, both `it`s failed with `status: 0` (no response received) from `Zotero.HTTP.request` against `http://127.0.0.1:23124/api/plus*`.
- An external `curl` to the same URL — issued from a shell while the scaffold-launched test Zotero was up — returned a clean `HTTP/1.0 200 OK` with the correct headers (`X-Zotero-Version: 9.0.3`, `Content-Type: text/plain`) and body. So the server was listening on 23124 and the plugin's endpoints were responding correctly.
- The user's normal Zotero (port 23119) also has the listener on (`/connector/ping` returns 200) — the listener is not the issue on either side.

**Likely cause:** Zotero's local API server enforces an Origin/Referer check intended to prevent CSRF from web pages. External `curl` has no `Origin` and is allowed; an in-process XHR from inside Zotero sends `Origin: chrome://...` which the server rejects pre-response (connection closed → `status: 0`). The check is server-side; not a client option that `Zotero.HTTP.request` can flip. `fetch()` from inside Zotero would send the same `Origin` and is expected to behave identically.

**Why we did not pursue a workaround:** the available workarounds either don't help (`fetch()` same Origin), introduce harness brittleness (subprocess `curl` from the test, or `Components.classes`/`nsIChannel` lower-level networking), or rely on patching Zotero's own CORS rules. The manual UAT curl on the **normal** install already exercises the production dispatch path from outside the Zotero process — that's how real callers will use the API, and it's already a required UAT step.

**Consequence for AC6.2 / I5:** the I5 hedge in the design plan already acknowledged that the in-process tests alone don't cover dispatch. The HTTP test was the closest _automated_ coverage of that surface. With it re-scoped, the automated suite only confirms endpoint method-body contracts; the dispatch-regression backstop is the operator's manual UAT, not automation.

## Lockfile side-effects (noted in Phase 1 code review)

Two incidental `package-lock.json` changes from the dep-bump `npm install`s, recorded here for the audit trail (both correct and harmless, neither a code change):

- **Stale name corrected (commit 1, `zotero-types`):** the lockfile's `name`/`packages[""].name` was `zotero-localapi-plus` — stale from before the repo was renamed. The first `npm install` corrected it to `zotero-api-plus` (matching `package.json`). Deterministic on any install; not specific to the `zotero-types` bump.
- **New transitive dev-deps (commit 3, `zotero-plugin-scaffold` → 0.8.6):** pulled in `@quansync/fs` and `quansync` (both MIT) as new transitive dependencies, and dropped a stale `"peer": true` flag on an `@octokit/*` entry. Expected `npm install` normalisation; not bundled into the `.xpi` (assets are `addon/**/*.*` only).
