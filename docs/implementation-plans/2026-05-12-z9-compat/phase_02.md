# Zotero 9 Compatibility Implementation Plan — Phase 2: Tests

**Goal:** Lock down the endpoint behaviour observed on Zotero 9 across three levels — a harness **preflight probe** (positive controls), **in-process contract tests** (one per endpoint), and **one HTTP dispatch test** against the real `Zotero.Server` routing — plus one real-network arXiv smoke test.

**Architecture (revised per critical review):** Most files follow the existing `test/startup.test.ts` pattern (`import { assert } from "chai"`, `describe`/`it`, instantiate via `new Zotero.Server.LocalAPI.<ClassName>()`, await `.run(...)`, assert on the `[status, mime, body]` tuple). **Two departures from the original Phase 2:** (1) a preflight probe turns the scaffold/mocha assumptions (`waitForPlugin` populated the namespace; the runner honours `this.timeout`) into tested controls rather than background facts (HA1/HA2 → I3); (2) one HTTP dispatch test drives `Zotero.Server`'s real routing over `127.0.0.1:23124`, covering the surface the in-process `.run()` calls bypass (DR2, revised). Per-test timeouts are set **inside** each long `it` callback (not at `describe` level), removing the propagation question I3/HA2 raised.

**Tech Stack:** Mocha 11.7.5, Chai 6.2.1 (assert style), `zotero-plugin test` (scaffold ≥ 0.8.6) as runner, `Zotero.HTTP.request` as the in-process HTTP client for the dispatch test.

**Scope:** Phase 2 of 3 from `docs/design-plans/2026-05-12-z9-compat.md`.

**Codebase verified:** 2026-05-12.

**Phase Type:** functionality

**Depends on Phase 1:** the `endpoint-plus` and HTTP-GET assertions target `"text/plain"`, which only holds after Phase 1's MIME fix. Scaffold's `0.8.6` test profile **already enables** the local API on **port 23124** (confirmed during Phase 1 execution — `prefs.js` sets `extensions.zotero.httpServer.localAPI.enabled = true` and `extensions.zotero.httpServer.port = 23124`), so the HTTP test needs no enablement code.

---

## Acceptance Criteria Coverage

- **z9-compat.AC-Preflight** (Task 1): namespace classes defined at `it`-time; runner honours an inside-`it` `this.timeout`.
- **z9-compat.AC3.1–AC3.4** (Tasks 2–4): in-process contract tuples.
- **z9-compat.AC9.0–AC9.3** (Tasks 0 + 5): HTTP dispatch, network-free.
- **z9-compat.AC4.1–AC4.3** (Task 6): arXiv smoke (network-dependent; DR5 triage applies).
- **z9-compat.AC6.2 finalised** (Task 7): the full suite still passes after Phase 1's `permitBookmarklet` removal — with the I5 caveat that "suite intact" ≠ "property unread."
- **z9-compat.AC-Aggregate** (Task 7): the test log shows `N passed`, `0 pending`, `0 failing` (I4).

**Test-run method (every `npm run test` here):** scaffold does NOT self-exit after tests (confirmed in Phase 1, even on 0.8.6), so run under `timeout` and read the result from the log line `Test run completed - N passed` — **`npm` exit code is `124` (timeout), which is expected, not a failure.** Never pipe through `tail` (it flushes only at EOF, which never comes). (No tmpfs precondition — the test runner uses `.scaffold/test/{profile,data}`, not the `/tmp` paths from `.env`.) **Zotero does NOT need to be closed** — scaffold launches an isolated `no-remote` instance on its own profile and port 23124, coexisting with a normal session (port 23119). Clean up any straggler with `for pid in $(pgrep -a zotero | grep scaffold/test | awk '{print $1}'); do kill "$pid"; done` (kills only test instances).

---

## Implementation Tasks

<!-- START_TASK_0 -->

### Task 0: Confirm the local API server is reachable (AC9.0)

**Resolved during Phase 1 execution:** scaffold's test profile **already enables** the local API — its `prefs.js` sets `extensions.zotero.httpServer.localAPI.enabled = true` and `extensions.zotero.httpServer.port = 23124`. The original "enablement spike" is therefore moot; no pref-setting code is needed.

