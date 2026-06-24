import { assert } from "chai";
import {
  parseRunAutoExportParams,
  normalizeExportPath,
  matchAutoExport,
  decideRunAutoExport,
  type AutoExportEntry,
  type RunAutoExportObservations,
} from "../src/utils/run-autoexport";

// Pure functional core for /api/plus/run-autoexport. The endpoint is a TRIGGER:
// it fires a registered BBT auto-export and reports only that it fired, never
// that the export succeeded (BBT swallows export failures — see the spec's
// floor (b)). The caller proves success against the written bib. These tests pin
// the request parse, the path matching, and the full validation-order branching,
// none of which need a Zotero context.
describe("run-autoexport (pure core)", function () {
  describe("parseRunAutoExportParams", function () {
    it("parses and trims a valid path", function () {
      const r = parseRunAutoExportParams({ path: "  /home/u/refs.bib  " });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) assert.strictEqual(r.path, "/home/u/refs.bib");
    });

    it("rejects a missing path", function () {
      const r = parseRunAutoExportParams({});
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /path/i);
    });

    it("rejects a whitespace-only path", function () {
      const r = parseRunAutoExportParams({ path: "   " });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /path/i);
    });

    it("rejects a non-string path", function () {
      const r = parseRunAutoExportParams({ path: 123 as unknown as string });
      assert.isFalse(r.ok);
    });
  });

  describe("normalizeExportPath", function () {
    it("trims surrounding whitespace", function () {
      assert.strictEqual(normalizeExportPath("  /a/b.bib  "), "/a/b.bib");
    });

    it("drops a single trailing slash", function () {
      assert.strictEqual(normalizeExportPath("/a/b/"), "/a/b");
    });

    it("leaves a bare root slash alone", function () {
      assert.strictEqual(normalizeExportPath("/"), "/");
    });

    it("leaves a path without a trailing slash unchanged", function () {
      assert.strictEqual(normalizeExportPath("/a/b.bib"), "/a/b.bib");
    });
  });

  describe("matchAutoExport", function () {
    const entries: AutoExportEntry[] = [
      { path: "/home/u/refs.bib", type: "collection", id: 12 },
      { path: "/home/u/other.bib", type: "library", id: 1 },
    ];

    it("matches exactly", function () {
      const e = matchAutoExport("/home/u/refs.bib", entries);
      assert.isNotNull(e);
      assert.strictEqual(e?.id, 12);
    });

    it("matches after lexical normalisation (trailing slash)", function () {
      const e = matchAutoExport("/home/u/refs.bib/", entries);
      assert.isNotNull(e);
      assert.strictEqual(e?.id, 12);
    });

    it("returns null on a real miss", function () {
      assert.isNull(matchAutoExport("/home/u/missing.bib", entries));
    });
  });

  describe("decideRunAutoExport (validation order)", function () {
    const entry: AutoExportEntry = {
      path: "/home/u/refs.bib",
      type: "collection",
      id: 1234,
      translatorID: "b6e39b57-8942-4d11-8259-342c46ce395f",
      recursive: false,
      status: "done",
    };

    function obs(
      over: Partial<RunAutoExportObservations>,
    ): RunAutoExportObservations {
      return {
        parse: parseRunAutoExportParams({ path: "/home/u/refs.bib" }),
        bbtPresent: true,
        bbtReady: true,
        entries: [entry],
        ...over,
      };
    }

    it("returns 400 for a missing path even when BBT is absent", function () {
      // Proves path-presence is checked FIRST so the path-less probe is stable
      // regardless of BBT state.
      const d = decideRunAutoExport(
        obs({
          parse: parseRunAutoExportParams({}),
          bbtPresent: false,
          bbtReady: false,
          entries: [],
        }),
      );
      assert.strictEqual(d.response[0], 400, `body: ${d.response[2]}`);
      assert.strictEqual(d.response[1], "text/plain");
      assert.isNull(d.fire);
    });

    it("returns 503 bbt-unavailable when BBT is absent", function () {
      const d = decideRunAutoExport(
        obs({ bbtPresent: false, bbtReady: false, entries: [] }),
      );
      assert.strictEqual(d.response[0], 503, `body: ${d.response[2]}`);
      assert.strictEqual(JSON.parse(d.response[2]).status, "bbt-unavailable");
      assert.isNull(d.fire);
    });

    it("returns 503 bbt-starting when BBT is present but not ready", function () {
      const d = decideRunAutoExport(obs({ bbtReady: false, entries: [] }));
      assert.strictEqual(d.response[0], 503, `body: ${d.response[2]}`);
      assert.strictEqual(JSON.parse(d.response[2]).status, "bbt-starting");
      assert.isNull(d.fire);
    });

    it("returns 404 no-autoexport with the registered paths when no entry matches", function () {
      const other: AutoExportEntry = {
        path: "/home/u/elsewhere.bib",
        type: "library",
        id: 1,
      };
      const d = decideRunAutoExport(obs({ entries: [other] }));
      assert.strictEqual(d.response[0], 404, `body: ${d.response[2]}`);
      const body = JSON.parse(d.response[2]);
      assert.strictEqual(body.status, "no-autoexport");
      assert.deepStrictEqual(body.registeredPaths, ["/home/u/elsewhere.bib"]);
      assert.isNull(d.fire);
    });

    it("returns 200 triggered and fires the matched entry's path", function () {
      const d = decideRunAutoExport(obs({}));
      assert.strictEqual(d.response[0], 200, `body: ${d.response[2]}`);
      const body = JSON.parse(d.response[2]);
      assert.strictEqual(body.status, "triggered");
      assert.strictEqual(body.path, "/home/u/refs.bib");
      assert.strictEqual(body.type, "collection");
      assert.strictEqual(body.scopeID, 1234);
      assert.strictEqual(
        body.translatorID,
        "b6e39b57-8942-4d11-8259-342c46ce395f",
      );
      assert.strictEqual(body.recursive, false);
      assert.isUndefined(body.alreadyRunning);
      // The shell fires AutoExport.run on the REGISTRY path, not the caller's.
      assert.strictEqual(d.fire, "/home/u/refs.bib");
    });

    it("does not fire when the export is already running (alreadyRunning guard)", function () {
      const d = decideRunAutoExport(
        obs({ entries: [{ ...entry, status: "running" }] }),
      );
      assert.strictEqual(d.response[0], 200, `body: ${d.response[2]}`);
      const body = JSON.parse(d.response[2]);
      assert.strictEqual(body.status, "triggered");
      assert.strictEqual(body.alreadyRunning, true);
      assert.isNull(d.fire);
    });

    it("matches via normalisation so a trailing-slash request still triggers", function () {
      const d = decideRunAutoExport(
        obs({ parse: parseRunAutoExportParams({ path: "/home/u/refs.bib/" }) }),
      );
      assert.strictEqual(d.response[0], 200, `body: ${d.response[2]}`);
      assert.strictEqual(d.fire, "/home/u/refs.bib");
    });
  });
});
