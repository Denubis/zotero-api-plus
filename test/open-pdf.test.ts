import { assert } from "chai";
import {
  parseOpenPdfParams,
  pageToPageIndex,
  isPageInRange,
} from "../src/utils/open-pdf";

// Pure functional core for the open-pdf endpoint. No Zotero context: the
// endpoint (imperative shell) hands the raw query string values here, then
// resolves the item / reads the page count / drives the reader itself.
describe("open-pdf (pure core)", function () {
  describe("parseOpenPdfParams", function () {
    it("parses a valid key + page with no libraryID", function () {
      const r = parseOpenPdfParams({ key: "ABCD2345", page: "3" });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.strictEqual(r.params.key, "ABCD2345");
        assert.strictEqual(r.params.page, 3);
        assert.isUndefined(r.params.libraryID);
      }
    });

    it("parses a libraryID when provided", function () {
      const r = parseOpenPdfParams({
        key: "ABCD2345",
        page: "3",
        libraryID: "27",
      });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) assert.strictEqual(r.params.libraryID, 27);
    });

    it("trims surrounding whitespace from the key", function () {
      const r = parseOpenPdfParams({ key: "  ABCD2345  ", page: "1" });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) assert.strictEqual(r.params.key, "ABCD2345");
    });

    it("rejects a missing key", function () {
      const r = parseOpenPdfParams({ page: "3" });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /key/i);
    });

    it("rejects a whitespace-only key", function () {
      const r = parseOpenPdfParams({ key: "   ", page: "3" });
      assert.isFalse(r.ok);
    });

    it("rejects a missing page", function () {
      const r = parseOpenPdfParams({ key: "ABCD2345" });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /page/i);
    });

    it("rejects a non-integer page", function () {
      assert.isFalse(parseOpenPdfParams({ key: "ABCD2345", page: "3.5" }).ok);
      assert.isFalse(parseOpenPdfParams({ key: "ABCD2345", page: "abc" }).ok);
    });

    it("rejects a page below 1 (0-based pageIndex is internal only)", function () {
      assert.isFalse(parseOpenPdfParams({ key: "ABCD2345", page: "0" }).ok);
      assert.isFalse(parseOpenPdfParams({ key: "ABCD2345", page: "-2" }).ok);
    });

    it("rejects a non-integer libraryID", function () {
      const r = parseOpenPdfParams({
        key: "ABCD2345",
        page: "3",
        libraryID: "abc",
      });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /librar/i);
    });
  });

  describe("pageToPageIndex", function () {
    it("converts a 1-based page to a 0-based pageIndex", function () {
      assert.strictEqual(pageToPageIndex(1), 0);
      assert.strictEqual(pageToPageIndex(3), 2);
    });
  });

  describe("isPageInRange", function () {
    it("is true when the page is within the PDF", function () {
      assert.isTrue(isPageInRange(3, 10));
      assert.isTrue(isPageInRange(10, 10));
      assert.isTrue(isPageInRange(1, 1));
    });

    it("is false when the page is beyond the PDF (no silent clamp)", function () {
      assert.isFalse(isPageInRange(11, 10));
      assert.isFalse(isPageInRange(1, 0));
    });
  });
});
