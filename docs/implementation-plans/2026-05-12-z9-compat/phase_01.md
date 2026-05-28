# Zotero 9 Compatibility Implementation Plan — Phase 1: Compatibility Shift

**Goal:** Bump three dev dependencies to versions current as of the Zotero 9 release — **one at a time, each after reading its changelog, each its own commit** (DR1, revised) — then widen the manifest's accepted Zotero range to include 9.x and remove one dead code line plus one MIME-type typo from `src/addon.ts` in a fourth commit.

**Architecture:** Config/dependency change. The plugin's runtime architecture (three endpoint classes — `Plus`, `AddItemEndpoint`, `GetSelectedCollectionEndpoint` — registered on `Zotero.Server.LocalAPI`) is unchanged.

**Tech Stack:** TypeScript 5.9, Node 24, esbuild (`firefox115` target preserved per design DR4), `zotero-plugin-scaffold` for build/test orchestration.

**Scope:** Phase 1 of 3 from `docs/design-plans/2026-05-12-z9-compat.md`.

**Codebase verified:** 2026-05-12.

**Phase Type:** infrastructure

**Revision note:** This phase was restructured after the critical peer review (`critical-peer-review-findings.md`, m3 + I-cluster). The single combined commit became four — three isolated dependency bumps (ascending risk order) plus the manifest/code commit — so a regression is attributable to one package, and the scaffold bump (which the Phase 2 HTTP dispatch test is most sensitive to) is the last variable changed. See design DR1 (revised).

---

## Standing preconditions for every `npm run test` in this phase

These apply to Tasks 1–4 (each runs the full verification chain). State them once; obey them each time.

- **Zotero must be closed.** Scaffold launches the local Z9 binary against the dev profile; a running user-session Zotero conflicts over the SQLite lock and the run fails.
- **tmpfs dev directories must exist (always run; idempotent).** `/tmp` is tmpfs on this host, so these vanish on reboot. Run unconditionally — a missing directory makes scaffold fail opaquely before mocha reports anything:

  ```
  mkdir -p /tmp/zotero-api-plus-dev-profile /tmp/zotero-api-plus-dev-data
  ```

- **The verification chain** (the same four commands after each change):

  ```
  npm install            # only after a package.json edit
  npm run lint:check
  npm run build
  npx tsc --noEmit
  npm run test
  ```

  Expected at the end of Phase 1: `npm run test` reports `1 passing`, `0 pending`, `0 failing` (only `test/startup.test.ts` exists yet; Phase 2 adds the rest).

---

## Acceptance Criteria Coverage

### z9-compat.AC1: Manifest accepts Zotero 9 — Task 4

- **AC1.1 Success:** `addon/manifest.json` shows `"strict_max_version": "9.*"`.
- **AC1.2 Success:** still shows `"strict_min_version": "6.999"` (widened, not narrowed).
- **AC1.4 Failure:** `strict_max_version` still reads `"8.*"` after Phase 1 — `git diff` surfaces it.
- (**AC1.3** — manual `.xpi` install in a normal Z9 profile — is operator UAT, post-Phase-3; see `uat-requirements.md`.)

### z9-compat.AC2: Existing startup test passes on Zotero 9 — every task

- **AC2.1 Success:** `npm run test` includes `✔ should have plugin instance defined` and exits 0.
- **AC2.2 Failure:** that test absent or `✖`; `npm run test` exits non-zero.

### z9-compat.AC5: Dev-deps refreshed; build/lint/typecheck stay green — Tasks 1–3

- **AC5.1 Success:** after Task 3, `package.json` shows `"zotero-types": "^4.1.2"`, `"zotero-plugin-toolkit": "^5.1.2"`, `"zotero-plugin-scaffold": "^0.8.6"`.
- **AC5.2 Success:** each `npm install` exits 0; `package-lock.json` regenerated.
- **AC5.3 Success:** `npm run lint:check` exits 0 after each bump.
- **AC5.4 Success:** `npm run build` exits 0 after each bump.
- **AC5.5 Success:** `npx tsc --noEmit` reports `No errors found` after each bump. Type errors from a bump are resolved in `typings/global.d.ts` (no `@ts-expect-error`, no `as any`).

### z9-compat.AC6: Dead `permitBookmarklet` line removed — Task 4 (final verification deferred to Phase 2)

