// Pure functional core for the add-highlight endpoint. No Zotero dependency, so
// it is unit-testable without a Zotero context. The imperative shell (the
// endpoint in addon.ts) resolves the PDF attachment, calls
// Zotero.PDFWorker.getRecognizerData, hands the raw page arrays here, then saves
// the resulting highlight via Zotero.Annotations.saveFromJSON.
//
// Strategy ("start/end zones"): anchor on the first and last few normalised
// tokens of the query and highlight everything between, rather than matching
// every token. Robust to messy middles (punctuation, hyphenation, spacing).
// Coordinates: the recogniser reports boxes in a TOP-LEFT origin (it computes
// yMin = pageHeight - rawTop); Zotero annotation rects are PDF user space
// (BOTTOM-LEFT origin), so we flip back with `pageHeight - y`.

// One recogniser word with its TOP-LEFT-origin box and text.
export type Word = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
};
// A line is its words in reading order; a page is its lines in reading order.
export type RecognizerPage = {
  pageWidth: number;
  pageHeight: number;
  lines: Word[][];
};

export type AddHighlightParams = {
  key: string;
  page: number; // 1-based start page (span may continue onto page + 1)
  text: string; // the quote to anchor + highlight
  libraryID?: number;
  color?: string;
  comment?: string;
};

export type AddHighlightParseResult =
  | { ok: true; params: AddHighlightParams }
  | { ok: false; error: string };

// The highlight geometry for one (or two, across a page break) pages, in PDF
// bottom-left coordinates, plus the matched text and the top-origin y of the
// start word (for sortIndex).
export type HighlightZone = {
  pageIndex: number;
  rects: number[][];
  nextPageRects?: number[][];
  matched: string;
  sortTop: number;
};

export type HighlightMatchResult =
  | { ok: true; zone: HighlightZone }
  | { ok: false; error: string };

// How many leading/trailing tokens form an anchor.
const ANCHOR = 4;

function toPositiveInt(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value.trim())
        : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// Lowercase and strip leading/trailing non-alphanumerics (keep internals like
// "128–142"). Returns "" for pure-punctuation tokens.
function normalize(token: string): string {
  return token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalize)
    .filter((t) => t.length > 0);
}

// Parse the POST/JSON body into validated add-highlight params (or a 400 message).
export function parseAddHighlightParams(raw: {
  key?: unknown;
  page?: unknown;
  text?: unknown;
  libraryID?: unknown;
  color?: unknown;
  comment?: unknown;
}): AddHighlightParseResult {
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
    return { ok: false, error: "Error: No highlight text provided" };
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

  let comment: string | undefined;
  if (typeof raw.comment === "string" && raw.comment.length > 0) {
    comment = raw.comment;
  }

  return { ok: true, params: { key, page, text, libraryID, color, comment } };
}

// Convert one raw recogniser page array into a clean RecognizerPage. The raw
// shape is [pageWidth, pageHeight, [[[[0,0,0,0, lines]]]]] where each line is
// [words] and each word is [xMin, yMin, xMax, yMax, ...metadata..., "text"].
// The recogniser data is untyped (PDFWorker is typed `any`), so this is the one
// place that walks the dynamic structure; the rest of the core is typed.
export function extractRecognizerPage(rawPage: any): RecognizerPage {
  const pageWidth = Number(rawPage?.[0]);
  const pageHeight = Number(rawPage?.[1]);
  const rawLines = rawPage?.[2]?.[0]?.[0]?.[0]?.[4] ?? [];
  const lines: Word[][] = [];
  for (const rawLine of rawLines) {
    const rawWords = rawLine?.[0] ?? [];
    const words: Word[] = [];
    for (const word of rawWords) {
      words.push({
        x1: Number(word[0]),
        y1: Number(word[1]),
        x2: Number(word[2]),
        y2: Number(word[3]),
        text: String(word[word.length - 1]),
      });
    }
    if (words.length) lines.push(words);
  }
  return { pageWidth, pageHeight, lines };
}

type FlatWord = { tok: string; line: number; word: Word };

