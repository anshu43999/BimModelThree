# BimModelThree

`BimModelThree` 当前已拆分为两个互相独立的服务：

```text
BimModelThree/
  converter-service/  IFC -> .frag 转换与验证
  viewer-service/     Three.js + Fragments 浏览器渲染页面
  docs/               架构与 MVP 文档
```

转换服务和渲染服务不能依赖彼此的运行时文件。两者之间只应通过生成的 `.frag` 文件，或后续新增的 HTTP API 进行交互。

## 服务边界

### converter-service

只负责 IFC 转换：

- 读取 IFC 文件。
- 生成 `.frag` 文件。
- 执行 T003/T004 验证。
- 将转换产物和验证报告保存到 `converter-service/output/`。

它不应该托管 Viewer 页面。

### viewer-service

只负责浏览器渲染：

- 托管 PC 端和移动端 Viewer 页面。
- 通过 URL 或本地文件选择加载 `.frag` 文件。
- 使用 Three.js 和 `@thatopen/fragments` 渲染模型。
- 提供模型树、构件选择、属性查看、隐藏、隔离、着色、透明度、快照和视点工具。

它不应该转换 IFC 文件。

## 安装依赖

依赖按服务分别安装。拆分后，根目录 `E:\BimModelThree\node_modules` 不再使用，可以删除。

转换服务：

```bat
cd /d E:\BimModelThree\converter-service
npm install
```

渲染服务：

```bat
cd /d E:\BimModelThree\viewer-service
npm install
```

## 运行转换服务

默认转换：

```bat
cd /d E:\BimModelThree\converter-service
npm run convert -- models\20210219Architecture.ifc output\20210219Architecture.frag
```

完整属性转换：

```bat
npm run convert:full:8g -- models\20210219Architecture.ifc output\20210219Architecture.full.frag
```

验证 T003/T004：

```bat
npm run validate:t003-t004:8g -- models\20210219Architecture.ifc -- --sample-size=500
```

## 运行渲染服务

```bat
cd /d E:\BimModelThree\viewer-service
npm run serve
```

访问：

```text
http://127.0.0.1:5175/viewer/index.html
http://127.0.0.1:5175/viewer/mobile.html
```

Viewer 只加载 `.frag` 文件，不直接读取 IFC。



不要删除 `converter-service/output/`，除非里面的 `.frag` 产物和验证报告已经不再需要。
