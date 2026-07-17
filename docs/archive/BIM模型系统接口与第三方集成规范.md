# BIM 模型系统接口与第三方集成规范

更新时间：2026-06-30

## 0. 当前进度修订

截至 2026-07-06，第三方系统集成仍建议优先采用 iframe 方式，npm SDK 作为后续深度集成方案。当前已补充宿主侧 `BimViewerEmbedClient`，第三方系统可以通过该 client 调用 iframe 内 Viewer 的 `openModel`、`fitModel`、`setView`、`setViewpoint`、`selectLocalIds`、`selectGlobalIds`、`getItemInfo`、`hideSelected`、`isolateSelected`、`colorSelected`、`showAll`、`createLabel`、`createAnnotation`、`listLabels`、`listAnnotations`、`removeLabel`、`removeAnnotation`、`snapshot`、`getState` 等命令。

当前判断：

| 集成方式 | 当前建议 | 原因 |
|---|---|---|
| iframe + URL/Manifest + postMessage | 优先推荐 | 接入成本低、隔离性好、适合当前 Viewer MVP 和业务系统试点 |
| npm 包 / SDK 深度嵌入 | 后置 | 当前 SDK facade 已有基础，但 API、样式隔离、版本发布和宿主依赖仍需稳定 |

当前已具备的集成基础：

- Viewer 可通过 Manifest 加载模型。
- 主 Viewer 和功能演示页已能复用模型加载、选择、属性、标签、批注、测量、剖切等基础能力。
- SDK facade 已有基础方法，适合作为 iframe `postMessage` 命令的内部执行层；当前已支持 `businessDataMode` 配置和业务数据模式判断。
- `viewer/sdk/embed-client.js` 已提供 iframe 宿主侧调用封装，可用于第三方系统试接入。

近期集成规范重点：

- 固化 iframe URL 参数：`manifest`、`model`、`projectId`、`modelId`、`versionId`。
- 固化 postMessage 命令和事件：加载、选择、适配、视点、快照、错误、选择变化。
- 当前已开放标签、批注的本地基础版第三方命令；主 Viewer 已支持配置 `businessDataBaseUrl`、`businessDataMode`、`tenantId`、`projectId`、`versionId`、`createdBy` 后同步视点、标签、批注和快照。`businessDataMode=local` 表示仅本地存储，`manual` 表示手动拉取/推送，`backend` 表示后端优先并启用加载后自动拉取和本地变更自动同步。快照可推送当前缩略图、相机和选择状态，也可拉取远端快照列表并恢复视角/选择或删除远端快照，后续再从文件型存储升级为正式数据库、权限和审计。

## 1. 目标

本文定义 Viewer 对外接口、内部引擎接口和第三方系统集成方式。当前优先推荐 iframe 集成，后续再演进为 npm SDK 集成。

## 2. 推荐集成方式

当前阶段推荐：

```text
第三方业务系统
 -> iframe 打开 BIM Viewer
 -> URL 参数传入模型或 manifest
 -> postMessage 双向通信
```

原因：

- 接入成本低。
- 与业务系统技术栈解耦。
- Viewer 升级不要求第三方系统重新构建。
- 适合当前 MVP 和试点阶段。

## 3. URL 参数

建议约定：

| 参数 | 说明 |
|---|---|
| `manifest` / `manifestUrl` | manifest URL，推荐入口 |
| `model` / `modelUrl` / `fragUrl` | 直接 `.frag` 模型 URL，兼容旧模式 |
| `tenantId` | 租户 ID |
| `projectId` | 项目 ID |
| `modelId` | 模型 ID |
| `versionId` | 模型版本 ID |
| `businessDataBaseUrl` | 业务数据接口地址，默认 `/api/business-data` |
| `businessDataMode` | 业务数据模式：`local` 本地模式、`manual` 手动同步、`backend` 后端优先 |
| `createdBy` / `userId` | 当前业务用户，用于业务数据创建人字段 |
| `token` | 短期访问令牌或票据 |

## 4. iframe 消息协议

当前真实协议使用 `protocol = "bim-viewer:v1"`，命令消息由第三方系统发送给 iframe：

