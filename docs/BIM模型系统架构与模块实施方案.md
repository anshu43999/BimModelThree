# BIM 模型系统架构与模块实施方案

更新时间：2026-07-16  
文档状态：当前有效

## 1. 系统定位

系统由模型转换服务、Viewer 服务和外部业务平台组成。当前核心目标是稳定提供 Fragments BIM 查看、模型交互和第三方 SDK 能力，不在 Viewer 内实现完整业务平台。

```text
业务平台
  ├─ 项目、用户、权限、流程、审计
  ├─ 模型版本和业务数据关系
  └─ iframe / JavaScript SDK
           │
           ▼
viewer-service
  ├─ Viewer UI 与 Demo
  ├─ Runtime / Embed / Direct SDK
  ├─ Render、Interaction、Semantic、Measurement 等 Engine
  └─ Manifest + .frag 加载
           │
           ▼
converter-service / 资源服务
  ├─ IFC 转 .frag
  ├─ Manifest / Report / T003 / T004
  ├─ 转换任务基础 API
  └─ 模型资源与可选业务数据仓储
```

## 2. 技术基线

| 项 | 当前选择 |
|---|---|
| BIM 主格式 | `.frag` |
| 资源入口 | `bim-model-manifest/v1` |
| 渲染 | Three.js `0.182.0` |
| BIM 引擎 | `@thatopen/fragments 3.4.5` |
| IFC 转换 | `web-ifc 0.0.77` + Fragments |
| 第三方集成 | iframe 优先，直接 ESM SDK 为高级方式 |
| Viewer 页面 | `viewer-service/viewer/index.html` |
| 功能演示 | `viewer-service/viewer/demo.html` |
| 业务数据基础 | viewpoints/labels/annotations/snapshots REST adapter |

GLB 仅作为辅助预览或导出格式，不替代当前 BIM Viewer 主链路。

## 3. 服务职责

### 3.1 converter-service

负责：

- 读取 IFC 并转换为 `.frag`。
- 生成 `manifest.json`、转换报告和可选索引。
- 执行 T003 属性完整度和 T004 ID 稳定性验证。
- 提供转换任务、健康检查和基础业务数据 API。
- 将产物交给对象存储或静态资源服务。

不负责浏览器渲染和 Viewer 交互。

### 3.2 viewer-service

负责：

- PC、移动端和 Demo 页面。
- Manifest、Frag、属性与索引加载。
- 模型树、属性、选择、测量、剖切、标签、批注、漫游、多模型和版本对比。
- iframe、Runtime 和直接 SDK。
- Viewer 前端状态和可选业务数据同步。

不负责 IFC 服务端解析、业务权限和审批流程。

### 3.3 第三方业务平台

负责：

- 登录、租户、项目、用户和权限。
- 模型与项目、版本、业务对象的关系。
- 标签、批注、视点、快照的正式数据库和审计。
- 向 Viewer 提供授权后的 Manifest、资源和业务 API。
- 消费 Viewer 选择、状态和命令事件。

## 4. Viewer 分层

| 层 | 当前模块 | 职责 |
|---|---|---|
| 页面层 | `index.html`、`main-mvp.js`、CSS modules | 布局、DOM、业务面板和兼容入口 |
| 运行时门面 | `ViewerRuntimeSDK`、runtime handlers | 页面命令统一、iframe 转发 |
| 公共 SDK | `BimViewerEmbedClient`、`BimViewerSDK`、契约文件 | 第三方稳定能力和事件 |
| 应用控制 | ToolMode、CameraControl、ViewportPanel、ModelRegistry | 模式、相机、面板、模型生命周期 |
| 业务控制 | PathRoam、SemanticIndex/Search、VersionCompare | 路线、索引、搜索和版本差异任务 |
| 引擎层 | Render、Interaction、Semantic、Measurement、Section、Label、Annotation、Zone 等 | 可复用 BIM 和渲染能力 |
| Fragments 层 | `BimViewerApp`、Fragments Model/Worker | 模型加载、更新和资源释放 |

页面层不得成为新的核心业务实现位置。新增或重构能力优先进入 Controller、Engine 或 SDK，再由页面调用。

## 5. 当前控制器

| 控制器 | 状态 | 职责 |
|---|---|---|
| `ToolModeController` | 已完成开发 | 工具模式互斥、共存和快速退出 |
| `CameraControlManager` | 已完成开发 | 相机控制权和鼠标状态 |
| `ViewportPanelManager` | 已完成开发 | 模型区域面板互斥和停靠 |
| `ModelRegistry` | 已完成开发 | 模型角色、范围、变换、图层和销毁 |
| `FreeInspectController` | 已完成开发 | WASD 自由巡检和速度 |
| PathRoam Controllers | 已完成开发 | 路线文档、关键帧和播放 |
| Semantic Controllers | 已完成开发 | 全量索引、缓存、搜索和取消 |
| VersionCompare Controllers | 已完成开发 | Worker 差异计算、进度和取消 |
| `TabStateController` | 已完成开发 | Tab 状态和键盘导航 |
| `TreeQueryPager` | 已完成开发 | 大树按父节点分页 |