function flatten(page: RecognizerPage): FlatWord[] {
  const flat: FlatWord[] = [];
  page.lines.forEach((line, lineIndex) => {
    for (const word of line) {
      const tok = normalize(word.text);
      if (tok) flat.push({ tok, line: lineIndex, word });
    }
  });
  return flat;
}

// First index i >= from where flat[i..i+anchor.length) tokens equal `anchor`.
function findAnchor(flat: FlatWord[], anchor: string[], from: number): number {
  outer: for (let i = from; i + anchor.length <= flat.length; i++) {
    for (let k = 0; k < anchor.length; k++) {
      if (flat[i + k].tok !== anchor[k]) continue outer;
    }
    return i;
  }
  return -1;
}

// Keep only the words whose tokens continue `query` in order (a subsequence),
// starting from query index `from`. Drops interleaved non-quote words such as a
// page's running header/footer (which the recogniser lists in reading order
// between the page break and the actual continuation). Returns the kept words
// and the advanced query index.
function filterToQuery(
  words: FlatWord[],
  query: string[],
  from: number,
): { kept: FlatWord[]; next: number } {
  const kept: FlatWord[] = [];
  let q = from;
  for (const fw of words) {
    if (q < query.length && fw.tok === query[q]) {
      kept.push(fw);
      q++;
    }
  }
  return { kept, next: q };
}

// One rect per line for a contiguous (reading-order) slice of words, y-flipped
// from the recogniser's top-left origin to PDF bottom-left.
function rectsFromSlice(slice: FlatWord[], pageHeight: number): number[][] {
  const byLine = new Map<number, Word[]>();
  for (const f of slice) {
    const words = byLine.get(f.line);
    if (words) words.push(f.word);
    else byLine.set(f.line, [f.word]);
  }
  const rects: number[][] = [];
  for (const words of byLine.values()) {
    const x1 = Math.min(...words.map((w) => w.x1));
    const x2 = Math.max(...words.map((w) => w.x2));
    const yTop = Math.min(...words.map((w) => w.y1)); // top-origin: smallest = highest
    const yBot = Math.max(...words.map((w) => w.y2));
    rects.push([x1, pageHeight - yBot, x2, pageHeight - yTop]);
  }
  return rects;
}

// Find the query span by its start/end anchors and build the highlight zone.
export function buildHighlightZone(
  pageIndex: number,
  startPage: RecognizerPage,
  nextPage: RecognizerPage | null,
  query: string,
): HighlightMatchResult {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { ok: false, error: "Error: empty highlight text" };
  }
  const startAnchor = tokens.slice(0, Math.min(ANCHOR, tokens.length));
  const endAnchor = tokens.slice(Math.max(0, tokens.length - ANCHOR));

  const flatA = flatten(startPage);
  const startIdx = findAnchor(flatA, startAnchor, 0);
  if (startIdx < 0) {
    return { ok: false, error: "Error: start of span not found on the page" };
  }

  // End anchor on the same page, at or after the start anchor.
  const endSame = findAnchor(flatA, endAnchor, startIdx);
  if (endSame >= 0) {
    const slice = flatA.slice(startIdx, endSame + endAnchor.length);
    const { kept } = filterToQuery(slice, tokens, 0);
    return {
      ok: true,
      zone: {
        pageIndex,
        rects: rectsFromSlice(kept, startPage.pageHeight),
        matched: kept.map((f) => f.word.text).join(" "),
        sortTop: kept[0].word.y1,
      },
    };
  }

  // Page break: end anchor on the next page.
  if (nextPage) {
    const flatB = flatten(nextPage);
    const endNext = findAnchor(flatB, endAnchor, 0);
    if (endNext >= 0) {
      const a = filterToQuery(flatA.slice(startIdx), tokens, 0);
      const b = filterToQuery(
        flatB.slice(0, endNext + endAnchor.length),
        tokens,
        a.next,
      );
      return {
        ok: true,
        zone: {
          pageIndex,
          rects: rectsFromSlice(a.kept, startPage.pageHeight),
          nextPageRects: rectsFromSlice(b.kept, nextPage.pageHeight),
          matched: [...a.kept, ...b.kept].map((f) => f.word.text).join(" "),
          sortTop: a.kept[0].word.y1,
        },
      };
    }
  }

  return { ok: false, error: "Error: end of span not found on the page" };
}
