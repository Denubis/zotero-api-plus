import { assert } from "chai";

// Negative paths for /api/plus/read-annotations (GET) that need no specific
// library data. Reading real highlights/notes back (single + list, type filter)
// is verified live in the user's Zotero.
describe("endpoint /api/plus/read-annotations (negative paths)", function () {
  function run(params: Record<string, string>) {
    const ep = new Zotero.Server.LocalAPI.ReadAnnotationsEndpoint();
    return ep.run({ searchParams: new URLSearchParams(params) });
  }

  it("returns 400 when no key is provided", async function () {
    const result = await run({});
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /key/i);
  });

  it("returns 400 for an unknown type", async function () {
    const result = await run({ key: "ABCD2345", type: "image" });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /type/i);
  });

  it("returns 400 for an invalid libraryID", async function () {
    const result = await run({ key: "ABCD2345", libraryID: "x" });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /librar/i);
  });

  it("returns 404 when the key matches no item in the library", async function () {
    const result = await run({ key: "ZZZZZZZZ", libraryID: "1" });
    assert.strictEqual(result[0], 404, `expected 404, body: ${result[2]}`);
  });
});
