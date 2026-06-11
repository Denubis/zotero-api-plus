import { assert } from "chai";

// Negative paths for /api/plus/add-note (POST/JSON) that need no specific
// library data, so they run in the isolated scaffold profile. Creating a note
// on a real PDF and reading it back is verified live in the user's Zotero.
describe("endpoint /api/plus/add-note (negative paths)", function () {
  function run(data: Record<string, unknown>) {
    const ep = new Zotero.Server.LocalAPI.AddNoteEndpoint();
    return ep.run({ data });
  }

  it("returns 400 when no key is provided", async function () {
    const result = await run({ page: 3, text: "x" });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /key/i);
  });

  it("returns 400 when no page is provided", async function () {
    const result = await run({ key: "ABCD2345", text: "x" });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /page/i);
  });

  it("returns 400 when the page is not a positive integer", async function () {
    const result = await run({ key: "ABCD2345", page: 0, text: "x" });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
  });

  it("returns 400 when no text is provided", async function () {
    const result = await run({ key: "ABCD2345", page: 1 });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /text/i);
  });

  it("returns 400 for an invalid color", async function () {
    const result = await run({
      key: "ABCD2345",
      page: 1,
      text: "x",
      color: "red",
    });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /color/i);
  });

  it("returns 400 for an unknown libraryID (no silent fallback)", async function () {
    const result = await run({
      key: "ABCD2345",
      page: 1,
      text: "x",
      libraryID: 999999,
    });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /librar/i);
  });

  it("returns 404 when the key matches no item in the library", async function () {
    const result = await run({
      key: "ZZZZZZZZ",
      page: 1,
      text: "x",
      libraryID: 1,
    });
    assert.strictEqual(result[0], 404, `expected 404, body: ${result[2]}`);
  });
});
