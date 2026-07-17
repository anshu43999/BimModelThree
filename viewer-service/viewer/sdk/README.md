# BIM Viewer SDK

该目录提供 npm 集成方向的 Viewer SDK 入口。第一版 SDK 仍复用现有浏览器端模块，不改变 `viewer/index.html` 的 iframe 集成路径。

## 推荐集成方式

MVP 阶段第三方系统优先使用 iframe 集成。需要深度集成到自有前端应用时，再使用 `BimViewerSDK`。

## iframe 与直接 SDK 可移植接口

两种入口都提供 `getCapabilities()`，返回 `bim-viewer-sdk-integration/v1` 能力清单。业务系统可据此检查方法是否可用，不需要根据集成方式维护两份硬编码列表。

```js
const capabilities = sdk.getCapabilities();
console.log(capabilities.integration); // iframe 或 direct
console.log(capabilities.methods);
console.log(capabilities.methodGroups);
console.log(capabilities.extensions);
```

两种入口统一支持以下兼容能力：

- `setViewpoint()` 与 `restoreViewpoint()`。
- `snapshot()` 与 `takeSnapshot()`。
- `getTree(mode)`，其中 `mode` 支持 `models / classes / storeys` 等 SemanticQueryEngine 模式。
- `getSelection()`。
- `getItemInfo(localId | globalId | {localId/globalId})`。
- `isolateSelected({mode, opacity})`、`colorSelected(color)`、`setSelectedOpacity(opacity)` 和 `resetSelectedMaterial()`。

iframe 方法始终返回 Promise；直接 SDK 的同步读取方法可以直接返回，但业务系统使用 `await` 调用两种入口均有效。旧方法名、原参数和原返回字段继续保留。

## ViewerRuntimeSDK 的定位

`ViewerRuntimeSDK` 是 `/viewer/index.html` 内部使用的轻量命令门面，用于让页面按钮和 iframe 桥接复用同一组业务命令。它不创建 Canvas、RenderEngine 或 FragmentsModels，也不负责加载模型，因此不是第三方系统的首选初始化入口。

当前已迁移的 Runtime 命令：

```text
fitModel
fitSelection
setView
setViewpoint
selectLocalIds
selectGlobalIds
getItemInfo
getTree
hideSelected
isolateSelected
colorSelected
resetSelectedMaterial
setSelectedOpacity
showAll
clearSelection
setFreeInspectMode
toggleFreeInspectMode
getFreeInspectMode
setFreeInspectSpeed
openPathRoamPanel
listPathRoamRoutes
createPathRoamRoute
switchPathRoamRoute
savePathRoamRoute
deletePathRoamRoute
setPathRoamSpeed
listPathRoamPoints
addPathRoamPoint
restorePathRoamPoint
deletePathRoamPoint
updatePathRoamPoint
recapturePathRoamPoint
movePathRoamPoint
playPathRoam
pausePathRoam
stopPathRoam
clearPathRoam
getPathRoamMode
createLabel
listLabels
removeLabel
createAnnotation
updateAnnotation
listAnnotations
getAnnotationHistory
removeAnnotation
openModel
listModels
activateModel
fitManagedModel
setModelVisibility
unloadModel
overlayModels
spreadModels
resetModelsPlacement
loadCompareModel
clearCompareModel
runVersionCompare
cancelVersionCompare
getVersionCompareState
snapshot
saveCurrentView
restoreLatestView
listViews
saveStoredView
updateStoredView
restoreStoredView
removeStoredView
getState
```

第三方系统仍按集成形态选择 `BimViewerEmbedClient` 或 `BimViewerSDK`。`ViewerRuntimeSDK` 主要解决 Viewer 页面内部逻辑重复问题。

## iframe 集成

Viewer 页面已经内置 `postMessage` 桥接协议。第三方系统可以使用 `BimViewerEmbedClient` 控制 iframe 内的 Viewer，不需要直接引入 Three.js 或 Fragments。

