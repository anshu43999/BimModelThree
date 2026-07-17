# BIM Viewer 第三方系统 SDK 对接说明

更新时间：2026-07-16  
文档状态：当前有效，第三方研发首选接入手册  
适用版本：`bim-fragments-viewer-service 0.1.0`  
接口契约：`bim-viewer-sdk-integration/v1`  
事件契约：`bim-viewer-sdk-event/v1`  
Manifest 契约：`bim-model-manifest/v1`

## 1. 文档目的

本文面向需要在业务系统中集成 BIM 模型能力的前端、后端和实施人员，说明当前 Viewer 的集成方式、初始化流程、稳定 SDK 方法、事件协议、Manifest 要求、业务数据边界和上线检查项。

当前 SDK 提供两种集成方式：

| 方式 | 推荐级别 | 适用场景 | 主要特点 |
|---|---:|---|---|
| iframe + `BimViewerEmbedClient` | 推荐 | 管理平台、项目平台、运维平台快速集成 | 依赖隔离、升级简单、业务系统技术栈不受限制 |
| 直接 ESM + `BimViewerSDK` | 高级 | 需要自定义 Viewer UI、深度控制画布和生命周期 | 控制能力更强，但宿主必须管理依赖、尺寸、Worker 和资源释放 |

默认应采用 iframe。只有业务系统需要直接管理 Three.js 画布或定制交互层时，才采用直接 ESM SDK。

> 当前项目尚未发布 npm 包。`viewer-service/package.json` 为 `private: true`，也没有稳定的 npm `exports` 配置。第三方目前通过部署后的静态 ESM 文件接入，或由交付方将 SDK 源码打包到业务系统；不能把 `npm install` 作为现阶段正式接入步骤。

## 2. 系统边界

```text
第三方业务系统
  ├─ 业务身份、权限、流程、审计、模型版本关系
  ├─ iframe 宿主或 SDK 容器
  └─ 调用 Viewer SDK / 监听 Viewer 事件
           │
           ▼
BIM Viewer Service
  ├─ Manifest 与 .frag 加载
  ├─ 模型渲染、选择、属性、视点、漫游
  ├─ 标签、批注、快照前端能力
  └─ 可选 BusinessDataApiClient
           │
           ▼
模型资源服务 / 业务数据服务
  ├─ manifest.json、.frag、属性和 GlobalId 索引
  └─ viewpoints、labels、annotations、snapshots
```

Viewer SDK 不负责第三方平台的登录、菜单权限、数据审批、冲突合并和组织权限。业务系统负责认证授权，并把可访问的模型资源 URL、用户上下文和业务数据接口交给 Viewer。

## 3. 接入前准备

第三方接入前需要准备：

1. 可通过 HTTP(S) 访问的 Viewer 地址，例如 `https://viewer.example.com`。
2. 可通过浏览器访问的 Manifest URL，例如 `https://models.example.com/project-a/v1/manifest.json`。
3. Viewer、Manifest、`.frag`、可选属性资源和 Worker 的跨域策略。
4. 业务系统自身的 `tenantId`、`projectId`、`modelId`、`versionId` 和当前用户标识。
5. 如需后端保存视点、标签、批注和快照，准备符合第 10 节的 REST API。

模型资源不能使用 `E:\...`、UNC 路径或其他本地文件路径。所有资源必须由 Web 服务暴露为 URL。

## 4. 推荐方式：iframe 集成

### 4.1 最小 HTML

```html
<div class="bim-frame-shell">
  <iframe
    id="bimViewer"
    title="BIM 模型"
    allow="fullscreen"
  ></iframe>
</div>

<style>
  .bim-frame-shell {
    width: 100%;
    height: 720px;
    min-height: 480px;
  }

  #bimViewer {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
```

### 4.2 初始化客户端

