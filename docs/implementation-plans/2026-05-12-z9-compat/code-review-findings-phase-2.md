# Code Review Findings — phase-2

**Reviewer:** Claude Sonnet 4.6
**Date:** 2026-05-30
**Range:** 94c7c2e..cd67132
**Scope:** Phase 2 — five characterisation/contract tests + AC9 re-scope documentation

---

## Status: APPROVED — one Important issue requires a follow-on fix before Phase 3 closes

**Critical: 0 | Important: 1 | Minor: 1**

---

## Verification

```
Lint:      npm run lint:check  → exit 0 (prettier + eslint clean)
Build:     npm run build       → exit 0 (zotero-plugin build + tsc --noEmit clean)
Typecheck: npx tsc --noEmit   → "No errors found"
Type suppression scan:         no `as any`, `@ts-ignore`, `@ts-expect-error` in any new file
typings/global.d.ts:           unchanged (no diff at 94c7c2e..cd67132)
```

Tests could not be run in the review environment (scaffold requires a live Zotero instance).
Accepted as verified per the caller's stated record: `npm run test` under `timeout 150s` → log
shows "Test run completed - 8 passed", 0 failing, 0 pending. That satisfies AC-Aggregate.

---

## Plan Alignment

| Requirement                                                                    | Status                                                                                                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| AC-Preflight.1 — namespace probe at `it`-time                                  | Implemented. `test/preflight.test.ts` asserts `Plus`, `AddItemEndpoint`, `GetSelectedCollectionEndpoint` all defined. |
| AC-Preflight.2 — runner honours inside-`it` `this.timeout`                     | Implemented. 2500 ms sleep inside a 30 000 ms budget.                                                                 |
| AC3.1 — Plus returns 200/text/plain/running message                            | Implemented. `test/endpoint-plus.test.ts`, `deepStrictEqual`.                                                         |
| AC3.2 — AddItemEndpoint 400 on no identifier                                   | Implemented. `test/endpoint-add-item.test.ts` it 1.                                                                   |
| AC3.3 — AddItemEndpoint 400 on unparseable identifier                          | Implemented. `test/endpoint-add-item.test.ts` it 2.                                                                   |
| AC3.4 — GetSelectedCollectionEndpoint 500/text/plain/tolerant body             | Implemented. `test/endpoint-selected-collection.test.ts`.                                                             |
| AC4.1/4.2 — arXiv smoke, 200/json/addedCount/titles                            | Implemented. `test/smoke-add-item-by-doi.test.ts`.                                                                    |
| DR2.1 — `this.timeout` inside `it` callback, not at `describe` level           | Satisfied. Both long `it`s (preflight it-2, smoke) set timeout inside the callback.                                   |
| DR2.2 — smoke cleanup: `Zotero.Items.get` + `.eraseTx()`, wrapped in try/catch | Satisfied. Loop uses synchronous `get`, not `getAsync`; catch logs via `Zotero.debug` and does not re-throw.          |
| DR5 — no skip-on-network-failure in smoke                                      | Satisfied. No `this.skip()`, no `pending`, no guard clause.                                                           |
| AC9 re-scope — documented in phase_02.md, changelog-notes.md, design-plans     | Satisfied in three of four documents. See Important issue below.                                                      |
| AC-Aggregate — 8 passing, 0 pending, 0 failing                                 | Satisfied per caller's verification record.                                                                           |

---

## Strengths

