// Pure functional core for the annotation read/delete endpoints. No Zotero
// dependency, so it is unit-testable without a Zotero context. The imperative
// shell (the endpoints in addon.ts) resolves items, walks getAnnotations(), and
// erases via eraseTx().

// The annotation types read-annotations can filter to. "all" returns every
// supported type (currently note + highlight).
export type AnnotationTypeFilter = "note" | "highlight" | "all";

const ANNOTATION_TYPE_FILTERS: readonly AnnotationTypeFilter[] = [
  "note",
  "highlight",
  "all",
];

export type ReadAnnotationsParams = {
  key: string;
  type: AnnotationTypeFilter;
  libraryID?: number;
};

export type ReadAnnotationsParseResult =
  | { ok: true; params: ReadAnnotationsParams }
  | { ok: false; error: string };

function parseLibraryID(
  raw: string | null | undefined,
): { ok: true; libraryID?: number } | { ok: false } {
  const libStr = (raw ?? "").trim();
  if (!libStr) return { ok: true, libraryID: undefined };
  const lib = Number(libStr);
  if (!Number.isInteger(lib) || lib < 1) return { ok: false };
  return { ok: true, libraryID: lib };
}

// Parse the GET query into validated read-annotations params (or a 400 message).
// `type` is optional and defaults to "all".
export function parseReadAnnotationsParams(raw: {
  key?: string | null;
  type?: string | null;
  libraryID?: string | null;
}): ReadAnnotationsParseResult {
  const key = (raw.key ?? "").trim();
  if (!key) {
    return { ok: false, error: "Error: No item key provided" };
  }

  const typeStr = (raw.type ?? "").trim() || "all";
  if (!ANNOTATION_TYPE_FILTERS.includes(typeStr as AnnotationTypeFilter)) {
    return {
      ok: false,
      error: `Error: Invalid type '${typeStr}' (expected note, highlight, or all)`,
    };
  }
  const type = typeStr as AnnotationTypeFilter;

  const lib = parseLibraryID(raw.libraryID);
  if (!lib.ok) {
    return { ok: false, error: `Error: Invalid libraryID '${raw.libraryID}'` };
  }

  return { ok: true, params: { key, type, libraryID: lib.libraryID } };
}

export type DeleteAnnotationParams = {
  key: string;
  libraryID?: number;
};

export type DeleteAnnotationParseResult =
  | { ok: true; params: DeleteAnnotationParams }
  | { ok: false; error: string };

// Parse the POST/JSON body into validated delete-annotation params (or a 400
// message). libraryID may arrive as a number (JSON) or a numeric string.
export function parseDeleteAnnotationParams(raw: {
  key?: unknown;
  libraryID?: unknown;
}): DeleteAnnotationParseResult {
  if (typeof raw.key !== "string" || !raw.key.trim()) {
    return { ok: false, error: "Error: No annotation key provided" };
  }
  const key = raw.key.trim();

  let libraryID: number | undefined;
  if (
    raw.libraryID !== undefined &&
    raw.libraryID !== null &&
    raw.libraryID !== ""
  ) {
    const lib =
      typeof raw.libraryID === "number"
        ? raw.libraryID
        : typeof raw.libraryID === "string"
          ? Number(raw.libraryID.trim())
          : NaN;
    if (!Number.isInteger(lib) || lib < 1) {
      return {
        ok: false,
        error: `Error: Invalid libraryID '${String(raw.libraryID)}'`,
      };
    }
    libraryID = lib;
  }

  return { ok: true, params: { key, libraryID } };
}
