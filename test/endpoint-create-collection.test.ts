import { assert } from "chai";

// Contract tests for POST /api/plus/create-collection. Network-free: collections
// are created in the isolated test profile's My Library. Each test starts and
// ends clean by erasing any collection with the test name.
describe("endpoint /api/plus/create-collection", function () {
  const NAME = "api-plus-test-collection";

  async function eraseTestCollections() {
    const userLibraryID = Zotero.Libraries.userLibraryID;
    for (const c of Zotero.Collections.getByLibrary(userLibraryID, true)) {
      if (c.name === NAME) await c.eraseTx();
    }
  }

  beforeEach(eraseTestCollections);

  after(eraseTestCollections);

  it("returns 400 when no name is provided", async function () {
    const ep = new Zotero.Server.LocalAPI.CreateCollectionEndpoint();
    const result = await ep.run({ data: {} });
    assert.strictEqual(result[0], 400, `body: ${result[2]}`);
    assert.match(result[2], /name/i);
  });

  it("returns 400 for an unknown groupID", async function () {
    const ep = new Zotero.Server.LocalAPI.CreateCollectionEndpoint();
    const result = await ep.run({
      data: { name: NAME, groupID: 999999999 },
    });
    assert.strictEqual(result[0], 400, `body: ${result[2]}`);
    assert.match(result[2], /group/i);
  });

  it("returns 400 for a parentCollectionKey not in the target library", async function () {
    const ep = new Zotero.Server.LocalAPI.CreateCollectionEndpoint();
    const result = await ep.run({
      data: { name: NAME, parentCollectionKey: "ZZZZZZZZ" },
    });
    assert.strictEqual(result[0], 400, `body: ${result[2]}`);
    assert.match(result[2], /parent|collection/i);
  });

  it("creates a collection in My Library, then is idempotent on the same name", async function () {
    const ep = new Zotero.Server.LocalAPI.CreateCollectionEndpoint();

    const r1 = await ep.run({ data: { name: NAME } });
    assert.strictEqual(r1[0], 200, `body: ${r1[2]}`);
    assert.strictEqual(r1[1], "application/json");
    const p1 = JSON.parse(r1[2]);
    assert.isTrue(p1.created, "first call creates");
    assert.isString(p1.collection.key);
    assert.strictEqual(p1.collection.name, NAME);
    assert.strictEqual(
      p1.collection.groupID,
      null,
      "My Library → groupID null",
    );

    const r2 = await ep.run({ data: { name: NAME } });
    const p2 = JSON.parse(r2[2]);
    assert.isFalse(p2.created, "second call finds the existing collection");
    assert.strictEqual(
      p2.collection.key,
      p1.collection.key,
      "idempotent: same key returned",
    );
  });
});