```html
<iframe
    id="bimViewer"
    src="/viewer/index.html?chrome=0&embedOrigin=https://your-system.example"
    style="width: 100%; height: 720px; border: 0"
></iframe>

<script type="module">
import {BimViewerEmbedClient} from "/viewer/sdk/embed-client.js";

const client = BimViewerEmbedClient.create({
    iframe: document.getElementById("bimViewer"),
    targetOrigin: window.location.origin,
    allowedOrigin: window.location.origin
});

await client.waitReady();
await client.openModel({manifestUrl: "/converted/manifest.json"});
await client.setView("iso");
const viewpoint = await client.captureViewpoint();
await client.setViewpoint(viewpoint);
await client.selectLocalIds([123], {source: "business-list"});
await client.selectGlobalIds(["0Jk8..."], {source: "business-id"});
const itemInfo = await client.getItemInfo({globalId: "0Jk8..."});
await client.isolateSelected();
await client.showAll();
await client.setFreeInspectMode(true);

client.addEventListener("modelLoaded", (event) => {
    console.log("model loaded", event.detail);
});

client.addEventListener("selectionChanged", (event) => {
    console.log("selection", event.detail);
});
</script>
```

常用 iframe 命令：

```js
await client.openModel({manifestUrl: "/models/demo/manifest.json"});
await client.fitModel();
await client.fitSelection();
const viewpoint = await client.captureViewpoint();
await client.setViewpoint(viewpoint);
await client.selectLocalIds([123]);
await client.selectGlobalIds(["0Jk8..."]);
await client.getItemInfo({localId: 123});
await client.hideSelected();
await client.colorSelected();
await client.showAll();
await client.createLabel({globalId: "0Jk8...", title: "业务标签"});
await client.createAnnotation({globalId: "0Jk8...", content: "业务批注"});
await client.updateAnnotation("annotation-id", {
    content: "业务平台更新后的批注",
    status: "processing",
    assignee: "user-b",
    permission: "assignee",
    userId: "user-a"
});
await client.getAnnotationHistory("annotation-id");
await client.listLabels({globalId: "0Jk8...", limit: 20});
await client.listAnnotations({globalId: "0Jk8...", status: "open", limit: 20});
await client.removeLabel("label-id");
await client.removeAnnotation("annotation-id");
await client.setView("top");
await client.setFreeInspectMode(true);
await client.getFreeInspectMode();
await client.toggleFreeInspectMode();
await client.openPathRoamPanel(true);
const route = await client.createPathRoamRoute({name: "一层巡检路线"});
await client.addPathRoamPoint({name: "入口视角"});
const keyframe = await client.addPathRoamPoint({name: "中庭视角"});
await client.updatePathRoamPoint(keyframe.point.id, {name: "中庭二层视角", time: 5000});
await client.movePathRoamPoint(keyframe.point.id, -1);
await client.recapturePathRoamPoint(keyframe.point.id);
await client.restorePathRoamPoint(keyframe.point.id);
await client.savePathRoamRoute({name: "一层巡检路线"});
// 播放经过关键帧时会自动触发主 Viewer 记录的选择/变换等状态。
await client.playPathRoam();
await client.pausePathRoam();
await client.stopPathRoam();
await client.listPathRoamRoutes();
await client.listPathRoamPoints();
await client.clearSelection();
await client.snapshot({download: true, filename: "view.png"});
const state = await client.getState();
```

## 基础用法

```js
import {BimViewerSDK} from "./viewer/sdk/index.js";

const sdk = await BimViewerSDK.create({
    container: document.getElementById("viewer"),
    workerUrl: "/node_modules/@thatopen/fragments/dist/Worker/worker.mjs",
    businessDataBaseUrl: "http://127.0.0.1:5180/api/business-data",
    businessDataMode: "manual",
    projectId: "demo-project",
    versionId: "v1"
});

await sdk.openModel({
    manifestUrl: "/models/demo/manifest.json"
});

sdk.fitModel();
sdk.setView("iso");
sdk.setFreeInspectMode(true);
```

