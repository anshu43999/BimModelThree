# BIM 模型 Manifest 需求文档

版本：v1.0
日期：2026-06-25

## 1. 背景

当前系统已拆分为 `converter-service` 和 `viewer-service` 两个边界。为避免 Viewer 直接依赖具体 `.frag` 路径、转换实现和目录结构，需要引入统一的模型 Manifest，作为模型版本、资源入口和能力描述的标准载体。

## 2. 目标

1. 统一描述模型版本和资源位置。
2. 支持 Viewer 通过 `manifestUrl` 加载模型。
3. 支持转换服务自动输出转换结果、报告和索引资源。
4. 为后续模型目录、任务状态、权限控制和性能回归提供基础。

## 3. 适用范围

### 3.1 范围内

- IFC 转 Fragments 的转换产物管理。
- Manifest 生成、解析与校验。
- Viewer 通过 Manifest 加载模型。
- Demo 页面作为功能入口和验收入口。

### 3.2 范围外

- 多人协同编辑。
- 云端任务编排平台。
- 完整权限审批流。
- 图纸与模型的自动坐标配准。

## 4. 角色

- 转换操作人员：提交 IFC，查看转换结果。
- Viewer 使用者：通过 Viewer 浏览模型、执行选择和显示控制。
- 测试/验收人员：通过 Demo 页面做功能回归。

## 5. 功能需求

### 5.1 Manifest 生成

转换服务在输出 `.frag` 后，必须生成同目录 `manifest.json`。

必须包含：

- `schemaVersion`
- `modelId`
- `modelVersionId`
- `displayName`
- `source`
- `resources.fragments.url`
- `conversion`

可选包含：

- `resources.properties`
- `resources.globalIdIndex`
- `viewer.defaultTreeTabs`
- `viewer.defaultView`

### 5.2 Manifest 加载

Viewer 必须支持通过 `manifestUrl` 加载模型。

要求：

- 支持 URL 输入。
- 支持查询参数 `?manifest=...` 自动加载。
- 解析 manifest 中的相对资源路径。
- manifest 版本不匹配时给出明确错误。

### 5.3 资源加载

Viewer 依据 manifest 读取：

- Fragments 主文件
- 可选属性索引
- 可选 GlobalId 索引

### 5.4 功能演示页面

系统必须提供一个演示入口页，用于：

- 打开标准 Viewer
- 输入 manifest URL
- 展示功能清单
- 作为后续模型库、性能记录和回归验收入口

## 6. 非功能需求

### 6.1 可维护性

- Manifest schema 必须可版本化。
- Viewer 不允许硬编码具体模型目录结构。

### 6.2 可扩展性

- 后续可以扩展属性索引、构件索引、任务状态、缓存策略和权限信息。

### 6.3 可用性

- Viewer 在 manifest 缺失或资源不可用时应提示清晰错误。
- Demo 页面应保持可直接打开和跳转。

### 6.4 性能

- Manifest 解析不应成为首屏瓶颈。
- Viewer 首次加载不应因 manifest 增加额外重渲染。

## 7. 验收标准

1. `converter-service` 输出目录中存在 `manifest.json`。
2. `viewer-service` 可通过 `manifestUrl` 打开模型。
3. `viewer-service` 可通过 `?manifest=` 自动加载。
4. Demo 页面可跳转到标准 Viewer。
5. manifest 缺少关键字段时，前端能够报出明确错误。

## 8. 优先级

- P0：Manifest schema、Viewer 加载、Demo 页面入口。
- P1：属性索引、GlobalId 索引、转换报告。
- P2：模型目录、任务状态、性能记录。

## 9. 约束

- 当前系统主线仍是 `IFC -> .frag -> Three.js + Fragments`。
- Manifest 只是交付协议，不改变现有渲染内核。
- 后续如引入服务化任务队列，Manifest 字段需保持向后兼容。
