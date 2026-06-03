import { assert } from "chai";

// Per AC-Preflight (critical review I3): convert two load-bearing harness
// assumptions into positive controls so a harness failure surfaces here, not
// as an opaque TypeError inside a contract test.
describe("preflight: scaffold/mocha invariants", function () {
  it("endpoint classes are assigned to the LocalAPI namespace at it-time", function () {
    assert.isOk(
      Zotero.Server.LocalAPI.Plus,
      "Plus undefined — waitForPlugin gate did not fire",
    );
    assert.isOk(
      Zotero.Server.LocalAPI.AddItemEndpoint,
      "AddItemEndpoint undefined",
    );
    assert.isOk(
      Zotero.Server.LocalAPI.GetSelectedCollectionEndpoint,
      "GetSelectedCollectionEndpoint undefined",
    );
  });

  it("the runner honours an inside-it this.timeout", async function () {
    this.timeout(30000);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  });
});