```json
{
  "protocol": "bim-viewer:v1",
  "target": "bim-viewer",
  "type": "openModel",
  "requestId": "uuid",
  "payload": {
    "manifestUrl": "/converted/manifest.json"
  }
}
```

Viewer 事件或响应消息由 iframe 发回宿主：

```json
{
  "protocol": "bim-viewer:v1",
  "source": "bim-viewer",
  "type": "modelLoaded",
  "requestId": "uuid",
  "payload": {}
}
```

宿主侧推荐使用 `BimViewerEmbedClient`，避免手写 `postMessage`：

```js
import {BimViewerEmbedClient} from "/viewer/sdk/embed-client.js";

const client = BimViewerEmbedClient.create({
  iframe: document.getElementById("bimViewer"),
  targetOrigin: window.location.origin,
  allowedOrigin: window.location.origin
});

await client.waitReady();
await client.openModel({manifestUrl: "/converted/manifest.json"});
const viewpoint = await client.captureViewpoint();
await client.setViewpoint(viewpoint);
await client.selectLocalIds([123], {source: "business-list"});
await client.selectGlobalIds(["0Jk8..."], {source: "business-id"});
const itemInfo = await client.getItemInfo({globalId: "0Jk8..."});
await client.isolateSelected();
await client.showAll();
await client.createLabel({globalId: "0Jk8...", title: "业务标签"});
await client.createAnnotation({globalId: "0Jk8...", content: "业务批注"});
await client.listLabels({globalId: "0Jk8...", limit: 20});
await client.listAnnotations({globalId: "0Jk8...", status: "open", limit: 20});
await client.removeLabel("label-id");
await client.removeAnnotation("annotation-id");
await client.setView("iso");

client.addEventListener("selectionChanged", (event) => {
  console.log(event.detail);
});
```

## 5. 当前支持命令

| 命令 | 说明 |
|---|---|
| `openModel` | 加载模型或 manifest |
| `fitModel` | 适配完整模型视图 |
| `fitSelection` | 适配当前选中构件 |
| `setView` | 切换前后左右顶底或等轴测 |
| `setViewpoint` | 恢复精确相机视点 |
| `selectLocalIds` | 根据 localId 选择构件 |
| `selectGlobalIds` | 根据 GlobalId 回查 localId 并选择构件 |
| `getItemInfo` | 根据 localId 或 GlobalId 查询构件信息 |
| `hideSelected` | 隐藏当前选中构件 |
| `isolateSelected` | 隔离当前选中构件 |
| `colorSelected` | 对当前选中构件着色 |
| `showAll` | 恢复显示全部构件 |
| `createLabel` | 为指定或当前选中构件创建标签 |
| `createAnnotation` | 为指定或当前选中构件创建批注 |
| `listLabels` | 查询当前模型或指定构件的标签 |
| `listAnnotations` | 查询当前模型或指定构件的批注，支持状态过滤 |
| `removeLabel` | 删除指定标签并刷新模型气泡 |
| `removeAnnotation` | 删除指定批注并刷新模型气泡 |
| `clearSelection` | 清空选择 |
| `snapshot` | 创建快照 |
| `getState` | 获取模型、选择和相机状态 |

当前 Viewer 事件：

| 事件 | 说明 |
|---|---|
| `ready` | Viewer 已完成初始化 |
| `modelLoaded` | 模型加载完成 |
| `modelLoadFailed` | 模型加载失败 |
| `selectionChanged` | 选择发生变化 |
| `snapshotCreated` | 快照创建完成 |
| `snapshotFailed` | 快照创建失败 |
| `commandCompleted` | 普通命令完成 |
| `commandFailed` | 命令执行失败 |
| `commandRejected` | 命令不支持或来源不允许 |

## 6. Viewer 门面接口

`BimViewerApp` 是业务系统和 UI 调用的稳定门面。

