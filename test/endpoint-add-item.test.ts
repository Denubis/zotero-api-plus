import { assert } from "chai";

describe("endpoint /api/plus/add-item-by-id (negative paths)", function () {
  it("returns 400 when no identifier is provided", async function () {
    const ep = new Zotero.Server.LocalAPI.AddItemEndpoint();
    const result = await ep.run({ data: {} });
    assert.deepStrictEqual(result, [
      400,
      "text/plain",
      "Error: No identifier provided",
    ]);
  });

  it("returns 400 when the identifier cannot be parsed", async function () {
    const ep = new Zotero.Server.LocalAPI.AddItemEndpoint();
    const result = await ep.run({ data: { identifier: "not-a-doi" } });
    assert.deepStrictEqual(result, [
      400,
      "text/plain",
      "Error: Could not parse identifier",
    ]);
  });

  // Group/collection targeting is validated BEFORE any network call, so these
  // stay network-free: a valid-format identifier never reaches the translator
  // because the target resolves to 400 first.
  it("returns 400 for an unknown groupID", async function () {
    const ep = new Zotero.Server.LocalAPI.AddItemEndpoint();
    const result = await ep.run({
      data: { identifier: "10.48550/arXiv.1706.03762", groupID: 999999999 },
    });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.strictEqual(result[1], "text/plain");
    assert.match(result[2], /group/i, "message names the group");
  });

  it("returns 400 for a collectionKey not in the target library", async function () {
    const ep = new Zotero.Server.LocalAPI.AddItemEndpoint();
    const result = await ep.run({
      data: {
        identifier: "10.48550/arXiv.1706.03762",
        collectionKey: "ZZZZZZZZ",
      },
    });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.strictEqual(result[1], "text/plain");
    assert.match(result[2], /collection/i, "message names the collection");
  });
});
