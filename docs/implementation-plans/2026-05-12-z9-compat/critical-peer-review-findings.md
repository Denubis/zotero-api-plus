# Critical Peer Review: 2026-05-12-z9-compat implementation plan

Reviewer: Opus 4.7 (1M context), acting as Critical Peer Reviewer
Date: 2026-05-13
Documents reviewed:

- `/home/brian/people/Brian/zotero-api-plus/.worktrees/z9-compat/docs/design-plans/2026-05-12-z9-compat.md`
- `/home/brian/people/Brian/zotero-api-plus/.worktrees/z9-compat/docs/implementation-plans/2026-05-12-z9-compat/phase_01.md`
- `/home/brian/people/Brian/zotero-api-plus/.worktrees/z9-compat/docs/implementation-plans/2026-05-12-z9-compat/phase_02.md`
- `/home/brian/people/Brian/zotero-api-plus/.worktrees/z9-compat/docs/implementation-plans/2026-05-12-z9-compat/phase_03.md`
- `/home/brian/people/Brian/zotero-api-plus/.worktrees/z9-compat/docs/implementation-plans/2026-05-12-z9-compat/test-requirements.md`
- `/home/brian/people/Brian/zotero-api-plus/.worktrees/z9-compat/docs/implementation-plans/2026-05-12-z9-compat/uat-requirements.md`
- `/home/brian/people/Brian/zotero-api-plus/.worktrees/z9-compat/docs/implementation-plans/2026-05-12-z9-compat/code-review-findings-plan-validation.md`

Independent verification artefacts read: `src/addon.ts`, `package.json`, `package-lock.json`, `addon/manifest.json`, `test/startup.test.ts`, `typings/global.d.ts`, `README.md`, `zotero-plugin.config.ts`, `src/hooks.ts`, `.env`, `git log`, `git rev-list`.

---

## Hidden Assumptions (Assumption-Based Planning)

Each row marks whether the assumption is **load-bearing** (a phase or AC fails if it is wrong) and what observable signal would indicate it is failing. Anything load-bearing without supporting evidence is escalated as a finding below.

