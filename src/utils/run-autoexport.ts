// Pure functional core for the run-autoexport endpoint. No Zotero dependency, so
// it is unit-testable without a Zotero context. The imperative shell (the
// endpoint in addon.ts) probes Better BibTeX, reads the registry via
// AutoExport.all(), and fires AutoExport.run() for the path this core selects.
//
// The endpoint is a TRIGGER, not an adjudicator: it forces BBT's own registered
// auto-export to run and reports only that it fired. It makes no success claim,
// because BBT swallows export failures (the run always lands on status "done"
// with error ""). The caller proves the file is current against ground truth —
// the citekey in the bib and the render on disk. So nothing in this core inspects
// BBT run status to judge success; `status` is read only for the alreadyRunning
// guard, which decides whether to fire, not whether the export worked.

// The subset of a BBT AutoExport registry entry the endpoint reads. The live
// entry (BBT 9.0.31) carries more (error, created, updated, enabled, …); we type
// only what the response needs. `id` is the scope id — the collectionID for a
// "collection" export, the libraryID for a "library" export. Internal BBT API,
// pinned to 9.0.31: re-confirm the shape after a BBT upgrade.
export type AutoExportEntry = {
  path: string;
  type: string;
  id?: number;
  translatorID?: string;
  recursive?: boolean;
  status?: string;
};

export type ParsePathResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

// The one-line usage string the path-less probe gets back. The helper detects a
// registered endpoint by the 400 (present) vs Zotero's generic 404 (absent), so
// this body is informational only.
const USAGE =
  'Error: POST application/json {"path": "<absolute output path of a registered BBT auto-export>"}';

// Parse the POST/JSON body into a validated path (or a 400 usage message). The
// path is the bib output the user named in "Export Collection → Keep updated";
// the caller supplies it from the project's own bibliography declaration, never a
// guess. Trimmed so a stray newline from the caller does not defeat the match.
export function parseRunAutoExportParams(raw: {
  path?: unknown;
}): ParsePathResult {
  if (typeof raw.path !== "string" || !raw.path.trim()) {
    return { ok: false, error: USAGE };
  }
  return { ok: true, path: raw.path.trim() };
}

// Normalise a path for tolerant comparison: trim, then drop a single trailing
// slash (a bib output path names a file, so a trailing slash is an artefact).
// Deliberately lexical — symlink/realpath resolution is a filesystem effect and
// stays out of the pure core. Exact match covers the common case, because the
// caller reads the path from the same string the user gave BBT.
export function normalizeExportPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length > 1 && trimmed.endsWith("/")) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

// Find the registered auto-export for `path`: exact match first, then a
// lexically-normalised match. Returns the entry or null. On a real miss the
// caller surfaces the registered paths so the user can reconcile their own.
export function matchAutoExport(
  path: string,
  entries: readonly AutoExportEntry[],
): AutoExportEntry | null {
  const exact = entries.find((e) => e.path === path);
  if (exact) return exact;
  const target = normalizeExportPath(path);
  const norm = entries.find((e) => normalizeExportPath(e.path) === target);
  return norm ?? null;
}

// The observable facts the endpoint gathers, in the order the contract validates
// them. `entries` is what AutoExport.all() returned (or [] when the shell never
// consulted it, because the path was missing or BBT was not ready).
export type RunAutoExportObservations = {
  parse: ParsePathResult;
  bbtPresent: boolean; // Zotero.BetterBibTeX exists (the install probe)
  bbtReady: boolean; // AutoExport is available and BBT is not mid-startup
  entries: readonly AutoExportEntry[];
};

// The response tuple to send, plus `fire`: the registry path the shell should
// pass to AutoExport.run(), or null when nothing should fire (bad request, BBT
// down/starting, no matching export, or an export already running).
export type RunAutoExportDecision = {
  response: [number, string, string];
  fire: string | null;
};

const JSON_CT = "application/json";

// Decide the response (and whether to fire) from the gathered observations. This
// is the whole validation order in one pure place, so the path-less probe's 400
// is provably independent of BBT state.
export function decideRunAutoExport(
  obs: RunAutoExportObservations,
): RunAutoExportDecision {
  // 1. No path → 400, checked first and independent of BBT.
  if (!obs.parse.ok) {
    return { response: [400, "text/plain", obs.parse.error], fire: null };
  }
  const path = obs.parse.path;

  // 2. BBT not installed → 503 bbt-unavailable (distinct from a 404 = endpoint
  //    absent, so the caller tells the two apart).
  if (!obs.bbtPresent) {
    return {
      response: [
        503,
        JSON_CT,
        JSON.stringify({
          status: "bbt-unavailable",
          message: "Better BibTeX is not installed in this Zotero.",
        }),
      ],
      fire: null,
    };
  }

  // 3. BBT installed but AutoExport not ready (mid-startup) → 503 bbt-starting;
  //    the caller retries.
  if (!obs.bbtReady) {
    return {
      response: [
        503,
        JSON_CT,
        JSON.stringify({
          status: "bbt-starting",
          message: "Better BibTeX is still starting; retry shortly.",
        }),
      ],
      fire: null,
    };
  }

  // 4. No registered auto-export for the path → 404 no-autoexport, listing the
  //    paths BBT actually holds. A setup gap to surface, never to paper over.
  const entry = matchAutoExport(path, obs.entries);
  if (!entry) {
    return {
      response: [
        404,
        JSON_CT,
        JSON.stringify({
          status: "no-autoexport",
          path,
          registeredPaths: obs.entries.map((e) => e.path),
        }),
      ],
      fire: null,
    };
  }

  // 5. Fire the registered export and report only that we triggered it. Skip
  //    firing when BBT already has a run in flight for this path (the cheap
  //    concurrency guard): a second forced run would interleave on the same git
  //    tree and registry entry for no gain, since the caller verifies the file.
  const alreadyRunning = entry.status === "running";
  return {
    response: [
      200,
      JSON_CT,
      JSON.stringify({
        status: "triggered",
        path: entry.path,
        type: entry.type,
        scopeID: entry.id,
        translatorID: entry.translatorID,
        recursive: entry.recursive ?? false,
        ...(alreadyRunning ? { alreadyRunning: true } : {}),
      }),
    ],
    // Fire the REGISTRY path (entry.path), not the caller's input, because a
    // normalised match may differ from what AutoExport.get() keys on.
    fire: alreadyRunning ? null : entry.path,
  };
}
