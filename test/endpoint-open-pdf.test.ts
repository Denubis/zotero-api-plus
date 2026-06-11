import { assert } from "chai";

// Negative paths for /api/plus/open-pdf that need no specific library data, so
// they run in the isolated scaffold profile (which has no group 27 / no test
// PDF). The happy path — opening a real PDF at a page — is verified live in the
// user's running Zotero, per the endpoint's "verify visually" contract.
//
// GET params arrive as req.searchParams (a URLSearchParams), exactly as the core
// LocalAPI GET endpoints (e.g. ItemTypeFields) read them.
describe("endpoint /api/plus/open-pdf (negative paths)", function () {
  function run(params: Record<string, string>) {
    const ep = new Zotero.Server.LocalAPI.OpenPdfEndpoint();
    return ep.run({ searchParams: new URLSearchParams(params) });
  }

  it("returns 400 when no key is provided", async function () {
    const result = await run({ page: "3" });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.strictEqual(result[1], "text/plain");
    assert.match(result[2], /key/i, "message names the key");
  });

  it("returns 400 when no page is provided", async function () {
    const result = await run({ key: "ABCD2345" });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /page/i, "message names the page");
  });

  it("returns 400 when the page is not a positive integer", async function () {
    const result = await run({ key: "ABCD2345", page: "0" });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
  });

  it("returns 400 for an unknown libraryID (no silent fallback)", async function () {
    const result = await run({
      key: "ABCD2345",
      page: "1",
      libraryID: "999999",
    });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /librar/i, "message names the library");
  });

  it("returns 404 when the key matches no item in the library", async function () {
    const result = await run({ key: "ZZZZZZZZ", page: "1", libraryID: "1" });
    assert.strictEqual(result[0], 404, `expected 404, body: ${result[2]}`);
    assert.strictEqual(result[1], "text/plain");
  });
});