```js
import {BimViewerEmbedClient} from "./vendor/bim-viewer/embed-client.js";

const iframe = document.getElementById("bimViewer");
const hostOrigin = window.location.origin;
const viewerBase = "https://viewer.example.com";
const viewerOrigin = new URL(viewerBase).origin;

iframe.src =
  `${viewerBase}/viewer/index.html?chrome=0`
  + `&embedOrigin=${encodeURIComponent(hostOrigin)}`;

const client = BimViewerEmbedClient.create({
  iframe,
  targetOrigin: viewerOrigin,
  allowedOrigin: viewerOrigin,
  timeoutMs: 30000
});

await client.waitReady();
await client.openModel({
  manifestUrl: "https://models.example.com/project-a/v1/manifest.json"
});
```

跨域配置中三个 Origin 的含义不能混用：

| 配置 | 应填写的值 | 用途 |
|---|---|---|
| Viewer URL 的 `embedOrigin` | 业务系统 Origin | Viewer 只向指定宿主发送消息 |
| Client 的 `targetOrigin` | Viewer Origin | 宿主只向指定 Viewer 发送命令 |
| Client 的 `allowedOrigin` | Viewer Origin | 宿主只接收指定 Viewer 的事件 |

生产环境不得将以上值设置为 `"*"`。同源本地开发可以使用 `window.location.origin`。

### 4.3 URL 参数

Viewer 页面当前支持以下初始化参数：

| 参数 | 说明 |
|---|---|
| `chrome=0` / `chrome=false` | 隐藏 Viewer 自带外层控制区，适合嵌入 |
| `embedOrigin` | 允许接收 Viewer 消息的宿主 Origin |
| `manifest` / `manifestUrl` | 启动时加载的 Manifest URL，推荐 |
| `model` / `modelUrl` / `fragUrl` | 启动时直接加载 `.frag` URL，兼容模式 |
| `name` / `modelName` | 直接加载模型时的显示名称 |
| `businessDataBaseUrl` | 业务数据 REST API 根地址 |
| `businessDataMode` | `local`、`manual` 或 `backend` |
| `tenantId` | 租户标识 |
| `projectId` | 项目标识 |
| `versionId` / `modelVersionId` | 模型版本标识 |
| `userId` / `createdBy` | 当前业务用户标识 |
| `businessDataAutoSync=1` | 开启本地变更自动同步 |
| `businessDataAutoPull=1` | 模型加载后自动拉取业务数据 |

模型可以通过 URL 参数启动时加载，也可以在 `waitReady()` 后调用 `openModel()`。业务系统需要动态切换模型时，应优先调用 SDK 方法。

### 4.4 事件监听

```js
client.addEventListener("modelLoaded", (event) => {
  console.log("模型已加载", event.detail);
});

client.addEventListener("selectionChanged", (event) => {
  const selection = event.detail;
  console.log(selection.localIds, selection.globalIds);
});

client.addEventListener("commandFailed", (event) => {
  console.error("Viewer 命令失败", event.detail);
});
```

### 4.5 页面销毁

```js
window.addEventListener("pagehide", () => {
  client.stop();
});
```

`stop()` 会移除 `message` 监听，并拒绝尚未完成的请求。单页应用在路由离开 Viewer 页面时也必须调用。

## 5. 高级方式：直接 ESM SDK

### 5.1 使用条件

直接 SDK 会创建或接管 Canvas，并负责 Three.js、Fragments、选择、标签、批注、漫游和渲染生命周期。宿主需要保证：

- 容器具有稳定宽高。
- Three.js 和 Fragments 版本与 Viewer 一致。
- Worker URL 可访问并允许跨域加载。
- 布局变化后调用 `resize()`。
- 页面销毁时调用 `dispose()`。

当前锁定依赖：

| 依赖 | 版本 |
|---|---:|
| `three` | `0.182.0` |
| `@thatopen/fragments` | `3.4.5` |
| `web-ifc` | `0.0.77` |

### 5.2 浏览器 ESM 示例

以下示例假设 SDK 和依赖由同一静态服务发布。跨域使用时，每个 ESM 文件和 Worker 都必须返回正确的 CORS 响应头。

