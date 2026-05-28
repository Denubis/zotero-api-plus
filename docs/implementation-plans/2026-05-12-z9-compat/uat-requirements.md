# UAT Requirements

Manual operator-performed verification entries. Each requires a human to perform an action that automated tests cannot cover (typically because the test environment bypasses the check, or because the verification needs a real install in a real Zotero profile).

The `exec-uat-gate` skill reads this file during execution.

## Ownership (per critical review F1)

| Field         | Value                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Operator**  | Brian (repository owner) — automation cannot perform a normal-profile install.                                                                           |
| **Trigger**   | After the Phase 3 commit, **before** pushing `z9-compat` / opening the PR to the fork's `main`.                                                          |
| **Recording** | Append a dated result to the "UAT log" section at the bottom of this file: `YYYY-MM-DD: PASS/FAIL — initials`. A FAIL holds the branch as not-mergeable. |

## Phase 1: Compatibility Shift

### AC1.3: `.xpi` installs in a normal Zotero 9 profile (not temporary)

**This decision assumes:** Widening `addon/manifest.json` `strict_max_version` from `8.*` to `9.*` is sufficient for Zotero 9's add-on manager to accept the plugin in a normal (permanent) install. Scaffold's test runner uses temporary install, which bypasses the `strict_max_version` check entirely — so the test suite cannot verify this.

**To shatter it:** Build the `.xpi` (`npm run build`; the artefact lands under `.scaffold/build/`), open Zotero 9, navigate to _Tools → Plugins_, install the `.xpi` via the gear menu's "Install Add-on From File…" option, and observe whether Zotero accepts the install.

**It's wrong if:** Zotero 9 displays a "this plugin is not compatible with Zotero 9" dialog or otherwise refuses the install. Any rejection here means the manifest change did not take effect or the `strict_max_version` semantics changed in Z9.

**Operator note:** This is a manual check that automation cannot perform (not a "judgment" UAT in the Carnap sense). The design plan explicitly excluded automating it (see design plan §"Additional Considerations", "Manual final verification"). After confirming acceptance, run two `curl` checks against the **normal** Z9 profile:

1. `curl http://127.0.0.1:23119/api/plus` — body exactly `Zotero Local API Plus is running.`, `Content-Type: text/plain` (verifies AC7.1 end-to-end; complements the Phase 2 in-process and HTTP-dispatch tests, which run against the _dev_ profile).
2. `curl -X POST -H 'Content-Type: application/json' -d '{"identifier":"10.48550/arXiv.1706.03762"}' http://127.0.0.1:23119/api/plus/add-item-by-id` — expect a `200` JSON payload with `addedCount >= 1`. This is the one place the connector-adjacent POST dispatch is exercised on a **normal** install, the closest manual coverage of the surface the removed `permitBookmarklet` touched (per critical review I1). Requires network.

## Smoke-test failure follow-up (per critical review F3)

If the Phase 2 arXiv smoke test (`AC4`) fails, it is the operator's call — not an auto-skip. Run the DR5 triage runbook (design plan) to discriminate network / DOI / rate-limit / translator / harness, then choose: (a) rerun if transient; (b) swap `TEST_DOI` to another stable open-access DOI if the chosen one was withdrawn; (c) hold `z9-compat` as not-mergeable and file an upstream Zotero translator issue if a genuine translator regression.

## UAT log

_(Append results here. Format: `YYYY-MM-DD: PASS/FAIL — initials — notes`.)_
