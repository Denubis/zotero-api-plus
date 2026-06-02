import { assert } from "chai";

// Discovery endpoint: lists My Library + groups, each with its collections
// (key + name + parentKey). The "trivial way to discover" group IDs and
// collection keys for add-item-by-id targeting. In-process contract test
// (no HTTP, no network) — the isolated test profile always has My Library.
describe("endpoint /api/plus/libraries", function () {
  it("returns 200 application/json with a libraries[] including My Library", async function () {
    const ep = new Zotero.Server.LocalAPI.GetLibrariesEndpoint();
    const result = await ep.run({});

    assert.strictEqual(result[0], 200, `expected 200, body: ${result[2]}`);
    assert.strictEqual(result[1], "application/json");

    const payload = JSON.parse(result[2]);
    assert.isArray(payload.libraries, "libraries[] present");

    const user = payload.libraries.find(
      (l: { type: string }) => l.type === "user",
    );
    assert.isOk(user, "a user-type library is present");
    assert.isNumber(user.libraryID, "user library carries a numeric libraryID");
    assert.isArray(user.collections, "user library carries a collections[]");
    for (const c of user.collections) {
      assert.isString(c.key, "collection carries a string key");
      assert.isString(c.name, "collection carries a string name");
      // parentKey is string | null
      assert.isTrue(
        c.parentKey === null || typeof c.parentKey === "string",
        "collection.parentKey is string or null",
      );
    }
  });
});
