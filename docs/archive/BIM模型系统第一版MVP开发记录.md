# BIM 模型系统第一版 MVP 开发记录

日期：2026-06-25

## 1. 本轮目标

根据系统架构、引擎和模块设计文档，启动第一版 MVP 系统开发，重点完成：

- Viewer SDK 目录铺底。
- Viewer 引擎模块雏形。
- iframe Embed Bridge 模块化。
- converter-service Manifest / Report 模块化。
- 保持现有 `viewer/index.html` 入口兼容。

## 2. 已完成模块

### 2.1 Viewer SDK 兼容入口

新增：

```text
viewer-service/viewer/sdk/index.js
viewer-service/viewer/sdk/bim-viewer-app.js
viewer-service/viewer/sdk/manifest-loader.js
viewer-service/viewer/sdk/viewer-sdk.js
```

说明：

- 当前先 re-export 旧入口。
- 不破坏现有 `main-mvp.js`。
- 为后续 npm SDK 化预留稳定路径。
- 新增 `BimViewerSDK` facade，面向 npm 集成场景统一封装 RenderEngine、BimViewerApp、SemanticQueryEngine、InteractionEngine、SnapshotEngine、ViewpointEngine。

`BimViewerSDK` 当前提供的核心入口：

```text
BimViewerSDK.create()
openModel()
closeModel()
fitModel()
setView()
selectLocalIds()
clearSelection()
fitSelection()
pick()
rectanglePick()
takeSnapshot()
captureViewpoint()
restoreViewpoint()
getTree()
getItemInfo()
getSelection()
getState()
resize()
dispose()
```

### 2.2 Render Engine

新增：

```text
viewer-service/viewer/engines/render-engine.js
```

能力：

- 初始化 Three.js scene / camera / renderer / OrbitControls。
- 支持 start / stop / resize / render。
- 支持 addObject / removeObject。
- 支持 fitBox / setNamedView。
- 支持 getViewState / restoreViewState。

当前状态：

- 模块已完成语法检查。
- 已接入 `main-mvp.js`，替换原 Three.js scene / camera / renderer / OrbitControls 初始化。
- `fitBox`、`setNamedView`、`resize`、`animate` 已委托给 `RenderEngine`。

### 2.3 Snapshot Engine

新增：

```text
viewer-service/viewer/engines/snapshot-engine.js
```

能力：

- 基于 canvas 生成 PNG Blob。
- 支持下载。
- 支持返回 DataURL。
- 支持自定义文件名。

当前状态：

- 模块已完成语法检查。
- 已接入 `main-mvp.js`，替换原 canvas `toBlob()` 快照逻辑。
- iframe `snapshotCreated` / `snapshotFailed` 事件保持兼容。

### 2.4 Embed Bridge

新增：

```text
viewer-service/viewer/app/bind-embed-bridge.js
```

能力：

- 协议：`bim-viewer:v1`。
- 支持 `start()` / `stop()` / `post()`。
- 支持 origin 校验。
- 支持命令分发：
  - `openModel`
  - `fitModel`
  - `fitSelection`
  - `setView`
  - `clearSelection`
  - `snapshot`
  - `getState`
- 支持事件回传：
  - `commandCompleted`
  - `commandFailed`
  - `commandRejected`
  - `state`

当前状态：

- 已接入 `main-mvp.js`。
- 旧的内嵌 `message` 处理器已移除。
- `main-mvp.js` 仍通过 `postEmbedEvent()` 统一发 Viewer 事件，但底层已委托给 `EmbedBridge`。

### 2.6 Viewpoint Engine

新增：

```text
viewer-service/viewer/engines/viewpoint-engine.js
```

能力：

- 捕获当前相机和 controls 状态。
- 恢复已保存视点。
- 保存最近一次视点状态。
- 预留 selection 等业务状态扩展入口。

当前状态：

- 已接入 `main-mvp.js`。
- 原 `savedView` 内存变量已替换为 `ViewpointEngine`。
- `保存视点` / `恢复视点` 按钮行为保持兼容。
- 已从 `viewer-service/viewer/sdk/index.js` 导出。

### 2.7 Semantic Query Engine

新增：

```text
viewer-service/viewer/engines/semantic-query-engine.js
```

能力：

- 获取空间结构。
- 获取 localIds。
- 获取分类和树结构。
- 获取构件属性、GlobalId 和材质信息。
- 提供 localId / GlobalId 反查缓存。

当前状态：

- 已接入 `main-mvp.js`，替代原有模型树和属性查询主路径。
- `buildModelsTree`、`buildClassesTree`、`buildStoreysTree`、`collectStoreys` 已不再作为主路径使用。
- 已从 `viewer-service/viewer/sdk/index.js` 导出。