```ts
interface BimViewerApp {
  load(input: { manifestUrl?: string; modelUrl?: string }): Promise<void>;
  unload(): Promise<void>;
  fitModel(): void;
  setView(view: string): void;
  select(ids: Array<string | number>): void;
  clearSelection(): void;
  hide(ids: Array<string | number>): void;
  show(ids: Array<string | number>): void;
  isolate(ids: Array<string | number>): void;
  setColor(ids: Array<string | number>, color: string): void;
  setOpacity(ids: Array<string | number>, opacity: number): void;
  createSnapshot(): Promise<Blob>;
  on(event: string, handler: (payload: unknown) => void): void;
  off(event: string, handler: (payload: unknown) => void): void;
}
```

## 7. 后端协作接口

后端接口至少应覆盖：

- 模型上传。
- 转换任务创建。
- 转换状态查询。
- manifest 获取。
- 模型版本查询。
- 快照保存。
- 视点保存。
- 标签和批注保存。

当前 converter-service 已提供第一版业务数据 JSON 持久化接口，可用于 MVP 后端化联调：

| 接口 | 说明 |
|---|---|
| `GET /api/business-data` | 查询业务数据存储后端、schemaVersion 和支持类型 |
| `GET /api/business-data/{type}` | 查询业务数据列表 |
| `POST /api/business-data/{type}` | 创建业务数据 |
| `GET /api/business-data/{type}/{id}` | 查询单条业务数据 |
| `PUT /api/business-data/{type}/{id}` | 更新单条业务数据 |
| `DELETE /api/business-data/{type}/{id}` | 删除单条业务数据 |

`type` 当前支持：`viewpoints`、`labels`、`annotations`、`snapshots`。

列表查询支持 `tenantId`、`projectId`、`modelId`、`versionId`、`localId`、`globalId`、`status`、`createdBy` 过滤。第一版默认使用 `BUSINESS_DATA_BACKEND=json-file` 文件型 JSON 存储，存储层已通过仓储工厂隔离，后续产品化应补充数据库仓储和对象存储。

## 8. 后续 npm SDK

npm SDK 适合二期或三期：

- 第三方系统希望深度嵌入 Viewer。
- 需要自定义 UI。
- 可接受构建集成和版本依赖管理。

当前阶段不建议优先 npm SDK，避免拖慢 MVP 验证。若确实采用 npm 深度集成，`BimViewerSDK` 已提供与 iframe client 对齐的基础方法：

```js
await sdk.openModel({manifestUrl: "/converted/manifest.json"});
await sdk.selectLocalIds([123], {source: "business"});
await sdk.selectGlobalIds(["0Jk8..."], {source: "business"});
const localId = await sdk.getLocalIdByGlobalId("0Jk8...");
await sdk.hideSelected();
await sdk.showAll();
await sdk.isolateSelected({mode: "dim", opacity: 0.35});
await sdk.colorSelected("#6bbcff");
await sdk.createLabel({globalId: "0Jk8...", title: "业务标签"});
await sdk.listLabels({globalId: "0Jk8...", limit: 20});
await sdk.removeLabel("label-id");
await sdk.createAnnotation({globalId: "0Jk8...", content: "业务批注"});
await sdk.listAnnotations({globalId: "0Jk8...", status: "open", limit: 20});
await sdk.removeAnnotation("annotation-id");
```

若要对接 converter-service 的业务数据接口，可以在创建 SDK 时传入 `businessDataBaseUrl`：

```js
const sdk = await BimViewerSDK.create({
  container: document.getElementById("viewer"),
  businessDataBaseUrl: "http://127.0.0.1:5180/api/business-data",
  businessDataMode: "manual",
  projectId: "demo-project",
  versionId: "v1"
});

const labelResult = await sdk.createLabel({globalId: "0Jk8...", title: "业务标签"});
await sdk.syncLabelToBusinessData(labelResult.label);

const annotationResult = await sdk.createAnnotation({globalId: "0Jk8...", content: "业务批注"});
await sdk.syncAnnotationToBusinessData(annotationResult.annotation);

await sdk.syncViewpointToBusinessData(sdk.captureViewpoint({includeSelection: true}), {
  title: "巡检视点"
});

const remoteLabels = await sdk.listBusinessData("labels", {
  projectId: "demo-project",
  modelId: sdk.getState().modelId
});
```

## 9. 历史来源

本文件合并整理自：

- `BIM模型第三方系统集成方案.md`
- `BIM模型系统引擎接口规范.md`
