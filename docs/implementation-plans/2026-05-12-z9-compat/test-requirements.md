# Test Requirements — Zotero 9 Compatibility

This file is the contract that `test-analyst` checks during execution. Every acceptance criterion maps to either an **Automated** verification, a **UAT** verification (`uat-requirements.md`), or a **Provisional-then-final** verification.

**Revised** after the critical peer review: Phase 1 now bumps dependencies one at a time (four commits), Phase 2 adds a preflight probe and an HTTP dispatch test, and the aggregate gate requires `0 pending`/`0 failing` (not just a passing count). Phase 2 task numbers below reflect the rewritten `phase_02.md`.

Test type vocabulary:

- **unit** — pure logic, no Zotero context
- **contract** — instantiate an endpoint class, call `.run()`, assert on the `[status, mime, body]` tuple in-process (no HTTP, no network)
- **http-dispatch** — real HTTP request to `127.0.0.1:23119` exercising `Zotero.Server` routing (network-free for these cases)
- **preflight** — harness positive control (namespace populated; timeout honoured)
- **integration** — exercises Zotero core APIs in-process
- **e2e / smoke** — full path including network egress
- **lint / build / typecheck** — `npm run lint:check` / `npm run build` / `npx tsc --noEmit`
- **git-diff** — `git diff` / `git status` / `git log` shape checks

---

## AC-Preflight: harness positive controls (NEW — critical review I3)

| AC             | Type      | Command / file                                                        | Expected outcome                                                                                                                               | Phase            |
| -------------- | --------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| AC-Preflight.1 | preflight | `test/preflight.test.ts` → "endpoint classes are assigned …"          | `Zotero.Server.LocalAPI.{Plus,AddItemEndpoint,GetSelectedCollectionEndpoint}` all defined at `it`-time; asserts the `waitForPlugin` gate fired | Phase 2 (Task 1) |
| AC-Preflight.2 | preflight | `test/preflight.test.ts` → "runner honours an inside-it this.timeout" | an inside-`it` `this.timeout(30000)` lets a 2500 ms op complete; if it fails, smoke/HTTP timeout budgets are untrustworthy                     | Phase 2 (Task 1) |

---

## AC1: Manifest accepts Zotero 9

| AC    | Type     | Command / file                                                    | Expected outcome                                                                  | Phase                       |
| ----- | -------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| AC1.1 | git-diff | `grep -E '"strict_max_version":\s*"9\.\*"' addon/manifest.json`   | Exit 0; one matching line                                                         | Phase 1 (Task 4)            |
| AC1.2 | git-diff | `grep -E '"strict_min_version":\s*"6\.999"' addon/manifest.json`  | Exit 0; one match (widened, not narrowed)                                         | Phase 1 (Task 4)            |
| AC1.3 | **UAT**  | `uat-requirements.md` § AC1.3                                     | Operator (Brian) confirms Z9 accepts a normal install; no "not compatible" dialog | Post-Phase-3 operator check |
| AC1.4 | git-diff | `! grep -E '"strict_max_version":\s*"8\.\*"' addon/manifest.json` | Exit 0 (no `8.*` remains)                                                         | Phase 1 (Task 4)            |

---

## AC2: Existing startup test passes on Zotero 9

| AC    | Type        | Command / file                          | Expected outcome                                                                                                               | Phase                                   |
| ----- | ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| AC2.1 | integration | `npm run test` — `test/startup.test.ts` | `✔ should have plugin instance defined`; exit 0; `1 passing` after each Phase 1 commit, included in `10 passing` after Phase 2 | Phase 1 (every task) + Phase 2 (Task 7) |
| AC2.2 | integration | `npm run test` (failure mode)           | startup absent/`✖` → exits non-zero; flagged as regression                                                                     | Phase 1 + Phase 2                       |

---

## AC3: In-process endpoint contract tests pass on Zotero 9

