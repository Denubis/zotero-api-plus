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

    // Per-item PDF status (the ping-back). Assert SHAPE only, never
    // `=== "fetched"`: whether this arXiv DataCite DOI resolves to a PDF
    // headlessly is the uncertain bit (Unpaywall coverage), and a hard
    // assertion would be flaky. The observed value is the empirical evidence
    // that settles note §4 — logged below for the record.
    const allowedPdf = ["present", "fetched", "unavailable", "error"];
    assert.isArray(payload.items, "response carries an items[] array");
    assert.lengthOf(
      payload.items,
      payload.addedCount,
      "items[] length matches addedCount",
    );
    for (const it of payload.items) {
      assert.isString(it.title, "item.title is a string");
      assert.isString(it.key, "item.key is a string");
      assert.include(
        allowedPdf,
        it.pdf,
        `item.pdf is a valid status (got ${it.pdf})`,
      );
      if (it.pdf === "fetched") {
        assert.isNumber(
          it.attachmentID,
          "a fetched item carries a numeric attachmentID",
        );
      }
    }
    Zotero.debug(
      "smoke pdf outcomes: " +
        JSON.stringify(payload.items.map((i: { pdf: string }) => i.pdf)),
    );

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
      // Format defensively so object rejections don't log as `[object Object]`.
      let msg: string;
      if (cleanupErr instanceof Error) {
        msg = cleanupErr.message;
      } else if (typeof cleanupErr === "string") {
        msg = cleanupErr;
      } else {
        try {
          msg = JSON.stringify(cleanupErr);
        } catch {
          msg = String(cleanupErr);
        }
      }
      Zotero.debug("smoke cleanup failed: " + msg);
    }
  });
});
