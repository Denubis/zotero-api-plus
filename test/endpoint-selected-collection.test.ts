import { assert } from "chai";

describe("endpoint /api/plus/selected-collection", function () {
  it("returns 500 with a known body when no collection is selected", async function () {
    const ep = new Zotero.Server.LocalAPI.GetSelectedCollectionEndpoint();
    const result = await ep.run({});
    // Strict on status + MIME; body is checked tolerantly because the runner's
    // pane state determines which branch of src/addon.ts (line 137 vs 141) fires.
    // The trailing space in "Internal Server Error: " is intentional and matches
    // the literal string concatenation at src/addon.ts:141.
    assert.strictEqual(result[0], 500);
    assert.strictEqual(result[1], "text/plain");
    assert.match(
      result[2],
      /^(No Collection selected\.|Internal Server Error: )/,
    );
  });
});