| AC    | Type     | Test file + `it`                                                        | Expected outcome                                                                                                                          | Phase            |
| ----- | -------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| AC3.1 | contract | `test/endpoint-plus.test.ts` → "returns 200 text/plain running message" | `deepStrictEqual([200,"text/plain","Zotero Local API Plus is running."])`; depends on AC7.1                                               | Phase 2 (Task 2) |
| AC3.2 | contract | `test/endpoint-add-item.test.ts` → "no identifier"                      | `deepStrictEqual([400,"text/plain","Error: No identifier provided"])`; no network                                                         | Phase 2 (Task 3) |
| AC3.3 | contract | `test/endpoint-add-item.test.ts` → "unparseable identifier"             | `deepStrictEqual([400,"text/plain","Error: Could not parse identifier"])`; no network                                                     | Phase 2 (Task 3) |
| AC3.4 | contract | `test/endpoint-selected-collection.test.ts`                             | `result[0]===500` strict; `result[1]==="text/plain"` strict; `result[2]` matches `/^(No Collection selected\.\|Internal Server Error: )/` | Phase 2 (Task 4) |
| AC3.5 | contract | `npm run test` (aggregate failure mode)                                 | any AC3.x `✖` → exits non-zero                                                                                                            | Phase 2 (Task 7) |

---

## AC9: HTTP dispatch test exercises `Zotero.Server` routing (NEW — DR2 revised)

| AC    | Type           | Command / file                                   | Expected outcome                                                                                                          | Phase            |
| ----- | -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| AC9.0 | (precondition) | Task 0 spike outcome recorded                    | HTTP server enablable in dev profile, mechanism documented — OR formally re-scoped (HTTP `it`s dropped, target count → 8) | Phase 2 (Task 0) |
| AC9.1 | http-dispatch  | `test/http-dispatch.test.ts` → "GET /api/plus"   | `res.status===200`; `Content-Type` matches `^text/plain`; body `Zotero Local API Plus is running.`; network-free          | Phase 2 (Task 5) |
| AC9.2 | http-dispatch  | `test/http-dispatch.test.ts` → "empty-body POST" | `res.status===400`; body `Error: No identifier provided`; returns before any translator call (network-free)               | Phase 2 (Task 5) |
| AC9.3 | http-dispatch  | `npm run test` (failure mode)                    | either HTTP `it` `✖` → exits non-zero; with AC3 passing, localises fault to dispatch/transport, not endpoint logic        | Phase 2 (Task 7) |

---

## AC4: Real-network arXiv smoke (network-dependent; DR5 triage applies)

| AC    | Type        | Test file + `it`                     | Expected outcome                                                                                                                                                                                                         | Phase            |
| ----- | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| AC4.1 | e2e / smoke | `test/smoke-add-item-by-doi.test.ts` | `res[0]===200`; `res[1]==="application/json"`; `JSON.parse(res[2]).addedCount >= 1`                                                                                                                                      | Phase 2 (Task 6) |
| AC4.2 | e2e / smoke | same `it`                            | `JSON.parse(res[2]).titles.length >= 1` (no title-content assertion)                                                                                                                                                     | Phase 2 (Task 6) |
| AC4.3 | e2e / smoke | `npm run test` (failure mode)        | smoke `✖` → exits non-zero. **Failure does not identify cause (I2)** — run the DR5 triage runbook (curl arxiv; confirm preflight + contract + HTTP pass; check translator/DOI) before concluding "translator regression" | Phase 2 (Task 7) |

---

## AC5: Dev-deps refreshed one at a time; build/lint/typecheck stay green

