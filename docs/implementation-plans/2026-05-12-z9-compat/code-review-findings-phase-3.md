# Code Review Findings — phase-3

## Status: APPROVED

**Critical: 0 | Important: 0 | Minor: 1**

## Verification

```
Lint: npm run lint:check → exit 0 (prettier: "All matched files use Prettier code style!")
```

No test suite to run — this is a documentation-only change with no code, no test files.

## Plan Alignment

- AC8.1: badge updated from `Zotero-8-green` to `Zotero-7%7C8%7C9-green`, old badge gone. ✓
- AC8.2: `prefs.js` reference removed; Settings → Advanced toggle path present; `curl http://127.0.0.1:23119/api/plus` smoke command included with expected response body and Content-Type. ✓
- AC8.3: `npm run lint:check` exits 0. ✓
- AC8.4: diff shows exactly two hunk targets (`+3` badge, `+94,10` Usage block) — no scope creep. ✓
- Phase 3 "Done when" conditions 1–5: all satisfied. ✓
  - Commit message is `update README for Zotero 9 and current local-API toggle` (matches spec). ✓
  - Out-of-scope item (`README.md:87` "Tools > Add-ons" → "Plugins") correctly left untouched. ✓
- Translated READMEs (`doc/README-zhCN.md`, etc.) deliberately excluded per design plan. ✓

## Issues

### Minor (count: 1)

- **Issue**: The Usage block renumbers existing step 2 ("Use the API endpoints as described above.") to step 3, which is correct in isolation. However, the new step 2 ("Verify the API is reachable") has its `curl` fenced block indented with three spaces to sit under the list item. Prettier accepted this formatting, but three-space indent for an ordered-list continuation is at the boundary of what CommonMark renderers handle uniformly — GitHub's renderer (the primary display surface for this README) does handle it correctly, so this is not a rendering defect. Worth noting only if the README is later copied into a documentation system with a stricter renderer.
- **Location**: `README.md` diff hunk `+94,10` — the indented fenced block under list item 2.
- **Fix**: No change required for the current target (GitHub). If the README is ever ported to a stricter renderer, switch to a four-space or tab indent for the fenced block.

## Consolidation Opportunities

None visible in the diff.

## Decision: APPROVED FOR MERGE
