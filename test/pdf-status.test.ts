import { assert } from "chai";
import { classifyPdfStatus } from "../src/utils/pdf-status";

// Pure functional core for the add-item-by-id PDF-fetch outcome. No Zotero
// context: the endpoint (imperative shell) computes `alreadyHadPdf` and the
// fetch outcome, then this function maps them to the response `pdf` value.
describe("classifyPdfStatus (pure)", function () {
  it("returns 'present' when the item already had a PDF and no fetch ran", function () {
    assert.strictEqual(classifyPdfStatus(true, null), "present");
  });

  it("returns 'present' even if an outcome is supplied (prior PDF wins)", function () {
    assert.strictEqual(classifyPdfStatus(true, "attached"), "present");
  });

  it("returns 'fetched' when a file was attached this call", function () {
    assert.strictEqual(classifyPdfStatus(false, "attached"), "fetched");
  });

  it("returns 'unavailable' when no file was found", function () {
    assert.strictEqual(classifyPdfStatus(false, "none"), "unavailable");
  });

  it("returns 'error' when the fetch attempt threw", function () {
    assert.strictEqual(classifyPdfStatus(false, "error"), "error");
  });

  it("returns 'unavailable' defensively when no prior PDF and no fetch ran", function () {
    assert.strictEqual(classifyPdfStatus(false, null), "unavailable");
  });
});
