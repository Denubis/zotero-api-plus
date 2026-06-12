import { assert } from "chai";
import {
  parseAddHighlightParams,
  extractRecognizerPage,
  buildHighlightZone,
  type RecognizerPage,
  type Word,
} from "../src/utils/highlight";

// Pure functional core for add-highlight. No Zotero context: the endpoint
// (imperative shell) hands recogniser page data + the query here, then saves the
// resulting highlight geometry itself. Recogniser boxes are TOP-LEFT origin;
// the core flips to PDF bottom-left via `pageHeight - y` (here pageHeight = 100,
// so a top-origin y becomes 100 - y).
const w = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  text: string,
): Word => ({
  x1,
  y1,
  x2,
  y2,
  text,
});

// page A: 3 lines, pageHeight 100
const pageA: RecognizerPage = {
  pageWidth: 100,
  pageHeight: 100,
  lines: [
    [
      w(10, 10, 20, 18, "the"),
      w(25, 10, 40, 18, "quick"),
      w(45, 10, 60, 18, "brown"),
      w(65, 10, 75, 18, "fox"),
    ],
    [
      w(10, 20, 30, 28, "jumps"),
      w(35, 20, 50, 28, "over"),
      w(55, 20, 62, 28, "the"),
      w(67, 20, 80, 28, "lazy"),
    ],
    [
      w(10, 30, 25, 38, "dog"),
      w(30, 30, 45, 38, "and"),
      w(50, 30, 70, 38, "runs"),
    ],
  ],
};
// page B (the next page), pageHeight 100
const pageB: RecognizerPage = {
  pageWidth: 100,
  pageHeight: 100,
  lines: [
    [
      w(10, 10, 40, 18, "continues"),
      w(45, 10, 60, 18, "onto"),
      w(65, 10, 80, 18, "page"),
    ],
    [w(10, 20, 25, 28, "two"), w(30, 20, 50, 28, "here")],
  ],
};
// page B as it really is: a running header (line 0) precedes the body. The
// recogniser lists it first in reading order, so a page-break slice must not
// sweep it into the highlight.
const pageBWithHeader: RecognizerPage = {
  pageWidth: 100,
  pageHeight: 100,
  lines: [
    [w(10, 2, 90, 8, "HEADER")],
    [
      w(10, 10, 40, 18, "continues"),
      w(45, 10, 60, 18, "onto"),
      w(65, 10, 80, 18, "page"),
    ],
    [w(10, 20, 25, 28, "two"), w(30, 20, 50, 28, "here")],
  ],
};

