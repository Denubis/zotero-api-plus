declare const _globalThis: {
  [key: string]: any;
  Zotero: _ZoteroTypes.Zotero;
  ztoolkit: ZToolkit;
  addon: typeof addon;
};

declare type ZToolkit = ReturnType<
  typeof import("../src/utils/ztoolkit").createZToolkit
>;

declare const ztoolkit: ZToolkit;

declare const rootURI: string;

declare const addon: import("../src/addon").default;

declare const __env__: "production" | "development";

declare namespace Zotero {
  namespace Server {
    namespace LocalAPI {
      class Schema {
        supportedMethods?: string[];
        supportedDataTypes?: string[];
        permitBookmarklet?: boolean;
        run(request: any): Promise<[number, string, string]>;
      }
      let Plus: new () => Schema;
      let AddItemEndpoint: new () => Schema;
      let GetSelectedCollectionEndpoint: new () => Schema;
      let GetLibrariesEndpoint: new () => Schema;
      let CreateCollectionEndpoint: new () => Schema;
      let OpenPdfEndpoint: new () => Schema;
      let AddNoteEndpoint: new () => Schema;
      let ReadNoteEndpoint: new () => Schema;
      let ReadAnnotationsEndpoint: new () => Schema;
      let AddHighlightEndpoint: new () => Schema;
      let DeleteAnnotationEndpoint: new () => Schema;
      let RunAutoExportEndpoint: new () => Schema;
    }
    const Endpoints: {
      [key: string]: any;
    };
  }

  // Better BibTeX's exposed singleton, present only when BBT is installed (so the
  // run-autoexport endpoint probes `Zotero.BetterBibTeX != null` first). This is
  // BBT's INTERNAL API, pinned to BBT 9.0.31 — re-confirm get/all/run and the
  // entry shape against the installed BBT after any BBT upgrade. The entry type
  // is the single source of truth in src/utils/run-autoexport.ts.
  interface BetterBibTeXAutoExport {
    get(
      path: string,
    ): import("../src/utils/run-autoexport").AutoExportEntry | undefined;
    all(): import("../src/utils/run-autoexport").AutoExportEntry[];
    run(path: string): void;
  }
  interface BetterBibTeXAPI {
    // true while BBT is mid-startup (a getter over Ready.pending in BBT).
    starting: boolean;
    // Optional: not yet assigned while BBT is starting, so callers must guard it
    // (the run-autoexport shell does: `bbt && !bbt.starting ? bbt.AutoExport : …`).
    AutoExport?: BetterBibTeXAutoExport;
  }
  let BetterBibTeX: BetterBibTeXAPI | undefined;
}