## 常用能力

```js
await sdk.selectLocalIds([123], {source: "business"});
await sdk.selectGlobalIds(["0Jk8..."], {source: "business"});
const localId = await sdk.getLocalIdByGlobalId("0Jk8...");
await sdk.fitSelection();
await sdk.hideSelected();
await sdk.showAll();
await sdk.isolateSelected({mode: "dim", opacity: 0.35});
await sdk.colorSelected("#6bbcff");
await sdk.setSelectedOpacity(0.5);
await sdk.resetSelectedMaterial();
await sdk.clearSelection("business");
sdk.setFreeInspectMode(true);
sdk.getFreeInspectMode();
sdk.toggleFreeInspectMode();

sdk.createPathRoamRoute({name: "一层巡检路线"});
const firstKeyframe = sdk.addPathRoamPoint({name: "入口视角"});
const secondKeyframe = sdk.addPathRoamPoint({name: "中庭视角"});
sdk.updatePathRoamPoint(secondKeyframe.id, {name: "中庭二层视角", time: 5000});
sdk.movePathRoamPoint(secondKeyframe.id, -1);
sdk.recapturePathRoamPoint(secondKeyframe.id);
await sdk.restorePathRoamPoint(firstKeyframe.id);
sdk.savePathRoamRoute({name: "一层巡检路线"});
sdk.setPathRoamSpeed(1.25);
// 播放经过关键帧时会自动触发该点记录的选择状态。
sdk.playPathRoam();
sdk.pausePathRoam();
sdk.stopPathRoam();
const roamRoutes = sdk.listPathRoamRoutes();
const roamPoints = sdk.listPathRoamPoints();

await sdk.createLabel({globalId: "0Jk8...", title: "业务标签"});
await sdk.listLabels({globalId: "0Jk8...", limit: 20});
await sdk.removeLabel("label-id");

await sdk.createAnnotation({globalId: "0Jk8...", content: "业务批注", status: "open"});
await sdk.updateAnnotation("annotation-id", {
    content: "业务平台更新后的批注",
    status: "processing",
    assignee: "user-b",
    permission: "assignee",
    userId: "user-a"
});
const annotationHistory = sdk.getAnnotationHistory("annotation-id");
await sdk.listAnnotations({globalId: "0Jk8...", status: "open", limit: 20});
await sdk.removeAnnotation("annotation-id");

const tree = await sdk.getTree("classes");
const info = await sdk.getItemInfo(123);
const state = sdk.getState();

const viewpoint = sdk.captureViewpoint({includeSelection: true});
sdk.restoreViewpoint(viewpoint);

await sdk.takeSnapshot({
    download: true,
    filename: "model-view.png"
});
```

## 后端业务数据 Adapter

`BimViewerSDK` 默认仍使用本地 `localStorage` 保存标签、批注和视点。传入 `businessDataBaseUrl` 后，可以显式把本地数据同步到后端业务数据接口；`businessDataMode` 支持 `local`、`manual`、`backend`，用于和主 Viewer 的本地模式、手动同步、后端优先保持一致：

```js
const labelResult = await sdk.createLabel({globalId: "0Jk8...", title: "业务标签"});
await sdk.syncLabelToBusinessData(labelResult.label);

const annotationResult = await sdk.createAnnotation({globalId: "0Jk8...", content: "业务批注"});
await sdk.syncAnnotationToBusinessData(annotationResult.annotation);

const viewpoint = sdk.captureViewpoint({includeSelection: true});
await sdk.syncViewpointToBusinessData(viewpoint, {title: "巡检视点"});

await sdk.syncSnapshotToBusinessData({
    filename: "model-view.png",
    camera: sdk.getState().view,
    selection: sdk.getSelection()
});

const remoteLabels = await sdk.listBusinessData("labels", {
    projectId: "demo-project",
    modelId: sdk.getState().modelId
});

sdk.setBusinessDataMode("backend");
const backendEnabled = sdk.isBusinessDataBackendEnabled();
```