```html
<div id="viewerContainer"></div>

<style>
  #viewerContainer {
    position: relative;
    width: 100%;
    height: 720px;
    min-height: 480px;
    overflow: hidden;
  }

  #viewerContainer canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>

<script type="importmap">
{
  "imports": {
    "three": "/node_modules/three/build/three.module.js",
    "three/addons/": "/node_modules/three/examples/jsm/",
    "three/examples/jsm/": "/node_modules/three/examples/jsm/",
    "@thatopen/fragments": "/node_modules/@thatopen/fragments/dist/index.mjs",
    "web-ifc": "/node_modules/web-ifc/web-ifc-api.js"
  }
}
</script>

<script type="module">
  import {BimViewerSDK} from "/viewer/sdk/index.js";

  const sdk = await BimViewerSDK.create({
    container: document.getElementById("viewerContainer"),
    workerUrl: "/node_modules/@thatopen/fragments/dist/Worker/worker.mjs",
    fitOnLoad: true,
    ctrlLookEnabled: true,
    freeInspectSpeedMultiplier: 0.2
  });

  await sdk.openModel({manifestUrl: "/converted/manifest.json"});

  const resizeObserver = new ResizeObserver(() => sdk.resize());
  resizeObserver.observe(document.getElementById("viewerContainer"));

  window.addEventListener("pagehide", () => {
    resizeObserver.disconnect();
    sdk.dispose();
  });
</script>
```

### 5.3 初始化选项

| 选项 | 类型 | 说明 |
|---|---|---|
| `container` | `HTMLElement` | 用于自动创建 Canvas 的容器 |
| `canvas` | `HTMLCanvasElement` | 已存在的 Canvas，与 `container` 二选一 |
| `workerUrl` | `string` | Fragments Worker 地址，生产环境建议显式传入 |
| `fitOnLoad` | `boolean` | 模型加载后是否自动适配视角，默认开启 |
| `ctrlLookEnabled` | `boolean` | 是否启用 Ctrl + 左键原地转向 |
| `freeInspectSpeedMultiplier` | `number` | 自由巡检默认移动倍率，当前默认 `0.2` |
| `businessDataBaseUrl` | `string` | 可选业务数据 API 地址 |
| `businessDataMode` | `local\|manual\|backend` | 业务数据同步模式 |
| `businessDataClient` | `BusinessDataApiClient` | 自定义业务数据客户端 |
| `projectId` | `string` | 默认项目标识 |
| `versionId` | `string` | 默认模型版本标识 |
| `userId` | `string` | 批注默认操作人 |

## 6. Manifest 规范

