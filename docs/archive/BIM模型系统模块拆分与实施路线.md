# BIM 模型系统模块拆分与实施路线

版本：v1.0
日期：2026-06-25

## 1. 目标

本文用于把 `BIM模型系统架构引擎与模块设计.md` 进一步落到当前代码仓库，明确：

- 当前 MVP 代码如何拆成工程模块。
- `viewer-service` 和 `converter-service` 各自承担什么职责。
- 哪些模块先做，哪些模块后置。
- 每个阶段的验收产物是什么。

## 2. 当前问题

当前 Viewer 能力已经较完整，但仍存在典型 MVP 代码形态：

- `main-mvp.js` 同时承担页面绑定、渲染初始化、模型加载、树渲染、属性读取、构件操作、右键菜单、框选、快照和第三方通信。
- `BimViewerApp` 已经是 SDK 雏形，但目前只收口了模型加载、释放和 Fragments 更新。
- Manifest 已经出现，但还没有成为所有模型资源的唯一入口。
- Demo 页面已经存在，但还不是完整的验收控制台。
- 转换服务已能输出模型资源，但还不是任务化服务。

因此下一阶段的重点不是重写，而是**把已有能力按模块边界逐步搬出页面脚本**。

## 3. 目标目录结构

建议后续将 `viewer-service/viewer` 逐步调整为：

```text
viewer-service/
  viewer/
    index.html
    mobile.html
    demo.html
    style.css
    demo.css
    main-mvp.js
    app/
      create-viewer-page.js
      bind-viewer-ui.js
      bind-embed-bridge.js
    sdk/
      bim-viewer-app.js
      manifest-loader.js
      viewer-events.js
    engines/
      render-engine.js
      model-loader-engine.js
      semantic-query-engine.js
      interaction-engine.js
      viewpoint-engine.js
      snapshot-engine.js
      measurement-engine.js
      section-engine.js
    ui/
      model-tree-panel.js
      property-panel.js
      toolbar.js
      context-menu.js
      log-panel.js
    utils/
      ids.js
      boxes.js
      format.js
      errors.js
```

说明：

- `main-mvp.js` 在过渡期保留，作为旧入口。
- 新模块先从 `main-mvp.js` 中抽离稳定函数。
- 抽离后仍由 `index.html` 进入，不急于发布 npm 包。
- 当 `sdk/` 稳定后，再考虑单独打包。

## 4. 模块拆分原则

### 4.1 先拆稳定能力

优先拆出：

- Manifest 加载。
- 模型加载 / 释放。
- 渲染初始化。
- 标准视图和 fit。
- 快照。
- postMessage 集成。

暂缓拆出：

- 仍在验证中的测量、捕捉、剖切。
- 大模型树虚拟滚动。
- 批注、标签、分区等业务模块。

### 4.2 保持行为兼容

拆分过程中必须保持：

- `viewer/index.html` 可以继续打开。
- `?manifest=...` 可以继续加载。
- `.frag` URL 和本地文件加载仍可使用。
- 当前模型树、属性、选择、显隐、隔离、着色、透明度、快照不回退。

### 4.3 SDK 和页面分离

SDK 只负责能力，不负责页面布局：

```text
SDK：加载模型、选择构件、显隐、着色、视点、事件
页面：按钮、面板、布局、输入框、日志、业务入口
```

## 5. viewer-service 模块实施

### 5.1 SDK 模块

目标：

- 将 `BimViewerApp` 从加载 SDK 雏形升级为 Viewer 核心 SDK。

第一阶段 API：

```js
await app.openModel({ manifestUrl });
await app.disposeModel();
await app.fitModel();
await app.setView("iso");
await app.takeSnapshot();
app.getCurrentModel();
app.getManifest();
```

第二阶段 API：

```js
await app.selectLocalIds(localIds);
await app.clearSelection();
await app.hideSelected();
await app.isolateSelected();
await app.showAll();
await app.setColor(localIds, color);
await app.setOpacity(localIds, opacity);
```

验收标准：

- 页面层不直接调用 Fragments 低层 API 完成核心操作。
- 外部 iframe 命令可以通过 SDK 方法执行。
- SDK 事件可以支撑页面 UI 和第三方系统回传。