| # | Assumption | Load-bearing? | Evidence in plan | Signpost if breaking |
|---|---|---|---|---|
| HA1 | Scaffold's `waitForPlugin` gate fires before the first `it` callback runs, so `Zotero.Server.LocalAPI.{Plus,AddItemEndpoint,GetSelectedCollectionEndpoint}` are populated by the time tests dereference them. | Load-bearing for AC3 and AC4. | Phase 2 architecture paragraph asserts it; no citation, no reference to scaffold's source or docs. | `TypeError: Zotero.Server.LocalAPI.Plus is not a constructor` in mocha output. |
| HA2 | Mocha's `function () {}` syntax with `this.timeout(30000)` declared at the `describe` callback level applies to nested `it` callbacks under the scaffold's mocha invocation. | Load-bearing for AC4. | Phase 2 architecture paragraph asserts it; existing `startup.test.ts` uses `function () {}` but never calls `this.timeout`. | Smoke `it` times out at 2 000 ms even on a healthy translator round-trip. |
| HA3 | `Zotero.Search` in Z9 still has `addCondition("DOI", "is", ...)` and `.search()` returning item IDs. | Not load-bearing for AC pass — cleanup is wrapped in try/catch. Load-bearing for "tests are idempotent across runs" (Phase 2 Task 4 design DR2.2). | Phase 2 Task 4 prose flags the uncertainty but does not verify it. | Test passes, but each run accumulates a duplicate item in the dev profile; on a long-lived profile, `addedCount` could become unstable across runs (translator dedup behaviour). |
| HA4 | `Zotero.Items.getAsync(id)` (or its synchronous twin `Zotero.Items.get`) exists in Z9 with the signature the cleanup uses. | Not load-bearing (cleanup best-effort). | Plan explicitly defers to execution-time. | Cleanup logs an error via `Zotero.debug`; assertions still pass; profile accumulates items. |
| HA5 | The arXiv DOI `10.48550/arXiv.1706.03762` will resolve through Zotero's translator on Z9 with `addedCount >= 1` and `titles.length >= 1`. | Load-bearing for AC4.1, AC4.2 (DR5: failure IS the signal). | Plan notes "stable arXiv DOI" but does not enumerate _how_ the test discriminates among possible failure modes. | Smoke test fails; the plan provides no triage runbook for "is this a translator regression, network failure, DOI withdrawal, or arxiv.org rate-limit?" |
| HA6 | The dev profile's pane state during a scaffold-driven test run is consistent enough that `Zotero.getActiveZoteroPane()` either returns a pane (with no selected collection → `"No Collection selected."` body) or returns null/throws (→ `"Internal Server Error: ..."` body). | Load-bearing for AC3.4 — the regex assumes one of two specific bodies. | Phase 2 Task 3 explicitly tolerates both. | A third state (e.g., `getActiveZoteroPane()` returns a pane that throws a non-`TypeError` from `getSelectedCollection`, or returns `undefined` swallowed silently) could yield a body that matches neither alternative. |
| HA7 | Bumping `zotero-plugin-scaffold` from `^0.8.2` to `^0.8.6` does not change the test-runner's behaviour (mocha invocation, `waitForPlugin` semantics, exit code mapping, profile-launch path) in ways that affect `npm run test`. | Load-bearing for AC2, AC3, AC4. | DR3 in design doc says "version bumps within existing major lines" implies low risk; no changelog citation. | Tests fail or hang in ways unrelated to the endpoint code; or scaffold begins requiring a newer Node engine; or it begins reporting different exit codes. |
| HA8 | Bumping `zotero-types` from `^4.1.0-beta.4` to `^4.1.2` does not introduce a type definition that contradicts the project's `typings/global.d.ts:20-37` augmentation in a way the escape-hatch can't resolve. | Load-bearing for AC5.5. | Phase 1 Task 1 Step 3 has a contingency that says "augment, don't suppress." | `tsc --noEmit` reports a duplicate identifier error for `Server.LocalAPI.Schema`. |
| HA9 | The dev profile at `/tmp/zotero-api-plus-dev-profile` is in a state on first execution that allows `npm run test` to launch Zotero successfully. | Load-bearing for every `npm run test` invocation. | `mkdir -p` covered, but contents (e.g., a stale `parent.lock` file from a previous Zotero crash) are not. | Scaffold launches Zotero, Zotero exits with "another instance running" or "profile in use", scaffold returns a non-zero with no mocha output. |
| HA10 | The user's local Z9 binary at `/var/lib/flatpak/app/org.zotero.Zotero/.../files/share/zotero/zotero` (per `.env`) is actually Zotero 9 and is reachable by scaffold. | Load-bearing for "tests are run on Z9". | `.env` documents the path; nothing in the plan probes the binary version before running. | A `flatpak update` could swap the binary out from under the test; tests would silently run on whatever version is installed. |
| HA11 | The `permitBookmarklet = true` line is genuinely dead — i.e., the LocalAPI router never reads it, on Z9 specifically. | Load-bearing for AC6 (the safety claim "removing it cannot affect behaviour"). | Design's "Additional Considerations" notes the verification was on `zotero/zotero` `main` branch, "not pinned to the Z7 or Z8 release branches" (also implicitly not pinned to Z9). | A Z9-specific behaviour change in `Zotero.Server.LocalAPI`'s dispatch could read `permitBookmarklet`; AC4 smoke would still pass (POST is dispatched), so the regression would be silent. |
| HA12 | The build target `firefox115` is sufficient to keep Z7 compatible **even after** the dependency bumps' transitive deps are emitted into the bundle. | Load-bearing for the Out-of-Scope claim "Z7 stays compatible". | Design DR4 reasons about esbuild's `target` only; does not consider transitive dep code that might use APIs not in Firefox 115. | Z7 install reports a runtime error referencing an unknown global or method when an endpoint is hit. (Will not appear in this plan's verification — falls in the Out-of-Scope reasoning.) |

---

## ACH Matrix — "Is the plan's design correct as written?"

Hypotheses:

- **H1**: The plan as written will produce a working Z9-compatible plugin and the 6 passing tests on Z9.
- **H2**: The plan will produce a working plugin but the test suite will exhibit at least one false-pass or false-fail caused by an inadequately discriminated assumption (HA1, HA3–HA6, HA9, HA10).
- **H3**: The plan will produce a Z9-broken plugin (e.g., the dep bump introduces a runtime change that no test catches) but the suite will still report `6 passing`, deferring discovery to manual UAT or production.
- **H4**: The plan will produce a working plugin and tests, but its claim "Z7/Z8 stay compatible" will silently be false.

Evidence (each row evaluated against each hypothesis individually):

| Evidence | H1 | H2 | H3 | H4 | Notes |
|---|---|---|---|---|---|
| E1: `src/addon.ts:16` shows `"plain/text"`; AC7.1 git-diff verifies the swap | + | + | + | + | Non-diagnostic — fits all hypotheses. |
| E2: `src/addon.ts:26` shows the `permitBookmarklet = true` line; design admits Z9 source not checked | + | + | **+** | + | Specifically supports H3 if Z9's router newly reads the property. Fits H1 weakly because there's no positive evidence the property is read on Z9. |
| E3: AC3.4 uses tolerant body regex; HA6 enumerates only two body branches | + | **−** | + | + | If a third body-state appears, H1 says "test should pass" but it would actually fail. Counts against H1. |
| E4: AC4 has no skip-on-network-failure; design DR5 frames failure as "the signal" | + | **−** | + | + | If smoke fails for non-translator reasons (DNS, retraction, rate-limit), H1 incorrectly claims `6 passing` is achievable; H2 is supported. |
| E5: Cleanup uses `Zotero.Items.getAsync`; plan acknowledges API uncertainty | + | + | + | + | Non-diagnostic — best-effort, doesn't affect assertion outcome. |
| E6: `package-lock.json` still records `^5.1.0-beta.13` and `^4.1.0-beta.4` (lockfile not regenerated yet) | + | + | + | + | Non-diagnostic — Phase 1 will regenerate it. |
| E7: `zotero-plugin.config.ts:36` keeps `target: "firefox115"`; transitive deps not audited | + | + | + | **+** | Supports H4 specifically if any transitive dep emits non-FF115-safe code into the bundle. |
| E8: AC1.3 is the only check that exercises `strict_max_version`; scaffold's temporary install bypasses it (per UAT file) | + | + | **+** | + | If AC1.3 is skipped or rubber-stamped, H3 becomes likely. UAT framing alone does not enforce execution. |
| E9: Plan's AC table maps every AC to either an automated check or AC1.3 UAT — no AC is unmapped | + | + | + | + | Coverage is complete, but coverage is not the same as discrimination. |
| E10: `git rev-list z9-compat ^main --count` returns `1` today (only the prettier-format commit) | + | + | + | + | Diagnostic for the count check itself, neutral for hypotheses. |
| E11: `.env` references a flatpak Zotero binary; nothing in the plan asserts the binary's version | + | **+** | **+** | + | Supports H2 and H3 if the binary turns out to not be Z9 (e.g., flatpak channel slipped). |

**Decision under the rule "fewest strong contradictions":**
- H1 has two strong `−` marks (E3, E4) and several non-diagnostic `+` marks.
- H2 has zero `−` marks and gains positive support from E3, E4, E11.
- H3 has zero `−` marks and gains positive support from E2, E8, E11.
- H4 has zero `−` marks and gains positive support from E7.

**H1 (the plan as written produces a clean 6-passing run that is also a true regression signal) is the favoured hypothesis in the plan's own framing, but the matrix shows H2 and H3 are equally well-supported by available evidence.** The plan does not adequately discriminate among them. This is the central structural weakness.

---

## Findings

### Critical (count: 0)

None. The plan is internally coherent and the design itself is reasonable.

### Important (count: 5)

---

**I1 — `permitBookmarklet` removal safety reasoning is not pinned to Z9**

- **Location**: design plan §"Additional Considerations" item (iii); phase_01.md Task 3; AC6.
- **What the plan claims**: "the removed `permitBookmarklet` property was never read by the LocalAPI router — verified across the `zotero/zotero` source on `main`, but not pinned to the Z7 or Z8 release branches." Implication: removal is safe.
- **What the evidence supports**: The `main` branch claim is unverifiable from inside this plan (no commit hash cited). More importantly, **Z9 specifically is not enumerated** — only Z7 and Z8 are flagged as un-pinned, suggesting the author considered Z9 the verified case. But Z9 was released 2026-04-10; "main" at the time of design verification could be ahead of Z9, behind Z9, or branched from a different tip.
- **Gap**: A Z9 source-pinned check is what AC6 implicitly relies on. AC6.2 verifies "tests still pass" but the test suite does not exercise any path where `permitBookmarklet` would matter (no bookmarklet test, no connector-server invocation). So AC6.2 cannot detect a regression caused by Z9 newly reading the property.
- **GRADE factors**: Indirectness (test surface does not cover the property's role); Imprecision (single source-tree check, no version pin).
- **Ripple**: design "Additional Considerations" wording flows into AC6 framing flows into Phase 1 "Done When" item 3.
- **Falsifiable by**: Cite the exact Z9 release tag (`zotero-9.0` or equivalent) of `zotero/zotero` and the file/line confirming `permitBookmarklet` is not read in `Zotero.Server.LocalAPI`'s dispatch path. If that citation can be made, this finding dissolves. If it cannot, the design's reasoning is overstated and should hedge: "removal is reasoned safe; not source-verified against Z9."
- **Corrected language**: "Verified against `zotero/zotero` at tag `<TAG>`. Not pinned to Z7 or Z8. **A regression in which Z9 begins reading `permitBookmarklet` would not be caught by this plan's test suite** (no bookmarklet/connector path is exercised); operator UAT (`AC1.3` complement) should include a POST to `/api/plus/add-item-by-id` from the dev profile to cover this path."

---

**I2 — Smoke test "is the signal" claim conflates four distinct failure modes**

- **Location**: design DR5; AC4.3; phase_02.md Task 4; test-requirements.md AC4.3 row.
- **What the plan claims**: "On network unreachability or translator regression, smoke `✖` — this is the design-intended signal."
- **What the evidence supports**: A failed smoke test is a signal that **at least one** of the following is true:
  1. arXiv translator regression in Z9.
  2. arxiv.org / DOI resolver DNS or HTTP outage.
  3. The chosen DOI (`10.48550/arXiv.1706.03762`) was withdrawn or its translator-extracted metadata changed shape.
  4. arxiv.org rate-limited the test runner's IP.
  5. `zotero-plugin-scaffold@0.8.6`'s Zotero launch path broke the in-process HTTP client used by the translator.
  6. Mocha 11.7.5 + the new scaffold version interact differently around `this.timeout(30000)`.
- **Gap**: The plan's framing collapses (1)–(6) into "translator regression" or "network down." That conflation is the falsification anti-pattern: a single observable cannot discriminate among multiple causes.
- **GRADE factors**: Indirectness (one observation, multiple inferences); Imprecision (no triage protocol for the failure case).
- **Ripple**: design DR5 wording flows into AC4.3 flows into test-requirements.md AC4.3 flows into phase_02.md Task 4's "Verification" block ("smoke fails, total reports `5 passing, 1 failing`... the design's intended signal that something the user cares about is broken").
- **Falsifiable by**: Add a triage runbook to AC4.3: "If smoke fails, the operator runs (a) `curl -I https://arxiv.org/abs/1706.03762` to discriminate network from translator, (b) checks `https://www.zotero.org/support/dev/translators` for translator updates, (c) runs the contract tests in isolation to confirm scaffold/mocha are healthy. Only after (a)–(c) is "translator regression" a tenable conclusion." Without this discrimination protocol, "smoke is the signal" is overclaimed.
- **Corrected language**: "Smoke failure indicates a problem in the path from the test runner through Zotero's translator pipeline to a stable arXiv DOI. Discriminating among network, runner, and translator failures requires the triage protocol in §X."

---

**I3 — Phase 2 architecture paragraph asserts mocha + scaffold behaviour without verification**

- **Location**: phase_02.md "Architecture" paragraph (lines 5–8); HA1, HA2.
- **What the plan claims**: "the scaffold's `waitForPlugin` gate guarantees the endpoint classes are already assigned to the namespace by the time `it` callbacks execute" and "`function () {}` so `this.timeout()` works."
- **What the evidence supports**: `test/startup.test.ts` uses `function () {}` but does not test either claim. The startup test only asserts `Zotero[config.addonInstance]` is non-empty — that does not verify that `Zotero.Server.LocalAPI.Plus` is assigned, nor that `this.timeout` propagates. The plan provides no citation to scaffold source/docs and no positive control.
- **Gap**: HA1 and HA2 are load-bearing for every test in Phase 2. The plan asserts them as background fact when they are inferences from "the existing `startup.test.ts` works."
- **GRADE factors**: Indirectness (existing test does not exercise the claim); Imprecision (single existing test, no probe).
- **Ripple**: every Phase 2 task body presumes the claims hold.
- **Falsifiable by**: Either (a) cite a `zotero-plugin-scaffold` source line or doc that documents `waitForPlugin`'s contract, or (b) add a Phase 2 Task 0 that runs a one-line probe (`assert.isOk(Zotero.Server.LocalAPI.Plus, "Plus class assigned at it-time");`) before the contract assertions, so the failure mode is "Plus is undefined" rather than the harder-to-diagnose "constructor is not a function." For HA2, point at `mocha`'s docs for `function ()` + `this.timeout` propagation, or rewrite the smoke `it` to set `this.timeout(30000)` inside the `it` callback (where the propagation question doesn't arise).
- **Corrected language**: "The architecture inherits two assumptions about the scaffold/mocha test runner. Those assumptions are inferred from the working `startup.test.ts` and from mocha documentation, not verified inside this plan. If either fails, Phase 2 will surface it as `TypeError` or premature timeout. See HA1 and HA2."

---

**I4 — `npm run test` "1 passing" / "6 passing" counts are brittle to scaffold/mocha output format**

- **Location**: phase_01.md Task 5 Step 4 ("`1 passing` reported"); phase_02.md Task 5 Step 2 ("`6 passing`"); test-requirements.md AC2.1, AC3.5, AC4.3 rows.
- **What the plan claims**: Numeric mocha pass counts are the falsification gate.
- **What the evidence supports**: Mocha's spec reporter prints `N passing` lines, but this is a reporter-level format. The bumped scaffold (`^0.8.6`) wraps mocha and may use a different reporter or strip output. The plan does not pin the reporter.
- **Gap**: If the scaffold update changes the reporter (or adds a wrapper line, or splits passing/failing across multiple "N passing" lines for nested suites), the visual check is fragile. More importantly, **a grep on "6 passing" can be satisfied by 6 passing tests in one file even if the smoke `it` was silently skipped** — mocha would print `5 passing, 1 pending` not `6 passing` in that case, but the plan never says "no pending count is acceptable."
- **GRADE factors**: Imprecision (visual count, no exit-code-only verification); Risk of bias (plan assumes reporter is stable across the scaffold bump).
- **Ripple**: every "Done when" clause that cites a count.
- **Falsifiable by**: Replace "reports `6 passing`" with "reports exactly `6 passing` AND `0 pending` AND `0 failing`, and exits 0." Or even better: rely on `npm run test` exit code only and assert `0 pending` separately via `--reporter json` parsed output. Any test that becomes `it.skip` or is silently `pending` would currently sneak past the `6 passing` check if there were also 6 actually-passing tests, but in the present plan 6 is also the total count, so this is a forward-compatibility issue rather than an immediate bug.
- **Corrected language**: "`npm run test` exits 0; the spec output shows `6 passing` and the line `0 pending` is either absent or shows `0`."

---

**I5 — Plan's claim that AC6.2 is the "real falsification gate" is overstated**

- **Location**: phase_01.md AC6.2 row (lines 45–46); test-requirements.md AC6.2 row; code-review re-review I1 resolution.
- **What the plan claims**: AC6.2 (full suite passes after `permitBookmarklet` removal) is the falsification gate that the removal didn't break anything.
- **What the evidence supports**: The full suite consists of `startup` (asserts plugin instance), three contract `it`s (all assert on endpoint return tuples for the un-bookmarklet code paths), and the smoke test (a successful `AddItemEndpoint.run` with a real DOI). **None of these exercises any code path that reads `permitBookmarklet`.** The Zotero LocalAPI router's dispatch — the only place `permitBookmarklet` was nominally read — is bypassed by all in-process tests, and bypassed by the smoke test too (which calls `.run()` directly, not via HTTP).
- **Gap**: AC6.2 is not a falsification of the safety claim. It only verifies "the tests we have don't fail" — which is true tautologically because none of those tests touched the property's role.
- **GRADE factors**: Indirectness (test surface does not cover the property's role); the code-reviewer's I1 resolution accepted the deferral but did not check whether the deferred check is _diagnostic_.
- **Ripple**: AC6.2 framing flows into the code-review-findings-plan-validation.md's "Resolved" verdict for I1.
- **Falsifiable by**: Either acknowledge in the AC6.2 row that the suite does not exercise the bookmarklet code path and document that AC6.2 is therefore "tests-still-passing, not regression-detection-of-the-removed-property"; or add a test that hits `AddItemEndpoint` via HTTP (`fetch("http://127.0.0.1:23119/api/plus/add-item-by-id", {method:"POST", ...})`) so the LocalAPI router's dispatch is in the tested surface. The first option is cheap; the second crosses an explicit DR2 boundary ("no HTTP transport").
- **Corrected language**: "AC6.2 confirms the suite continues to pass after the removal. **It does not verify that nothing in Z9's LocalAPI dispatch reads `permitBookmarklet`** — no test exercises that path. The safety of the removal rests on the structural reasoning in design Additional Consideration (iii), not on AC6.2."

---

### Minor (count: 4)

---

**m1 — Test-requirements.md DR2.1 grep is exact-match-fragile**

- **Location**: test-requirements.md DR2.1 row.
- **What the plan claims**: `grep -E "this\.timeout\(30000\)" test/smoke-add-item-by-doi.test.ts` returns exactly 1 line, "the `this.timeout(30000)` call inside the `describe` callback, not the `it` callback."
- **Gap**: A grep matches text, not AST position. A future refactor could move `this.timeout(30000)` into the `it` callback (where it would still work but Phase 2 Task 4 explicitly chose the `describe` level), and the grep would still report `1` and pass DR2.1.
- **Falsifiable by**: Use ast-grep or eslint-style position checking, or accept that DR2.1 is "presence check, not position check" and adjust the description.

---

**m2 — Phase 3 AC8.4 "scope creep" check is declared, not enforced**

- **Location**: phase_03.md Task 3 Step 2 ("Inspect: every `+` and `-` line should belong to either the badge line or the Usage block"); test-requirements.md AC8.4 row.
- **What the plan claims**: "Manual inspection of `+`/`-` lines"; "Use `git diff --stat README.md`: total under ~15 lines changed."
- **Gap**: AC8.4 is the only AC in the plan that relies on manual visual inspection of a diff (AC1.3 is genuine UAT — a different category). A 15-line cap is not falsifiable in CI. An executor in a hurry can satisfy "looks fine" while having added a paragraph to the Features section.
- **Falsifiable by**: Pin the line ranges expected to change (e.g., "the only diff lines are `README.md:3` and the Usage block from `README.md:92` to `README.md:95`"). A deterministic check: `git diff --unified=0 README.md | grep -E "^@@" | awk '{print $3}'` and assert the hunk headers point only at line 3 and lines 92–95.
- **Corrected language**: Replace "inspect manually" with "the only `@@` hunk headers in `git diff --unified=0 README.md` reference line 3 and lines in the 92–100 range."

---

**m3 — `0.8.2 → 0.8.6` scaffold bump is not a truly minor version risk**

- **Location**: design DoD item 5; phase_01.md Task 1 Step 2 ("No new top-level packages should appear (these are version bumps within existing major lines: 4.x → 4.x, 5.x → 5.x, 0.8.x → 0.8.x).")
- **What the plan claims**: All three bumps are within an existing major line, implying low risk.
- **Gap**: `zotero-plugin-scaffold` is at `^0.8.x` — semver explicitly does NOT guarantee API stability before 1.0.0. Within the `0.8.x` range, the scaffold can break compatibility. Additionally, `^5.1.0-beta.13 → ^5.1.2` for `zotero-plugin-toolkit` is a beta-to-stable transition, which is a known release-quality boundary (betas often cut features that don't survive into stable).
- **Falsifiable by**: Cite the upstream changelogs for the three packages between the pinned versions and call out anything that touches the test runner, build target, or namespace augmentation. If no changelog is read, the "low risk" claim is `Possible` not `Plausible` per the evidence grade table.
- **Corrected language**: "Three bumps within existing major lines (zotero-plugin-toolkit beta→stable; scaffold pre-1.0 patch range). Pre-1.0 and beta-to-stable transitions are explicit semver carve-outs; risk is reduced by the existing test surface but not eliminated. Changelogs reviewed: [link or NONE]."

---

**m4 — The `git rev-list z9-compat ^main --count` checks bake in the prettier-format commit count**

- **Location**: phase_01.md Task 6 Step 3 (`Expected: 2`); phase_02.md Task 6 Step 3 (`Expected: 3`); phase_03.md Task 4 Step 3 (`Expected: 4`); test-requirements.md DR1.2.
- **What the plan claims**: Each phase produces "exactly one commit beyond the prettier-format setup commit," with counts 2/3/4.
- **Verified independently**: Today on the worktree, `git rev-list z9-compat ^main --count` returns `1` (only the `format design plan with prettier` commit, c536690). The math checks out.
- **Gap**: This is fragile to anything that adds a non-phase commit on the branch (e.g., a fix-up after code review, a `chore: update findings file`, this critical review's findings file if committed). An executor who cleans up between phases by committing the findings file would fail DR1.2 with no signal that anything is wrong with the actual implementation.
- **Falsifiable by**: Replace the count check with a content-based check: "the exact set of commit messages in `git log --pretty=%s z9-compat ^main` matches `["format design plan with prettier", "bump deps and manifest for Zotero 9; drop dead permitBookmarklet; fix MIME typo"]` after Phase 1."
- **Corrected language**: Acknowledge that any non-phase commits on `z9-compat` (review notes, findings files, follow-up fixes) will inflate the count, and that DR1.2 is brittle to ordinary in-flight branch hygiene.

---

### Flagged (count: 3)

---

**F1 — UAT framing of AC1.3 is correct but the operator handoff is unowned**

- **Location**: uat-requirements.md AC1.3.
- **Observation**: AC1.3 cannot be automated (scaffold's temporary install bypasses `strict_max_version`). UAT is the right category. But the plan does not name **who** runs UAT — the executing agent? The original user? A separate operator? — nor when (immediately after Phase 3? before merging? before tagging a release?).
- **Falsifiable by**: Add to uat-requirements.md: "Operator: `<name or role>`. Trigger: `<after Phase 3 commit and before any merge to main>`. Recording: `<append to this file as YYYY-MM-DD: PASS/FAIL with operator initials>`."

---

**F2 — No defined post-execution path for the `z9-compat` branch**

- **Location**: All phase files; design plan §"Out of Scope".
- **Observation**: After all 3 phases plus AC1.3 UAT, the plan says nothing about what becomes of the branch. Merge to main? Open a PR? Tag a release? Leave the branch parked? The design's Out of Scope explicitly excludes "version bump and release" and "any GitHub interaction," but the plan does not say "the branch stays as a feature branch, owner is responsible for next steps." This is implication-audit fodder.
- **Falsifiable by**: Add a line to the design's "Out of Scope" section: "Branch fate after AC1.3 PASS is a separate decision (merge / release / park) outside this design's scope. The branch will not be merged or pushed by this design's execution."

---

**F3 — No documented behaviour for "smoke test fails on a real translator regression — what next?"**

- **Location**: design DR5; AC4.3; phase_02.md Task 5 Step 2.
- **Observation**: DR5 says fail loud. The plan says "surface to the user; do not silently retry or skip." But there is no follow-up: what does the user do? Re-run? File a ticket? Roll back? Per F1, no operator is even named.
- **Falsifiable by**: Add to design DR5 consequences: "If smoke fails after triage (per I2), the operator's options are (a) file an upstream Zotero translator issue and tag the test as a regression, (b) update `TEST_DOI` to a different stable DOI if the chosen one was withdrawn, (c) hold the `z9-compat` branch as not-mergeable until upstream resolution. Decision is owner's."

---

## Verification

Independent checks performed in this review:

| Check | Command | Result |
|---|---|---|
| `permitBookmarklet` location | `grep -n permitBookmarklet src/addon.ts typings/global.d.ts` | `src/addon.ts:26` ✓; `typings/global.d.ts:26` (declaration only) ✓ |
| MIME typo location | Read `src/addon.ts` line 16 | Line 16 contains `"plain/text"` ✓ |
| Manifest version cited | Read `addon/manifest.json:17` | Confirmed `"strict_max_version": "8.*"` ✓ |
| `package.json` dep versions cited | Read `package.json` | Line 33 `^5.1.0-beta.13` ✓; line 45 `^0.8.2` ✓; line 46 `^4.1.0-beta.4` ✓ |
| README badge line cited | Read `README.md:3` | Confirmed `Zotero-8-green` shield ✓ |
| README Usage section cited | Read `README.md:92-95` | Confirmed prefs.js wording on line 94 ✓ |
| Installation menu cited (out of scope) | `grep -n "Tools >" README.md` | `README.md:87` `Tools > Add-ons` ✓ (correctly flagged Phase 3 as out-of-scope) |
| esbuild target cited | `grep -n target zotero-plugin.config.ts` | Line 36 `target: "firefox115"` ✓ |
| `assets` field cited | `grep -n assets zotero-plugin.config.ts` | Line 17 `assets: ["addon/**/*.*"]` ✓ |
| Branch state | `git rev-list z9-compat ^main --count` | Returns `1` (only prettier-format commit) ✓ — DR1.2 starting state correct |
| `.env` flatpak path | Read `.env` | Path matches design plan exactly ✓ |
| Existing `startup.test.ts` pattern | Read `test/startup.test.ts` | Uses `function () {}`, no `this.timeout` call — confirms HA2 is inferred not verified |
| `typings/global.d.ts:20-37` augmentation | Read whole file | `Schema`, `Plus`, `AddItemEndpoint`, `GetSelectedCollectionEndpoint` all declared ✓ |

All file:line citations in the implementation plan that I checked are accurate.

---

## Strongest Hypothesis

**H1 — the plan as written produces a working Z9-compatible plugin and a 6-passing test suite — has the most direct evidence**: the dep bumps are mechanical, the test pattern mirrors the existing working `startup.test.ts`, the file:line citations are all accurate, and code-reviewer's two passes have closed the obvious issues. **However, H1 is not as well-supported as the plan implies** — the ACH matrix shows H2 (false-pass/false-fail in suite) and H3 (silent Z9 breakage) are equally consistent with the available evidence because the test surface does not discriminate against them.

## Weakest Hypothesis

**The test suite is a sufficient regression detector for the changes made.** Every test in the suite asserts on the in-process `[status, mime, body]` tuple of an endpoint class. The changes made include: (a) removing a property potentially read by the LocalAPI router (HTTP-layer), (b) bumping dev-deps that include the test runner itself, (c) widening the manifest range that is enforced by Zotero's add-on manager (not by the test runner). **None of these change-classes is in the test surface.** The test suite verifies that the endpoint code paths themselves still produce the expected tuples — which is a small subset of what could break.

## Pre-Mortem — Three Alternative Failure Scenarios

**Scenario A — "Tests passed; user reports plugin doesn't load on Z9".** The dep bump for `zotero-plugin-scaffold@0.8.6` changes how it injects the plugin. The temporary-install path that scaffold uses succeeds (so tests pass), but the production `.xpi` install path triggers a Z9 add-on-manager check that the temporary path bypasses. AC1.3 UAT catches it — IF the operator runs UAT. F1 is the relevant mitigation gap.

**Scenario B — "Tests passed; Z7 silently broke".** A transitive dependency of the bumped `zotero-types` or `zotero-plugin-toolkit` emits ES2022+ syntax into a code path that gets included in the bundle. esbuild's `firefox115` target only constrains _esbuild's own_ output; it does not down-level code from `node_modules` that was pre-emitted as ES2022+. Out-of-scope per the design's "reasoned not tested" framing — but the design's reasoning explicitly omits this transitive-dep risk. HA12 and m3 are the relevant gaps.

**Scenario C — "Smoke test fails on a Tuesday".** arxiv.org has a brief outage. Smoke fails. Per DR5, no skip. Per the plan, "this is the intended signal." Operator (F1: undefined) sees `5 passing, 1 failing`, doesn't know whether to (a) wait and rerun, (b) investigate translator, (c) hold the branch. Without I2's triage runbook, the failure is signal but not actionable signal.

These scenarios are not edge cases — they are mainline risks for a config/dep change.

## Fastest Next Test

**Add a Phase 2 Task 0: a one-line "namespace probe"** before any contract assertion runs:

```
describe("preflight: scaffold/mocha invariants", function () {
  it("Plus class is assigned to the LocalAPI namespace at it-time", function () {
    assert.isOk(Zotero.Server.LocalAPI.Plus, "Plus undefined — waitForPlugin gate failed");
    assert.isOk(Zotero.Server.LocalAPI.AddItemEndpoint);
    assert.isOk(Zotero.Server.LocalAPI.GetSelectedCollectionEndpoint);
  });
  it("this.timeout(30000) propagates to nested it callbacks", function () {
    this.timeout(30000);
    // a no-op slow assertion that would time out at 2000ms
    return new Promise((resolve) => setTimeout(resolve, 2500));
  });
});
```

This converts HA1 and HA2 from "background facts" to "explicit positive controls." If either is wrong, the suite fails with a discriminating message, not with a `TypeError` from the contract assertions. Cost: ~10 lines of test code and one extra `it` execution. Information return: high — it isolates "scaffold/mocha is healthy" from "endpoint is healthy."

---

## Overall Assessment

**APPROVED-WITH-NOTES.** The plan is executable as written and the code-reviewer's two passes have closed the obvious correctness issues. The plan will most likely produce a working Z9-compatible plugin and a 6-passing test suite. Verification of file:line citations confirms the plan's evidence is faithful to the codebase.

However, the plan **systematically overclaims the discriminating power of its test suite**. Five Important findings cluster around one structural pattern: the in-process contract tests assert on endpoint return tuples, but the changes being made affect surfaces (HTTP dispatch, dep-bump runtime semantics, manifest enforcement, transitive code emission) that the test surface does not cover. Code-reviewer's prior passes did not surface this because they checked AC coverage (which is complete) rather than AC discrimination (which is partial).

**Required before execution:**

- I1: Pin the `permitBookmarklet`-not-read claim to a Z9 source tag, or hedge the claim and add a UAT step covering the bookmarklet path.
- I2: Add a triage runbook to AC4.3 so smoke failure is actionable signal, not just signal.
- I3: Either cite scaffold's `waitForPlugin` contract or add the Phase 2 Task 0 namespace probe (Fastest Next Test).
- I5: Acknowledge in AC6.2 that the suite does not exercise the property's role; AC6.2 is "tests-still-pass" not "regression-of-removal-detected".

**Recommended (Important but not blocking):**

- I4: Tighten the `N passing` checks to also assert `0 pending`.

**Recommended (Minor / Flagged):**

- m1, m2, m3, m4: small precision improvements to grep checks, scope-creep enforcement, dep-bump risk language, and commit-count fragility.
- F1, F2, F3: name the UAT operator, define the branch's post-execution fate, define the smoke-failure follow-up.

The code-reviewer's APPROVED verdict is defensible for AC coverage. This review's APPROVED-WITH-NOTES is for AC discrimination — a different question. The two are not in conflict.

---

## What was checked but found NOT to be a problem

- **Phase 1 commit message exactly matches design "Done when"**: confirmed across phase_01.md Task 6 Step 2 and design plan implementation phase block. ✓
- **Phase 2 Task 3 trailing-space-in-regex load-bearing claim**: confirmed against `src/addon.ts:141` — the literal string is `"Internal Server Error: " + e.message`. The space is genuinely there. ✓
- **Out-of-Scope "no CI changes"**: confirmed. No phase touches `.github/workflows/`. The existing CI is broken (per design Additional Considerations, last paragraph), but that is correctly out of scope. ✓
- **Out-of-Scope "no localisation"**: confirmed. No phase touches `*.ftl`. ✓
- **Out-of-Scope "no esbuild target change"**: confirmed at `zotero-plugin.config.ts:36`. Phase 1 does not touch this file. ✓
- **DR3 (MIME typo fix) breaking-change risk**: the dismissal is sound; `"plain/text"` is not an IANA-registered MIME and `"text/plain"` is the correct value. Any client built against the malformed value was broken; the fix unbreaks it. ✓
- **AC8.2 Settings path string-literal**: the design and Phase 3 use the exact phrase "Allow other applications on this computer to communicate with Zotero". I did not verify this against a Z9 binary (no Z9 installed in this review's environment), but the phrase is the standard Zotero 7+ wording and is consistent across both documents. ✓
- **`typings/global.d.ts` already declares `Plus`, `AddItemEndpoint`, `GetSelectedCollectionEndpoint`**: confirmed at lines 29–31. The contract tests' namespace dereferences will type-check. ✓
- **prettier config consistency**: design plan, phase plans, and `package.json` agree on `printWidth: 80, tabWidth: 2, endOfLine: "lf"`. ✓
- **Code-reviewer re-review's new-m1 finding** (regex rendering defect in phase_02.md Task 3 Testing sub-section line 152): independently confirmed. The code block in the same task is correct; the prose is mildly wrong but not load-bearing. The plan acknowledges it; no action required from this review. ✓