This task is now just a **reachability confirmation** for the HTTP test (Task 5): after scaffold prints `Server Ready!`, a `GET http://127.0.0.1:23124/api/plus` should connect. If Task 5 cannot connect, add a short readiness poll in a `before()` hook (condition-based wait on the GET — not a fixed sleep); do **not** add pref-setting code, the pref is already on.

**Fallback only (not the expected path):** if the server proves genuinely unreachable in-harness (not observed in Phase 1), re-scope AC9 — drop the two HTTP `it`s, set the target to **8 passing**, and surface to the user. Unlikely.

**This task writes no standalone assertions** — reachability is exercised by Task 5's GET case itself.

<!-- END_TASK_0 -->

<!-- START_TASK_1 -->

### Task 1: `test/preflight.test.ts` — harness positive controls (AC-Preflight)

**Files:** Create `test/preflight.test.ts`.

```
import { assert } from "chai";

describe("preflight: scaffold/mocha invariants", function () {
  it("endpoint classes are assigned to the LocalAPI namespace at it-time", function () {
    assert.isOk(Zotero.Server.LocalAPI.Plus, "Plus undefined — waitForPlugin gate did not fire");
    assert.isOk(Zotero.Server.LocalAPI.AddItemEndpoint, "AddItemEndpoint undefined");
    assert.isOk(Zotero.Server.LocalAPI.GetSelectedCollectionEndpoint, "GetSelectedCollectionEndpoint undefined");
  });

  it("the runner honours an inside-it this.timeout", async function () {
    this.timeout(30000);
    await new Promise((resolve) => setTimeout(resolve, 2500)); // would fail at the 2000ms default
  });
});
```

**Why:** converts HA1/HA2 (critical review I3) into positive controls. If the `waitForPlugin` gate fails, the message is "Plus undefined …", not an opaque `TypeError: ... is not a constructor` inside a contract test. If the runner ignores inside-`it` timeouts, the smoke/HTTP tests' budgets are not trustworthy and this fails first.

**Verification:** `npm run test` → `3 passing` (startup + 2 preflight).

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: `test/endpoint-plus.test.ts` — Plus contract (AC3.1)

**Files:** Create `test/endpoint-plus.test.ts`.

One `describe("endpoint /api/plus", ...)` with one `it`: `const ep = new Zotero.Server.LocalAPI.Plus(); const result = await ep.run({});` then `assert.deepStrictEqual(result, [200, "text/plain", "Zotero Local API Plus is running."]);` (the corrected MIME from Phase 1 — depends on AC7.1).

Namespace access (no named export) is the only viable pattern; `src/addon.ts:12` assigns the class there. **Verification:** `npm run test` → `4 passing`.

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: `test/endpoint-add-item.test.ts` — AddItemEndpoint negative paths (AC3.2, AC3.3)

**Files:** Create `test/endpoint-add-item.test.ts`.

One `describe(...)` with two `it`s:

1. `await new Zotero.Server.LocalAPI.AddItemEndpoint().run({ data: {} })` → `assert.deepStrictEqual(result, [400, "text/plain", "Error: No identifier provided"]);` (verbatim from `src/addon.ts:41`).
2. `...run({ data: { identifier: "not-a-doi" } })` → `assert.deepStrictEqual(result, [400, "text/plain", "Error: Could not parse identifier"]);` (`src/addon.ts:47`; `extractIdentifiers("not-a-doi")` returns `[]`).

Neither touches the network (both return before `Zotero.Translate.Search`). **Verification:** `npm run test` → `6 passing`.

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: `test/endpoint-selected-collection.test.ts` — GetSelectedCollectionEndpoint contract (AC3.4)

**Files:** Create `test/endpoint-selected-collection.test.ts`.

One `it`: `const result = await new Zotero.Server.LocalAPI.GetSelectedCollectionEndpoint().run({});` then:

- `assert.strictEqual(result[0], 500);`
- `assert.strictEqual(result[1], "text/plain");`
- `assert.match(result[2], /^(No Collection selected\.|Internal Server Error: )/);`

**The trailing space in `Internal Server Error: ` is intentional and load-bearing** — it matches `src/addon.ts:141` (`"Internal Server Error: " + e.message`). Status + MIME are strict; the body is tolerant because runner pane-state determines which branch (`src/addon.ts:137` vs `:141`) fires. **Verification:** `npm run test` → `7 passing`.

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: `test/http-dispatch.test.ts` — real `Zotero.Server` routing, network-free (AC9.1, AC9.2)

