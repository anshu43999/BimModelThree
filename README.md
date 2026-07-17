# BimModelThree

更新时间：2026-07-17

`BimModelThree` 是基于 Three.js 与 `@thatopen/fragments` 的 BIM 模型转换、浏览和第三方集成项目。当前前端主要功能已经形成基础版，项目进入真实模型验收、SDK 试接入、后端产品化和架构收口阶段。

## 技术路线

```text
IFC
 -> converter-service
 -> .frag + manifest.json + conversion report
 -> viewer-service
 -> iframe / JavaScript SDK
 -> third-party business system
```

当前 BIM Viewer 主格式为 `.frag`，推荐通过 `bim-model-manifest/v1` Manifest 加载模型。GLB 是辅助导出格式，不替代 Fragments 主链路。

## 项目结构

```text
BimModelThree/
  converter-service/       IFC -> Fragments 转换、验证和 HTTP API
  viewer-service/          PC/移动 Viewer、Demo、SDK、Engine 和测试
  ifc-to-glb-converter/    可选的 IFC -> GLB Python 工具
  docs/                    当前文档与历史归档
```

### converter-service

负责：

- IFC 转 `.frag`。
- 生成 Manifest 和转换报告。
- T003 属性完整度与 T004 ID 稳定性验证。
- 提供转换任务 HTTP API。
- 提供 viewpoints、labels、annotations、snapshots 文件型业务数据 API。

默认 HTTP 端口：`5180`。

### viewer-service

负责：

- PC、移动端和功能 Demo。
- Manifest、URL 和本地 Frag 加载。
- 模型树、属性、选择、测量、剖切、视点和快照。
- 标签、批注、气泡样式、位置调整和聚合。
- 分区可视化、多模型装配、自由巡检和路径漫游。
- 双视窗以及 GlobalId、属性、几何版本差异。
- iframe Client、Runtime SDK 和直接 ESM SDK。

Viewer 不直接解析 IFC。

默认静态服务端口：`5176`。

### ifc-to-glb-converter

可选的 Python 辅助工具，使用 IfcOpenShell 将 IFC 转换为 GLB，适用于轻量预览和外部格式交付。它不属于当前核心 Viewer 加载链路。

## 环境要求

- Node.js 和 npm。
- Python 3.11 或更高版本，仅 `ifc-to-glb-converter` 需要。
- 支持 WebGL、ES Module 和 Worker 的现代浏览器。

依赖版本：

| 依赖 | 版本 |
|---|---:|
| `three` | `0.182.0` |
| `@thatopen/fragments` | `3.4.5` |
| `web-ifc` | `0.0.77` |

## 安装

Node.js 服务分别安装依赖：

```bat
cd /d E:\BimModelThree\converter-service
npm install

cd /d E:\BimModelThree\viewer-service
npm install
```

可选 GLB 工具：

```bat
cd /d E:\BimModelThree\ifc-to-glb-converter
python -m venv .venv
.venv\Scripts\activate
pip install -e .
```

## 快速启动

### 1. 转换 IFC

```bat
cd /d E:\BimModelThree\converter-service

npm run convert -- models\demo.ifc output\demo.frag
```

完整属性转换：

```bat
npm run convert:full:8g -- models\demo.ifc output\demo.full.frag
```

验证 T003/T004：

```bat
npm run validate:t003-t004:8g -- models\demo.ifc -- --sample-size=500
```

转换成功后，建议使用生成的 `output/manifest.json` 作为 Viewer 加载入口。

### 2. 启动转换 API

```bat
cd /d E:\BimModelThree\converter-service
npm run serve
```

服务入口：

```text
http://127.0.0.1:5180/health
http://127.0.0.1:5180/api/conversions
http://127.0.0.1:5180/api/business-data
```

当前转换任务表位于内存中，服务重启后不会恢复任务状态；已生成的转换产物仍保留在 `converter-service/output/`。

### 3. 启动 Viewer

```bat
cd /d E:\BimModelThree\viewer-service
npm run serve
```

访问地址：

```text
PC Viewer:  http://127.0.0.1:5176/viewer/index.html
功能 Demo:  http://127.0.0.1:5176/viewer/demo.html
移动 Viewer: http://127.0.0.1:5176/viewer/mobile.html
```

Viewer 静态服务将 `/converted/*` 映射到 `converter-service/output/*`。默认 Manifest 地址为：

```text
http://127.0.0.1:5176/converted/manifest.json
```

局域网访问：

```bat
npm run serve:lan
```

## 第三方系统集成

推荐使用 iframe + `BimViewerEmbedClient`，它可以隔离 Three.js 和 Fragments 依赖，并允许 Viewer 独立升级。

高级集成可以使用 `BimViewerSDK` 直接接管 Canvas 和模型生命周期。当前项目尚未发布 npm 包，直接 SDK 以静态 ESM 或业务系统构建集成为主。

详细说明：

- [第三方系统 SDK 对接说明](docs/BIM%20Viewer第三方系统SDK对接说明.md)
- [Manifest 与 Viewer SDK 规范](docs/BIM模型Manifest与ViewerSDK规范.md)

## 自动化验证

Viewer 全量 Node 测试：

```bat
cd /d E:\BimModelThree\viewer-service
node --test --test-isolation=none
```

当前基线：`109 passed / 0 failed`。

IFC 转 GLB 测试：

```bat
cd /d E:\BimModelThree\ifc-to-glb-converter
python -m pytest -p no:cacheprovider
```

当前基线：`25 passed / 3 skipped`。

自动化测试不替代浏览器、GPU、网络和真实项目模型人工验收。

## 数据与版本规则

- 模型资源使用 HTTP(S) URL，不使用本地 Windows 路径作为第三方接口。
- 业务构件优先保存 `modelId + versionId + GlobalId`。
- `localId` 只在当前模型版本和运行时内使用。
- 视点、标签、批注和快照当前支持文件型业务数据 API；正式环境仍需数据库、权限和审计。
- `converter-service/output/`、模型二进制、临时分析和生成报表不提交 Git。

## 文档

项目文档入口：[docs/README.md](docs/README.md)

核心文档：

- [系统当前现状](docs/BIM模型系统MVP现状与开发记录.md)
- [进度评估与计划](docs/BIM模型项目进度评估与进度计划表.md)
- [功能验收清单](docs/BIM模型系统功能验收清单.md)
- [系统架构与模块实施方案](docs/BIM模型系统架构与模块实施方案.md)
- [Viewer 系统优化方案](docs/BIM%20Viewer系统优化方案.md)

历史方案和阶段记录位于 `docs/archive/`。

## 当前限制

- T003/T004 仍需使用真实项目模型形成正式验证报告。
- Viewer 主要功能仍需完整人工验收。
- 业务数据后端目前是 JSON 文件仓储，不是生产数据库。
- 多模型装配依赖明确的模型坐标系、单位和基点。
- 同源图纸模型联动尚未实现。
