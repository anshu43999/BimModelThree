# BIM 模型系统引擎接口规范

版本：v1.0
日期：2026-06-25

## 1. 目标

本文定义 BIM 模型系统核心引擎的接口边界，用于指导后续从 `main-mvp.js` 拆分 Viewer 引擎、SDK、UI 面板和第三方集成桥。

本文不是最终 npm SDK 文档，而是当前工程内部模块化重构的接口规范。

## 2. 总体接口分层

```text
页面 UI
  -> ViewerPageController
    -> BimViewerApp
      -> RenderEngine
      -> ModelLoaderEngine
      -> SemanticQueryEngine
      -> InteractionEngine
      -> ViewpointEngine
      -> SnapshotEngine
      -> EmbedBridge
```

设计原则：

- 页面 UI 只绑定按钮、输入框、面板和日志。
- `BimViewerApp` 作为统一门面。
- 各 Engine 负责单一领域能力。
- Engine 之间通过明确参数和事件协作。
- 不让 UI 面板直接调用 Fragments 低层 API。

## 3. 统一事件模型

建议所有 Viewer 内部事件统一为：

```js
{
  type: "modelLoaded",
  payload: {},
  timestamp: 1710000000000
}
```

核心事件：

| 事件 | 触发时机 |
| --- | --- |
| `viewerReady` | Viewer 初始化完成 |
| `modelLoadStart` | 模型开始加载 |
| `modelLoadProgress` | Fragments 加载进度变化 |
| `modelLoaded` | 模型加载完成 |
| `modelLoadFailed` | 模型加载失败 |
| `modelDisposed` | 模型释放完成 |
| `selectionChanged` | 构件选中变化 |
| `viewChanged` | 相机或视图变化 |
| `snapshotCreated` | 快照生成完成 |
| `toolModeChanged` | 工具模式变化 |
| `error` | 统一错误事件 |

## 4. BimViewerApp 门面接口

### 4.1 创建 Viewer

```js
const app = await BimViewerApp.create({
  canvas,
  container,
  workerUrl,
  maxWorkers,
  initialView,
  embedOrigin
});
```

### 4.2 模型加载

```js
await app.openModel({
  manifestUrl,
  manifest,
  fragUrl,
  file,
  buffer,
  name
});
```

返回：

```js
{
  modelId,
  modelVersionId,
  name,
  manifest,
  localIdsCount,
  box
}
```

### 4.3 模型释放

```js
await app.disposeModel();
```

### 4.4 视图控制

```js
app.fitModel();
app.fitSelection();
app.setView("iso");
app.getViewState();
app.restoreViewState(viewState);
```

### 4.5 构件操作

```js
await app.selectLocalIds([1, 2, 3]);
await app.clearSelection();
await app.hideLocalIds([1, 2, 3]);
await app.isolateLocalIds([1, 2, 3]);
await app.showAll();
await app.setColor([1, 2, 3], "#34c38f");
await app.resetColor([1, 2, 3]);
await app.setOpacity([1, 2, 3], 0.5);
```

### 4.6 查询

```js
app.getCurrentModel();
app.getManifest();
app.getSelection();
await app.getItemInfo(localId);
await app.getTree({ mode: "classes" });
```

### 4.7 快照

```js
const snapshot = await app.takeSnapshot({
  download: false,
  returnDataUrl: true
});
```

返回：

```js
{
  filename,
  mimeType,
  sizeBytes,
  blob,
  dataUrl
}
```

## 5. RenderEngine 接口

职责：

- 初始化 Three.js。
- 管理场景、相机、渲染器和控制器。
- 提供标准视图和相机状态。

接口：

```js
const renderEngine = new RenderEngine({
  canvas,
  container
});

renderEngine.init();
renderEngine.start();
renderEngine.stop();
renderEngine.resize();
renderEngine.render();
renderEngine.addObject(object3d);
renderEngine.removeObject(object3d);
renderEngine.fitBox(box);
renderEngine.setNamedView("top", box);
renderEngine.getViewState();
renderEngine.restoreViewState(viewState);
renderEngine.dispose();
```

输出对象：

```js
{
  scene,
  camera,
  renderer,
  controls
}
```

## 6. ModelLoaderEngine 接口

职责：

- 加载 manifest。
- 拉取 `.frag`。
- 调用 Fragments 加载模型。
- 释放模型资源。

接口：

```js
const loader = new ModelLoaderEngine({
  scene,
  camera,
  workerUrl,
  maxWorkers
});

await loader.init();
await loader.openModel({ manifestUrl });
await loader.disposeModel(modelId);
await loader.update(force);
loader.getCurrentModel();
loader.getManifest();
```

模型加载结果：

```js
{
  model,
  modelId,
  name,
  manifest,
  sizeBytes,
  loadSeconds
}
```

## 7. SemanticQueryEngine 接口

职责：

- 查询空间结构。
- 查询分类、楼层、属性、材质。
- 建立 ID 映射。

接口：

```js
const semantic = new SemanticQueryEngine({ model });

await semantic.init();
await semantic.getSpatialStructure();
await semantic.getLocalIds();
await semantic.getCategories();
await semantic.getTree("models");
await semantic.getTree("objects");
await semantic.getTree("classes");
await semantic.getTree("storeys");
await semantic.getItemInfo(localId);
await semantic.getGlobalId(localId);
await semantic.getLocalIdByGlobalId(globalId);
```