**Server is enabled by scaffold** (local API on port 23124, per Task 0) — these cases target that port. If the GET cannot connect, add Task 0's readiness poll in a `before()`; only in the unlikely event the server is unreachable does AC9 re-scope (target `8 passing`).

**Files:** Create `test/http-dispatch.test.ts`. If Task 0 produced a setup snippet (mechanism 2), include it in a `before()` here.

Drive the live local server with `Zotero.HTTP.request` (the Zotero-native in-process client; confirm the exact option/return shape against `zotero-types@4.1.2` at execution). The illustrative shape:

```
import { assert } from "chai";

describe("HTTP dispatch via Zotero.Server (127.0.0.1:23124)", function () {
  it("GET /api/plus dispatches to the Plus endpoint", async function () {
    this.timeout(15000);
    const res = await Zotero.HTTP.request("GET", "http://127.0.0.1:23124/api/plus");
    assert.strictEqual(res.status, 200);
    assert.match(res.getResponseHeader("Content-Type") || "", /^text\/plain/);
    assert.strictEqual(res.responseText, "Zotero Local API Plus is running.");
  });

  it("empty-body POST /api/plus/add-item-by-id returns 400 before any translator call", async function () {
    this.timeout(15000);
    const res = await Zotero.HTTP.request(
      "POST",
      "http://127.0.0.1:23124/api/plus/add-item-by-id",
      { body: "{}", headers: { "Content-Type": "application/json" }, successCodes: false },
    );
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.responseText, "Error: No identifier provided");
  });
});
```

**Confirm-at-execution notes (no speculation baked into the contract):**

- `successCodes: false` (or the Z9 equivalent) is required so a 400 resolves rather than throws. If `Zotero.HTTP.request`'s option name differs in Z9, adjust per `zotero-types@4.1.2`; the _intent_ is "do not treat 4xx as an exception."
- Response accessors (`.status`, `.responseText`, `.getResponseHeader`) follow the XHR-like shape Zotero returns; confirm names against the bumped types.
- These two cases are **network-free**: GET returns a static string; the empty-body POST returns at `src/addon.ts:41` before `Zotero.Translate.Search`. Any network egress here is a bug in the test.

**Why it matters:** this is the only automated coverage of `Zotero.Server`'s dispatch — URL match, method/`supportedDataTypes` enforcement, response framing — and thus the surface where the removed `permitBookmarklet` (or a scaffold-bump regression) would manifest. A failure here while Tasks 2–3 pass localises the fault to transport/dispatch, not endpoint logic.

**Verification:** `npm run test` → `9 passing` (after Tasks 1–5).

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: `test/smoke-add-item-by-doi.test.ts` — real-network arXiv smoke (AC4.1, AC4.2)

**Files:** Create `test/smoke-add-item-by-doi.test.ts`. The only network-dependent test.

One `it` with `this.timeout(30000)` **set inside the callback** (translator round-trips take 5–15 s):

```
it("adds the arXiv DOI and returns success payload", async function () {
  this.timeout(30000);
  const TEST_DOI = "10.48550/arXiv.1706.03762";
  const result = await new Zotero.Server.LocalAPI.AddItemEndpoint().run({ data: { identifier: TEST_DOI } });

  assert.strictEqual(result[0], 200, `expected 200, got ${result[0]}: ${result[2]}`);
  assert.strictEqual(result[1], "application/json");
  const payload = JSON.parse(result[2]);
  assert.strictEqual(payload.status, "success");
  assert.isAtLeast(payload.addedCount, 1);
  assert.isAtLeast(payload.titles.length, 1);

  // Best-effort cleanup so reruns are idempotent; failure here must not mask the assertions.
  try {
    const search = new Zotero.Search();
    search.libraryID = Zotero.Libraries.userLibraryID;
    search.addCondition("DOI", "is", TEST_DOI);
    const itemIDs = await search.search();
    if (itemIDs.length) await Zotero.Items.erase(itemIDs); // confirm Zotero.Items.erase(itemIDs) against zotero-types@4.1.2; else loop Zotero.Items.get(id).eraseTx()
  } catch (cleanupErr) {
    Zotero.debug("smoke cleanup failed: " + (cleanupErr as Error).message);
  }
});
```