以上状态表示开发和 Node 自动化已完成，仍需真实浏览器与项目模型人工验收。

## 6. 当前引擎

| 引擎 | 主要职责 |
|---|---|
| `RenderEngine` | Scene、Camera、Renderer、Controls 和循环 |
| `InteractionEngine` | 构件拾取、选择、高亮、定位和框选 |
| `SemanticQueryEngine` | 模型树、属性、GlobalId/localId 和楼层分类 |
| `MeasurementEngine` | 捕捉、距离、角度、面积和预览 |
| `SectionEngine` | 单面、多面和剖切盒 |
| `LabelEngine` / `LabelStoreEngine` | 标签渲染、绑定和本地存储 |
| `AnnotationEngine` | 批注、状态、权限字段和历史 |
| `BubbleClusterEngine` | 标签与批注气泡屏幕聚合 |
| `ZoneEngine` | 分区着色、隔离、显隐和复原 |
| `ViewpointEngine` / `ViewStoreEngine` | 视点捕获、恢复和视图列表 |
| `SnapshotEngine` | 视口快照 |
| `TreeDialogEngine` / `TreeVirtualListEngine` | 详细树和虚拟列表 |
| `VersionCompareCore` | GlobalId、属性和几何差异分类 |

## 7. 模型角色与生命周期

`ModelRegistry` 统一管理：

| 角色 | 说明 |
|---|---|
| `primary` | 当前主模型 |
| `managed` | 追加的装配模型 |
| `compare` | 当前版本对比模型 |

每个模型记录原始范围、局部范围、当前范围、显示状态、装配归属、变换、图层和销毁状态。

约束：

1. 设置新主模型时旧主模型降级为 managed，不隐式销毁。
2. compare 角色唯一，但不改变 primary。
3. 模型平移和旋转后必须更新当前范围。
4. 叠加、错开、复位和适配相机使用 Registry 合并范围。
5. 同一模型只允许一个资源销毁所有者。
6. 对比结束后恢复模型原图层和装配归属。

## 8. 数据与 ID

| 数据 | 推荐归属 |
|---|---|
| IFC、Frag、Manifest、属性和索引 | 对象存储/模型资源服务 |
| 模型、版本、转换任务元数据 | 模型服务数据库 |
| 项目、用户、权限、业务流程 | 第三方业务平台 |
| 标签、批注、视点、快照 | 业务数据库；图片进入对象存储 |
| 临时 UI、未同步草稿 | 浏览器本地存储 |

业务构件键优先使用 `modelId + versionId + GlobalId`。`localId` 只用于当前模型版本的高性能运行时操作。

## 9. 集成边界

- 推荐入口：iframe + `BimViewerEmbedClient`。
- 深度入口：`BimViewerSDK` 直接 ESM。
- 内部入口：`ViewerRuntimeSDK`，第三方不直接初始化。
- 第三方不访问 Viewer DOM、`main-mvp.js` 函数或 Fragments 内部对象。
- 多模型、测量、剖切、分区和双视窗尚未全部进入可移植 SDK 合同。
- 正式接口版本与限制见《BIM模型Manifest与ViewerSDK规范》和《BIM Viewer第三方系统SDK对接说明》。

## 10. 后续实施路线

### P0：验证与集成收口

- 完成 T003/T004 正式验证。
- 完成真实大模型人工验收。
- 完成一个真实第三方 iframe 试接入。
- 固化 Origin、CORS、CSP 和资源授权策略。

### P1：数据产品化

- 实现统一 StorageAdapter。
- 文件型业务数据仓储升级为数据库。
- 快照图片进入对象存储。
- 增加权限、审计、幂等和并发控制。
- 保存多模型装配方案与路径漫游路线。

### P2：前端架构收口

- 继续缩小 `main-mvp.js`。
- 页面只保留 DOM 适配和渲染。
- 新能力先进入 Controller/Engine/SDK。
- 补集成测试和浏览器回归矩阵。

### P3：专项能力

- 图纸模型联动 PoC。
- 正式多用户协同与审批。
- 超大模型分片、流式加载和性能专项。

## 11. 验证基线

2026-07-16 执行 Viewer 全量 Node 测试：`109 passed / 0 failed`。

该结果覆盖核心控制器、引擎核心算法、SDK 契约和 CSS 结构契约，不替代浏览器、GPU、网络和真实大模型人工验收。