### 2.8 Interaction Engine

新增：

```text
viewer-service/viewer/engines/interaction-engine.js
```

能力：

- 统一管理单选、框选、选择集状态和高亮。
- 支持选中构件定位、隐藏、隔离、显示全部。
- 支持选中构件着色、重置材质、透明度调整。
- 输出标准选择状态：`modelId`、`primaryLocalId`、`localIds`、`globalIds`、`count`、`source`。

当前状态：

- 已接入 `main-mvp.js`，页面脚本保留 UI 状态同步和事件通知，模型操作已委托给 `InteractionEngine`。
- `selectionChanged` iframe 事件保持兼容。
- 已从 `viewer-service/viewer/sdk/index.js` 导出。

### 2.5 converter-service Manifest / Report

新增：

```text
converter-service/src/manifest-writer.js
converter-service/src/conversion-report-writer.js
```

修改：

```text
converter-service/src/convert-ifc-to-fragments.js
```

能力：

- `buildModelManifest()` / `writeModelManifest()`
- `buildConversionReport()` / `writeConversionReport()`
- 转换成功时输出 `manifest.json` 和 `conversion-report.json`。
- 转换失败时尽量输出失败状态的 `conversion-report.json`。

### 2.9 converter-service HTTP 任务服务

新增：

```text
converter-service/src/conversion-task-service.js
converter-service/server/api-server.js
```

修改：

```text
converter-service/src/convert-ifc-to-fragments.js
converter-service/package.json
converter-service/README.md
```

能力：

- `convert-ifc-to-fragments.js` 同时支持 CLI 和模块调用。
- HTTP API 支持创建转换任务、查询任务列表、查询单个任务、获取 manifest、获取 report、下载 fragments。
- 任务服务第一版采用内存任务表和串行队列，避免多个大模型转换同时占用内存。
- `npm run serve` 启动转换 API，默认 `http://127.0.0.1:5180`。

## 3. 本轮验证

已通过语法检查：

```text
node --check viewer-service/viewer/main-mvp.js
node --check viewer-service/viewer/app/bind-embed-bridge.js
node --check viewer-service/viewer/engines/render-engine.js
node --check viewer-service/viewer/engines/snapshot-engine.js
node --check viewer-service/viewer/engines/interaction-engine.js
node --check viewer-service/viewer/sdk/index.js
node --check viewer-service/viewer/sdk/viewer-sdk.js
node --check viewer-service/viewer/sdk/bim-viewer-app.js
node --check viewer-service/viewer/sdk/manifest-loader.js
node --check converter-service/src/convert-ifc-to-fragments.js
node --check converter-service/src/manifest-writer.js
node --check converter-service/src/conversion-report-writer.js
node --check converter-service/src/conversion-task-service.js
node --check converter-service/server/api-server.js
```

已完成运行检查：

```text
GET http://127.0.0.1:5175/viewer/index.html -> 200
GET http://127.0.0.1:5180/health -> 200
```

## 4. 下一步建议

### 阶段 1：继续收口 Viewer 内部实现

已完成：

- 模型加载已收口到 `BimViewerApp`。
- 选择、高亮、显隐、隔离、着色已迁移到 `InteractionEngine`。

下一步：

1. 把 `main-mvp.js` 中剩余 fallback 查询逻辑继续收敛到各引擎。
2. 将 Viewer 页面入口能力整理成更稳定的 SDK facade。
3. 补充 Viewer SDK 使用示例和 iframe 集成示例。

### 阶段 2：拆语义和交互

新增：

```text
viewer-service/viewer/engines/semantic-query-engine.js
viewer-service/viewer/engines/interaction-engine.js
```

目标：

- 把模型树、属性查询、选择、高亮、显隐、隔离、着色从页面脚本中拆出。

### 阶段 3：转换服务任务化

新增：

```text
converter-service/src/conversion-task-service.js
converter-service/server/api-server.js
```

目标：

- 已从 CLI 转换演进到 HTTP 任务接口。
- 当前支持基于 `inputPath` 创建转换任务、转换状态查询、失败报告、manifest 获取。
- 后续再补文件上传、任务持久化、失败重试和历史任务恢复。

## 5. 注意事项

- 当前仓库已有大量未提交改动，开发时不要回退非自己负责的文件。
- `main-mvp.js` 仍然是第一版可运行入口，不要一次性重写。
- 每次拆分都必须保证 `viewer/index.html?manifest=...` 可继续运行。
- 业务持久化主键优先使用 `GlobalId`，前端运行时操作继续使用 `localId`。