推荐使用 Manifest 作为唯一模型加载入口：

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
    },
    "properties": {
      "url": "properties.json",
      "optional": true
    },
    "globalIdIndex": {
      "url": "global-id-index.json",
      "optional": true
    }
  }
}
```

必填规则：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `schemaVersion` | 是 | 当前必须为 `bim-model-manifest/v1` |
| `modelId` | 建议视为必填 | 模型稳定标识 |
| `modelVersionId` | 建议视为必填 | 模型版本标识 |
| `displayName` | 建议视为必填 | 用户可读名称 |
| `resources.fragments.url` | 是 | `.frag` 资源 URL |
| `resources.fragments.format` | 建议 | 当前值为 `frag` |

相对资源 URL 以 Manifest URL 所在目录为基准解析。`properties`、`globalIdIndex` 等可选资源也遵循相同规则。

```js
await client.openModel({manifestUrl: "https://models.example.com/a/v1/manifest.json"});
// 或直接 SDK：await sdk.openModel({manifestUrl: "..."});
```

只有兼容旧系统时才直接传入 `.frag`：

```js
await client.openModel({
  fragUrl: "https://models.example.com/a/v1/model.frag",
  name: "模型 A"
});
```

## 7. 稳定方法清单

第三方应通过 `getCapabilities()` 判断当前集成入口支持的方法，不应依赖 Viewer 内部对象。

```js
const capabilities = await client.getCapabilities();
console.log(capabilities.schemaVersion, capabilities.methods);
```

为兼容 iframe 的异步消息调用，第三方代码建议对所有公开方法统一使用 `await`。

### 7.1 模型与相机

| 方法 | 主要参数 | 说明 |
|---|---|---|
| `openModel(source)` | `manifestUrl` / `fragUrl` / Manifest 数据 | 加载模型 |
| `fitModel()` | 无 | 模型适配到视口 |
| `fitSelection()` | 无 | 当前选择适配到视口 |
| `getTree(mode)` | `models\|objects\|classes\|storeys` | 获取语义树 |
| `setView(view)` | `iso\|top\|front\|back\|left\|right` | 设置标准视角 |
| `captureViewpoint(options)` | 可选包含选择状态 | 获取当前精确视点 |
| `setViewpoint(viewpoint)` | 视点对象 | 设置视点，iframe 常用入口 |
| `restoreViewpoint(viewpoint)` | 视点对象 | 恢复视点，跨入口统一别名 |

### 7.2 选择与构件显示

| 方法 | 说明 |
|---|---|
| `selectLocalIds(localIds, options)` | 按当前模型版本内的 `localId` 选择 |
| `selectGlobalIds(globalIds, options)` | 按稳定 `GlobalId` 选择 |
| `getItemInfo(target)` | 按 `{localId}` 或 `{globalId}` 查询属性 |
| `getSelection()` | 获取当前选择摘要 |
| `hideSelected()` | 隐藏当前选中构件 |
| `isolateSelected(options)` | 隔离当前选中构件 |
| `colorSelected(color)` | 设置选中构件颜色 |
| `resetSelectedMaterial()` | 清除选中构件材质覆盖 |
| `setSelectedOpacity(opacity)` | 设置选中构件透明度，范围 `0..1` |
| `showAll()` | 清除显隐和材质覆盖并恢复全部 |
| `clearSelection()` | 清空选择 |

```js
await client.selectGlobalIds(["0Jk8ExampleGlobalId"], {
  source: "work-order-list"
});

const selection = await client.getSelection();
const item = await client.getItemInfo({globalId: "0Jk8ExampleGlobalId"});
await client.fitSelection();
```

### 7.3 自由巡检

| 方法 | 说明 |
|---|---|
| `setFreeInspectMode(enabled)` | 开启或关闭 WASD 自由巡检 |
| `toggleFreeInspectMode()` | 切换自由巡检状态 |
| `getFreeInspectMode()` | 获取可用性、启用状态和控制状态 |
| `setFreeInspectSpeed(speedMultiplier)` | 设置移动倍率，默认建议 `0.2` |

### 7.4 路径漫游与关键帧

| 方法组 | 方法 |
|---|---|
| 路线管理 | `listPathRoamRoutes`、`createPathRoamRoute`、`switchPathRoamRoute`、`savePathRoamRoute`、`deletePathRoamRoute` |
| 关键帧管理 | `listPathRoamPoints`、`addPathRoamPoint`、`restorePathRoamPoint`、`updatePathRoamPoint`、`recapturePathRoamPoint`、`movePathRoamPoint`、`deletePathRoamPoint` |
| 播放控制 | `setPathRoamSpeed`、`playPathRoam`、`pausePathRoam`、`stopPathRoam`、`clearPathRoam`、`getPathRoamMode` |

```js
const route = await client.createPathRoamRoute({name: "首层巡检"});
await client.addPathRoamPoint({name: "入口", time: 0});
// 调整相机后继续添加关键帧
await client.addPathRoamPoint({name: "设备间", time: 5000});
await client.setPathRoamSpeed(1);
await client.playPathRoam();
```

路径数据当前可以保存在 Viewer 本地。需要跨用户、跨设备共享时，业务系统应读取路线数据并保存到自身后端，或扩展业务数据适配器。

### 7.5 标签与批注

| 方法 | 说明 |
|---|---|
| `createLabel(payload)` | 创建绑定构件的标签 |
| `listLabels(filter)` | 查询标签 |
| `removeLabel(id)` | 删除标签 |
| `createAnnotation(payload)` | 创建批注 |
| `updateAnnotation(id, patch)` | 修改批注内容、状态等 |
| `listAnnotations(filter)` | 查询批注 |
| `getAnnotationHistory(id)` | 查询批注历史 |
| `removeAnnotation(id)` | 删除批注 |

```js
const labelResult = await client.createLabel({
  globalId: "0Jk8ExampleGlobalId",
  title: "重点设备",
  style: "info"
});