### 5.2 Render Engine

职责：

- 创建 scene、camera、renderer、controls。
- 处理 resize、animate、render。
- 提供标准视图、fit、view state。

建议文件：

```text
viewer-service/viewer/engines/render-engine.js
```

验收标准：

- `main-mvp.js` 不再直接维护大量 Three.js 初始化细节。
- 标准视图和 fit 逻辑可被 iframe 命令和页面按钮复用。

### 5.3 Model Loader Engine

职责：

- 统一处理 manifest、fragUrl、file、buffer。
- 处理加载耗时、错误和资源释放。
- 维护当前模型引用。

建议文件：

```text
viewer-service/viewer/engines/model-loader-engine.js
```

验收标准：

- 当前 `loadModelSource()` 逻辑从页面脚本中拆出。
- 加载成功和失败事件统一。
- 后续多模型加载有扩展空间。

### 5.4 Semantic Query Engine

职责：

- 获取空间结构。
- 获取 localIds。
- 获取分类、楼层、属性、材质。
- 建立 GlobalId / localId 映射。

建议文件：

```text
viewer-service/viewer/engines/semantic-query-engine.js
```

验收标准：

- 属性面板只负责展示，不负责直接组织复杂查询。
- 树模块只负责树 UI，不负责调用所有底层 Fragments 查询。
- 后续属性索引和搜索可以接入同一层。

### 5.5 Interaction Engine

职责：

- 点击选择。
- 框选。
- 右键拾取。
- 清空选择。
- 显隐、隔离、着色、透明、定位。

建议文件：

```text
viewer-service/viewer/engines/interaction-engine.js
```

验收标准：

- 选择状态集中管理。
- 页面、右键菜单、树、iframe 命令使用同一套选择 API。
- `selectionChanged` 事件统一发出。

### 5.6 Viewpoint Engine

职责：

- 保存视点。
- 恢复视点。
- 序列化 camera / controls 状态。
- 后续持久化到后端。

建议文件：

```text
viewer-service/viewer/engines/viewpoint-engine.js
```

验收标准：

- 当前内存级视点保存和恢复被模块化。
- 视点数据结构与后端接口一致。
- 后续视图浏览器可以直接使用。

### 5.7 Snapshot Engine

职责：

- canvas 截图。
- 下载图片。
- 返回 Blob / DataURL。
- 后续上传到后端。

建议文件：

```text
viewer-service/viewer/engines/snapshot-engine.js
```

验收标准：

- 页面快照按钮和 iframe `snapshot` 命令共用同一逻辑。
- 支持只下载、不下载、返回 dataUrl 三种模式。

### 5.8 Embed Bridge

职责：

- 处理 iframe postMessage。
- 校验 origin。
- 命令分发。
- Viewer 事件回传。

建议文件：

```text
viewer-service/viewer/app/bind-embed-bridge.js
```

验收标准：

- 第三方系统可监听 `ready`、`modelLoaded`、`selectionChanged`。
- 第三方系统可发送 `openModel`、`fitModel`、`setView`、`clearSelection`、`snapshot`。
- 生产环境支持明确的 `embedOrigin`。

## 6. converter-service 模块实施

### 6.1 当前职责

`converter-service` 应继续保持单一职责：

- 读取 IFC。
- 转换 `.frag`。
- 输出 Manifest。
- 输出转换报告。

不应承担：

- Viewer 页面托管。
- 前端交互。
- 业务审批。
- 长期权限流程。

### 6.2 目标目录结构

建议后续演进为：

```text
converter-service/
  src/
    convert-ifc-to-fragments.js
    manifest-writer.js
    conversion-report-writer.js
    conversion-task-service.js
    storage-adapter.js
  server/
    api-server.js
    routes/
      conversion-routes.js
  output/
    {modelVersionId}/
      model.frag
      manifest.json
      conversion-report.json
```

### 6.3 任务化能力

建议状态：

```text
uploaded
queued
converting
converted
failed
cancelled
```

建议接口：

```text
POST /api/conversions
GET  /api/conversions/{taskId}
GET  /api/models/{modelVersionId}/manifest
GET  /api/models/{modelVersionId}/report
```

