# BIM 模型 Manifest 与 Viewer SDK 规范

更新时间：2026-07-16  
文档状态：当前有效  
适用契约：`bim-model-manifest/v1`、`bim-viewer-sdk-integration/v1`、`bim-viewer-sdk-event/v1`

## 1. 规范定位

Manifest 是转换服务、模型资源服务和 Viewer 之间的模型版本资源契约。Viewer SDK 是业务系统加载模型、控制视图、查询构件和监听事件的稳定边界。

```text
converter-service
 -> manifest.json + .frag + optional resources
 -> viewer-service
 -> iframe SDK / direct ESM SDK
 -> third-party business system
```

本文件定义内部技术契约。第三方开发者的完整接入步骤见《BIM Viewer第三方系统SDK对接说明》。

## 2. Manifest v1

### 2.1 最小结构

```json
{
  "schemaVersion": "bim-model-manifest/v1",
  "modelId": "mall-as",
  "modelVersionId": "mall-as-v1",
  "displayName": "西单商场_AS",
  "resources": {
    "fragments": {
      "url": "西单商场_AS.frag",
      "format": "frag"
    }
  }
}
```

### 2.2 字段规则

| 字段 | 约束 | 说明 |
|---|---|---|
| `schemaVersion` | 必填，固定 `bim-model-manifest/v1` | 契约版本 |
| `modelId` | 业务接入必须提供 | 同一模型跨版本稳定标识 |
| `modelVersionId` | 业务接入必须提供 | 当前转换产物版本标识 |
| `displayName` | 建议必填 | 用户可读名称 |
| `source` | 可选 | IFC 文件名、类型和大小等来源信息 |
| `resources.fragments` | 必填对象 | Viewer 主模型资源 |
| `resources.fragments.url` | 必填 | 浏览器可访问的 `.frag` URL |
| `resources.fragments.format` | 建议为 `frag` | 资源格式 |
| `resources.properties` | 可选 | 外置属性资源 |
| `resources.globalIdIndex` | 可选 | GlobalId 索引 |
| `conversion` | 可选 | 转换器、模式、耗时和创建时间 |
| `viewer` | 可选 | 默认树 Tab、默认视角等展示建议 |

### 2.3 资源解析

- 相对 URL 以 Manifest URL 所在目录为基准。
- 绝对 HTTP(S) URL 直接使用。
- Windows 盘符路径和 UNC 路径会被拒绝。
- Manifest、Fragments、属性资源和 Worker 必须能从浏览器访问。
- 可选资源缺失不能阻断主模型加载，必填资源失败必须返回明确错误。
- `modelId + modelVersionId` 用于索引缓存、业务数据和版本追踪，不能随页面刷新变化。

### 2.4 兼容策略

- v1 字段只允许向后兼容扩展。
- 不再支持旧的 `version/modelName/resources.fragments: string` 作为正式格式。
- 如需兼容历史数据，应在转换服务或网关中升级为 v1，不在业务页面中分散兼容。
- 直接传入 `.frag` URL 仅用于本地文件、调试和旧系统兼容。

## 3. SDK 入口

稳定导出入口：`viewer-service/viewer/sdk/index.js`。

| 入口 | 使用者 | 定位 |
|---|---|---|
| `BimViewerEmbedClient` | iframe 宿主业务系统 | 推荐的第三方集成入口 |
| `BimViewerSDK` | 深度嵌入页面 | 直接管理 Canvas、模型和渲染生命周期 |
| `ViewerRuntimeSDK` | Viewer 页面内部 | UI 与 iframe Bridge 的内部命令门面，不作为第三方初始化入口 |
| `BusinessDataApiClient` | SDK 或业务适配层 | 视点、标签、批注和快照 REST adapter |
| `BimViewerApp` | SDK 与高级扩展 | 模型加载和 Fragments 生命周期门面 |

当前包为 `private: true`，没有发布 npm 包。正式第三方接入优先 iframe；直接 SDK 当前以静态 ESM 或业务方构建集成为主。

## 4. 可移植 SDK 能力

可移植方法由 `sdk-integration-contract.js` 定义，iframe 和直接 SDK 均需支持：

