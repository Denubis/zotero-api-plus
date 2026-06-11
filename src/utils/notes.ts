// Pure functional core for the add-note / read-note endpoints: parse/validate
// request params, build the annotation sortIndex, and build the default note
// position. No Zotero dependency, so it is unit-testable without a Zotero
// context. The imperative shell (the endpoints in addon.ts) resolves the item,
// finds the PDF attachment, reads the page count, and saves/reads annotations.

// A validated add-note request (POST/JSON body).
export type AddNoteParams = {
  key: string; // PDF attachment key, or a parent item key
  page: number; // 1-based physical PDF page
  text: string; // the note body (stored as the annotation comment)
  libraryID?: number; // optional Zotero libraryID (NOT a groupID)
  color?: string; // optional #rrggbb; shell applies a default when absent
};

export type AddNoteParseResult =
  | { ok: true; params: AddNoteParams }
  | { ok: false; error: string };

// A validated read-note request (GET query).
export type ReadNoteParams = {
  key: string; // an annotation key (single) OR a parent/PDF key (list)
  libraryID?: number;
};

export type ReadNoteParseResult =
  | { ok: true; params: ReadNoteParams }
  | { ok: false; error: string };

// The default sticky-note icon box, in PDF points. Deliberately dimension-free
// (a fixed corner box) so we needn't read the page size — placing it at a
// natural top-left would require page dimensions, which has no headless API.
const NOTE_DEFAULT_RECT = [12, 12, 36, 36];

// Coerce an unknown body value to a positive integer, or null if it isn't one.
function toPositiveInt(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value.trim())
        : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// Parse the POST/JSON body into validated add-note params (or a 400 message).
export function parseAddNoteParams(raw: {
  key?: unknown;
  page?: unknown;
  text?: unknown;
  libraryID?: unknown;
  color?: unknown;
}): AddNoteParseResult {
  if (typeof raw.key !== "string" || !raw.key.trim()) {
    return { ok: false, error: "Error: No item key provided" };
  }
  const key = raw.key.trim();

  if (raw.page === undefined || raw.page === null || raw.page === "") {
    return { ok: false, error: "Error: No page provided" };
  }
  const page = toPositiveInt(raw.page);
  if (page === null) {
    return {
      ok: false,
      error: `Error: Invalid page '${String(raw.page)}' (expected a 1-based integer >= 1)`,
    };
  }

  if (typeof raw.text !== "string" || !raw.text.trim()) {
    return { ok: false, error: "Error: No note text provided" };
  }
  const text = raw.text;

  let libraryID: number | undefined;
  if (
    raw.libraryID !== undefined &&
    raw.libraryID !== null &&
    raw.libraryID !== ""
  ) {
    const lib = toPositiveInt(raw.libraryID);
    if (lib === null) {
      return {
        ok: false,
        error: `Error: Invalid libraryID '${String(raw.libraryID)}'`,
      };
    }
    libraryID = lib;
  }

  let color: string | undefined;
  if (raw.color !== undefined && raw.color !== null && raw.color !== "") {
    if (typeof raw.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(raw.color)) {
      return {
        ok: false,
        error: `Error: Invalid color '${String(raw.color)}' (expected #rrggbb)`,
      };
    }
    color = raw.color;
  }

  return { ok: true, params: { key, page, text, libraryID, color } };
}

// Parse the GET query into validated read-note params (or a 400 message).
export function parseReadNoteParams(raw: {
  key?: string | null;
  libraryID?: string | null;
}): ReadNoteParseResult {
  const key = (raw.key ?? "").trim();
  if (!key) {
    return { ok: false, error: "Error: No item key provided" };
  }

  let libraryID: number | undefined;
  const libStr = (raw.libraryID ?? "").trim();
  if (libStr) {
    const lib = Number(libStr);
    if (!Number.isInteger(lib) || lib < 1) {
      return {
        ok: false,
        error: `Error: Invalid libraryID '${raw.libraryID}'`,
      };
    }
    libraryID = lib;
  }

  return { ok: true, params: { key, libraryID } };
}

// Zotero annotation sortIndex string. Mirrors the PDF worker's getSortIndex:
// [pageIndex(5) | offset(6) | top(5)] zero-padded, joined by '|'.
export function buildAnnotationSortIndex(
  pageIndex: number,
  offset: number,
  top: number,
): string {
  return [
    String(pageIndex).slice(0, 5).padStart(5, "0"),
    String(offset).slice(0, 6).padStart(6, "0"),
    String(Math.max(Math.floor(top), 0))
      .slice(0, 5)
      .padStart(5, "0"),
  ].join("|");
}

// Default, dimension-free position for a page-anchored note annotation.
export function buildNotePosition(pageIndex: number): {
  pageIndex: number;
  rects: number[][];
} {
  return { pageIndex, rects: [[...NOTE_DEFAULT_RECT]] };
}
