import { assert } from "chai";
import {
  parseReadAnnotationsParams,
  parseDeleteAnnotationParams,
} from "../src/utils/annotations";

// Pure functional core for read-annotations (the generalised read path that can
// return highlights too, for batch-mode idempotency). GET params arrive as
// strings or null from URLSearchParams; `type` defaults to "all".
describe("annotations (pure core)", function () {
  describe("parseReadAnnotationsParams", function () {
    it("parses a key and defaults type to 'all'", function () {
      const r = parseReadAnnotationsParams({
        key: "ABCD2345",
        type: null,
        libraryID: null,
      });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.strictEqual(r.params.key, "ABCD2345");
        assert.strictEqual(r.params.type, "all");
        assert.isUndefined(r.params.libraryID);
      }
    });

    it("accepts type note | highlight | all", function () {
      for (const t of ["note", "highlight", "all"]) {
        const r = parseReadAnnotationsParams({
          key: "ABCD2345",
          type: t,
          libraryID: null,
        });
        assert.isTrue(r.ok, t);
        if (r.ok) assert.strictEqual(r.params.type, t);
      }
    });

    it("rejects an unknown type", function () {
      const r = parseReadAnnotationsParams({
        key: "ABCD2345",
        type: "image",
        libraryID: null,
      });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /type/i);
    });

    it("rejects a missing key", function () {
      const r = parseReadAnnotationsParams({
        key: null,
        type: null,
        libraryID: null,
      });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /key/i);
    });

    it("parses a libraryID", function () {
      const r = parseReadAnnotationsParams({
        key: "ABCD2345",
        type: null,
        libraryID: "27",
      });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) assert.strictEqual(r.params.libraryID, 27);
    });

    it("rejects an invalid libraryID", function () {
      const r = parseReadAnnotationsParams({
        key: "ABCD2345",
        type: null,
        libraryID: "abc",
      });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /librar/i);
    });
  });

  // delete-annotation is POST/JSON, so params come from the body (unknowns).
  describe("parseDeleteAnnotationParams", function () {
    it("parses a valid body (key + optional libraryID)", function () {
      const r = parseDeleteAnnotationParams({ key: "9HCAT8A4", libraryID: 27 });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) {
        assert.strictEqual(r.params.key, "9HCAT8A4");
        assert.strictEqual(r.params.libraryID, 27);
      }
    });

    it("parses a body with no libraryID", function () {
      const r = parseDeleteAnnotationParams({ key: "9HCAT8A4" });
      assert.isTrue(r.ok, JSON.stringify(r));
      if (r.ok) assert.isUndefined(r.params.libraryID);
    });

    it("rejects a missing or empty key", function () {
      assert.isFalse(parseDeleteAnnotationParams({}).ok);
      const r = parseDeleteAnnotationParams({ key: "   " });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /key/i);
    });

    it("rejects an invalid libraryID", function () {
      const r = parseDeleteAnnotationParams({
        key: "9HCAT8A4",
        libraryID: "x",
      });
      assert.isFalse(r.ok);
      if (!r.ok) assert.match(r.error, /librar/i);
    });
  });
});
