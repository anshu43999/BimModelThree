# BIM 模型 Manifest 与 Viewer SDK 实施计划

## 目标

将当前“Viewer 直接加载 `.frag` 文件”的方式升级为：

```text
converter-service 生成 manifest.json
viewer-service 通过 BimViewerApp.openModel({ manifestUrl }) 加载模型
demo.html 作为功能演示和验收入口
```

## Manifest v1

Manifest 描述模型版本、转换产物和可选索引资源。当前 schema：

```text
bim-model-manifest/v1
```

核心字段：

```json
{
  "schemaVersion": "bim-model-manifest/v1",
  "modelId": "demo",
  "modelVersionId": "demo-1710000000000",
  "displayName": "Demo",
  "source": {
    "type": "ifc",
    "fileName": "Demo.ifc",
    "sizeBytes": 0
  },
  "resources": {
    "fragments": {
      "url": "./Demo.frag",
      "sizeBytes": 0,
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

## Viewer SDK

新增：

```text
viewer-service/viewer/manifest-loader.js
viewer-service/viewer/bim-viewer-app.js
```

第一版 SDK 只收口加载、释放和 Fragments 更新。后续再逐步迁移选择、属性、视图、显示控制。

## 功能演示系统

新增：

```text
viewer-service/viewer/demo.html
viewer-service/viewer/demo.css
```

演示页承担：

- Manifest 加载入口。
- Viewer、移动端入口。
- 加载、模型树、选择、属性、显示控制、视图工具的功能清单。
- 后续标准模型库、转换任务状态、性能记录和回归验收入口。

## 后续阶段

1. 为 converter-service 增加 HTTP 任务接口。
2. 生成 `properties.json`、`global-id-index.json`。
3. 在 BimViewerApp 中封装选择、隐藏、隔离、着色、视点。
4. demo.html 接入标准模型列表和性能记录。
