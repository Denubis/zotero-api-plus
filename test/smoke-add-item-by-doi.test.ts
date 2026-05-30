import { assert } from "chai";

// Per AC4 / DR5: the one real-network smoke test. NO skip-on-failure — a
// failed run is the design-intended signal (run the DR5 triage runbook to
// discriminate network / DOI withdrawal / translator regression / harness).
describe("smoke /api/plus/add-item-by-id (arXiv DOI, network)", function () {
  it("adds the arXiv DOI and returns success payload", async function () {
    this.timeout(30000);
    const TEST_DOI = "10.48550/arXiv.1706.03762";
    const ep = new Zotero.Server.LocalAPI.AddItemEndpoint();
    const result = await ep.run({ data: { identifier: TEST_DOI } });

    assert.strictEqual(
      result[0],
      200,
      `expected 200, got ${result[0]}: ${result[2]}`,
    );
    assert.strictEqual(result[1], "application/json");
    const payload = JSON.parse(result[2]);
    assert.strictEqual(payload.status, "success");
    assert.isAtLeast(payload.addedCount, 1);
    assert.isAtLeast(payload.titles.length, 1);

    // Best-effort cleanup so reruns are idempotent. Failure here is logged but
    // must NOT mask the assertions above. Uses the synchronous Zotero.Items.get
    // path (per code-review I2 — not getAsync, which is the non-standard route).
    try {
      const search = new Zotero.Search();
      search.libraryID = Zotero.Libraries.userLibraryID;
      search.addCondition("DOI", "is", TEST_DOI);
      const itemIDs = await search.search();
      for (const id of itemIDs ?? []) {
        const item = Zotero.Items.get(id);
        if (item) await item.eraseTx();
      }
    } catch (cleanupErr: unknown) {
      const msg =
        cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      Zotero.debug("smoke cleanup failed: " + msg);
    }
  });
});
