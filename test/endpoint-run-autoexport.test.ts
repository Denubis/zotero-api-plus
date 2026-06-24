import { assert } from "chai";

// Contract tests for POST /api/plus/run-autoexport that need no Better BibTeX.
// The isolated scaffold test profile has only this plugin installed, so
// Zotero.BetterBibTeX is undefined here: a path-less probe returns 400 (the
// endpoint-present signal) and any path-bearing request returns 503
// bbt-unavailable. The happy path (a real registered auto-export firing) is
// verified manually against a running Zotero that has BBT and a registered
// auto-export, since it depends on BBT's internal AutoExport API.
describe("endpoint /api/plus/run-autoexport (no-BBT paths)", function () {
  function run(data: Record<string, unknown>) {
    const ep = new Zotero.Server.LocalAPI.RunAutoExportEndpoint();
    return ep.run({ data });
  }

  it("returns 400 when no path is provided (the endpoint-present probe)", async function () {
    const result = await run({});
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.strictEqual(result[1], "text/plain");
    assert.match(result[2], /path/i);
  });

  it("returns 400 for a whitespace-only path", async function () {
    const result = await run({ path: "   " });
    assert.strictEqual(result[0], 400, `expected 400, body: ${result[2]}`);
    assert.match(result[2], /path/i);
  });

  it("returns 503 bbt-unavailable for a path when BBT is not installed", async function () {
    const result = await run({ path: "/tmp/not-a-real-bib.bib" });
    assert.strictEqual(result[0], 503, `expected 503, body: ${result[2]}`);
    assert.strictEqual(result[1], "application/json");
    assert.strictEqual(JSON.parse(result[2]).status, "bbt-unavailable");
  });
});