## 批注协同 SDK 约定

当前批注协同按“业务平台主导，Viewer SDK 承载模型定位”的方式设计：

- 业务平台负责登录态、组织权限、最终鉴权、审批流、冲突处理和正式持久化。
- Viewer SDK 负责根据 `localId/globalId` 创建和定位批注，保存 `createdBy/updatedBy/assignee/permission/history` 等轻量协同字段。
- `permission` 只作为业务字段透传，取值为 `team`、`owner`、`assignee`。
- `history` 用于记录 Viewer 侧创建、编辑、状态变更和位置变更；服务端审计日志仍应由业务平台保存。

```js
const created = await sdk.createAnnotation({
    globalId: "0Jk8...",
    content: "消防管线标高需复核",
    status: "open",
    priority: "high",
    userId: "user-a",
    assignee: "user-b",
    permission: "assignee"
});

const updated = sdk.updateAnnotation(created.annotation.id, {
    status: "resolved",
    content: "已复核并调整",
    userId: "user-b"
});

const history = sdk.getAnnotationHistory(created.annotation.id);
await sdk.syncAnnotationToBusinessData(updated.annotation);
```

iframe 集成时使用 `BimViewerEmbedClient` 的同名方法：

```js
await client.createAnnotation({
    globalId: "0Jk8...",
    content: "业务批注",
    userId: "user-a",
    assignee: "user-b",
    permission: "team"
});
await client.updateAnnotation("annotation-id", {status: "closed", userId: "user-a"});
await client.getAnnotationHistory("annotation-id");
```

当前 adapter 只负责 API 调用和字段透传，不处理登录态、权限、审批流和冲突合并。

## 事件

```js
sdk.addEventListener("ready", (event) => {});
sdk.addEventListener("progress", (event) => {});
sdk.addEventListener("modelloaded", (event) => {});
sdk.addEventListener("selectionchanged", (event) => {});
sdk.addEventListener("pathroamchange", (event) => {});
sdk.addEventListener("modelclosed", (event) => {});
```

Runtime SDK、iframe SDK 和直接 SDK 事件统一附加 `bim-viewer-sdk-event/v1` 元数据。原事件名和原 `detail`/`payload` 顶层字段保持不变。

```js
sdk.addEventListener("selectionchanged", (event) => {
    const detail = event.detail;
    console.log(detail.schemaVersion); // bim-viewer-sdk-event/v1
    console.log(detail.eventId, detail.event, detail.source, detail.timestamp);
    console.log(detail.localIds);       // 兼容原字段
    console.log(detail.payload);        // 原始业务载荷
});
```

命令生命周期事件额外包含：

- `commandId`：同一次 Runtime 命令的开始、完成和失败事件保持一致；iframe 下优先使用 `requestId`。
- `command`：命令名称。
- `status`：`started`、`completed`、`failed` 或 `rejected`。
- `startedAt`、`finishedAt`、`durationMs`：毫秒时间和耗时。
- `result`：命令结果。
- `error`：可序列化的 `{name, message, code?}`。

Runtime SDK 继续使用 `commandstart / commandcomplete / commanderror`；iframe 继续使用 `commandCompleted / commandFailed / commandRejected`，不会影响现有监听器。

## 当前限制

- SDK 仍依赖浏览器环境、Three.js、`@thatopen/fragments` 和 Web Worker。
- Node 侧不要用运行时 `import()` 做验证，容易因为浏览器/worker 依赖导致进程不退出；使用 `node --check` 做语法检查即可。
- 第一版 SDK 已提供业务数据 API adapter，但不处理业务权限、模型列表、审批流、多人协同和冲突合并。
