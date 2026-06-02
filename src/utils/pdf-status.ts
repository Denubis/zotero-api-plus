// Pure functional core: classify the PDF-attachment outcome of an
// add-item-by-id call into the `pdf` field returned per item. No Zotero
// dependency, so it is unit-testable without a Zotero context.

export type PdfStatus = "present" | "fetched" | "unavailable" | "error";

// What the (imperative-shell) fetch attempt produced. `null` means no attempt
// ran (e.g. the item already had a PDF, or — defensively — was skipped).
export type FetchOutcome = "attached" | "none" | "error";

export function classifyPdfStatus(
  alreadyHadPdf: boolean,
  outcome: FetchOutcome | null,
): PdfStatus {
  if (alreadyHadPdf) return "present";
  switch (outcome) {
    case "attached":
      return "fetched";
    case "error":
      return "error";
    case "none":
    case null:
      return "unavailable";
  }
}