- **AC6.1 Success:** `git diff src/addon.ts` shows `permitBookmarklet = true;` removed from `AddItemEndpoint`; no other change in that class.
- **AC6.2 (re-scoped per critical review I5):** Phase 1 can only confirm the removal does not break the _existing_ suite (`1 passing`). **This is "suite intact," not "property unread"** — the in-process tests bypass the dispatch surface entirely. Full verification that the suite (now including the HTTP dispatch test, AC9) still passes is **deferred to Phase 2 Task — full-suite run**. The removal's safety reasoning is pinned to a Z9 source tag in Task 4 Step 1.

### z9-compat.AC7: MIME-type typo fixed — Task 4

- **AC7.1 Success:** `git diff src/addon.ts` shows `"plain/text"` → `"text/plain"` on the `Plus` return tuple (one-line swap).
- **AC7.2 Success:** verified in Phase 2 (`endpoint-plus` contract test + HTTP GET).

---

## Implementation Tasks

Phase Type = infrastructure. No TDD; no new tests in this phase. Verification = operational success of the standing chain above. **Each of Tasks 1–4 ends in its own commit.**

<!-- START_TASK_1 -->

### Task 1: Bump `zotero-types` → `^4.1.2` (commit 1)

**Verifies:** AC5.1 (partial), AC5.2, AC5.5 (for this package)

Type-only, lowest blast radius — bumped first so any type fallout is isolated before the runtime/runner packages change.

**Step 1 — Read the changelog.** Find the repo (`npm view zotero-types repository.url`), read the release notes / `CHANGELOG` between `4.1.0-beta.4` and `4.1.2`. Note anything touching `Zotero.Server`, `Zotero.Server.LocalAPI`, the `Schema` base class, `Zotero.Search`, `Zotero.Items`, or `Zotero.Translate`. Record a one-line finding (or "no relevant changes") — this note is part of the phase's deliverable.

**Step 2 — Edit `package.json`.** Line 46: `"zotero-types": "^4.1.0-beta.4"` → `"zotero-types": "^4.1.2"`. Use the full version-string line as `old_string`.

**Step 3 — Install + verify.** `npm install`; then the standing verification chain. Expected: all exit 0; `1 passing`. If `tsc --noEmit` flags type errors, resolve them in `typings/global.d.ts` per the existing augmentation pattern (lines 20–37). Hard rules: no `@ts-expect-error`/`@ts-ignore`/`as any`; minimum necessary augmentation, visible in this commit's diff. If augmentation is structurally impossible, **HALT** and surface to the user.

**Step 4 — Commit.** Stage `package.json`, `package-lock.json` (and `typings/global.d.ts` if changed):

```
git commit -m "bump zotero-types to ^4.1.2 for Zotero 9"
```

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Bump `zotero-plugin-toolkit` → `^5.1.2` (commit 2)

**Verifies:** AC5.1 (partial), AC5.2, AC5.5 (for this package)

