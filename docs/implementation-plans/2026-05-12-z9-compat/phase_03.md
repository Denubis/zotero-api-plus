# Zotero 9 Compatibility Implementation Plan — Phase 3: Documentation Updates

**Goal:** Bring `README.md` in line with the migration: signal Zotero 7/8/9 support in the badge and replace the outdated `prefs.js`-editing Usage instructions with the current Z7+ in-app toggle path.

**Architecture:** A single-file documentation edit. No code changes, no test changes. Two scoped edits inside `README.md`: the version badge on line 3 and the "Usage" section starting at line 92.

**Tech Stack:** Markdown + shields.io badge URLs.

**Scope:** Phase 3 of 3 from `docs/design-plans/2026-05-12-z9-compat.md`.

**Codebase verified:** 2026-05-12.

**Phase Type:** infrastructure

**Depends on Phase 1:** the badge change presupposes the manifest accepts Z9 (Phase 1 AC1) and the corrected MIME type (Phase 1 AC7) — without those, advertising Z9 support in the README would be misleading.

---

## Acceptance Criteria Coverage

This phase implements and verifies operationally:

### z9-compat.AC8: README updated for accuracy

- **z9-compat.AC8.1 Success:** the Zotero version badge in `README.md` is updated to signal the supported range (e.g. `Zotero-7|8|9-green` or equivalent shield syntax). The `Zotero-8` shield is gone.
- **z9-compat.AC8.2 Success:** the "Usage" section's first numbered item is replaced with text instructing the user to enable *Settings → Advanced → "Allow other applications on this computer to communicate with Zotero"*. The instruction to edit `prefs.js` is gone. Optionally includes a `curl http://127.0.0.1:23119/api/plus` smoke command.
- **z9-compat.AC8.3 Success:** `npm run lint:check` exits 0 (prettier accepts the markdown).
- **z9-compat.AC8.4 Failure:** `git diff README.md` shows changes to any section other than the badge line and the targeted Usage paragraph — surfaces unintended scope creep.

---

## Implementation Tasks

Phase Type = infrastructure. Verification = operational success of `npm run lint:check` plus a bounded `git diff` showing only the two intended edits.

<!-- START_TASK_1 -->
### Task 1: Replace the Zotero version badge

**Verifies:** z9-compat.AC8.1 (and contributes to AC8.4 — bounded diff).

**Files:**
- Modify: `README.md:3` — replace the badge URL.

**Current line 3 (verbatim):**

```
[![zotero target version](https://img.shields.io/badge/Zotero-8-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
```

**Replacement (URL-encoded `|` as `%7C` for cross-renderer safety in shield badge URLs; matches the encoding convention of the existing License badge URL on line 4):**

```
[![zotero target version](https://img.shields.io/badge/Zotero-7%7C8%7C9-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
```

**Step 1: Apply the one-line edit with the Edit tool.**

Use the full line as `old_string` to ensure uniqueness. The substring `Zotero-8-green` should not appear elsewhere in the README (codebase investigation confirms it does not — the License badge URL has different structure).

**Step 2: Verify the change**

```
grep -c "Zotero-7%7C8%7C9-green" README.md
```
Expected: `1`.

```
grep -c "Zotero-8-green" README.md
```
Expected: `0` — the old shield is gone.

```
git diff README.md | grep -E "^[+-].*shields.io"
```
Expected: exactly two lines — one removal containing `Zotero-8-green`, one addition containing `Zotero-7%7C8%7C9-green`. No other shield URLs should appear in the diff (the License badge stays untouched).
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Replace the Usage section's first numbered item and add a smoke command

**Verifies:** z9-compat.AC8.2 (and contributes to AC8.4 — bounded diff).

**Files:**
- Modify: `README.md:92-95` — replace the Usage section's two-line numbered list (currently lines 94 and 95) with a three-line list reflecting the Z7+ toggle plus a `curl` smoke command (the design plan's AC8.2 marks the curl line as optional; this plan elects to include it because it's the same one-line check the operator runs for AC1.3 UAT, and putting it in the README gives the user an immediate copy-pasteable verification path that also surfaces the corrected `text/plain` MIME from Phase 1).

**Current lines 92-95 (verbatim):**

```
## Usage

1. Ensure Zotero's local API is enabled (go to `Edit > Preferences > Advanced > Files and Folders > Show Data Directory`, then edit `prefs.js` and add `user_pref("extensions.zotero.httpServer.enabled", true);`).
2. Use the API endpoints as described above.
```

**Replacement (satisfies design AC8.2; includes the optional curl smoke command per the rationale above):**

```
## Usage

1. Enable Zotero's local API: open _Settings → Advanced_ and tick "Allow other applications on this computer to communicate with Zotero".
2. Verify the API is reachable:

   ```
   curl http://127.0.0.1:23119/api/plus
   ```

   Expected response body: `Zotero Local API Plus is running.` with `Content-Type: text/plain`.
3. Use the API endpoints as described above.
```

**Notes on the replacement:**