| AC          | Type      | Command / file                                                                                                                                                      | Expected outcome                                                                                                  | Phase                                                               |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| AC5.1       | git-diff  | after Task 3: `grep` each of `"zotero-types":\s*"\^4\.1\.2"`, `"zotero-plugin-toolkit":\s*"\^5\.1\.2"`, `"zotero-plugin-scaffold":\s*"\^0\.8\.6"` in `package.json` | all exit 0                                                                                                        | Phase 1 (Tasks 1–3)                                                 |
| AC5.2       | build     | `npm install` after each bump                                                                                                                                       | exit 0; `package-lock.json` regenerated each time                                                                 | Phase 1 (Tasks 1–3)                                                 |
| AC5.3       | lint      | `npm run lint:check` after each bump                                                                                                                                | exit 0                                                                                                            | Phase 1 (Tasks 1–3); revalidated Phase 2 (Task 7), Phase 3 (Task 3) |
| AC5.4       | build     | `npm run build` after each bump                                                                                                                                     | exit 0; `.xpi`/bundle under `.scaffold/build/`                                                                    | Phase 1 (Tasks 1–3); revalidated Phase 2 (Task 7)                   |
| AC5.5       | typecheck | `npx tsc --noEmit` after each bump                                                                                                                                  | `No errors found`; errors resolved in `typings/global.d.ts` (no `as any`, no `@ts-expect-error`)                  | Phase 1 (Tasks 1–3); revalidated Phase 2 (Task 7)                   |
| AC5.6 (NEW) | doc       | changelog-review note recorded per dependency                                                                                                                       | one-line finding (or "no relevant changes") for `zotero-types`, `zotero-plugin-toolkit`, `zotero-plugin-scaffold` | Phase 1 (Tasks 1–3)                                                 |

---

## AC6: Dead `permitBookmarklet` line removed (re-scoped per I5)

| AC    | Type                        | Command / file                                                                        | Expected outcome                                                                                                                                                                                                                                                                                                                                                     | Phase                                                |
| ----- | --------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| AC6.1 | git-diff                    | `git diff main..HEAD -- src/addon.ts \| grep -E '^-\s*permitBookmarklet\s*=\s*true;'` | exactly one removal line; no other change in `AddItemEndpoint`                                                                                                                                                                                                                                                                                                       | Phase 1 (Task 4)                                     |
| AC6.2 | integration + http-dispatch | `npm run test` after removal                                                          | **Provisional Phase 1, final Phase 2.** Phase 1: `1 passing` (provisional — startup only). Phase 2: full suite passes incl. the HTTP dispatch test (AC9). **Caveat (I5): confirms suite integrity, NOT that the property is unread** — even AC9 covers only LocalAPI dispatch, not the connector/bookmarklet path. Safety rests on the Phase 1 Task 4 Z9 source pin. | Provisional Phase 1 (Task 4); final Phase 2 (Task 7) |

---

## AC7: MIME-type typo fixed

| AC    | Type                     | Command / file                                                                         | Expected outcome                                                              | Phase                |
| ----- | ------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------- |
| AC7.1 | git-diff                 | `git diff main..HEAD -- src/addon.ts \| grep -E '^[+-].*("plain/text"\|"text/plain")'` | one `-` with `"plain/text"`, one `+` with `"text/plain"`; no other such lines | Phase 1 (Task 4)     |
| AC7.2 | contract + http-dispatch | `endpoint-plus.test.ts` (AC3.1) and `http-dispatch.test.ts` GET (AC9.1)                | both assert `"text/plain"` against the corrected behaviour                    | Phase 2 (Tasks 2, 5) |

---

## AC8: README updated for accuracy

| AC    | Type     | Command / file                                                                                                                                                                                                    | Expected outcome                                                                                                     | Phase                   |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| AC8.1 | git-diff | `grep -c "Zotero-7%7C8%7C9-green" README.md` → `1`; `grep -c "Zotero-8-green" README.md` → `0`                                                                                                                    | both pass                                                                                                            | Phase 3 (Task 1)        |
| AC8.2 | git-diff | `grep -c "prefs.js" README.md` → `0`; `grep -c "Allow other applications on this computer to communicate with Zotero" README.md` → `1`; `grep -F "curl http://127.0.0.1:23119/api/plus" README.md \| wc -l` → `1` | all pass                                                                                                             | Phase 3 (Task 2)        |
| AC8.3 | lint     | `npm run lint:check`                                                                                                                                                                                              | exit 0                                                                                                               | Phase 3 (Task 3)        |
| AC8.4 | git-diff | `git diff --unified=0 README.md \| grep -E '^@@' \| awk '{print $3}'` (m2 — deterministic hunk-range)                                                                                                             | exactly two hunk targets: `+3` (badge) and one in the Usage range (~`+92`…`+100`); any header outside is scope creep | Phase 3 (Task 3 Step 2) |

