// Pure functional core for the open-pdf endpoint: parse/validate the request
// params and the page<->pageIndex relationship. No Zotero dependency, so it is
// unit-testable without a Zotero context. The imperative shell (the endpoint in
// addon.ts) resolves the item, finds the PDF attachment, reads the page count,
// and drives the reader.

// A validated open-pdf request.
export type OpenPdfParams = {
  key: string; // Zotero item key (PDF attachment, or a parent item)
  page: number; // 1-based physical PDF page (page 1 = first page of the file)
  libraryID?: number; // optional Zotero libraryID (NOT a groupID)
};

export type ParseResult =
  | { ok: true; params: OpenPdfParams }
  | { ok: false; error: string };

// Parse the raw query (string | null values, as URLSearchParams.get yields)
// into a validated params object, or an error string suitable for a 400 body.
export function parseOpenPdfParams(raw: {
  key?: string | null;
  page?: string | null;
  libraryID?: string | null;
}): ParseResult {
  const key = (raw.key ?? "").trim();
  if (!key) {
    return { ok: false, error: "Error: No item key provided" };
  }

  const pageStr = (raw.page ?? "").trim();
  if (!pageStr) {
    return { ok: false, error: "Error: No page provided" };
  }
  const page = Number(pageStr);
  if (!Number.isInteger(page) || page < 1) {
    return {
      ok: false,
      error: `Error: Invalid page '${raw.page}' (expected a 1-based integer >= 1)`,
    };
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

  return { ok: true, params: { key, page, libraryID } };
}

// 1-based physical page -> Zotero's 0-based reader pageIndex.
export function pageToPageIndex(page: number): number {
  return page - 1;
}

// Whether a 1-based page falls within a PDF of `totalPages` pages.
export function isPageInRange(page: number, totalPages: number): boolean {
  return page >= 1 && page <= totalPages;
}