构件信息建议结构：

```js
{
  localId,
  globalId,
  category,
  name,
  description,
  objectType,
  predefinedType,
  properties,
  materials
}
```

## 8. InteractionEngine 接口

职责：

- 处理选择、高亮、框选、右键拾取、显隐、隔离、着色和透明。

接口：

```js
const interaction = new InteractionEngine({
  model,
  camera,
  canvas,
  semanticEngine
});

await interaction.selectLocalIds(localIds, { source: "tree" });
await interaction.clearSelection();
await interaction.pick(clientX, clientY);
await interaction.rectanglePick(rect);
await interaction.fitSelection();
await interaction.hideSelected();
await interaction.isolateSelected();
await interaction.showAll();
await interaction.colorSelected(color);
await interaction.resetSelectedColor();
await interaction.setSelectedOpacity(opacity);
interaction.getSelection();
```

选中结构：

```js
{
  modelId,
  primaryLocalId,
  localIds,
  globalIds,
  count,
  source
}
```

## 9. ViewpointEngine 接口

职责：

- 序列化视点。
- 恢复视点。
- 为视图浏览器、快照、批注和漫游提供状态基础。

接口：

```js
const viewpoint = new ViewpointEngine({ renderEngine, interactionEngine });

const state = viewpoint.capture({
  includeSelection: true,
  includeVisibility: true,
  includeMaterials: true,
  includeSections: true
});

await viewpoint.restore(state);
```

视点结构：

```js
{
  camera: {
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    near: 0.1,
    far: 100000,
    zoom: 1
  },
  controls: {
    target: [0, 0, 0]
  },
  selection: {
    globalIds: []
  },
  visibility: {
    hiddenGlobalIds: []
  },
  materials: {
    coloredGlobalIds: [],
    opacityGlobalIds: []
  },
  sections: []
}
```

## 10. SnapshotEngine 接口

职责：

- 生成当前视口截图。
- 支持下载、Blob 返回、DataURL 返回。

接口：

```js
const snapshot = new SnapshotEngine({ renderer, scene, camera, canvas });

await snapshot.create({
  download: true,
  returnBlob: true,
  returnDataUrl: false,
  filename
});
```

返回：

```js
{
  filename,
  mimeType,
  sizeBytes,
  blob,
  dataUrl
}
```

## 11. EmbedBridge 接口

职责：

- iframe 消息接入。
- origin 校验。
- 命令分发。
- 事件回传。

接口：

```js
const bridge = new EmbedBridge({
  app,
  targetOrigin
});

bridge.start();
bridge.stop();
bridge.post("ready", payload);
```

支持命令：

```text
openModel
fitModel
fitSelection
setView
clearSelection
snapshot
getState
```

支持事件：

```text
ready
modelLoaded
modelLoadFailed
selectionChanged
snapshotCreated
snapshotFailed
state
commandCompleted
commandFailed
commandRejected
```

## 12. UI 面板接口

UI 面板不直接依赖 Fragments。每个面板只接收状态和回调。

### 12.1 ModelTreePanel

```js
treePanel.render(tree);
treePanel.setActive(localId);
treePanel.onSelect((localIds, primaryLocalId) => {});
```

### 12.2 PropertyPanel

```js
propertyPanel.renderItem(itemInfo);
propertyPanel.clear();
```

### 12.3 Toolbar

```js
toolbar.setBusy(true);
toolbar.setModelLoaded(true);
toolbar.onAction((action) => {});
```

### 12.4 LogPanel

```js
logPanel.info(message, data);
logPanel.error(message, error);
logPanel.clear();
```

## 13. 后端接口协作

前端引擎不直接决定业务数据保存方式。建议后端接口提供：

```text
GET  /api/models/{modelVersionId}/manifest
GET  /api/models/{modelVersionId}/properties
POST /api/models/{modelVersionId}/viewpoints
GET  /api/models/{modelVersionId}/viewpoints
POST /api/models/{modelVersionId}/snapshots
POST /api/models/{modelVersionId}/annotations
GET  /api/models/{modelVersionId}/annotations
```

前端传给后端的业务绑定 ID 应优先使用：

```text
projectId + modelVersionId + GlobalId
```

## 14. 实施顺序

建议按以下顺序落地：

1. `RenderEngine`
2. `ModelLoaderEngine`
3. `SnapshotEngine`
4. `EmbedBridge`
5. `ViewpointEngine`
6. `SemanticQueryEngine`
7. `InteractionEngine`
8. `ModelTreePanel`
9. `PropertyPanel`
10. 测量、剖切、标签等新增工具引擎

原因：

- 前 4 个模块最稳定，拆分风险低。
- `SemanticQueryEngine` 和 `InteractionEngine` 牵涉现有业务行为，适合在大模型验证后拆。
- UI 面板拆分应在底层引擎稳定后进行。

## 15. 验收标准

完成本接口规范第一阶段后，应满足：

- `index.html?manifest=...` 可正常加载模型。
- 本地 `.frag` 和 URL `.frag` 加载不回退。
- 模型树、属性面板、点击选择、框选、右键菜单不回退。
- iframe 可通过 postMessage 打开模型、切换视角、截图和获取状态。
- `main-mvp.js` 中核心逻辑逐步迁移到 `engines/` 和 `sdk/`。
- 后续 npm SDK 可直接复用 `BimViewerApp` 和核心 Engine。