**Cleanup API note (per code-review I2):** prefer the batch `Zotero.Items.erase(itemIDs)` if `zotero-types@4.1.2` declares it; otherwise loop `Zotero.Items.get(id)` (synchronous, standard) + `.eraseTx()`. Do **not** default to `Zotero.Items.getAsync` — it is the non-standard path. Cleanup is best-effort; the tmpfs profile is wiped on reboot regardless.

**No skip-on-failure (DR5):** if the network is down or the translator regresses, this fails — run the DR5 triage runbook before concluding "translator regression."

**Verification:** `npm run test` with network → `10 passing` (Tasks 1–6). Without network → `9 passing, 1 failing`.

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->

### Task 7: Full-suite verification (AC3, AC4, AC9, AC-Preflight, AC-Aggregate, finalises AC6.2)

**Pre-flight:** Zotero closed; tmpfs dirs created.

**Step 1 — lint/build/typecheck the new files.**

```
npm run lint:check && npm run build && npx tsc --noEmit
```

All exit 0. If `tsc` flags the test files' Zotero API references (`Zotero.HTTP.request`, `Zotero.Search`, `Zotero.Items`), resolve in `typings/global.d.ts` per the escape-hatch pattern (no `as any`, no `@ts-expect-error`).

**Step 2 — full run; assert the aggregate gate (I4).**

```
npm run test
```

Expected (network up): the spec output shows the preflight, four contract `it`s, two HTTP `it`s, and the smoke `it` as `✔`, and the log line reports **`10 passing`** with **no `pending` line (or `0 pending`)** and **`0 failing`**. (`npm` exits `124` under `timeout` — expected, since scaffold does not self-exit; read success from the log line, not the exit code.) If AC9 was re-scoped: **`8 passing`**. A `pending`/skipped test, or any `failing`, fails this gate — a passing _count_ alone is not sufficient.

**Step 3 — AC6.2 finalisation.** With the full suite green, AC6.2 is finalised: the `permitBookmarklet` removal did not break the suite (including the HTTP dispatch test). Record the I5 caveat in the phase notes: this confirms suite integrity, not that the property is unread on Z9 (that rests on the Phase 1 source pin).

**Step 4 — working-tree shape.**

```
git status --short
```

Expected untracked: `test/preflight.test.ts`, `test/endpoint-plus.test.ts`, `test/endpoint-add-item.test.ts`, `test/endpoint-selected-collection.test.ts`, `test/http-dispatch.test.ts` (unless re-scoped), `test/smoke-add-item-by-doi.test.ts`. Plus possibly `M typings/global.d.ts`. Anything else → halt and reconcile.

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->

### Task 8: Commit Phase 2

```
git add test/preflight.test.ts test/endpoint-plus.test.ts test/endpoint-add-item.test.ts test/endpoint-selected-collection.test.ts test/smoke-add-item-by-doi.test.ts
# add test/http-dispatch.test.ts unless AC9 was re-scoped; add typings/global.d.ts if modified
git commit -m "add preflight, contract, HTTP dispatch, and arXiv smoke tests"
```

Verify: `git log -1 --stat` shows the new test files; `git status --short` is empty. Content-based branch check (m4):

```
git log --pretty=%s z9-compat ^main
```

Expected to include the four Phase 1 subjects plus this Phase 2 subject.

<!-- END_TASK_8 -->

---

## Phase 2 Done When

1. New files under `test/`: `preflight`, `endpoint-plus`, `endpoint-add-item`, `endpoint-selected-collection`, `smoke-add-item-by-doi`, and `http-dispatch` (unless AC9 was re-scoped, documented in Task 0).
2. `npm run lint:check`, `npm run build`, `npx tsc --noEmit` all exit 0.
3. `npm run test` log shows `10 passing` (network up) or `8 passing` (AC9 re-scoped) with **`0 pending`, `0 failing`** — run under `timeout`; `npm` exit `124` is expected (scaffold does not self-exit), success is the log line.
4. One commit on `z9-compat`: `add preflight, contract, HTTP dispatch, and arXiv smoke tests`.
5. AC6.2 finalised with its I5 caveat recorded; Task 0 outcome recorded.

Covers `z9-compat.AC3`, `z9-compat.AC4`, `z9-compat.AC9`, `z9-compat.AC-Preflight`, `z9-compat.AC-Aggregate`, and finalises `z9-compat.AC6.2`.
