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

_To be completed during Task 4: record the `zotero/zotero` Z9 release tag and the file:line in `Zotero.Server.LocalAPI` dispatch confirming `permitBookmarklet` is unread, or hedge to "reasoned, not source-verified."_
