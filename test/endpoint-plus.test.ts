import { assert } from "chai";

describe("endpoint /api/plus", function () {
  it("returns 200 text/plain running message", async function () {
    const ep = new Zotero.Server.LocalAPI.Plus();
    const result = await ep.run({});
    assert.deepStrictEqual(result, [
      200,
      "text/plain",
      "Zotero Local API Plus is running.",
    ]);
  });
});
