# Code Review Findings — phase-1

## Status: APPROVED

**Critical: 0 | Important: 1 | Minor: 1**

## Verification

```
Lint:  npm run lint:check → exit 0 (prettier + eslint clean)
Build: npm run build      → exit 0 (zotero-plugin build + tsc --noEmit, 0.077 s)
```

Tests were not re-run during this review (the scaffold runner requires a live Zotero binary and does not self-exit; re-running under the reviewer's environment is not reliable). The caller confirms the verification chain — lint, build, tsc, and `npm run test` reporting `Test run completed - 1 passed` — was run after each of the four commits during implementation.

## Plan Alignment

- AC1.1: `strict_max_version` changed from `"8.*"` to `"9.*"` — confirmed in diff. ✓
- AC1.2: `strict_min_version: "6.999"` unchanged — confirmed in diff (only one line touched in manifest). ✓
- AC5.1: `package.json` shows `"zotero-types": "^4.1.2"`, `"zotero-plugin-toolkit": "^5.1.2"`, `"zotero-plugin-scaffold": "^0.8.6"` — confirmed in diff. ✓
- AC5.2: `package-lock.json` regenerated — confirmed (840-line lock diff present, all three dep trees updated). ✓
- AC5.3/AC5.4/AC5.5: lint/build/typecheck green — confirmed by reviewer-run commands above. ✓
- AC6.1: `permitBookmarklet = true;` removed from `AddItemEndpoint`; no other changes in that class — confirmed in diff (exactly 2 deletions, 1 addition in `src/addon.ts`). ✓
- AC6.2 (re-scoped): suite intact after removal — caller confirms `1 passing`, `0 failing`; this is "suite intact," not "property unread," as the plan documents explicitly. ✓
- AC7.1: `"plain/text"` → `"text/plain"` on the `Plus` return tuple — confirmed in diff. ✓
- DR1 (four isolated commits): four commits exist, one per dependency then one for manifest/code; subjects match the plan's expected set exactly. ✓
- Changelog-review note recorded: all three deps and the `permitBookmarklet` Z9 source pin recorded in `changelog-notes.md`. ✓
- `typings/global.d.ts` unchanged: no type errors surfaced by the bumps (confirmed: file not in diff). ✓

## Strengths

- **Commit discipline is correct.** Four commits, one concern each, in the plan-specified ascending-risk order. `git bisect` is fully operable against any regression.
- **Changelog notes are substantive.** Each entry names the versions in range, lists the relevant changes (or explicitly states "no relevant changes"), and gives a risk assessment with a verification pointer. The scaffold note proactively flags the Phase 2 HTTP-test implication.
- **`permitBookmarklet` reasoning is well-documented and appropriately hedged.** The Z9 source pin clearly states what was structurally verified, what could not be pinned to a single file:line, and why the removal is still safe. The AC6.2 re-scope is carried consistently through the plan, changelog note, and implementation.
- **MIME fix is exactly scoped.** One line replaced; nothing else in the `Plus` class touched.
- **Manifest change is minimal and correct.** One field changed; `strict_min_version` confirmed untouched.
- **No type suppression introduced.** No `@ts-expect-error`, `@ts-ignore`, or `as any` anywhere in the diff.

## Issues

### Important (count: 1)

- **Issue**: The `package-lock.json` diff contains an undocumented name correction: `"name": "zotero-localapi-plus"` (at BASE) becomes `"name": "zotero-api-plus"` (at HEAD) in both the root object and the `packages[""]` entry. This was not a planned change — it is a pre-existing stale lock file state (the lock was last regenerated before the repo was renamed in `package.json`) corrected silently by the first `npm install` in commit c3915b8. The change is harmless and correct, but it is unattributed in any commit message or changelog note, and a future reader of `git log -- package-lock.json` will see a spurious name change alongside the `zotero-types` version bump with no explanation.
- **Location**: `package-lock.json` lines 2 and 8 in the diff (first hunk, commit c3915b8).
- **Fix**: Add a one-line note to `changelog-notes.md` (or this findings file's context) recording that the lock file name was stale (`zotero-localapi-plus`) before Phase 1 and was corrected to `zotero-api-plus` automatically by `npm install`. No code change needed; the correction itself is right.

### Minor (count: 1)

- **Issue**: The `package-lock.json` diff also reflects an `@octokit/...` peer-dependency field removal (`"peer": true` dropped from one entry) and new transitive dev-dependency entries (`@quansync/fs`, `quansync`) introduced by the scaffold bump. These are expected side-effects of `npm install` after dependency version changes, but they are not acknowledged in the changelog note for `zotero-plugin-scaffold`. The `@quansync/fs` dependency in particular is a new package in the tree that was not present before.
- **Location**: `package-lock.json`, `node_modules/@octokit/...` hunk and `node_modules/@quansync/fs` hunk.
- **Fix**: Add a sentence to the scaffold changelog note in `changelog-notes.md` noting that the bump pulls in `@quansync/fs` and `quansync` as new transitive dependencies (MIT-licensed per the lock file) and removes a stale `"peer": true` field from the octokit entry. This is documentation hygiene, not a correctness concern.

## Consolidation Opportunities

None visible in the diff.

## Decision: APPROVED FOR MERGE (of Phase 1 into the z9-compat branch's running state)

The two findings are documentation gaps, not defects. The code changes are correct, minimal, and precisely scoped. No type suppression, no error handling gaps, no security concerns, no plan deviations. Phase 2 may proceed.
