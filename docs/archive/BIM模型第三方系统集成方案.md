# BIM 模型系统第三方集成方案

版本：v1.0
日期：2026-06-25

## 1. 目标

为第三方业务系统提供明确的 BIM 模型系统接入方式，解决以下问题：

- 如何在业务系统中打开、查看和操作模型。
- 如何接收模型加载结果、选中结果和状态变化。
- 如何在不破坏现有 `viewer-service` / `converter-service` 架构的前提下完成集成。

## 2. 当前架构判断

当前仓库的模型系统是典型的“双服务”结构：

- `converter-service` 负责模型转换与产物生成。
- `viewer-service` 负责浏览器端模型加载与交互渲染。

其中 `viewer-service/viewer/index.html`、`viewer-service/viewer/main-mvp.js`、`viewer-service/viewer/bim-viewer-app.js` 都表明当前 Viewer 仍是一个独立运行的页面应用，核心能力虽然已经封装成 `BimViewerApp`，但还没有形成可直接给外部业务前端工程依赖的标准 npm SDK 包。

因此，**当前阶段推荐第三方优先采用 iframe 集成**。

## 3. 推荐方案：iframe 集成

### 3.1 适用场景

- 第三方系统只需要“打开模型并操作”。
- 第三方系统已经有自己的业务框架、权限体系和导航体系。
- 希望最快上线，尽量少改第三方前端工程。
- 需要将模型系统作为一个相对独立的子系统交付。

### 3.2 集成方式

第三方系统在页面中嵌入 viewer 页面：

```html
<iframe
  src="https://model-host/viewer/index.html?manifest=https://.../manifest.json"
  style="width:100%;height:100%;border:0"
></iframe>
```

### 3.3 约定参数

建议至少支持以下参数：

- `manifest`：模型 manifest 地址。
- `modelId`：模型逻辑 ID，可用于后台查找 manifest。
- `mode`：viewer 模式，例如 `single`、`overlay`、`diff`。
- `token`：登录态或访问令牌。
- `theme`：主题配置，可选。

### 3.4 通信方式

建议使用 `postMessage` 做双向通信。

第三方 -> Viewer：
- 打开模型
- 切换模型版本
- 请求定位、截图、清空选择
- 请求同步当前视点

Viewer -> 第三方：
- 模型加载完成
- 模型加载失败
- 构件选中变化
- 当前视点变化
- 导出截图结果

### 3.5 iframe 消息协议

当前 Viewer 约定协议名为：

```text
bim-viewer:v1
```

第三方系统发送消息格式：

```js
iframe.contentWindow.postMessage({
  protocol: "bim-viewer:v1",
  target: "bim-viewer",
  type: "openModel",
  requestId: "req-001",
  payload: {
    manifestUrl: "https://model-host/models/demo/manifest.json"
  }
}, "https://model-host");
```

Viewer 回传消息格式：

```js
{
  protocol: "bim-viewer:v1",
  source: "bim-viewer",
  type: "modelLoaded",
  requestId: "req-001",
  payload: {
    modelId: "demo-001",
    name: "Demo",
    localIds: 1200
  }
}
```

生产环境必须显式指定 `postMessage` 的目标源，不建议长期使用 `*`。

### 3.6 当前支持的命令

| 命令 | 方向 | 说明 |
| --- | --- | --- |
| `openModel` | 第三方 -> Viewer | 通过 `manifestUrl` 或 `fragUrl` 打开模型 |
| `fitModel` | 第三方 -> Viewer | 适配当前模型视图 |
| `fitSelection` | 第三方 -> Viewer | 适配当前选中构件 |
| `setView` | 第三方 -> Viewer | 切换标准视图，支持 `iso`、`top`、`front`、`back`、`left`、`right`、`bottom` |
| `clearSelection` | 第三方 -> Viewer | 清空当前选中 |
| `snapshot` | 第三方 -> Viewer | 生成当前视口截图 |
| `getState` | 第三方 -> Viewer | 获取当前模型、选中和视点状态 |

### 3.7 当前支持的事件

| 事件 | 方向 | 说明 |
| --- | --- | --- |
| `ready` | Viewer -> 第三方 | Viewer 已初始化，可接收命令 |
| `modelLoaded` | Viewer -> 第三方 | 模型加载完成 |
| `modelLoadFailed` | Viewer -> 第三方 | 模型加载失败 |
| `selectionChanged` | Viewer -> 第三方 | 构件选中状态变化 |
| `snapshotCreated` | Viewer -> 第三方 | 截图创建完成 |
| `snapshotFailed` | Viewer -> 第三方 | 截图创建失败 |
| `state` | Viewer -> 第三方 | 当前状态返回 |
| `commandCompleted` | Viewer -> 第三方 | 命令执行完成 |
| `commandFailed` | Viewer -> 第三方 | 命令执行失败 |
| `commandRejected` | Viewer -> 第三方 | 命令因来源校验失败被拒绝 |

