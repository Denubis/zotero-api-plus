# Zotero 9 API Plus

[![zotero target version](https://img.shields.io/badge/Zotero-7%7C8%7C9-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![License: AGPL-3.0-or-later](https://img.shields.io/github/license/Denubis/zotero-api-plus)](https://github.com/Denubis/zotero-api-plus/blob/main/LICENSE)

[English](README.md) | [简体中文](doc/README-zhCN.md)

A Zotero 9-ready fork of [GOKORURI007/zotero-api-plus](https://github.com/GOKORURI007/zotero-api-plus)
that extends Zotero's local API with additional endpoints. It keeps the same
plugin ID, so it installs in place over the original. Tracks Zotero 7, 8, and 9.

## Features

- Extends Zotero's local API with custom endpoints
- Add items to Zotero by identifier (DOI, ISBN, PMID, etc.) via API
- Auto-fetch an available PDF after adding, with a per-item status when it can't
- Target a group library and collection, with a discovery endpoint to list them
- Find-or-create collections (idempotently) in any library or group
- Open a PDF attachment at a specific page in the built-in reader via a clickable link
- Add a page-anchored note (a reader annotation) to a PDF, and read notes back
- Highlight a quoted span by its text (first 5 pages), or by pre-computed
  rectangles on any page
- Read annotations back (notes and highlights) and delete an annotation
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

### Open a PDF at a Page

```
GET /api/plus/open-pdf?key=<itemKey>&page=<n>&libraryID=<id>
```

Opens a PDF attachment in Zotero's built-in reader and navigates to a page.
Because it is a plain `GET`, an
`http://localhost:23119/api/plus/open-pdf?...` link is clickable from a browser,
a Markdown preview, or a note app — handy for citation verification, where a link
should jump the reader to the cited page.

#### Query Parameters

- `key` (required) — a Zotero item key: either a PDF **attachment** key, or a
  **parent** item key (then its first PDF child attachment is used).
- `page` (required) — the 1-based **physical** page of the PDF (page 1 = the
  first page of the file). It is converted to Zotero's 0-based `pageIndex`. A
  page beyond the PDF's length returns `400` (no silent clamp).
- `libraryID` (optional) — the numeric Zotero library id (a group library's
  library id, **not** its groupID; see `GET /api/plus/libraries`). Attachment
  keys are unique per library, not globally. Omit to search My Library first,
  then each group library.

The page opens in Zotero's built-in reader regardless of any external PDF handler
you may have configured. If a reader tab is already open for the item, it is
navigated rather than duplicated.

#### Response

```json
{
  "ok": true,
  "key": "4G7Z5EUI",
  "page": 3,
  "title": "Schönbrodt and Wagenmakers - 2018 - …"
}
```

`400` for missing/invalid params or a page beyond the PDF; `404` when the key
matches no item, or the item has no PDF attachment; `500` if the reader fails to
open.

### Add a Note to a Page

```
POST /api/plus/add-note
Content-Type: application/json
```

Creates a page-anchored **note annotation** on a PDF — a sticky note that shows
in Zotero's reader (annotation sidebar and on the page). Returns the new
annotation's key, which `read-note` reads back.

#### Request Body

```jsonc
{
  "key": "4G7Z5EUI", // Required: PDF attachment, or a parent item (→ its first PDF child)
  "page": 3, // Required: 1-based physical page; validated ≤ the PDF's length (else 400)
  "text": "Jeffreys table — verify cited threshold", // Required: the note body
  "libraryID": 27, // Optional: Zotero library id (see GET /api/plus/libraries)
  "color": "#ffd400", // Optional: #rrggbb, defaults to Zotero yellow
}
```

#### Response

```json
{ "ok": true, "key": "9HCAT8A4", "page": 3, "attachmentKey": "4G7Z5EUI" }
```

`400` for bad/missing params or a page beyond the PDF; `404` when the key matches
no item, or the item has no PDF attachment; `500` if the save fails. The note icon
is placed at a fixed position on the page (it is not located against the text).

### Read Notes

```
GET /api/plus/read-note?key=<key>&libraryID=<id>
```

Reads page-anchored note annotations. The result depends on what `key` resolves
to:

- a **note-annotation** key → that one note
- a **parent item or PDF attachment** key → all note annotations on that document

#### Response (single)

```json
{
  "ok": true,
  "key": "9HCAT8A4",
  "page": 3,
  "pageLabel": "3",
  "comment": "Jeffreys table — verify cited threshold",
  "color": "#ffd400",
  "type": "note"
}
```

#### Response (list)

```json
{
  "ok": true,
  "notes": [
    {
      "key": "9HCAT8A4",
      "page": 3,
      "pageLabel": "3",
      "comment": "Jeffreys table — verify cited threshold",
      "color": "#ffd400",
      "type": "note"
    }
  ]
}
```

`page` is the 1-based physical page recovered from the annotation. `400` for
missing/invalid params, or an annotation key that isn't a note; `404` for an
unknown key.

### Add a Highlight

```
POST /api/plus/add-highlight
Content-Type: application/json
```

Creates a highlight annotation on a PDF. There are two modes; the endpoint picks
**position mode** when the body contains `rects`, otherwise **text mode**.

#### Text mode — highlight a quoted span

Give a quote; the endpoint reads the PDF's recognised word boxes, anchors on the
first and last few words, and highlights everything between them — one rectangle
per line. The middle of the quote need not match exactly (punctuation, hyphenation,
and running headers between the anchors are tolerated).

**This mode only sees the first 5 pages.** Zotero's recogniser
(`getRecognizerData`) hard-caps at 5 pages, and the plugin cannot lift that. To
highlight later pages, use position mode.

```jsonc
{
  "key": "4G7Z5EUI", // Required: PDF attachment, or a parent item (→ its first PDF child)
  "page": 3, // Required: 1-based start page (≤ 5; the span may run onto page + 1)
  "text": "the stopping rule principle", // Required: the quote to find and highlight
  "libraryID": 27, // Optional: Zotero library id (see GET /api/plus/libraries)
  "color": "#ffd400", // Optional: #rrggbb, defaults to Zotero yellow
  "comment": "Bayes factors retain meaning", // Optional: a comment on the highlight
}
```

A span crossing a single page break is supported (continuation via `nextPageRects`).
Response: `{ "ok": true, "key": "…", "page": 3, "matched": "…", "rects": [[…]], "nextPageRects": [[…]] }`
(`nextPageRects` only across a break).

#### Position mode — highlight pre-computed rectangles (any page)

Supply the rectangles yourself, so highlighting works on **any page** — the
recogniser is bypassed. Compute per-quote rects with your own PDF tooling (e.g.
PyMuPDF `page.search_for(...)`), which returns boxes in a **top-left** origin, and
pass them with the page height; the endpoint flips them to PDF bottom-left and
saves.

```jsonc
{
  "key": "4G7Z5EUI", // Required: PDF attachment, or a parent item
  "page": 80, // Required: 1-based physical page (= PyMuPDF page index + 1); validated ≤ the PDF length
  "rects": [[71, 120, 521, 140]], // Required: TOP-LEFT origin [x1, yTop, x2, yBot], in PDF points, one per line
  "pageHeight": 792, // Required: the page height in PDF points (PyMuPDF page.rect.height), for the y-flip
  "text": "the stopping rule principle", // Optional: the quoted text (→ the highlight's text)
  "comment": "[@schonbrodt2018, p.80]", // Optional: a comment on the highlight
  "libraryID": 27, // Optional
  "color": "#ffd400", // Optional
}
```

Response: `{ "ok": true, "key": "…", "page": 80, "rects": [[71, 652, 521, 672]] }`
(`rects` echoed back in PDF bottom-left coordinates).

#### Errors

The endpoint's own failures return a structured body `{ "ok": false, "code": "…",
"message": "…" }` so a caller can branch a fallback (e.g. drop a page note instead):

| code                   | status | meaning                                                    |
| ---------------------- | ------ | ---------------------------------------------------------- |
| `bad_request`          | 400    | missing/invalid params                                     |
| `span_not_found`       | 422    | text mode: the start or end anchor isn't on the page       |
| `no_text_layer`        | 422    | text mode: the page has no extractable text (scanned PDF)  |
| `page_beyond_cap`      | 422    | text mode: the page is past the recogniser's first 5 pages |
| `page_beyond_document` | 400    | position mode: the page is past the end of the PDF         |
| `no_pdf_attachment`    | 404    | the item has no PDF attachment                             |
| `internal`             | 500    | the PDF couldn't be read, or the save failed               |

An unknown item key or library id still returns a plain-text `404`/`400` (from
shared item resolution), without a `code`.

### Read Annotations

```
GET /api/plus/read-annotations?key=<key>&type=<filter>&libraryID=<id>
```

Reads annotations back — unlike `read-note`, this can return **highlights** too,
which makes a re-run of a batch annotation job idempotent (you can see what's
already there). The result depends on what `key` resolves to:

- an **annotation** key → that one annotation
- a **parent item or PDF attachment** key → all matching annotations on that document

`type` filters to `note`, `highlight`, or `all` (default `all`).

#### Response (list)

```json
{
  "ok": true,
  "annotations": [
    {
      "key": "GJZ8ZL3F",
      "type": "highlight",
      "page": 80,
      "pageLabel": "80",
      "comment": "[@schonbrodt2018, p.80]",
      "color": "#ffd400",
      "text": "the stopping rule principle"
    }
  ]
}
```

A single-annotation key returns the same fields at the top level alongside
`ok: true`. `text` is the highlighted span for highlights (empty for notes). `400`
for missing/invalid params or a `type` mismatch on a single annotation key; `404`
for an unknown key.

### Delete an Annotation

```
POST /api/plus/delete-annotation
Content-Type: application/json
```

Deletes one annotation (note or highlight). Enables replace-on-edit and cleaning
up annotations created by mistake.

```jsonc
{
  "key": "GJZ8ZL3F", // Required: an annotation key
  "libraryID": 27, // Optional: Zotero library id
}
```

Response `{ "ok": true, "key": "GJZ8ZL3F" }`. `400` if the key resolves to
something that isn't an annotation; `404` for an unknown key.

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
