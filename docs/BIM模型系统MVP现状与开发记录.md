# BIM 模型系统当前现状

更新时间：2026-07-16  
文档状态：当前有效  
用途：项目现状的权威摘要；详细排期以《BIM模型项目进度评估与进度计划表》为准。

## 1. 当前定位

当前系统已经从 Viewer MVP 功能开发阶段进入稳定化、人工验收、SDK 对接和后端产品化阶段。

主技术路线：

```text
IFC
 -> converter-service
 -> .frag + manifest.json + conversion report
 -> viewer-service
 -> Three.js + @thatopen/fragments
 -> iframe / JavaScript SDK 接入业务系统
```

- `viewer-service`：PC/移动 Viewer、Demo、渲染与交互引擎、iframe/直接 SDK。
- `converter-service`：IFC 转 Fragments、Manifest/报告、T003/T004 验证工具、基础 HTTP 服务。
- 主模型格式：`.frag`。
- 推荐模型入口：`bim-model-manifest/v1` Manifest。
- 推荐第三方集成：iframe + `BimViewerEmbedClient`。

## 2. 当前实现总览

| 功能域 | 当前实现 | 剩余工作 |
|---|---|---|
| 模型加载 | Frag 文件、URL、Manifest、加载状态、模型适配 | 真实大模型与异常网络验收 |
| 模型树 | 四类 Tab、懒加载、分页、虚拟列表、搜索、详细树、非几何数据摘要 | 万级节点人工性能验收 |
| 属性与 ID | entityName、GlobalId、localId、完整属性、T003/T004 验证入口 | 与原 IFC 和重复转换产物正式比对 |
| 构件交互 | 点选、框选、定位、显隐、隔离、透明隔离、着色、右键扩展 | 多模型和大模型准确性验收 |
| 测量捕捉 | 顶点/端点/边捕捉、距离、角度、三角形和多边形面积、撤销 | 单位与真实工程尺寸验收 |
| 剖切 | 单面、多剖切、剖切盒、活动面、滑杆与微调 | 拖拽手柄后置；真实模型验收 |
| 视点与快照 | 视点保存/恢复、视图浏览器、分类、重命名、缩略图、快照 | 正式后端存储和容量策略 |
| 标签与批注 | 编辑、筛选、气泡、自定义样式、位置调整、聚合、定位 | 数据库、权限、审计和多人协同 |
| 分区可视化 | 楼层/类型分区、着色、隔离、显隐、复原 | 真实区域/专业字段和后端映射 |
| 自由巡检 | WASD、Shift 加速、步进调节、Ctrl + 左键原地转向 | 真实模型操作体验验收 |
| 路径漫游 | 多路线、关键帧、速度、播放/暂停/停止、本地保存 | 完整状态恢复、后端保存、时间轴增强 |
| 多模型装配 | 追加、切换、显隐、定位、卸载、叠加、错开、平移、旋转 | 坐标策略、装配方案后端保存 |
| 双视窗对比 | 双版本加载、视角联动、构件联动、GlobalId/属性/几何差异 | 大模型性能、差异业务确认和人工验收 |
| SDK 集成 | iframe Client、直接 ESM SDK、Runtime SDK、Manifest、事件和能力契约 | 第三方试接入；npm 发布尚未完成 |
| 业务数据 | viewpoints/labels/annotations/snapshots 文件型 CRUD 与 SDK adapter | 数据库仓储、鉴权、审计和并发控制 |

## 3. 前端架构收口进度

当前已经抽出的核心控制器：

- `ToolModeController`：统一测量、框选、剖切、巡检、模型变换和漫游等模式冲突。
- `CameraControlManager`：统一相机控制权、鼠标样式和恢复。
- `ViewportPanelManager`：统一模型区域浮层、停靠轨道和互斥展开。
- `ModelRegistry`：统一主模型、装配模型、对比模型、范围、变换、图层和销毁。
- `SemanticIndexController` / `SemanticSearchController`：全量语义索引、缓存、搜索与取消。
- `VersionCompareController` / `VersionCompareTaskController`：差异计算 Worker、进度和取消。
- `ViewerRuntimeSDK`：页面命令门面，连接 Viewer UI 与 iframe Bridge。

页面入口仍集中在 `viewer/main-mvp.js`，后续不再继续向该文件堆叠新功能，优先完成模块迁移和稳定契约。

## 4. 自动化验证基线

2026-07-16 执行：

```powershell
cd viewer-service
node --test --test-isolation=none
```

结果：`109 passed / 0 failed`。

当前自动化覆盖：

- 工具模式和相机控制权。
- 测量捕捉预览与锁定。
- 模型注册、范围、角色和销毁。
- 路径漫游核心、路线文档和播放。
- 语义索引、搜索、缓存和树分页。
- 双版本属性/几何差异和任务取消。
- Runtime SDK、iframe Bridge、事件与集成契约。
- 分区隔离与着色恢复。
- Tab、CSS 模块、响应式布局和左栏结构契约。

自动化通过不等于产品验收。当前未使用浏览器自动化，仍需真实模型人工验证视觉、交互、性能和连续模式切换。

## 5. 当前主要缺口

| 优先级 | 缺口 | 当前判断 |
|---|---|---|
| P0 | T003 属性完整度正式验证 | 工具已具备，缺原 IFC 抽样和报告签字 |
| P0 | T004 ID 稳定性正式验证 | 工具已具备，缺同源模型多次转换和跨版本记录 |
| P0 | 真实大模型人工验收 | 树、框选、右键、捕捉、测量、多模型和对比均需记录 |
| P0 | 第三方系统试接入 | SDK 文档已完成，缺真实宿主、Origin、CORS、CSP 联调 |
| P1 | 业务数据产品化 | 当前为 JSON 文件仓储，缺数据库、权限、审计和对象存储 |
| P1 | 页面控制器继续解耦 | `main-mvp.js` 仍较大，StorageAdapter 尚未完成统一 |
| P1 | 多模型坐标与装配方案 | 前端功能可演示，业务坐标规则和后端方案未固化 |
| P2 | 图纸模型联动 | 未实现，需要图纸数据和 2D/3D 坐标配准专项 PoC |

## 6. 当前建议执行顺序

1. 暂停新增 Viewer 功能，完成《BIM模型系统功能验收清单》的真实模型验收。
2. 完成 T003 属性完整度和 T004 ID 稳定性报告。
3. 使用《BIM Viewer第三方系统SDK对接说明》完成一个真实第三方 iframe 试接入。
4. 将视点、标签、批注和快照从文件型仓储升级为数据库与对象存储。
5. 完成 StorageAdapter 和 `main-mvp.js` 剩余模块拆分。
6. 在业务明确图纸来源、坐标和构件映射后，再启动图纸模型联动。

## 7. 文档关系

- 进度、难度、剩余人日：《BIM模型项目进度评估与进度计划表》
- 人工验收入口：《BIM模型系统功能验收清单》
- 前端架构优化：《BIM Viewer系统优化方案》
- 第三方接入：《BIM Viewer第三方系统SDK对接说明》
- Manifest 与 SDK 契约：《BIM模型Manifest与ViewerSDK规范》
- 历史 MVP 开发记录：`docs/archive/`