const annotationResult = await client.createAnnotation({
  globalId: "0Jk8ExampleGlobalId",
  title: "现场问题",
  content: "请复核安装位置",
  status: "open",
  priority: "normal",
  createdBy: "user-1001"
});

await client.updateAnnotation(annotationResult.annotation.id, {
  status: "resolved"
});
```

标签用于短文本识别和模型标识；批注用于问题内容、状态、人员和历史过程。业务流程与批注权限由第三方业务系统负责。

### 7.6 快照与状态

| 方法 | 说明 |
|---|---|
| `snapshot(options)` | 创建快照，iframe 可传 `download` 和 `filename` |
| `takeSnapshot(options)` | 快照别名，返回快照数据 |
| `getState()` | 获取模型、选择、相机和模式状态 |
| `getCapabilities()` | 获取稳定方法和入口扩展能力 |

## 8. 入口专属扩展

以下方法不是跨入口稳定契约，使用前必须检查 `getCapabilities().extensions`：

| 入口 | 扩展方法 |
|---|---|
| iframe | `openPathRoamPanel`、`waitReady`、`sendCommand` |
| 直接 SDK | `closeModel`、`resize`、`dispose`、`pick`、`rectanglePick`、`setCtrlLookEnabled`、`getCtrlLookMode` |

`ViewerRuntimeSDK` 是 `/viewer/index.html` 内部命令门面，用于连接 Viewer UI 与 iframe Bridge。第三方不得把它作为初始化入口。

## 9. 事件与错误处理

### 9.1 标准事件数据

SDK 事件采用以下公共元数据：

```js
{
  schemaVersion: "bim-viewer-sdk-event/v1",
  eventId: "event-...",
  event: "selectionChanged",
  source: "iframe|direct-sdk|viewer-runtime",
  timestamp: 1780000000000,
  payload: {}
}
```

为兼容现有代码，部分事件还会在 `event.detail` 顶层保留旧字段。新业务代码应优先读取 `detail.payload`，并在对接过渡期兼容 `detail.payload ?? detail`。

### 9.2 iframe 事件名

| 事件 | 说明 |
|---|---|
| `ready` | Viewer 初始化完成 |
| `modelLoaded` | 模型加载完成 |
| `modelLoadFailed` | 模型加载失败 |
| `selectionChanged` | 选择变化 |
| `snapshotCreated` | 快照创建完成 |
| `snapshotFailed` | 快照创建失败 |
| `commandCompleted` | 普通命令完成 |
| `commandFailed` | 命令执行失败 |
| `commandRejected` | 命令不支持或来源不允许 |
| `state` | Viewer 状态响应 |

### 9.3 直接 SDK 事件名

直接 SDK 事件当前使用全小写命名：

`ready`、`progress`、`modelloaded`、`modelclosed`、`selectionchanged`、`ctrllookchange`、`freeinspectchange`、`pathroamchange`、`labelcreated`、`labelremoved`、`annotationcreated`、`annotationupdated`、`annotationremoved`、`businessdatasynced`。

iframe 与直接 SDK 的事件名大小写暂未完全统一。封装业务适配层时应集中转换，不要在各业务页面分散判断。

### 9.4 调用错误

```js
try {
  await client.openModel({manifestUrl});
} catch (error) {
  console.error("模型加载失败", {
    message: error.message,
    payload: error.payload
  });
}
```

建议业务系统统一处理以下错误：

| 类型 | 处理建议 |
|---|---|
| Ready 超时 | 检查 iframe 地址、CSP、Origin 和 Viewer 控制台错误 |
| 命令超时 | 提示重试，并记录命令名、模型和请求时间 |
| Manifest 失败 | 检查 HTTP 状态、JSON、schemaVersion 和资源 URL |
| `.frag` 加载失败 | 检查 CORS、资源大小、网络中断和 Worker |
| GlobalId 无匹配 | 检查模型版本与 GlobalId 索引，不要退化为旧版本 localId |
| 命令拒绝 | 检查消息来源、协议版本和能力清单 |

## 10. 业务数据 API

`BusinessDataApiClient` 支持以下资源：

- `viewpoints`
- `labels`
- `annotations`
- `snapshots`

REST 约定：

```text
GET    /api/business-data/{type}
GET    /api/business-data/{type}/{id}
POST   /api/business-data/{type}
PUT    /api/business-data/{type}/{id}
DELETE /api/business-data/{type}/{id}
```

响应约定：

```json
// 列表
{"items": [], "count": 0, "type": "labels"}

