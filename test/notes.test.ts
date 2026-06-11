import { assert } from "chai";
import {
  parseAddNoteParams,
  parseReadNoteParams,
  buildAnnotationSortIndex,
  buildNotePosition,
} from "../src/utils/notes";

// Pure functional core for the add-note / read-note endpoints. No Zotero
// context: the endpoints (imperative shell) hand the raw body/query here, then
// resolve the item / save / read annotations themselves.
describe("notes (pure core)", function () {
  describe("parseAddNoteParams", function () {
    it("parses a valid body with a string page", function () {
      const r = parseAddNoteParams({ key: "ABCD2345", page: "3", text: "hi" });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.strictEqual(r.params.key, "ABCD2345");
        assert.strictEqual(r.params.page, 3);
        assert.strictEqual(r.params.text, "hi");
        assert.isUndefined(r.params.libraryID);
        assert.isUndefined(r.params.color);
      }
    });

    it("parses a numeric page and libraryID", function () {
      const r = parseAddNoteParams({
        key: "ABCD2345",
        page: 3,
        text: "hi",
        libraryID: 27,
      });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.strictEqual(r.params.page, 3);
        assert.strictEqual(r.params.libraryID, 27);
      }
    });

    it("accepts a valid #rrggbb color", function () {
      const r = parseAddNoteParams({
        key: "ABCD2345",
        page: 1,
        text: "hi",
        color: "#ff8800",
      });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) assert.strictEqual(r.params.color, "#ff8800");
    });

    it("rejects a missing key", function () {
      const r = parseAddNoteParams({ page: 1, text: "hi" });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /key/i);
    });

    it("rejects a non-string / empty key", function () {
      assert.isFalse(parseAddNoteParams({ key: 123, page: 1, text: "x" }).ok);
      assert.isFalse(parseAddNoteParams({ key: "  ", page: 1, text: "x" }).ok);
    });

    it("rejects a missing page", function () {
      const r = parseAddNoteParams({ key: "ABCD2345", text: "hi" });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /page/i);
    });

    it("rejects a non-integer or sub-1 page", function () {
      assert.isFalse(
        parseAddNoteParams({ key: "ABCD2345", page: "3.5", text: "x" }).ok,
      );
      assert.isFalse(
        parseAddNoteParams({ key: "ABCD2345", page: 0, text: "x" }).ok,
      );
    });

    it("rejects a missing or empty text", function () {
      assert.isFalse(parseAddNoteParams({ key: "ABCD2345", page: 1 }).ok);
      const r = parseAddNoteParams({ key: "ABCD2345", page: 1, text: "   " });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /text/i);
    });

    it("rejects an invalid color", function () {
      const r = parseAddNoteParams({
        key: "ABCD2345",
        page: 1,
        text: "x",
        color: "red",
      });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /color/i);
    });

    it("rejects an invalid libraryID", function () {
      const r = parseAddNoteParams({
        key: "ABCD2345",
        page: 1,
        text: "x",
        libraryID: "abc",
      });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /librar/i);
    });
  });

  describe("parseReadNoteParams", function () {
    it("parses a valid key (+ optional libraryID)", function () {
      const r = parseReadNoteParams({ key: "ABCD2345", libraryID: "27" });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.strictEqual(r.params.key, "ABCD2345");
        assert.strictEqual(r.params.libraryID, 27);
      }
    });

    it("rejects a missing key", function () {
      const r = parseReadNoteParams({});
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /key/i);
    });

    it("rejects an invalid libraryID", function () {
      const r = parseReadNoteParams({ key: "ABCD2345", libraryID: "x" });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /librar/i);
    });
  });

  describe("buildAnnotationSortIndex", function () {
    it("zero-pads and joins [pageIndex(5)|offset(6)|top(5)]", function () {
      assert.strictEqual(
        buildAnnotationSortIndex(2, 0, 0),
        "00002|000000|00000",
      );
      assert.strictEqual(
        buildAnnotationSortIndex(12, 34, 567),
        "00012|000034|00567",
      );
    });
  });

  describe("buildNotePosition", function () {
    it("returns a position carrying the pageIndex and a single rect", function () {
      const pos = buildNotePosition(2);
      assert.strictEqual(pos.pageIndex, 2);
      assert.isArray(pos.rects);
      assert.lengthOf(pos.rects, 1);
      assert.lengthOf(pos.rects[0], 4);
    });
  });
});
