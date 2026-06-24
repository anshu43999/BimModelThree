# BIM Fragments 转换服务

该服务只负责 IFC 到 Fragments 的转换与验证。它不托管 Viewer 页面，也不依赖前端渲染服务。

## 职责

- 将 IFC 文件转换为 `.frag` 文件。
- 对比默认转换和完整属性转换。
- 验证 T003 属性完整度。
- 验证 T004 构件 ID 稳定性。
- 将生成的 `.frag` 文件和验证报告保存到 `output/`。

## 安装依赖

```bat
cd /d E:\BimModelThree\converter-service
npm install
```

## 执行转换

默认转换：

```bat
npm run convert -- models\20210219Architecture.ifc output\20210219Architecture.frag
```

完整属性转换：

```bat
npm run convert:full:8g -- models\20210219Architecture.ifc output\20210219Architecture.full.frag
```

## 验证 T003/T004

```bat
npm run validate:t003-t004:8g -- models\20210219Architecture.ifc -- --sample-size=500
```

## 服务边界

Viewer 应该通过 URL 或本地文件选择消费转换生成的 `.frag` 文件。该服务不应该托管 Viewer 页面。

当前该服务仍是命令行工具形态，不是 HTTP 服务。后续如果需要服务化，可以增加上传、转换任务、状态查询、文件下载和报告查询接口。
