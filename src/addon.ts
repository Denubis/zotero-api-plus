// Zotero 本地 API Plus - 扩展功能入口文件
// 提供通过标识符添加项目的 API 端点

import { config } from "../package.json";
import { ColumnOptions, DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import {
  classifyPdfStatus,
  type FetchOutcome,
  type PdfStatus,
} from "./utils/pdf-status";
import {
  parseOpenPdfParams,
  pageToPageIndex,
  isPageInRange,
} from "./utils/open-pdf";
import {
  parseAddNoteParams,
  parseReadNoteParams,
  buildAnnotationSortIndex,
  buildNotePosition,
} from "./utils/notes";
import {
  parseAddHighlightParams,
  parseAddHighlightRectsParams,
  extractRecognizerPage,
  buildHighlightZone,
  buildRectsZone,
} from "./utils/highlight";
import {
  parseReadAnnotationsParams,
  parseDeleteAnnotationParams,
} from "./utils/annotations";

// add-item-by-id 响应中每个新增项目的形状。
type ItemResult = {
  title: string;
  key: string;
  pdf: PdfStatus;
  attachmentID?: number;
};

// 定义 AddItemEndpoint 类

// 判断某个条目是否已挂有 PDF 附件（同步遍历子附件）。属于命令式外壳，
// 因此放在此处，而非纯函数模块 utils/pdf-status.ts 中。
function itemHasPdfAttachment(item: Zotero.Item): boolean {
  for (const id of item.getAttachments()) {
    const attachment = Zotero.Items.get(id);
    if (attachment && attachment.isPDFAttachment()) return true;
  }
  return false;
}

// Shared resolution for the key-driven endpoints (open-pdf, add-note, read-note).
// libraryID is a Zotero libraryID (NOT a groupID); attachment keys are unique per
// library, not globally. Given a libraryID it must exist (no silent fallback to
// My Library); omitted, search My Library then each group library. Returns the
// item, or a ready-to-send error tuple (400 unknown library, 404 unknown key).
async function resolveItemByKey(
  key: string,
  libraryID: number | undefined,
): Promise<{ item: Zotero.Item } | { error: [number, string, string] }> {
  if (libraryID !== undefined) {
    if (!Zotero.Libraries.exists(libraryID)) {
      return {
        error: [400, "text/plain", `Error: No library with ID ${libraryID}`],
      };
    }
    const item = await Zotero.Items.getByLibraryAndKeyAsync(libraryID, key);
    if (!item) {
      return { error: [404, "text/plain", `Error: No item with key ${key}`] };
    }
    return { item };
  }

  const libraryIDs = [
    Zotero.Libraries.userLibraryID,
    ...Zotero.Groups.getAll().map((g) => g.libraryID),
  ];
  for (const id of libraryIDs) {
    const item = await Zotero.Items.getByLibraryAndKeyAsync(id, key);
    if (item) return { item };
  }
  return { error: [404, "text/plain", `Error: No item with key ${key}`] };
}

// Resolve an item to a PDF attachment: the item itself if it is a PDF
// attachment, else (a regular item) its first PDF child attachment, else null.
function resolvePdfAttachment(item: Zotero.Item): Zotero.Item | null {
  if (item.isPDFAttachment()) return item;
  if (item.isRegularItem()) {
    for (const id of item.getAttachments()) {
      const child = Zotero.Items.get(id);
      if (child && child.isPDFAttachment()) return child;
    }
  }
  return null;
}

// The read-note JSON shape for one note annotation. `page` is the 1-based
// physical page recovered from the stored 0-based pageIndex (null if unparsable).
function noteAnnotationToJSON(annotation: Zotero.Item): {
  key: string;
  page: number | null;
  pageLabel: string;
  comment: string;
  color: string;
  type: string;
} {
  let pageIndex: number | null = null;
  try {
    const pos = JSON.parse(annotation.annotationPosition);
    if (typeof pos?.pageIndex === "number") pageIndex = pos.pageIndex;
  } catch (e: any) {
    Zotero.logError(e);
  }
  return {
    key: annotation.key,
    page: pageIndex === null ? null : pageIndex + 1,
    pageLabel: annotation.annotationPageLabel,
    comment: annotation.annotationComment,
    color: annotation.annotationColor,
    type: annotation.annotationType,
  };
}

// The read-annotations JSON shape for one annotation of ANY type. Unlike
// noteAnnotationToJSON it also carries `text` (annotationText — the highlighted
// span for highlights, empty for notes), which batch-mode dedup keys on.
function annotationToJSON(annotation: Zotero.Item): {
  key: string;
  type: string;
  page: number | null;
  pageLabel: string;
  comment: string;
  color: string;
  text: string;
} {
  let pageIndex: number | null = null;
  try {
    const pos = JSON.parse(annotation.annotationPosition);
    if (typeof pos?.pageIndex === "number") pageIndex = pos.pageIndex;
  } catch (e: any) {
    Zotero.logError(e);
  }
  return {
    key: annotation.key,
    type: annotation.annotationType,
    page: pageIndex === null ? null : pageIndex + 1,
    pageLabel: annotation.annotationPageLabel,
    comment: annotation.annotationComment,
    color: annotation.annotationColor,
    text: annotation.annotationText ?? "",
  };
}

// Plus 端点 - 检查 API 是否正常运行
Zotero.Server.LocalAPI.Plus = class extends Zotero.Server.LocalAPI.Schema {
  supportedMethods = ["GET"];

  async run(_: any): Promise<[number, string, string]> {
    return [200, "text/plain", "Zotero Local API Plus is running."];
  }
};

// 添加项目端点 - 通过标识符（如 DOI、ISBN 等）添加项目到 Zotero
Zotero.Server.LocalAPI.AddItemEndpoint = class extends (
  Zotero.Server.LocalAPI.Schema
) {
  supportedMethods = ["POST"];
  supportedDataTypes = ["application/json"];

  // 处理添加项目请求
  // req.data.identifier: 标识符字符串（支持 DOI、ISBN、PMID 等）
  // req.data.collectionKey: 可选的收藏夹 key
  async run(req: {
    data: { identifier: string; groupID?: number; collectionKey?: string };
  }): Promise<[number, string, string]> {
    try {
      const data = req.data;
      const identifierStr = data.identifier;
      const groupID = data.groupID;
      const collectionKey = data.collectionKey;

      // 验证标识符是否提供
      if (!identifierStr) {
        return [400, "text/plain", "Error: No identifier provided"];
      }

      // 从字符串中提取标识符
      const identifiers = Zotero.Utilities.extractIdentifiers(identifierStr);
      if (!identifiers.length) {
        return [400, "text/plain", "Error: Could not parse identifier"];
      }

      // 解析目标库：给了 groupID 就用对应的群组库，否则用 My Library。
      // 校验在任何网络调用之前完成；失败立即返回 400（不再静默回退到 My Library）。
      let libraryID = Zotero.Libraries.userLibraryID;
      if (groupID !== undefined) {
        const groupLibraryID = Zotero.Groups.getLibraryIDFromGroupID(groupID);
        if (groupLibraryID === false) {
          return [400, "text/plain", `Error: No group with ID ${groupID}`];
        }
        libraryID = groupLibraryID;
      }

      // 解析目标收藏夹（在目标库内）。给了 key 但找不到则 400。
      let collections: number[] | false = false;
      if (collectionKey) {
        const col = Zotero.Collections.getByLibraryAndKey(
          libraryID,
          collectionKey,
        );
        if (!col) {
          return [
            400,
            "text/plain",
            `Error: No collection with key ${collectionKey} in the target library`,
          ];
        }
        collections = [col.id];
      }

      // 遍历每个标识符并添加对应的项目
      const newItems: Zotero.Item[] = [];
      for (const identifier of identifiers) {
        const translate = new Zotero.Translate.Search();
        translate.setIdentifier(identifier);

        // 获取适用于该标识符的翻译器
        const translators = await translate.getTranslators();
        if (!translators.length) continue;

        translate.setTranslator(translators);

        try {
          // 执行翻译并保存项目，包括附件
          const items = await translate.translate({
            libraryID,
            collections,
            saveAttachments: true,
          });
          newItems.push(...items);
        } catch (e: any) {
          // 记录错误但继续处理其他标识符
          Zotero.logError(e);
        }
      }

      // 添加完成后尝试获取全文 PDF（"Find Available PDF" 的无界面等价方法）。
      // 翻译器只在部分情况下附带附件；DOI 元数据翻译器不会。因此对尚无 PDF 的
      // 项目调用 addAvailableFile（单数形式，调用链不含任何窗口/进度 UI，可在
      // Server 端点中安全调用）。逐项独立 try/catch，单项失败不影响整批。
      const itemResults: ItemResult[] = [];
      // newItems are the regular bibliographic items saved for the identifiers;
      // DOI/ISBN/PMID search translators don't return standalone top-level
      // attachments, so getField("title") and the PDF lookup apply to real items.
      for (const item of newItems) {
        const alreadyHadPdf = itemHasPdfAttachment(item);
        let outcome: FetchOutcome | null = null;
        let attachmentID: number | undefined;

        if (!alreadyHadPdf) {
          try {
            const attachment = await Zotero.Attachments.addAvailableFile(item);
            if (attachment) {
              outcome = "attached";
              attachmentID = attachment.id;
            } else {
              outcome = "none";
            }
          } catch (e: any) {
            // 记录错误但继续处理其他项目
            Zotero.logError(e);
            outcome = "error";
          }
        }

        const entry: ItemResult = {
          title: item.getField("title"),
          key: item.key,
          pdf: classifyPdfStatus(alreadyHadPdf, outcome),
        };
        if (attachmentID !== undefined) {
          entry.attachmentID = attachmentID;
        }
        itemResults.push(entry);
      }

      // 返回添加结果
      if (newItems.length > 0) {
        return [
          200,
          "application/json",
          JSON.stringify({
            status: "success",
            addedCount: newItems.length,
            // 由 itemResults 派生，确保与 items[] 中的标题不会分叉。
            titles: itemResults.map((r) => r.title),
            items: itemResults,
          }),
        ];
      } else {
        return [404, "text/plain", "Failed to find or save any items."];
      }
    } catch (e: any) {
      // 捕获并返回服务器错误
      return [500, "text/plain", "Internal Server Error: " + e.message];
    }
  }
};

// 添加项目端点 - 获取当前 Collection 列表
Zotero.Server.LocalAPI.GetSelectedCollectionEndpoint = class extends (
  Zotero.Server.LocalAPI.Schema
) {
  supportedMethods = ["GET"];

  async run(_: any): Promise<[number, string, string]> {
    try {
      // 获取当前活动的窗口面板
      const collection = Zotero.getActiveZoteroPane().getSelectedCollection();

      if (collection) {
        ztoolkit.log("当前 Collection 名称:", collection.name);
        ztoolkit.log("当前 Collection Key:", collection.key);
        // 同时返回库标识，便于与 add-item-by-id 的 groupID 目标组合使用。
        const selLibraryID = collection.libraryID;
        // getGroupIDFromLibraryID is typed `number` (not `number | false`); the
        // guard ensures it is only called for a group library, so it always
        // yields a real groupID here.
        const selGroupID =
          selLibraryID === Zotero.Libraries.userLibraryID
            ? null
            : Zotero.Groups.getGroupIDFromLibraryID(selLibraryID);
        return [
          200,
          "application/json",
          JSON.stringify({
            name: collection.name,
            key: collection.key,
            libraryID: selLibraryID,
            groupID: selGroupID,
          }),
        ];
      } else {
        // 如果用户选中了“我的出版物”或“未分类条目”，getSelectedCollection 会返回 null
        ztoolkit.log("当前未选中特定 Collection (可能在根目录或特殊分类下)");
        return [500, "text/plain", "No Collection selected."];
      }
    } catch (e: any) {
      // 捕获并返回服务器错误
      return [500, "text/plain", "Internal Server Error: " + e.message];
    }
  }
};

// Libraries 端点 - 列出 My Library 与所有群组库及各自的收藏夹，
// 便于发现 groupID 与 collectionKey（add-item-by-id 的目标参数）。
Zotero.Server.LocalAPI.GetLibrariesEndpoint = class extends (
  Zotero.Server.LocalAPI.Schema
) {
  supportedMethods = ["GET"];

  async run(_: any): Promise<[number, string, string]> {
    try {
      const collectionsFor = (libraryID: number) =>
        Zotero.Collections.getByLibrary(libraryID, true).map((c) => ({
          key: c.key,
          name: c.name,
          parentKey: c.parentKey || null,
        }));

      const userLibraryID = Zotero.Libraries.userLibraryID;
      const libraries: Array<{
        type: "user" | "group";
        libraryID: number;
        groupID?: number;
        name: string;
        collections: Array<{
          key: string;
          name: string;
          parentKey: string | null;
        }>;
      }> = [
        {
          type: "user",
          libraryID: userLibraryID,
          name: "My Library",
          collections: collectionsFor(userLibraryID),
        },
      ];

      // libraryTypeID 对群组库即为 groupID（来自 LibraryAbstract，非可选）。
      for (const group of Zotero.Groups.getAll()) {
        libraries.push({
          type: "group",
          libraryID: group.libraryID,
          groupID: group.libraryTypeID,
          name: group.name,
          collections: collectionsFor(group.libraryID),
        });
      }

      return [200, "application/json", JSON.stringify({ libraries })];
    } catch (e: any) {
      return [500, "text/plain", "Internal Server Error: " + e.message];
    }
  }
};

// Create-Collection 端点 - 在目标库（默认 My Library，或给定 groupID 的群组库）
// 中按名查找或创建收藏夹。幂等：同库、同父、同名已存在则返回既有的。
Zotero.Server.LocalAPI.CreateCollectionEndpoint = class extends (
  Zotero.Server.LocalAPI.Schema
) {
  supportedMethods = ["POST"];
  supportedDataTypes = ["application/json"];

  async run(req: {
    data: { name?: string; groupID?: number; parentCollectionKey?: string };
  }): Promise<[number, string, string]> {
    try {
      const { name, groupID, parentCollectionKey } = req.data;

      if (!name || !name.trim()) {
        return [400, "text/plain", "Error: No collection name provided"];
      }

      // 解析目标库
      let libraryID = Zotero.Libraries.userLibraryID;
      if (groupID !== undefined) {
        const groupLibraryID = Zotero.Groups.getLibraryIDFromGroupID(groupID);
        if (groupLibraryID === false) {
          return [400, "text/plain", `Error: No group with ID ${groupID}`];
        }
        libraryID = groupLibraryID;
      }

      // 解析父收藏夹（若指定），校验其在目标库内存在
      let parentKey: string | undefined;
      if (parentCollectionKey) {
        const parent = Zotero.Collections.getByLibraryAndKey(
          libraryID,
          parentCollectionKey,
        );
        if (!parent) {
          return [
            400,
            "text/plain",
            `Error: No parent collection with key ${parentCollectionKey} in the target library`,
          ];
        }
        parentKey = parent.key;
      }

      // 幂等查找：同库、同父、同名已存在则复用，否则新建。
      const existing = Zotero.Collections.getByLibrary(libraryID, true).find(
        (c) => c.name === name && (c.parentKey || null) === (parentKey || null),
      );

      let collection: Zotero.Collection;
      let created: boolean;
      if (existing) {
        collection = existing;
        created = false;
      } else {
        collection = new Zotero.Collection({ name, libraryID, parentKey });
        await collection.saveTx();
        created = true;
      }

      // getGroupIDFromLibraryID is typed `number` (not `number | false`); the
      // guard ensures it is only called for a group library, so it always
      // yields a real groupID here.
      const groupOut =
        libraryID === Zotero.Libraries.userLibraryID
          ? null
          : Zotero.Groups.getGroupIDFromLibraryID(libraryID);

      return [
        200,
        "application/json",
        JSON.stringify({
          status: "success",
          created,
          collection: {
            key: collection.key,
            name: collection.name,
            parentKey: collection.parentKey || null,
            libraryID,
            groupID: groupOut,
          },
        }),
      ];
    } catch (e: any) {
      return [500, "text/plain", "Internal Server Error: " + e.message];
    }
  }
};

// Open-PDF 端点 - 在 Zotero 内置阅读器中打开某个 PDF 附件并跳到指定页。
// GET so a plain http://localhost:23119/api/plus/open-pdf?key=…&page=…&libraryID=…
// link is clickable anywhere (the zotero:// scheme has no working handler on this
// machine). page is the 1-based PHYSICAL PDF page; we convert to Zotero's 0-based
// pageIndex. Params arrive as req.searchParams (a URLSearchParams), exactly as the
// core LocalAPI GET endpoints read them.
Zotero.Server.LocalAPI.OpenPdfEndpoint = class extends (
  Zotero.Server.LocalAPI.Schema
) {
  supportedMethods = ["GET"];

  async run(req: {
    searchParams?: URLSearchParams;
  }): Promise<[number, string, string]> {
    try {
      const sp = req.searchParams;
      const parsed = parseOpenPdfParams({
        key: sp?.get("key") ?? null,
        page: sp?.get("page") ?? null,
        libraryID: sp?.get("libraryID") ?? null,
      });
      if (!parsed.ok) {
        return [400, "text/plain", parsed.error];
      }
      const { key, page, libraryID } = parsed.params;

      // 解析目标库与条目，再解析到 PDF 附件（见 resolveItemByKey/resolvePdfAttachment）。
      const resolved = await resolveItemByKey(key, libraryID);
      if ("error" in resolved) return resolved.error;
      const attachment = resolvePdfAttachment(resolved.item);
      if (!attachment) {
        return [404, "text/plain", `Error: No PDF attachment for key ${key}`];
      }

      // 校验页码在范围内。getFullText(id, 1) 即便 maxPages=1，也会从 PDF 目录返回
      // 真实的 totalPages，因此可拒绝越界页码而非静默截断。若 PDF 读不出页数
      // （加密/损坏），记录并继续打开（尽力而为），不因此拒绝一个本可打开的文件。
      let totalPages: number | null = null;
      try {
        const fullText = await Zotero.PDFWorker.getFullText(attachment.id, 1);
        totalPages =
          typeof fullText?.totalPages === "number" ? fullText.totalPages : null;
      } catch (e: any) {
        Zotero.logError(e);
      }
      if (totalPages !== null && !isPageInRange(page, totalPages)) {
        return [
          400,
          "text/plain",
          `Error: page ${page} is beyond the PDF (it has ${totalPages} page(s))`,
        ];
      }

      // 在 Zotero 内置阅读器中打开并跳页。这里刻意直接调用 Zotero.Reader.open，
      // 而非 zotero://open-pdf 走的 Zotero.FileHandlers.open：后者在用户设置了
      // fileHandler.pdf 时会转交外部应用，而本端点的契约是内置阅读器。Reader.open
      // 自带去重——默认 allowDuplicate(false) 时，会选中/导航该条目已打开的标签页
      // 而非重复打开。pageIndex 为 0 基（page - 1），与 ZoteroProtocolHandler 中
      // `location.pageIndex = parseInt(page) - 1` 一致。
      await Zotero.Reader.open(attachment.id, {
        pageIndex: pageToPageIndex(page),
      });

      return [
        200,
        "application/json",
        JSON.stringify({
          ok: true,
          key: attachment.key,
          page,
          title: attachment.getDisplayTitle(),
        }),
      ];
    } catch (e: any) {
      return [500, "text/plain", "Internal Server Error: " + e.message];
    }
  }
};

// Add-Note 端点 - 在某 PDF 页上创建一个页定位的 note 标注（显示在阅读器标注栏）。
// POST/JSON：{ key, page(1基物理页), text, libraryID?, color? }。通过官方
// Zotero.Annotations.saveFromJSON 创建（自带版本兼容性处理），key 自动生成。
// 标注图标位置用一个与页面尺寸无关的固定矩形（取页面尺寸以摆放到自然的左上角
// 需读取 PDF 尺寸，暂无无界面 API——留待增强）。
Zotero.Server.LocalAPI.AddNoteEndpoint = class extends (
  Zotero.Server.LocalAPI.Schema
) {
  supportedMethods = ["POST"];
  supportedDataTypes = ["application/json"];

  async run(req: {
    data?: Record<string, unknown>;
  }): Promise<[number, string, string]> {
    try {
      const parsed = parseAddNoteParams(req.data ?? {});
      if (!parsed.ok) {
        return [400, "text/plain", parsed.error];
      }
      const { key, page, text, libraryID, color } = parsed.params;

      const resolved = await resolveItemByKey(key, libraryID);
      if ("error" in resolved) return resolved.error;
      const attachment = resolvePdfAttachment(resolved.item);
      if (!attachment) {
        return [404, "text/plain", `Error: No PDF attachment for key ${key}`];
      }

      // 与 open-pdf 一致地校验页码：getFullText(id, 1) 返回真实 totalPages，越界 → 400。
      let totalPages: number | null = null;
      try {
        const fullText = await Zotero.PDFWorker.getFullText(attachment.id, 1);
        totalPages =
          typeof fullText?.totalPages === "number" ? fullText.totalPages : null;
      } catch (e: any) {
        Zotero.logError(e);
      }
      if (totalPages !== null && !isPageInRange(page, totalPages)) {
        return [
          400,
          "text/plain",
          `Error: page ${page} is beyond the PDF (it has ${totalPages} page(s))`,
        ];
      }

      const pageIndex = pageToPageIndex(page);
      // AnnotationJson 类型把若干字段标为必填，但 saveFromJSON 运行时并不读取
      // id/text/libraryID/readOnly/dateModified（note 类型用 comment 承载正文），
      // 这里填入无害的占位值以满足类型。
      const json: _ZoteroTypes.Annotations.AnnotationJson = {
        id: "",
        key: Zotero.Utilities.generateObjectKey(),
        libraryID: attachment.libraryID,
        type: "note",
        text: "",
        comment: text,
        color: color ?? Zotero.Annotations.DEFAULT_COLOR,
        pageLabel: String(page),
        sortIndex: buildAnnotationSortIndex(pageIndex, 0, 0),
        position: buildNotePosition(pageIndex),
        readOnly: false,
        dateModified: "",
      };
      const created = await Zotero.Annotations.saveFromJSON(attachment, json);

      return [
        200,
        "application/json",
        JSON.stringify({
          ok: true,
          key: created.key,
          page,
          attachmentKey: attachment.key,
        }),
      ];
    } catch (e: any) {
      return [500, "text/plain", "Internal Server Error: " + e.message];
    }
  }
};

// Read-Note 端点 - GET。key 解析为某 note 标注 → 返回单条；解析为父条目/PDF 附件
// → 返回该文档全部 note 标注 { notes: [...] }。其它标注（如 highlight）走单条
// 分支时返回 400（本端点只读 note）。
Zotero.Server.LocalAPI.ReadNoteEndpoint = class extends (
  Zotero.Server.LocalAPI.Schema
) {
  supportedMethods = ["GET"];

  async run(req: {
    searchParams?: URLSearchParams;
  }): Promise<[number, string, string]> {
    try {
      const sp = req.searchParams;
      const parsed = parseReadNoteParams({
        key: sp?.get("key") ?? null,
        libraryID: sp?.get("libraryID") ?? null,
      });
      if (!parsed.ok) {
        return [400, "text/plain", parsed.error];
      }
      const { key, libraryID } = parsed.params;

      const resolved = await resolveItemByKey(key, libraryID);
      if ("error" in resolved) return resolved.error;
      const item = resolved.item;

      // 单条：key 指向一个 note 标注。
      if (item.isAnnotation()) {
        if (item.annotationType !== "note") {
          return [400, "text/plain", `Error: ${key} is not a note annotation`];
        }
        return [
          200,
          "application/json",
          JSON.stringify({ ok: true, ...noteAnnotationToJSON(item) }),
        ];
      }

      // 列表：key 指向父条目或 PDF 附件 → 汇总其 PDF 附件上的全部 note 标注。
      const attachments: Zotero.Item[] = [];
      if (item.isPDFAttachment()) {
        attachments.push(item);
      } else if (item.isRegularItem()) {
        for (const id of item.getAttachments()) {
          const child = Zotero.Items.get(id);
          if (child && child.isPDFAttachment()) attachments.push(child);
        }
      }

      const notes: ReturnType<typeof noteAnnotationToJSON>[] = [];
      for (const att of attachments) {
        for (const ann of att.getAnnotations()) {
          if (ann.annotationType === "note") {
            notes.push(noteAnnotationToJSON(ann));
          }
        }
      }
      return [200, "application/json", JSON.stringify({ ok: true, notes })];
    } catch (e: any) {
      return [500, "text/plain", "Internal Server Error: " + e.message];
    }
  }
};

// Read-Annotations 端点 - 通用读取，可返回 highlight（read-note 只返回 note）。
// GET ?key=&type=note|highlight|all（默认 all）&libraryID=。注释 key → 单条；
// 父条目/PDF key → 该 PDF 上按 type 过滤的标注列表。每条含 text（annotationText，
// highlight 的高亮文本；note 为空），供批量模式按 comment 标记去重。
Zotero.Server.LocalAPI.ReadAnnotationsEndpoint = class extends (
  Zotero.Server.LocalAPI.Schema
) {
  supportedMethods = ["GET"];

  async run(req: {
    searchParams?: URLSearchParams;
  }): Promise<[number, string, string]> {
    try {
      const sp = req.searchParams;
      const parsed = parseReadAnnotationsParams({
        key: sp?.get("key") ?? null,
        type: sp?.get("type") ?? null,
        libraryID: sp?.get("libraryID") ?? null,
      });
      if (!parsed.ok) {
        return [400, "text/plain", parsed.error];
      }
      const { key, type, libraryID } = parsed.params;

      const resolved = await resolveItemByKey(key, libraryID);
      if ("error" in resolved) return resolved.error;
      const item = resolved.item;

      // 单条：key 指向一个标注。type 过滤（非 all）时校验类型。
      if (item.isAnnotation()) {
        if (type !== "all" && item.annotationType !== type) {
          return [
            400,
            "text/plain",
            `Error: ${key} is a ${item.annotationType} annotation, not ${type}`,
          ];
        }
        return [
          200,
          "application/json",
          JSON.stringify({ ok: true, ...annotationToJSON(item) }),
        ];
      }

      // 列表：父条目或 PDF 附件 → 汇总其 PDF 附件上按 type 过滤的标注。
      const attachments: Zotero.Item[] = [];
      if (item.isPDFAttachment()) {
        attachments.push(item);
      } else if (item.isRegularItem()) {
        for (const id of item.getAttachments()) {
          const child = Zotero.Items.get(id);
          if (child && child.isPDFAttachment()) attachments.push(child);
        }
      }

      const annotations: ReturnType<typeof annotationToJSON>[] = [];
      for (const att of attachments) {
        for (const ann of att.getAnnotations()) {
          if (type === "all" || ann.annotationType === type) {
            annotations.push(annotationToJSON(ann));
          }
        }
      }
      return [
        200,
        "application/json",
        JSON.stringify({ ok: true, annotations }),
      ];
    } catch (e: any) {
      return [500, "text/plain", "Internal Server Error: " + e.message];
    }
  }
};

// add-highlight 的结构化错误：{ok:false, code, message}，HTTP 状态由 code 决定。
// 消费方按 code 分支其“放置失败 → 改放页锚 note”的回退（与 page_beyond_cap /
// no_text_layer / span_not_found 同等处理）。注意：条目/库解析失败（未知 key/库、
// 非 PDF）仍由 resolveItemByKey 以 text/plain 404/400 返回，不带 code。
const HIGHLIGHT_ERROR_STATUS: Record<string, number> = {
  bad_request: 400,
  no_pdf_attachment: 404,
  empty_text: 400,
  span_not_found: 422,
  no_text_layer: 422,
  page_beyond_cap: 422,
  page_beyond_document: 400,
  internal: 500,
};

function highlightError(
  code: string,
  message: string,
): [number, string, string] {
  const status = HIGHLIGHT_ERROR_STATUS[code] ?? 400;
  return [
    status,
    "application/json",
    JSON.stringify({ ok: false, code, message }),
  ];
}

// 共享保存：构造 highlight 标注 JSON（左下原点 rects）并落库，返回新建标注。
async function saveHighlightAnnotation(
  attachment: Zotero.Item,
  opts: {
    page: number;
    pageIndex: number;
    sortTop: number;
    rects: number[][];
    nextPageRects?: number[][];
    text: string;
    comment?: string;
    color?: string;
  },
): Promise<Zotero.Item> {
  const position: _ZoteroTypes.Annotations.AnnotationJson["position"] = {
    pageIndex: opts.pageIndex,
    rects: opts.rects,
  };
  if (opts.nextPageRects) {
    position.nextPageRects = opts.nextPageRects;
  }
  const json: _ZoteroTypes.Annotations.AnnotationJson = {
    id: "",
    key: Zotero.Utilities.generateObjectKey(),
    libraryID: attachment.libraryID,
    type: "highlight",
    text: opts.text,
    comment: opts.comment ?? "",
    color: opts.color ?? Zotero.Annotations.DEFAULT_COLOR,
    pageLabel: String(opts.page),
    sortIndex: buildAnnotationSortIndex(opts.pageIndex, 0, opts.sortTop),
    position,
    readOnly: false,
    dateModified: "",
  };
  return Zotero.Annotations.saveFromJSON(attachment, json);
}

// 文本模式：用 getRecognizerData 的逐词包围盒（仅前 5 页）按首/尾锚点定位跨度，
// 逐行生成矩形并把识别器的左上原点 y 翻回 PDF 左下；跨一个分页用 nextPageRects。
async function runAddHighlightText(
  data: Record<string, unknown>,
): Promise<[number, string, string]> {
  const parsed = parseAddHighlightParams(data);
  if (!parsed.ok) {
    return highlightError("bad_request", parsed.error);
  }
  const { key, page, text, libraryID, color, comment } = parsed.params;

  const resolved = await resolveItemByKey(key, libraryID);
  if ("error" in resolved) return resolved.error;
  const attachment = resolvePdfAttachment(resolved.item);
  if (!attachment) {
    return highlightError(
      "no_pdf_attachment",
      `Error: No PDF attachment for key ${key}`,
    );
  }

  // 识别器只解析前 5 页（maxPages=5，硬编码在 pdf-worker 内，插件无法放宽）。
  let recognizer: any;
  try {
    recognizer = await Zotero.PDFWorker.getRecognizerData(attachment.id);
  } catch (e: any) {
    Zotero.logError(e);
    return highlightError(
      "internal",
      "could not read PDF text layout: " + e.message,
    );
  }
  const pages = recognizer?.pages;
  if (!Array.isArray(pages)) {
    return highlightError("internal", "unexpected recognizer output");
  }

  const pageIndex = pageToPageIndex(page);
  if (pageIndex < 0 || pageIndex >= pages.length) {
    return highlightError(
      "page_beyond_cap",
      `Error: page ${page} is beyond the recognizer's reach (it reads only the first ${pages.length} page(s); the recognizer caps at 5 — use rects/position mode for later pages)`,
    );
  }

  const startPage = extractRecognizerPage(pages[pageIndex]);
  const nextPage =
    pageIndex + 1 < pages.length
      ? extractRecognizerPage(pages[pageIndex + 1])
      : null;

  const match = buildHighlightZone(pageIndex, startPage, nextPage, text);
  if (!match.ok) {
    return highlightError(match.code, match.message);
  }
  const zone = match.zone;

  const created = await saveHighlightAnnotation(attachment, {
    page,
    pageIndex,
    sortTop: zone.sortTop,
    rects: zone.rects,
    nextPageRects: zone.nextPageRects,
    text: zone.matched,
    comment,
    color,
  });

  return [
    200,
    "application/json",
    JSON.stringify({
      ok: true,
      key: created.key,
      page,
      matched: zone.matched,
      rects: zone.rects,
      ...(zone.nextPageRects ? { nextPageRects: zone.nextPageRects } : {}),
    }),
  ];
}

// 位置模式：消费方用自有 PDF 工具（如 PyMuPDF）算好逐行矩形（左上原点）+ 页高，
// 绕开识别器 5 页上限，任意页可高亮。页码用 getFullText 的真实 totalPages 校验。
async function runAddHighlightRects(
  data: Record<string, unknown>,
): Promise<[number, string, string]> {
  const parsed = parseAddHighlightRectsParams(data);
  if (!parsed.ok) {
    return highlightError("bad_request", parsed.error);
  }
  const { key, page, rects, pageHeight, text, libraryID, color, comment } =
    parsed.params;

  const resolved = await resolveItemByKey(key, libraryID);
  if ("error" in resolved) return resolved.error;
  const attachment = resolvePdfAttachment(resolved.item);
  if (!attachment) {
    return highlightError(
      "no_pdf_attachment",
      `Error: No PDF attachment for key ${key}`,
    );
  }

  let totalPages: number | null = null;
  try {
    const fullText = await Zotero.PDFWorker.getFullText(attachment.id, 1);
    totalPages =
      typeof fullText?.totalPages === "number" ? fullText.totalPages : null;
  } catch (e: any) {
    Zotero.logError(e);
  }
  if (totalPages !== null && !isPageInRange(page, totalPages)) {
    return highlightError(
      "page_beyond_document",
      `Error: page ${page} is beyond the PDF (it has ${totalPages} page(s))`,
    );
  }

  const zone = buildRectsZone(page, rects, pageHeight);

  const created = await saveHighlightAnnotation(attachment, {
    page,
    pageIndex: zone.pageIndex,
    sortTop: zone.sortTop,
    rects: zone.rects,
    text: text ?? "",
    comment,
    color,
  });

  return [
    200,
    "application/json",
    JSON.stringify({ ok: true, key: created.key, page, rects: zone.rects }),
  ];
}

// Add-Highlight 端点 - 两种模式（请求体含 rects → 位置模式，否则文本模式）。
Zotero.Server.LocalAPI.AddHighlightEndpoint = class extends (
  Zotero.Server.LocalAPI.Schema
) {
  supportedMethods = ["POST"];
  supportedDataTypes = ["application/json"];

  async run(req: {
    data?: Record<string, unknown>;
  }): Promise<[number, string, string]> {
    try {
      const data = req.data ?? {};
      return "rects" in data
        ? await runAddHighlightRects(data)
        : await runAddHighlightText(data);
    } catch (e: any) {
      return highlightError("internal", e.message);
    }
  }
};

// Delete-Annotation 端点 - 删除一个标注。POST/JSON { key, libraryID? }。
// 解析 key → 必须是标注（否则 400），用 eraseTx() 删除。供测试清理与“改写即先删”。
Zotero.Server.LocalAPI.DeleteAnnotationEndpoint = class extends (
  Zotero.Server.LocalAPI.Schema
) {
  supportedMethods = ["POST"];
  supportedDataTypes = ["application/json"];

  async run(req: {
    data?: Record<string, unknown>;
  }): Promise<[number, string, string]> {
    try {
      const parsed = parseDeleteAnnotationParams(req.data ?? {});
      if (!parsed.ok) {
        return [400, "text/plain", parsed.error];
      }
      const { key, libraryID } = parsed.params;

      const resolved = await resolveItemByKey(key, libraryID);
      if ("error" in resolved) return resolved.error;
      const item = resolved.item;

      if (!item.isAnnotation()) {
        return [
          400,
          "text/plain",
          `Error: ${key} is not an annotation (its item type is ${item.itemType})`,
        ];
      }

      await item.eraseTx();

      return [200, "application/json", JSON.stringify({ ok: true, key })];
    } catch (e: any) {
      return [500, "text/plain", "Internal Server Error: " + e.message];
    }
  }
};

// 插件主类 - 管理插件的生命周期和数据
class Addon {
  public data: {
    alive: boolean; // 插件是否活跃
    config: typeof config; // 配置对象
    env: "development" | "production"; // 环境类型
    initialized?: boolean; // 插件是否已初始化
    ztoolkit: ZToolkit; // ZToolkit 实例
    locale?: {
      current: any;
    }; // 当前语言设置
    prefs?: {
      window: Window;
      columns: Array<ColumnOptions>;
      rows: Array<{ [dataKey: string]: string }>;
    }; // 偏好设置窗口信息
    dialog?: DialogHelper; // 对话框助手
  };
  // 生命周期钩子
  public hooks: typeof hooks;
  // 对外暴露的 API
  public api: object;

  // 构造函数 - 初始化插件
  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {};
  }

  // 注册 API 端点到 Zotero Server
  public registerEndpoints() {
    Zotero.Server.Endpoints["/api/plus/add-item-by-id"] =
      Zotero.Server.LocalAPI.AddItemEndpoint;
    Zotero.Server.Endpoints["/api/plus"] = Zotero.Server.LocalAPI.Plus;
    Zotero.Server.Endpoints["/api/plus/selected-collection"] =
      Zotero.Server.LocalAPI.GetSelectedCollectionEndpoint;
    Zotero.Server.Endpoints["/api/plus/libraries"] =
      Zotero.Server.LocalAPI.GetLibrariesEndpoint;
    Zotero.Server.Endpoints["/api/plus/create-collection"] =
      Zotero.Server.LocalAPI.CreateCollectionEndpoint;
    Zotero.Server.Endpoints["/api/plus/open-pdf"] =
      Zotero.Server.LocalAPI.OpenPdfEndpoint;
    Zotero.Server.Endpoints["/api/plus/add-note"] =
      Zotero.Server.LocalAPI.AddNoteEndpoint;
    Zotero.Server.Endpoints["/api/plus/read-note"] =
      Zotero.Server.LocalAPI.ReadNoteEndpoint;
    Zotero.Server.Endpoints["/api/plus/read-annotations"] =
      Zotero.Server.LocalAPI.ReadAnnotationsEndpoint;
    Zotero.Server.Endpoints["/api/plus/add-highlight"] =
      Zotero.Server.LocalAPI.AddHighlightEndpoint;
    Zotero.Server.Endpoints["/api/plus/delete-annotation"] =
      Zotero.Server.LocalAPI.DeleteAnnotationEndpoint;
    ztoolkit.log("Registering Local API Plus endpoint");
    ztoolkit.log(Zotero.Server.LocalAPI.Plus);
  }
}

export default Addon;