---

## AC-Aggregate: suite gate (NEW — critical review I4)

| AC           | Type        | Command / file | Expected outcome                                                                                                                                                                                                                 | Phase            |
| ------------ | ----------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| AC-Aggregate | integration | `npm run test` | exits `0` **and** reports `0 pending` **and** `0 failing`. Target `10 passing` (network up, HTTP server enabled) or `8 passing` (AC9 re-scoped). A passing _count_ alone does not gate — a `pending`/skipped test fails the gate | Phase 2 (Task 7) |

---

## Plan-level DR checks

| DR         | Description                                                                                      | Command                                                                                                                                                                                                       | Expected outcome                                                                                                                                                                       | Phase                        |
| ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| DR1.1      | `typings/global.d.ts` augmentation, if any, is minimal and structurally justified                | `git diff main..HEAD -- typings/global.d.ts`                                                                                                                                                                  | Empty, or a minimal augmentation (no `as any`, no `@ts-expect-error`) flagged for review                                                                                               | After Phase 1, after Phase 2 |
| DR1.2 (m4) | Phase commits exist by **subject**, not by count                                                 | `git log --pretty=%s z9-compat ^main`                                                                                                                                                                         | Contains the four Phase 1 subjects, the Phase 2 subject, the Phase 3 subject, and `format design plan with prettier`. Extra commits (findings/notes) acceptable                        | After each phase             |
| DR2.1 (m1) | Long `it`s set `this.timeout` **inside** the callback (no describe-level propagation dependency) | ast-grep: match `member_expression` `this.timeout($N)` whose enclosing function is the `it` callback in `test/smoke-add-item-by-doi.test.ts` and `test/http-dispatch.test.ts` (position check, not text grep) | each long `it` sets its own timeout; the preflight (AC-Preflight.2) confirms the runner honours it                                                                                     | After Phase 2 Tasks 1, 5, 6  |
| DR2.2      | Smoke cleanup makes reruns idempotent                                                            | code inspection of `test/smoke-add-item-by-doi.test.ts`                                                                                                                                                       | search-by-DOI + `Zotero.Items.erase(itemIDs)` (or `Zotero.Items.get(id).eraseTx()` loop — NOT `getAsync`, per code-review I2), wrapped in try/catch so failure doesn't mask assertions | After Phase 2 Task 6         |
| DR3.1      | README badge uses `Zotero-7%7C8%7C9-green`                                                       | `grep -c "Zotero-7%7C8%7C9-green" README.md` → `1`; `grep -c "Zotero-8-green" README.md` → `0`                                                                                                                | both pass (duplicates AC8.1 for independent DR verification)                                                                                                                           | After Phase 3 Task 1         |
| DR3.2      | README contains the curl smoke command once                                                      | `grep -F "curl http://127.0.0.1:23119/api/plus" README.md \| wc -l` → `1`                                                                                                                                     | exit 0, output `1`                                                                                                                                                                     | After Phase 3 Task 2         |

---

## Coverage summary

- **Automated:** AC-Preflight.1/.2, AC1.1/1.2/1.4, AC2.1/2.2, AC3.1–3.5, AC9.0–9.3, AC4.1–4.3, AC5.1–5.6, AC6.1, AC7.1/7.2, AC8.1–8.4, AC-Aggregate.
- **Provisional-then-final:** AC6.2 (provisional Phase 1 Task 4; final Phase 2 Task 7, with the I5 caveat).
- **UAT (`uat-requirements.md`):** AC1.3.
- **Plan-level DR checks:** DR1.1, DR1.2, DR2.1, DR2.2, DR3.1, DR3.2.

No AC is unmapped. AC9 carries a documented re-scope path (Task 0) rather than a silent skip.