**1. Re-scope documentation is honest and complete in three documents.**
`changelog-notes.md` § "AC9 re-scoped" gives a reproducible failure account (status 0, external
curl clean 200, chrome:// Origin hypothesis, workarounds considered and rejected). The phase_02.md
Task 0 and Task 5 markers are unambiguous. The design-plans update adds a dated status banner.
A future reader who finds 8 tests where the plan says 10 will immediately know why.

**2. Preflight structure is exactly right.**
Converting HA1/HA2 from background assumptions to failing `it`s means a harness regression
(e.g. `waitForPlugin` gate not firing) surfaces with a diagnostic message, not an opaque
`TypeError` inside a contract test. The `this.timeout` probe serving double duty — both
testing the runner and providing the budget guarantee for smoke — is a tight design.

**3. Type safety upheld without augmentation.**
tsc green, no suppressions, `typings/global.d.ts` untouched. The Zotero API surface needed
for these tests was already covered by the existing type declarations.

**4. Smoke cleanup is structurally correct.**
The try/catch boundary ensures cleanup failure cannot mask a passing assertion. Using
synchronous `Zotero.Items.get` (not `getAsync`) and `eraseTx()` per-item matches the plan's
stated preferred path. The `itemIDs ?? []` guard handles a null return without throwing.

**5. `endpoint-selected-collection` assertion is appropriately tolerant.**
Strict on status + MIME; regex on body to accommodate both branches of `src/addon.ts` (line
137 vs 141) depending on runner pane state. The comment correctly names the trailing space as
intentional and load-bearing. This is characterisation testing done right — it pins the
observable contract without over-specifying internal branch selection.

---

## Issues

### Important (count: 1)

**`test-requirements.md` was not updated to reflect the AC9 re-scope.**

- **Location:** `docs/implementation-plans/2026-05-12-z9-compat/test-requirements.md` — not
  present in the 94c7c2e..cd67132 diff at all.

- **Detail:** `test-requirements.md` is the document the plan designates as "the contract that
  `test-analyst` checks during execution." It currently:
  - Describes AC9.1, AC9.2, AC9.3 as active Phase 2 items with a concrete `test/http-dispatch.test.ts` file.
  - States in AC2.1: `included in '10 passing' after Phase 2`.
  - States in AC6.2: `full suite passes incl. the HTTP dispatch test (AC9)`.
  - States in the Coverage summary: `AC9.0–9.3` listed under Automated.
  - States at the foot: `AC9 carries a documented re-scope path (Task 0) rather than a silent skip` — which is now the active state, but the table rows above it still describe AC9 as implemented.

  The three other documents (`design-plans`, `phase_02.md`, `changelog-notes.md`) all carry the
  re-scope notation. `test-requirements.md` is the one document that does not. This creates an
  inconsistency: a test-analyst or Phase 3 executor reading `test-requirements.md` as the
  authoritative contract would see four AC9 rows still marked as Phase 2 deliverables,
  cross-reference `phase_02.md` and find them dropped, and have no single source of truth.

  The passing count discrepancy (10 vs 8) in AC2.1 is the sharpest concrete inconsistency —
  it is exactly the kind of detail a test-analyst gate-checks.

- **Fix:** Update `test-requirements.md` in a follow-on commit (does not need to block this
  merge, but must land before Phase 3 execution). Minimum changes:
  1. Add a re-scope banner to the AC9 section (mirroring the design-plans pattern).
  2. Mark AC9.1, AC9.2, AC9.3 rows as "NOT IMPLEMENTED — re-scoped per Task 0 / changelog-notes.md".
  3. Correct AC2.1's `10 passing` reference to `8 passing (AC9 re-scoped)`.
  4. Correct AC6.2's `incl. the HTTP dispatch test (AC9)` clause.
  5. Correct the Coverage summary to move AC9.0–9.3 out of Automated.

---

### Minor (count: 1)

**`cleanupErr: unknown` narrowing is correct but the error path only logs the message, silently
dropping non-Error throwables' detail.**

- **Location:** `test/smoke-add-item-by-doi.test.ts:36–39`

- **Detail:** `String(cleanupErr)` for non-Error throwables produces e.g. `[object Object]` for
  a plain object rejection. In practice the Zotero APIs involved throw `Error` instances, so
  this is unlikely to matter. But if `search.search()` or `item.eraseTx()` ever rejects with a
  non-Error, the debug log will be uninformative. The fix is trivial:

  ```ts
  Zotero.debug("smoke cleanup failed: " + String(cleanupErr));
  ```

  becomes:

  ```ts
  Zotero.debug(
    "smoke cleanup failed: " +
      (cleanupErr instanceof Error
        ? (cleanupErr.stack ?? cleanupErr.message)
        : JSON.stringify(cleanupErr)),
  );
  ```

  This is a quality-of-life improvement for future debugging, not a correctness issue.

---

## Consolidation Opportunities

None visible in the diff context. The five test files are structurally independent and do not
duplicate each other's patterns in a way that warrants factoring.

---

## Decision: APPROVED FOR MERGE — fix `test-requirements.md` before Phase 3 execution