describe("highlight (pure core)", function () {
  describe("buildHighlightZone", function () {
    it("highlights a single-line span as one rect (y-flipped)", function () {
      const r = buildHighlightZone(2, pageA, null, "the quick brown fox");
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.strictEqual(r.zone.pageIndex, 2);
        assert.deepStrictEqual(r.zone.rects, [[10, 82, 75, 90]]);
        assert.isUndefined(r.zone.nextPageRects);
        assert.strictEqual(r.zone.matched, "the quick brown fox");
        assert.strictEqual(r.zone.sortTop, 10);
      }
    });

    it("normalises case and punctuation in the query", function () {
      const r = buildHighlightZone(2, pageA, null, "  The, QUICK brown FOX.  ");
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) assert.deepStrictEqual(r.zone.rects, [[10, 82, 75, 90]]);
    });

    it("highlights a multi-line span as one rect per line", function () {
      const r = buildHighlightZone(
        2,
        pageA,
        null,
        "brown fox jumps over the lazy",
      );
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.deepStrictEqual(r.zone.rects, [
          [45, 82, 75, 90],
          [10, 72, 80, 80],
        ]);
        assert.strictEqual(r.zone.matched, "brown fox jumps over the lazy");
      }
    });

    it("matches a short query as a single anchor", function () {
      const r = buildHighlightZone(2, pageA, null, "lazy dog");
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.deepStrictEqual(r.zone.rects, [
          [67, 72, 80, 80],
          [10, 62, 25, 70],
        ]);
        assert.strictEqual(r.zone.sortTop, 20);
      }
    });

    it("spans a page break with nextPageRects", function () {
      const r = buildHighlightZone(
        2,
        pageA,
        pageB,
        "lazy dog and runs continues onto page two",
      );
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.deepStrictEqual(r.zone.rects, [
          [67, 72, 80, 80],
          [10, 62, 70, 70],
        ]);
        assert.deepStrictEqual(r.zone.nextPageRects, [
          [10, 82, 80, 90],
          [10, 72, 25, 80],
        ]);
        assert.strictEqual(
          r.zone.matched,
          "lazy dog and runs continues onto page two",
        );
      }
    });

    it("drops a next-page running header from a page-break span", function () {
      const r = buildHighlightZone(
        2,
        pageA,
        pageBWithHeader,
        "lazy dog and runs continues onto page two",
      );
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        // header line excluded; only the real continuation lines remain
        assert.deepStrictEqual(r.zone.nextPageRects, [
          [10, 82, 80, 90],
          [10, 72, 25, 80],
        ]);
        assert.strictEqual(
          r.zone.matched,
          "lazy dog and runs continues onto page two",
        );
      }
    });

    it("fails when the start anchor is not found", function () {
      const r = buildHighlightZone(2, pageA, null, "zzz yyy xxx");
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /start|not found/i);
    });

    it("fails when the end anchor is not found", function () {
      const r = buildHighlightZone(
        2,
        pageA,
        null,
        "the quick brown fox endnotfound zzz qqq www",
      );
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /end|not found/i);
    });
  });

  describe("extractRecognizerPage", function () {
    it("navigates the raw nesting to lines of words", function () {
      // Mirrors the real recogniser shape (Spike A): page[2] is [[[[0,0,0,0,
      // lines]]]] (four levels), each line is [words], each word is
      // [x1,y1,x2,y2, ...metadata..., "text"].
      const raw = [
        200,
        100,
        [
          [
            [
              [
                0,
                0,
                0,
                0,
                [
                  [
                    [
                      [10, 10, 20, 18, 8.5, 1, 16, 0, 0, 0, 0, 0, 0, "the"],
                      [25, 10, 40, 18, 8.5, 1, 16, 0, 0, 0, 0, 0, 0, "quick"],
                    ],
                  ],
                  [[[10, 20, 30, 28, 8.5, 1, 26, 0, 0, 0, 0, 0, 0, "jumps"]]],
                ],
              ],
            ],
          ],
        ],
      ];
      const page = extractRecognizerPage(raw);
      assert.strictEqual(page.pageWidth, 200);
      assert.strictEqual(page.pageHeight, 100);
      assert.lengthOf(page.lines, 2);
      assert.lengthOf(page.lines[0], 2);
      assert.strictEqual(page.lines[0][0].text, "the");
      assert.deepStrictEqual(
        [
          page.lines[0][0].x1,
          page.lines[0][0].y1,
          page.lines[0][0].x2,
          page.lines[0][0].y2,
        ],
        [10, 10, 20, 18],
      );
      assert.strictEqual(page.lines[1][0].text, "jumps");
    });
  });

  describe("parseAddHighlightParams", function () {
    it("parses a valid body (string or numeric page) + optional comment", function () {
      const r = parseAddHighlightParams({
        key: "ABCD2345",
        page: 3,
        text: "a quoted span",
        comment: "note",
      });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.strictEqual(r.params.page, 3);
        assert.strictEqual(r.params.text, "a quoted span");
        assert.strictEqual(r.params.comment, "note");
      }
    });

    it("rejects a missing key", function () {
      const r = parseAddHighlightParams({ page: 1, text: "x" });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /key/i);
    });

    it("rejects a missing page", function () {
      const r = parseAddHighlightParams({ key: "ABCD2345", text: "x" });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /page/i);
    });

    it("rejects a sub-1 page", function () {
      assert.isFalse(
        parseAddHighlightParams({ key: "ABCD2345", page: 0, text: "x" }).ok,
      );
    });

    it("rejects a missing or empty text", function () {
      assert.isFalse(parseAddHighlightParams({ key: "ABCD2345", page: 1 }).ok);
      const r = parseAddHighlightParams({
        key: "ABCD2345",
        page: 1,
        text: "  ",
      });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /text/i);
    });

    it("rejects an invalid color", function () {
      const r = parseAddHighlightParams({
        key: "ABCD2345",
        page: 1,
        text: "x",
        color: "blue",
      });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /color/i);
    });

    it("rejects an invalid libraryID", function () {
      const r = parseAddHighlightParams({
        key: "ABCD2345",
        page: 1,
        text: "x",
        libraryID: "abc",
      });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /librar/i);
    });
  });
});
