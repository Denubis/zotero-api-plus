# Code Review Findings — plan-validation

## Status: APPROVED

**Critical: 0 | Important: 2 | Minor: 3**

## Verification

Not applicable — this is a plan review, not a code diff review. No test/lint commands run.

## Plan Alignment — AC Coverage Map

| Design DoD / AC             | Phase    | Task                                   | Status                                       |
| --------------------------- | -------- | -------------------------------------- | -------------------------------------------- |
| DoD 1 / AC1.1, AC1.2        | Phase 1  | Task 2                                 | Implemented                                  |
| DoD 1 / AC1.3 (manual UAT)  | UAT file | AC1.3 entry                            | Satisfied — uat-requirements.md captures it  |
| DoD 2 / AC2.1, AC2.2        | Phase 1  | Task 5                                 | Implemented                                  |
| DoD 3 / AC3.1               | Phase 2  | Task 1                                 | Implemented                                  |
| DoD 3 / AC3.2, AC3.3        | Phase 2  | Task 2                                 | Implemented                                  |
| DoD 3 / AC3.4, AC3.5        | Phase 2  | Task 3                                 | Implemented                                  |
| DoD 4 / AC4.1, AC4.2, AC4.3 | Phase 2  | Task 4                                 | Implemented                                  |
| DoD 5 / AC5.1–AC5.5         | Phase 1  | Tasks 1, 5                             | Implemented                                  |
| DoD 6 / AC6.1, AC6.2        | Phase 1  | Task 3                                 | Implemented (AC6.2 deferred to Phase 2 pass) |
| DoD 7 / AC7.1, AC7.2        | Phase 1  | Task 4 (AC7.1); Phase 2 Task 1 (AC7.2) | Implemented                                  |
| DoD 8 / AC8.1–AC8.4         | Phase 3  | Tasks 1–3                              | Implemented                                  |

All 8 DoD items and all AC sub-items (AC1–AC8 with subitems) are covered. AC1.3 is routed to uat-requirements.md, which captures the correct preconditions, the shattering condition, and the operator action. Coverage is complete.

## MIME Typo → Phase 2 Dependency

Phase 2 "Depends on Phase 1" is explicitly stated at the top of phase_02.md: "the `endpoint-plus.test.ts` assertion targets `"text/plain"`, which only holds after Phase 1 Task 4 (MIME typo fix). Phase 2 cannot precede Phase 1." This satisfies the cross-phase dependency requirement.

## Issues

### Important (count: 2)

**I1 — AC6.2 cross-phase verification gap**

- **Issue**: AC6.2 ("all tests in the suite still pass after the removal") appears in the Phase 1 AC coverage table but references AC3 and AC4, which are only created in Phase 2. Phase 1 Task 5 only verifies "1 passing" (the startup test). The plan text in phase*01.md Task 3 Step 2 says the `git diff` check should show "one removal line... before Task 4", but the AC6.2 success condition lists AC3 and AC4 satisfaction. An executor following phase_01.md literally will see AC6.2 marked as "covered" but the tests that would confirm AC6.2 (endpoint contract tests) won't exist until Phase 2. This is not a gap in what gets \_verified eventually* — Phase 2 Task 5 verifies it — but the Phase 1 coverage table creates a false impression that AC6.2 is fully satisfied by Phase 1 alone.
- **Location**: phase_01.md, Acceptance Criteria Coverage section (AC6.2 row) and phase_01.md "Done When" item 3.
- **Fix**: Annotate AC6.2 in the Phase 1 coverage table: "(final verification deferred to Phase 2 Task 5 — the full suite must pass with all tests after Phase 2)". The Phase 1 Done When could note: "AC6.2 partial — startup test passes; contract test verification deferred to Phase 2."

**I2 — Smoke test cleanup: `Zotero.Items.getAsync` may not exist in Z9**

- **Issue**: The smoke test cleanup block in phase_02.md Task 4 calls `Zotero.Items.getAsync(id)` after calling `search.search()` which returns item IDs. The `Zotero.Items.getAsync` API may have changed in Z9 (the plan itself acknowledges "If the API surface differs in Z9, the implementor should consult `zotero-types@4.1.2` declarations"). However, the standard synchronous access is `Zotero.Items.get(id)` — `getAsync` is not the primary API; it may exist but the plan should cite the correct Z9 idiom rather than leaving resolution to the implementor at execution time. This is a Quality-of-Plan issue, not a correctness blocker (cleanup is explicitly marked best-effort and non-throwing), but the plan gives future implementors a potentially wrong starting point.
- **Location**: phase_02.md, Task 4, cleanup block lines 203–205.
- **Fix**: Add a parenthetical note that `Zotero.Items.get(id)` (synchronous) is the standard path in recent Zotero versions; use it unless `zotero-types@4.1.2` confirms `getAsync` is preferred. Alternatively, simplify cleanup to `Zotero.Items.erase(itemIDs)` if that batch API is available in Z9, which avoids the per-item async loop entirely.