| 方法组 | 方法 |
|---|---|
| 模型 | `openModel`、`fitModel`、`fitSelection`、`getTree` |
| 相机 | `setView`、`setViewpoint`、`restoreViewpoint`、`captureViewpoint` |
| 选择与材质 | `selectLocalIds`、`selectGlobalIds`、`getItemInfo`、`getSelection`、`hideSelected`、`isolateSelected`、`colorSelected`、`resetSelectedMaterial`、`setSelectedOpacity`、`showAll`、`clearSelection` |
| 自由巡检 | `setFreeInspectMode`、`toggleFreeInspectMode`、`getFreeInspectMode`、`setFreeInspectSpeed` |
| 路径漫游 | 路线 CRUD、关键帧 CRUD、速度、播放、暂停、停止、清空和状态 |
| 业务标记 | 标签 CRUD、批注 CRUD 与历史 |
| 快照 | `snapshot`、`takeSnapshot` |
| 状态 | `getState`、`getCapabilities` |

第三方必须优先使用 `GlobalId` 绑定业务构件。`localId` 只在单个模型版本和当前运行时内稳定。

## 5. 入口扩展

| 入口 | 非可移植扩展 |
|---|---|
| iframe | `waitReady`、`sendCommand`、`openPathRoamPanel` |
| 直接 SDK | `closeModel`、`resize`、`dispose`、`pick`、`rectanglePick`、`setCtrlLookEnabled`、`getCtrlLookMode` |

调用扩展前应检查 `getCapabilities().extensions`。

多模型管理、模型变换、测量、剖切、分区可视化和双视窗版本对比目前属于主 Viewer/Runtime 层能力，尚未全部进入稳定可移植 SDK 合同。

## 6. 事件规范

事件公共结构：

```js
{
  schemaVersion: "bim-viewer-sdk-event/v1",
  eventId: "event-...",
  event: "selectionChanged",
  source: "iframe",
  timestamp: 1780000000000,
  payload: {}
}
```

- iframe 当前使用 `modelLoaded`、`selectionChanged` 等 camelCase 事件名。
- 直接 SDK 当前使用 `modelloaded`、`selectionchanged` 等小写事件名。
- 事件元数据已统一，事件名尚未完全统一。
- 新业务代码读取 `detail.payload`，过渡期兼容 `detail.payload ?? detail`。
- 命令生命周期事件包含 commandId、状态、起止时间、耗时、结果和可序列化错误。

## 7. 业务数据边界

当前 `BusinessDataApiClient` 支持：

- `viewpoints`
- `labels`
- `annotations`
- `snapshots`

```text
GET    /api/business-data/{type}
GET    /api/business-data/{type}/{id}
POST   /api/business-data/{type}
PUT    /api/business-data/{type}/{id}
DELETE /api/business-data/{type}/{id}
```

Viewer 只提供数据 adapter 和交互字段。登录、RBAC、审批、审计、冲突处理和正式数据库由业务平台负责。

## 8. 版本与兼容规则

1. Manifest、SDK 能力和事件分别独立版本化。
2. 新增方法必须先补能力契约、iframe handler、直接 SDK 和自动化测试。
3. 不向第三方暴露 Fragments Model、Three.js 内部对象、Viewer DOM 或 `main-mvp.js` 函数。
4. 破坏性变更必须升级 schemaVersion，不在 v1 中静默改变语义。
5. SDK 调用统一建议使用 `await`，便于 iframe 与直接 SDK 共享业务适配层。
6. 页面卸载时 iframe 调用 `client.stop()`，直接 SDK 调用 `sdk.dispose()`。

## 9. 验证基线

2026-07-16 自动化验证结果：`109 passed / 0 failed`。

契约相关覆盖包括：

- Manifest 版本和稳定模型版本缓存键。
- 可移植 SDK 方法分组和目标 ID 规范化。
- Runtime SDK 命令转发。
- iframe Bridge 来源、命令和事件生命周期。
- iframe Client 方法对齐与能力清单。
- 双版本属性/几何差异任务。
- 模型角色、范围和销毁生命周期。

真实跨域接入仍需按《BIM Viewer第三方系统SDK对接说明》的验收清单执行。