// 查询、创建或修改
{"item": {"id": "label-1"}}
```

直接 SDK 可以传入 API 地址：

```js
const sdk = await BimViewerSDK.create({
  container,
  businessDataBaseUrl: "https://api.example.com/api/business-data",
  businessDataMode: "manual",
  businessDataHeaders: {
    Authorization: `Bearer ${accessToken}`
  },
  projectId: "project-a",
  versionId: "v1",
  userId: "user-1001"
});
```

也可以自定义客户端或带认证的 `fetchImpl`：

```js
import {BusinessDataApiClient} from "/viewer/sdk/index.js";

const businessDataClient = new BusinessDataApiClient({
  baseUrl: "https://api.example.com/api/business-data",
  fetchImpl: (url, options = {}) => fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      "X-Project-Token": projectToken
    }
  })
});
```

iframe 集成建议使用同站 Cookie、API 网关反向代理或短时签名资源 URL。不要把长期访问令牌直接拼接到 Viewer URL。

## 11. ID 与版本规则

| 标识 | 稳定范围 | 用途 |
|---|---|---|
| `tenantId` | 租户级 | 多租户隔离 |
| `projectId` | 项目级 | 业务项目关联 |
| `modelId` | 模型级 | 同一模型跨版本关联 |
| `modelVersionId` / `versionId` | 模型版本级 | 明确当前加载版本 |
| `GlobalId` | IFC 语义构件级 | 业务绑定、跨版本构件匹配的首选键 |
| `localId` | 单个 `.frag` 版本内 | 高性能渲染和当前会话交互 |

第三方业务表应优先保存 `modelId + versionId + GlobalId`。`localId` 可能在重新转换或模型版本变化后改变，不应作为长期业务主键。

## 12. 安全与部署要求

### 12.1 CORS

跨域部署时，下列资源都需要允许业务系统或 Viewer Origin 访问：

- Manifest JSON
- `.frag`
- 属性 JSON 和 GlobalId 索引
- SDK ESM 文件及其传递依赖
- Fragments Worker
- 业务数据 API

### 12.2 CSP

业务系统和 Viewer 的 CSP 至少需要按部署域名配置：

- `frame-src`：允许 Viewer Origin
- `connect-src`：允许模型资源和业务 API Origin
- `worker-src`：允许 Worker Origin；按浏览器情况包含 `blob:`
- `script-src`：允许 SDK 模块来源

### 12.3 认证与资源授权

- 模型资源应使用受控 Cookie、网关鉴权或短时签名 URL。
- iframe URL 不传长期 Token。
- 服务端必须校验租户、项目、模型版本和用户权限。
- Viewer 事件只表示前端交互结果，不能替代服务端权限判断。
- 生产环境使用 HTTPS 和精确 Origin。

## 13. 当前限制

1. SDK 尚未发布 npm 包，也未形成独立的版本化 CDN 产物。
2. iframe 与直接 SDK 的事件名大小写尚未统一，但事件元数据已标准化。
3. 多模型管理和双视窗版本差异对比已在主 Viewer 中实现基础能力，但尚未进入稳定、可移植的第三方 SDK 合同。
4. 测量、剖切、分区可视化、模型变换等主 Viewer 功能当前没有全部进入稳定 SDK 方法清单。
5. 标签、批注和路径数据的本地存储适合演示；跨用户使用必须接业务后端。
6. 当前静态开发服务器不代表生产 CORS、缓存、鉴权和大文件传输配置。

第三方系统不得直接调用 `main-mvp.js` 内部函数、Fragments Model 对象或 Viewer DOM 节点。这些均属于内部实现，不保证兼容。

## 14. 联调与验收清单

| 编号 | 验收项 | 通过标准 |
|---|---|---|
| SDK-01 | Viewer Ready | `waitReady()` 在超时前成功 |
| SDK-02 | Manifest 加载 | 模型加载完成并触发 `modelLoaded` / `modelloaded` |
| SDK-03 | 模型适配 | `fitModel()` 后模型位于有效视口范围 |
| SDK-04 | 业务选择模型 | `selectGlobalIds()` 能选中并触发选择事件 |
| SDK-05 | Viewer 反向通知业务 | 用户点击构件后业务系统收到 `GlobalId` 和 `localId` |
| SDK-06 | 属性查询 | `getItemInfo()` 返回构件名称、ID 和属性数据 |
| SDK-07 | 显隐操作 | 隐藏、隔离、着色、透明和 `showAll()` 可恢复 |
| SDK-08 | 视点 | 捕获视点后可恢复相机与可选选择状态 |
| SDK-09 | 标签批注 | 可按 GlobalId 创建、查询、修改或删除 |
| SDK-10 | 漫游 | 路线、关键帧和播放控制正常 |
| SDK-11 | 错误处理 | 错误 Manifest、超时和无权限均有明确提示与日志 |
| SDK-12 | 跨域安全 | 精确 Origin 生效，错误来源消息被拒绝 |
| SDK-13 | 页面销毁 | 路由切换后无残留监听、动画循环和 WebGL 资源 |
| SDK-14 | 大模型网络 | 支持断网提示、超时处理和大文件服务端 Range/缓存策略验证 |

## 15. 推荐对接流程

1. 第三方先使用 iframe + `BimViewerEmbedClient` 完成单模型加载。
2. 使用 `GlobalId` 打通业务列表与模型双向选择。
3. 接入视点、标签、批注和快照数据接口。
4. 完成 Origin、CORS、CSP、认证和资源授权配置。
5. 按第 14 节完成测试环境验收。
6. 只有确认 iframe 无法满足 UI 或交互要求时，再评估直接 ESM SDK。

## 16. 仓库参考实现

| 内容 | 路径 |
|---|---|
| 稳定 SDK 导出 | `viewer-service/viewer/sdk/index.js` |
| iframe Client | `viewer-service/viewer/sdk/embed-client.js` |
| 直接 SDK | `viewer-service/viewer/sdk/viewer-sdk.js` |
| 集成能力契约 | `viewer-service/viewer/sdk/sdk-integration-contract.js` |
| 事件契约 | `viewer-service/viewer/sdk/sdk-event-contract.js` |
| Manifest 加载器 | `viewer-service/viewer/manifest-loader.js` |
| 业务数据 Client | `viewer-service/viewer/sdk/business-data-client.js` |
| iframe 示例 | `viewer-service/viewer/demo-pages/iframe-integration.html` |
| 直接 SDK 示例 | `viewer-service/viewer/demo-pages/model-load.html` |