### Minor (count: 3)

**m1 — Phase 1 "Done When" item 3 count hardcodes "1 passing" without acknowledging tmpfs state**

- **Issue**: Phase 1 Task 5 Step 4 and "Done When" item 3 both assert `npm run test` reports `1 passing`. The design plan notes the dev profile lives in tmpfs and may be missing. If the profile directory is absent, the scaffold launch will fail before mocha reports any count. The plan correctly says to `mkdir -p` the tmpfs dirs as a pre-flight, but the pre-flight is framed as conditional ("If the dev profile or data directory is missing"), making it easy to skip. A missing profile causes a harder-to-diagnose failure than a clean "0 passing" — the scaffold exits non-zero before mocha output appears.
- **Location**: phase_01.md, Task 5 Pre-flight.
- **Fix**: Make the `mkdir -p` unconditional (idempotent anyway) so it is always the first step.

**m2 — Phase 2 Task 3 regex has an extra `/` inside the assert**

- **Issue**: phase_02.md Task 3 shows:
  `assert.match(result[2], /^(No Collection selected\.|Internal Server Error: )/);`
  The design plan AC3.4 specifies the body is either `"No Collection selected."` or matches `/^Internal Server Error: /`. The regex in the plan is correct. But the referenced source line in the task (`src/addon.ts:141`) is described as the "catch branch" body — the plan should make clear that the `|` alternative inside the regex group is not a literal pipe in the body but an alternation. This is clear to anyone reading the code, but the parenthetical notation `^(No Collection selected\.|Internal Server Error: )` is slightly ambiguous in prose — the trailing `/` of the literal JavaScript regex could be confused with end of the pattern. No actual defect, but a clarity issue.
- **Location**: phase_02.md, Task 3, Implementation block.
- **Fix**: Minor prose clarification — "The regex `^(No Collection selected\.|Internal Server Error: )` matches either the no-collection branch body or the exception catch body" — already present implicitly; no action strictly required.

**m3 — Phase 3 references "DR3.1" and "DR3.2" which do not exist in the design plan**

- **Issue**: phase_03.md Task 1 cites "per DR3.1 — URL-encoded `|`" and Task 2 cites "per design AC8.2 + DR3.2". The design plan's Decision Record goes DR1 through DR5; there is no DR3.1 or DR3.2. These appear to be sub-items of an implementation-level decision that was inlined into the phase plan without a corresponding design DR entry. An executor reading the phase plan and searching the design plan for DR3.1 will not find it.
- **Location**: phase_03.md, Task 1 Step 1 note and Task 2 replacement block header.
- **Fix**: Replace "per DR3.1" / "per DR3.2" with explicit inline rationale: "URL-encoded `|` (`%7C`) for cross-renderer safety in shield badge URLs" and "curl smoke command per design AC8.2 (optional inclusion)".

## Out-of-Scope Compliance

All design "Out of Scope" entries are respected:

- No Z7/Z8 verification tasks present in any phase.
- No esbuild target change — DR4 referenced in phase_01.md architecture section.
- No localisation changes — no `.ftl` files mentioned.
- No CI changes — no `.github/workflows/` edits in any phase.
- No version bump — no `package.json` version field change in task list.
- No GitHub interaction — no `gh pr create` or push tasks.
- No translated READMEs — phase_03.md explicitly scopes only `README.md`, and flags `doc/README-zhCN.md` / `doc/README-frFR.md` as out of scope.

## Test Quality Assessment (Phase 2 specific)

Tests are written against observable behaviour, not implementation details:

- AC3.1: asserts the exact `[status, mime, body]` tuple — behavioural contract.
- AC3.2, AC3.3: asserts exact error tuples for two distinct negative paths — both paths are triggered by data shape, not internal wiring.
- AC3.4: uses tolerant body match on `result[2]` to decouple from runner state, while asserting strictly on `result[0]` (status) and `result[1]` (MIME) — appropriate tolerance/strictness split.
- AC4.1, AC4.2: asserts on payload structure, not on title content — appropriate tolerance for translator metadata drift.