### 6.4 Manifest 输出增强

建议补充字段：

- `checksum`
- `converterVersion`
- `conversionOptions`
- `status`
- `storageType`
- `createdAt`
- `source.fileName`
- `source.sizeBytes`
- `resources.fragments.sizeBytes`
- `resources.properties`
- `resources.globalIdIndex`

验收标准：

- Viewer 可仅凭 manifest 加载模型。
- 转换报告可用于排查失败。
- 后续模型管理系统可依据 manifest 管理资源。

## 7. Demo Console 实施

### 7.1 当前定位

`demo.html` 应作为项目功能演示与验收入口，不是营销首页。

### 7.2 后续能力

建议增加：

- 标准模型列表。
- Manifest 快速加载。
- Viewer / Mobile 入口。
- 功能验收清单。
- 性能记录。
- 转换任务状态。
- 回归测试入口。

### 7.3 验收标准

- 新功能都能从 Demo Console 找到入口。
- 标准模型可以一键加载。
- 可记录加载耗时、构件数量、浏览器内存观察值。
- 可作为给业务方演示的唯一入口。

## 8. 分阶段实施路线

### 8.1 阶段 A：集成和资源标准化

目标：

- 稳定 Manifest。
- 稳定 iframe 集成。
- 保持现有 Viewer 能力。

任务：

- 完善 Manifest 字段。
- 完善 postMessage 协议。
- Demo Console 增加第三方集成示例。
- Viewer 加载入口统一走 `BimViewerApp.openModel()`。

验收产物：

- 第三方 iframe 示例可运行。
- `?manifest=...` 可稳定加载。
- 文档中有完整协议说明。

### 8.2 阶段 B：Viewer 引擎拆分

目标：

- 从 `main-mvp.js` 中拆出核心引擎。

任务：

- 拆 Render Engine。
- 拆 Model Loader Engine。
- 拆 Snapshot Engine。
- 拆 Embed Bridge。
- 拆 Viewpoint Engine。

验收产物：

- `main-mvp.js` 明显变薄。
- 页面行为不变。
- `node --check` 通过。

### 8.3 阶段 C：语义和交互稳定化

目标：

- 支撑属性、ID、模型树和构件操作稳定发展。

任务：

- 拆 Semantic Query Engine。
- 拆 Interaction Engine。
- 模型树懒加载 / 虚拟滚动预研。
- 属性完整度验证。
- GlobalId / localId 稳定性验证。

验收产物：

- 真实模型下属性面板可用。
- 构件业务主键策略明确。
- 大模型树不卡死页面。

### 8.4 阶段 D：基础工具补齐

目标：

- 补齐 BIM Viewer 高频基础能力。

任务：

- 点到点测量。
- 捕捉。
- 基础剖切。
- 三维标签。
- 视点持久化。
- 快照持久化。

验收产物：

- 业务方可以用真实模型完成查看、测量、标注、截图和视点恢复。

### 8.5 阶段 E：业务化模块

目标：

- 支撑项目试点。

任务：

- 模型批注。
- 视图浏览器。
- 分区可视化。
- 多模型管理。
- 模型平移 / 旋转。

验收产物：

- 能围绕一个真实项目完成模型查看、问题记录、视点复现和多专业叠加。

## 9. 当前优先级建议

建议近期优先级：

1. 稳定 Manifest v1。
2. 稳定 iframe postMessage 协议。
3. 拆出 Render Engine。
4. 拆出 Model Loader Engine。
5. 拆出 Embed Bridge。
6. 验证大模型属性完整度和 ID 稳定性。
7. 做模型树性能优化。
8. 再进入测量、剖切、标签。

## 10. 结论

当前系统已经具备从 MVP 演进为平台能力的基础，但下一步不应直接堆新功能，而应先完成模块拆分和边界固化。

推荐路线是：

```text
Manifest 标准化
-> iframe 集成稳定
-> Viewer 引擎拆分
-> 语义和交互稳定化
-> 基础工具补齐
-> 业务模块扩展
-> npm SDK 产品化
```

这样可以保持现有 Viewer 能力不回退，同时逐步形成可集成、可维护、可扩展的 BIM 模型系统。
