# Zotero API Plus

[![zotero target version](https://img.shields.io/badge/Zotero-7%7C8%7C9-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![License: AGPL-3.0-or-later](https://img.shields.io/github/license/GOKORURI007/zotero-api-plus)](https://github.com/GOKORURI007/zotero-api-plus/blob/main/LICENSE)

[English](README.md) | [简体中文](doc/README-zhCN.md)

A Zotero plugin that extends Zotero's local API with additional functionality.

## Features

- Extends Zotero's local API with custom endpoints
- Add items to Zotero by identifier (DOI, ISBN, PMID, etc.) via API
- Auto-fetch an available PDF after adding, with a per-item status when it can't
- Target a group library and collection, with a discovery endpoint to list them
- Find-or-create collections (idempotently) in any library or group
- Health check endpoint to verify plugin status
- Easy integration with other tools and scripts

## API Endpoints

### Health Check

```
GET /api/plus
```

Returns a simple message indicating the API is running.

#### Response

```
Zotero Local API Plus is running.
```

### Add Item by Identifier

```
POST /api/plus/add-item-by-id
Content-Type: application/json
```

Adds items to Zotero using identifiers like DOI, ISBN, PMID, etc.

After saving each item, the endpoint attempts a headless "Find Available PDF"
(Zotero's open-access / DOI / URL resolver chain) and reports the outcome per
item.

#### Request Body

```json
{
  "identifier": "10.1038/nature12373", // Required: DOI, ISBN, PMID, etc.
  "groupID": 1234567, // Optional: target a group library (see GET /api/plus/libraries). Omit for My Library.
  "collectionKey": "ABC123" // Optional: collection key, resolved within the target library
}
```

An unknown `groupID`, or a `collectionKey` not present in the target library,
returns `400` — the item is not silently added to My Library.

#### Response

```json
{
  "status": "success",
  "addedCount": 1,
  "titles": ["Article Title"],
  "items": [
    {
      "title": "Article Title",
      "key": "ABCD1234",
      "pdf": "fetched", // present | fetched | unavailable | error
      "attachmentID": 456 // present only when pdf === "fetched"
    }
  ]
}
```

Per-item `pdf`: `present` (a PDF was already attached), `fetched` (one was
retrieved this call), `unavailable` (none found — fetch it manually, e.g. via the
browser connector), `error` (the attempt threw). Retrieval depends on Zotero's
resolver configuration (open-access lookup and any configured OpenURL/proxy
resolver), so `unavailable` is a normal outcome, not a failure.

### Get Selected Collection

```
GET /api/plus/selected-collection
```

Returns information about the currently selected collection in Zotero.

#### Response

```json
{
  "name": "My Collection",
  "key": "ABC123",
  "libraryID": 1,
  "groupID": null // the group ID when the collection is in a group library, else null
}
```

#### Error Response

```
No Collection selected.
```

### List Libraries & Collections

```
GET /api/plus/libraries
```

Lists My Library and every group library, each with its collections — the
`groupID` and `collectionKey` values used to target `add-item-by-id`.

#### Response

```json
{
  "libraries": [
    {
      "type": "user",
      "libraryID": 1,
      "name": "My Library",
      "collections": [
        { "key": "AB12CD34", "name": "Reading", "parentKey": null }
      ]
    },
    {
      "type": "group",
      "libraryID": 5,
      "groupID": 1234567,
      "name": "Project X",
      "collections": []
    }
  ]
}
```

### Create Collection

```
POST /api/plus/create-collection
Content-Type: application/json
```

Finds or creates a collection (idempotent by name within the target library and
parent) and returns its key — handy for ensuring a target collection exists
before adding items.

#### Request Body

```json
{
  "name": "Frameworks bib", // Required
  "groupID": 1234567, // Optional: target a group library. Omit for My Library.
  "parentCollectionKey": "ABC123" // Optional: nest under an existing collection in the target library
}
```

An unknown `groupID`, or a `parentCollectionKey` not present in the target
library, returns `400`.

#### Response

```json
{
  "status": "success",
  "created": true,
  "collection": {
    "key": "NEWKEY12",
    "name": "Frameworks bib",
    "parentKey": null,
    "libraryID": 1,
    "groupID": null
  }
}
```

`created` is `false` when an existing same-name collection (same parent and
library) was returned instead of creating a duplicate.

## Installation

1. Download the latest release from the [GitHub Releases](https://github.com/GOKORURI007/zotero-api-plus/releases) page.
2. In Zotero, go to `Tools > Add-ons`.
3. Click the gear icon and select `Install Add-on From File...`.
4. Select the downloaded `.xpi` file.
5. Restart Zotero.

## Usage

1. Enable Zotero's local API: open _Settings → Advanced_ and tick "Allow other applications on this computer to communicate with Zotero".
2. Verify the API is reachable:

   ```
   curl http://127.0.0.1:23119/api/plus
   ```

   Expected response body: `Zotero Local API Plus is running.` with `Content-Type: text/plain`.

3. Use the API endpoints as described above.

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
npm install
npm run start
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint:check
```

## License

AGPL-3.0-or-later

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
