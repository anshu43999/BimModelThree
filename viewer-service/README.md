# BIM Fragments 渲染服务

该服务只负责浏览器端 BIM Viewer。它通过 URL 或本地文件选择加载 `.frag` 文件，不负责 IFC 转换。

## 职责

- 托管 PC 端和移动端 Viewer 页面。
- 加载 `.frag` 模型。
- 使用 Three.js 和 `@thatopen/fragments` 渲染模型。
- 提供模型树、构件选择、属性查看、隐藏、隔离、着色、透明度、快照和视点工具。

## 安装依赖

```bat
cd /d E:\BimModelThree\viewer-service
npm install
```

## 启动服务

```bat
npm run serve
```

访问：

```text
http://127.0.0.1:5175/viewer/index.html
http://127.0.0.1:5175/viewer/mobile.html
```

局域网或手机访问：

```bat
npm run serve:lan
```

## 服务边界

该服务不应该转换 IFC 文件，只应该消费转换服务生成的 `.frag` 文件，或加载用户本地选择的 `.frag` 文件。
