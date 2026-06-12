import { assert } from "chai";

// Negative paths for /api/plus/add-highlight (POST/JSON) that need no specific
// library data, so they run in the isolated scaffold profile. Matching a real
// quote and placing the highlight is verified live in the user's Zotero.
//
// add-highlight has two modes: text mode (default) and position/rects mode
// (request body contains `rects`). Its own failures return a structured
// {ok:false, code, message} JSON body; item/library resolution failures
// (unknown key/library) still come back as plain-text 404/400.
describe("endpoint /api/plus/add-highlight (negative paths)", function () {
  function run(data: Record<string, unknown>) {
    const ep = new Zotero.Server.LocalAPI.AddHighlightEndpoint();
    return ep.run({ data });
  }

  // Parse a structured-error body; fails loudly if it isn't JSON.
  function code(body: string): string {
    return JSON.parse(body).code;
  }

  describe("text mode", function () {
    it("400 bad_request when no key is provided", async function () {
      const result = await run({ page: 3, text: "x" });
      assert.strictEqual(result[0], 400, `body: ${result[2]}`);
      assert.strictEqual(code(result[2]), "bad_request");
      assert.match(result[2], /key/i);
    });

    it("400 bad_request when no page is provided", async function () {
      const result = await run({ key: "ABCD2345", text: "x" });
      assert.strictEqual(result[0], 400);
      assert.strictEqual(code(result[2]), "bad_request");
      assert.match(result[2], /page/i);
    });

    it("400 bad_request when no text is provided", async function () {
      const result = await run({ key: "ABCD2345", page: 1 });
      assert.strictEqual(result[0], 400);
      assert.strictEqual(code(result[2]), "bad_request");
      assert.match(result[2], /text/i);
    });

    it("400 bad_request for an invalid color", async function () {
      const result = await run({
        key: "ABCD2345",
        page: 1,
        text: "x",
        color: "blue",
      });
      assert.strictEqual(result[0], 400);
      assert.strictEqual(code(result[2]), "bad_request");
      assert.match(result[2], /color/i);
    });

    it("400 for an unknown libraryID (plain-text resolution error, no silent fallback)", async function () {
      const result = await run({
        key: "ABCD2345",
        page: 1,
        text: "x",
        libraryID: 999999,
      });
      assert.strictEqual(result[0], 400, `body: ${result[2]}`);
      assert.match(result[2], /librar/i);
    });

    it("404 when the key matches no item in the library", async function () {
      const result = await run({
        key: "ZZZZZZZZ",
        page: 1,
        text: "x",
        libraryID: 1,
      });
      assert.strictEqual(result[0], 404, `body: ${result[2]}`);
    });
  });

  describe("position (rects) mode", function () {
    it("400 bad_request when rects are empty", async function () {
      const result = await run({
        key: "ABCD2345",
        page: 8,
        rects: [],
        pageHeight: 800,
      });
      assert.strictEqual(result[0], 400, `body: ${result[2]}`);
      assert.strictEqual(code(result[2]), "bad_request");
      assert.match(result[2], /rect/i);
    });

    it("400 bad_request when pageHeight is missing", async function () {
      const result = await run({
        key: "ABCD2345",
        page: 8,
        rects: [[1, 2, 3, 4]],
      });
      assert.strictEqual(result[0], 400);
      assert.strictEqual(code(result[2]), "bad_request");
      assert.match(result[2], /height/i);
    });

    it("400 bad_request when a rect is not four numbers", async function () {
      const result = await run({
        key: "ABCD2345",
        page: 8,
        rects: [[1, 2, 3]],
        pageHeight: 800,
      });
      assert.strictEqual(result[0], 400);
      assert.strictEqual(code(result[2]), "bad_request");
    });
  });
});