### 3.8 第三方页面示例

```html
<iframe
  id="bimViewer"
  src="https://model-host/viewer/index.html?embedOrigin=https%3A%2F%2Fbusiness-host"
  style="width:100%;height:720px;border:0"
></iframe>

<script>
  const iframe = document.getElementById("bimViewer");
  const viewerOrigin = "https://model-host";

  window.addEventListener("message", (event) => {
    if (event.origin !== viewerOrigin) return;
    const message = event.data;
    if (!message || message.protocol !== "bim-viewer:v1") return;
    console.log("Viewer event:", message.type, message.payload);
  });

  function openModel(manifestUrl) {
    iframe.contentWindow.postMessage({
      protocol: "bim-viewer:v1",
      target: "bim-viewer",
      type: "openModel",
      requestId: String(Date.now()),
      payload: { manifestUrl }
    }, viewerOrigin);
  }
</script>
```

### 3.9 优点

- 交付快。
- 与现有项目架构一致。
- 不要求第三方工程引入复杂依赖。
- Viewer 可独立升级，不影响宿主系统发布。

### 3.10 局限

- 与宿主页面的 DOM、路由、状态共享能力弱。
- 深度定制成本高。
- 复杂交互需要额外做消息协议。

## 4. 二期方案：npm 包集成

### 4.1 适用场景

- 第三方系统希望把模型能力嵌入到自己的 React / Vue / Angular 页面中。
- 需要更紧密的 UI 融合。
- 需要与宿主系统共享权限、主题、国际化、弹窗和布局。
- 需要把模型视图当作一个页面组件，而不是独立子系统。

### 4.2 目标形态

建议后续将 `BimViewerApp` 发展为 SDK 入口，例如：

```js
import { createBimViewer } from "bim-viewer-sdk";

const app = await createBimViewer({
  container,
  workerUrl,
  manifestUrl
});
```

### 4.3 SDK 边界

SDK 只负责：
- 初始化渲染环境。
- 加载 / 释放模型。
- 暴露基础事件。
- 逐步暴露选择、显示、视点等能力。

页面壳、按钮、布局、业务路由由宿主系统负责。

### 4.4 优点

- 深度集成能力强。
- 宿主系统体验统一。
- 更适合平台化长期演进。

### 4.5 局限

- 需要明确打包、版本、依赖和兼容策略。
- 初期接入成本高于 iframe。
- 需要更严格的 API 稳定性管理。

## 5. 推荐结论

### 5.1 当前阶段

**优先 iframe。**

原因是当前项目已经具备独立 Viewer 服务能力，而不是完整成熟的前端 SDK 产品形态。iframe 最符合现状，也最容易稳定交付。

### 5.2 演进方向

建议按以下顺序演进：

1. 先把 viewer 作为独立页面通过 iframe 对外提供。
2. 再把 `BimViewerApp` 中的核心能力继续收口成稳定 API。
3. 最后抽出 npm SDK 包，供需要深度集成的系统使用。

## 6. 集成建议

### 6.1 业务系统接入建议

第三方系统如果是“项目管理平台、OA、台账系统、审批系统、BIM 门户”等，建议先用 iframe。

### 6.2 工程接入建议

第三方系统如果是“自身就是前端产品，且希望模型作为核心页面组件”，再考虑 npm SDK。

### 6.3 实施顺序

- 第一阶段：iframe + postMessage。
- 第二阶段：SDK API 稳定化。
- 第三阶段：npm 包发布。

## 7. 现有仓库对应关系

- `converter-service`：负责生成 `manifest.json` 和 `.frag`。
- `viewer-service/viewer/index.html`：标准 Viewer 页面入口。
- `viewer-service/viewer/demo.html`：功能演示与验收入口。
- `viewer-service/viewer/bim-viewer-app.js`：SDK 化的核心雏形。

## 8. 结论

对于当前架构，第三方系统**优先采用 iframe 集成**，这是最稳、最快、最符合现状的方式。`npm` 包方式是更长期的二期目标，适合在 Viewer 核心 API 稳定后再推进。