Negative-path coverage is sufficient for the three error branches visible in `src/addon.ts` (no identifier, unparseable identifier, no collection selected). The network-failure path is covered by design intent (DR5) rather than by a test case — a test asserting failure on unreachable network would be meta-circular. The smoke test's explicit no-skip policy satisfies DR5.

## Phase Executability

Each phase is independently executable after its predecessors:

- Phase 1: no dependencies (first phase); ends with a clean commit and `1 passing`.
- Phase 2: depends on Phase 1 (MIME fix required for AC3.1) — dependency is explicit in phase_02.md header; ends with `6 passing` and a commit.
- Phase 3: depends on Phase 1 (manifest justifies badge) — dependency is explicit in phase_03.md header; ends with lint-clean README and a commit.

No forward references to code not yet existing. Each phase ends with a verifiable passing state and a named commit.

## Decision: APPROVED FOR MERGE (with minor plan edits recommended)

The implementation plan covers all design requirements completely. No Critical gaps. Two Important issues (AC6.2 cross-phase labelling and cleanup API uncertainty) are quality-of-plan rather than correctness blockers — an executor following the plan will still produce a correct implementation. Three Minor issues are documentation clarity only. The plan is executable as written.

---

## Re-review (2026-05-13)

### Prior Findings Verification

| ID  | Description                                                          | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | AC6.2 cross-phase signal — Phase 1 coverage table and Done When item | Resolved | phase_01.md AC6.2 row (lines 45-46) and Done When item 3 (line 308) both carry explicit deferral language pointing to Phase 2 Task 5 as the real falsification gate.                                                                                                                                                                                                                                                               |
| I2  | Smoke test cleanup API — `getAsync` vs `get` (sync) vs batch erase   | Resolved | phase_02.md Task 4 notes (lines 218-219) now name `Zotero.Items.get(id)` (synchronous) as the conventional path, `getAsync` as the cache-miss variant, and batch `Zotero.Items.erase` as the terseness alternative. The code snippet still shows `getAsync` but the prose instructs the implementor to verify against `zotero-types@4.1.2` and prefer the synchronous form. This satisfies the finding's requested guidance level. |
| m1  | Pre-flight `mkdir -p` unconditional                                  | Resolved | phase_01.md Task 5 pre-flight block (lines 194-202) now reads "always run; idempotent" and drops the conditional framing. Rationale for unconditional execution is present.                                                                                                                                                                                                                                                        |
| m2  | Phase 3 phantom "DR3.1" / "DR3.2" citations                          | Resolved | phase_03.md Task 1 and Task 2 no longer cite DR3.1 or DR3.2. Both replaced with accurate inline rationale. The remaining "design AC8.2" reference in Task 2 is a real AC item — not a phantom citation.                                                                                                                                                                                                                            |
| m3  | Trailing space in Task 3 regex as load-bearing                       | Resolved | phase_02.md Task 3 (lines 141-143) now contains an explicit bolded note: "The trailing space inside `Internal Server Error: ` in the regex alternation is intentional and load-bearing." with a precise explanation.                                                                                                                                                                                                               |

### New Issues

**New-m1 (Minor) — Regex rendering defect in phase_02.md Task 3 Testing sub-section**

- **Issue**: The "Testing" sub-section (phase_02.md line 152) writes the AC3.4 body match condition as `^(No Collection selected\.|Internal Server Error: )/` — the opening `/` is absent, leaving a dangling `/` at the end. The correct form is `/^(No Collection selected\.|Internal Server Error: )/`. This is prose-only; the Implementation block's code (line 141) is correct. An executor writing the test from the code block will not be misled, but the Testing prose is mildly confusing. This defect predates the prior review cycle and was partially noted under original m2.
- **Location**: phase_02.md, Task 3, Testing sub-section, line 152.
- **Fix**: Change `body matches \`^(No Collection selected\.|Internal Server Error: )/\``to`body matches \`/^(No Collection selected\.|Internal Server Error: )/\``(add the opening`/`).

### Re-review Assessment

**APPROVED**

All five prior findings are fully addressed. One pre-existing minor rendering defect (new-m1) remains in the Testing prose of phase_02.md Task 3 — it does not affect implementation correctness and the code block in the same task is correct. The plan is executable as written.
