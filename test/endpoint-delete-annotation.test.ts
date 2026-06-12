import { assert } from "chai";

// Negative paths for /api/plus/delete-annotation (POST/JSON) that need no
// specific library data. Actually deleting an annotation is verified live in
// the user's Zotero (it is destructive, so it is not exercised in the suite).
describe("endpoint /api/plus/delete-annotation (negative paths)", function () {
  function run(data: Record<string, unknown>) {
    const ep = new Zotero.Server.LocalAPI.DeleteAnnotationEndpoint();
    return ep.run({ data });
  }

  it("returns 400 when no key is provided", async function () {
    const result = await run({});
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /key/i);
  });

  it("returns 400 for an invalid libraryID", async function () {
    const result = await run({ key: "ABCD2345", libraryID: "x" });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /librar/i);
  });

  it("returns 404 when the key matches no item in the library", async function () {
    const result = await run({ key: "ZZZZZZZZ", libraryID: 1 });
    assert.strictEqual(result[0], 404, `expected 404, body: ${result[2]}`);
  });
});
