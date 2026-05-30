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
});