Beta→stable transition — a semver carve-out (betas sometimes cut features that don't survive into stable).

**Step 1 — Read the changelog** between `5.1.0-beta.13` and `5.1.2`. Note removed/renamed exports, especially anything `src/addon.ts` imports (`ColumnOptions`, `DialogHelper`) or `src/utils/ztoolkit` uses. Record the finding.

**Step 2 — Edit `package.json`.** Line 33 (in `dependencies`, not `devDependencies` — confirmed by investigation): `"zotero-plugin-toolkit": "^5.1.0-beta.13"` → `"^5.1.2"`.

**Step 3 — Install + verify.** Same chain. If a removed/renamed toolkit export breaks compilation, fix the call site minimally (this is a real source change, not an augmentation) — and if the fix is more than trivial, **HALT** and surface, because it exceeds "version bump" scope.

**Step 4 — Commit.**

```
git commit -m "bump zotero-plugin-toolkit to ^5.1.2"
```

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Bump `zotero-plugin-scaffold` → `^0.8.6` (commit 3)

**Verifies:** AC5.1, AC5.2, AC5.5 (for this package)

Pre-1.0 (no semver API-stability guarantee in `0.x`); controls the test runner, the `waitForPlugin` gate, and the dev-profile launch. Bumped **last and alone** so a runner regression is unambiguously attributable, and because the Phase 2 HTTP dispatch test depends on this version's behaviour.

**Step 1 — Read the changelog** between `0.8.2` and `0.8.6`. Note anything touching: the mocha invocation / reporter, `waitForPlugin` semantics, exit-code mapping, dev-profile prefs injection, or any local-API / `httpServer` test-server support (directly relevant to the Phase 2 HTTP-test enablement spike). Record the finding — this one is load-bearing for Phase 2.

**Step 2 — Edit `package.json`.** Line 45: `"zotero-plugin-scaffold": "^0.8.2"` → `"^0.8.6"`.

**Step 3 — Install + verify.** Same chain. The startup test is the canary: if `npm run test` now fails or hangs where it passed in Task 2, the scaffold bump is the cause — investigate before proceeding (do not paper over with retries).

**Step 4 — Commit.**

```
git commit -m "bump zotero-plugin-scaffold to ^0.8.6"
```

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Manifest widen + dead-code removal + MIME fix (commit 4)

**Verifies:** AC1.1, AC1.2, AC6.1, AC7.1

**Step 1 — Pin the `permitBookmarklet` safety claim to Z9 (per critical review I1).** Before removing the line, record in the changelog notes the exact `zotero/zotero` tag (the Z9 release tag) and the file:line in `Zotero.Server.LocalAPI`'s dispatch confirming the property is not read on Z9. If that citation cannot be made with confidence, note it explicitly and treat the removal as "reasoned, not source-verified" (the design's Additional Considerations item (iii) carries the hedge). This is a research note, not a code change.

**Step 2 — `addon/manifest.json:17`:** `"strict_max_version": "8.*"` → `"9.*"`. Leave `strict_min_version: "6.999"` (line 16) untouched. Verify: `git diff addon/manifest.json` shows exactly one line removed, one added.

**Step 3 — `src/addon.ts:26`:** delete `  permitBookmarklet = true;` from `AddItemEndpoint`. The `typings/global.d.ts:26` optional declaration stays (harmless; removing it is separate scope).

**Step 4 — `src/addon.ts:16`:** `[200, "plain/text", "Zotero Local API Plus is running."]` → `[200, "text/plain", ...]`. Verify combined: `git diff src/addon.ts` shows exactly one removal line (`permitBookmarklet`) plus one removed + one added line for the MIME swap; nothing else.

**Step 5 — Verify.** Standing chain. Expected: all exit 0; `1 passing`. `git status --short` shows only `addon/manifest.json` and `src/addon.ts` modified (lockfile/package.json already committed in Tasks 1–3).

**Step 6 — Commit.**

```
git commit -m "widen manifest to Zotero 9; drop dead permitBookmarklet; fix MIME typo"
```

<!-- END_TASK_4 -->

---

## Phase 1 Done When

1. **Four commits** exist on `z9-compat` beyond the prettier-format setup commit, with these subjects (content-based check per critical review m4 — not a hardcoded count, which one-at-a-time bumps would make brittle):

   ```
   git log --pretty=%s z9-compat ^main
   ```

   Expected set (newest first): `widen manifest to Zotero 9; drop dead permitBookmarklet; fix MIME typo`, `bump zotero-plugin-scaffold to ^0.8.6`, `bump zotero-plugin-toolkit to ^5.1.2`, `bump zotero-types to ^4.1.2 for Zotero 9`, `format design plan with prettier`. (Findings-file or review-note commits, if any, are expected extras — the check is "these five subjects are present," not "exactly five commits.")

2. `git diff main..HEAD` touches only: `package.json`, `package-lock.json`, `addon/manifest.json`, `src/addon.ts` (and optionally `typings/global.d.ts`), plus the design/plan docs already on the branch.

3. After the final commit: `npm run lint:check`, `npm run build`, `npx tsc --noEmit`, and `npm run test` all exit 0; `npm run test` reports `1 passing`, `0 pending`, `0 failing`.

4. A changelog-review note (or "no relevant changes") is recorded for each of the three dependencies, and the Z9 source pin (or its hedge) for `permitBookmarklet`.

Covers `z9-compat.AC1` (except AC1.3 UAT), `z9-compat.AC2`, `z9-compat.AC5`, `z9-compat.AC6` (provisionally — final in Phase 2), `z9-compat.AC7`.
