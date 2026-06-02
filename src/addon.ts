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
    ztoolkit.log("Registering Local API Plus endpoint");
    ztoolkit.log(Zotero.Server.LocalAPI.Plus);
  }
}

export default Addon;