- The Settings path uses `_underscore italics_` rather than `*asterisk italics*` — Phase 0's prettier-format commit moved the project's design plan markdown to underscore-italic style, so this Phase 3 edit follows suit. Prettier (as configured in `package.json`'s `prettier` block) will reformat to underscores anyway; writing them directly avoids the post-edit reformat noise.
- The `curl` command is in an indented fenced block under list item 2 so it renders as a child of the list item rather than terminating the list. Indentation: three spaces (matches the standard markdown list-continuation indent for ordered lists with single-digit numbers).
- `Content-Type: text/plain` is asserted explicitly to reinforce Phase 1 AC7 (the MIME typo fix) — readers see the corrected value, not the legacy `plain/text`.

**Step 1: Apply the multi-line edit with the Edit tool.**

Use the full four-line block (lines 92-95 as shown above) as `old_string` to ensure uniqueness. The replacement is the full new block above.

**Step 2: Verify the change**

```
grep -c "prefs.js" README.md
```
Expected: `0` — the stale `prefs.js` reference is gone.

```
grep -c "Allow other applications on this computer to communicate with Zotero" README.md
```
Expected: `1`.

```
grep -F "curl http://127.0.0.1:23119/api/plus" README.md | wc -l
```
Expected: `1`.

```
git diff README.md
```

Inspect manually: changes should appear only in the two windows — line 3 (badge) and the Usage block (around line 92). Any other line in the diff is a scope violation per AC8.4.

The Installation section's "Tools > Add-ons" reference on line 87 is OUT OF SCOPE for this phase (deferred to a future README modernisation pass — Z7+ renamed the menu to "Plugins"). Do NOT touch it.
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Lint check + bounded-diff verification

**Verifies:** z9-compat.AC8.3, z9-compat.AC8.4

**Step 1: Lint**

```
npm run lint:check
```
Expected: exit 0. Prettier checks `README.md` against the project's prettier config (`printWidth: 80, tabWidth: 2, endOfLine: "lf"`) and accepts the new content. If prettier reformats anything not anticipated above, the implementor should run `prettier --write README.md` and re-verify the bounded diff in Step 2 — but the rewrite must still produce changes only in the two intended windows.

**Step 2: Bounded-diff verification (deterministic hunk-range check, per critical review m2)**

Replace the old "inspect manually / under 15 lines" check with a positional assertion on the diff's hunk headers. With zero context lines, every changed region must start at line 3 (badge) or within the Usage block:

```
git diff --unified=0 README.md | grep -E '^@@' | awk '{print $3}'
```

Expected: exactly two hunk-header targets — one `+3` (or `+3,N`) for the badge, and one in the Usage range (around `+92`…`+100` depending on the post-edit line numbers). Any hunk header pointing outside those two windows (Installation, Features, License, Contributing, etc.) is scope creep — halt and reconcile. This is falsifiable in a script, unlike visual inspection.

```
git diff --stat README.md
```
Sanity magnitude (not the gate): roughly 1−/1+ for the badge and ~2−/~6+ for the Usage block.

**Step 3: Working tree check**

```
git status --short
```
Expected: exactly one line: `M  README.md`. No other file modifications, no untracked files.
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Commit Phase 3

**Verifies:** the design plan's Phase 3 "Done when" requirement (single commit with the specified message).

**Step 1: Stage the README**

```
git add README.md
```

**Step 2: Commit with the design-specified message**

```
git commit -m "update README for Zotero 9 and current local-API toggle"
```

**Step 3: Verify the commit**

```
git log -1 --stat
```
Expected: one commit on `z9-compat` with the message above and 1 file changed (`README.md`).

```
git status --short
```
Expected: empty.

Content-based branch check (per critical review m4 — not a hardcoded count, which is brittle now that Phase 1 produces four commits and review-note commits may exist):

```
git log --pretty=%s z9-compat ^main
```
Expected to **contain** these subjects: `update README for Zotero 9 and current local-API toggle` (this phase); the Phase 2 subject `add preflight, contract, HTTP dispatch, and arXiv smoke tests`; the four Phase 1 subjects (`widen manifest …`, `bump zotero-plugin-scaffold …`, `bump zotero-plugin-toolkit …`, `bump zotero-types …`); and `format design plan with prettier`. Extra commits (findings files, review notes) are acceptable — the check is presence of the expected subjects, not an exact count.
<!-- END_TASK_4 -->

---

## Phase 3 Done When

All of the following are true:

1. `README.md:3` shows the new badge URL with `Zotero-7%7C8%7C9-green`; the `Zotero-8-green` URL is gone.
2. `README.md` Usage section instructs the user to enable *Settings → Advanced → "Allow other applications on this computer to communicate with Zotero"* and includes a `curl http://127.0.0.1:23119/api/plus` smoke command. The `prefs.js` reference is gone.
3. `git diff main..HEAD -- README.md` shows changes only in the badge line and the Usage block.
4. `npm run lint:check` exits 0.
5. One new commit on `z9-compat` for Phase 3 with the message `update README for Zotero 9 and current local-API toggle`.

This phase covers `z9-compat.AC8`. No UAT entries — all verification is by automated lint plus operator visual inspection of the rendered README on GitHub.

**Out of scope (flagged for future):** `README.md:87` Installation step 2 references "Tools > Add-ons"; Z7+ renamed the menu to "Plugins". Deferred to a future README modernisation pass (separate design plan).
