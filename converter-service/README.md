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

## 启动 HTTP 任务服务

```bat
npm run serve
```

默认地址：

```text
http://127.0.0.1:5180
```

健康检查：

```text
GET /health
```

创建转换任务：

```http
POST /api/conversions
Content-Type: application/json

{
  "inputPath": "E:\\BimModelThree\\converter-service\\models\\demo.ifc",
  "modelName": "demo",
  "fullProperties": true,
  "bytesMode": false,
  "raw": false
}
```

查询任务：

```text
GET /api/conversions/{taskId}
GET /api/conversions/{taskId}/manifest
GET /api/conversions/{taskId}/report
GET /api/conversions/{taskId}/fragments
```

第一版任务服务使用内存任务表和串行队列，适合 MVP 验证。服务重启后历史任务状态不会自动恢复，但已经生成的 `.frag`、`manifest.json` 和 `conversion-report.json` 会保留在 `output/tasks/{taskId}/`。

## 业务数据持久化接口

第一版业务数据接口使用可替换的存储仓储接口，当前默认后端为 `json-file`，数据保存到：

```text
converter-service/output/business-data/
```

可通过环境变量调整：

```text
BUSINESS_DATA_BACKEND=json-file
BUSINESS_DATA_ROOT=converter-service/output/business-data
```

当前 `BUSINESS_DATA_BACKEND` 仅支持 `json-file`。后续切换数据库时，应新增数据库仓储实现，并保持 `/api/business-data` 接口结构不变。

支持的数据类型：

```text
viewpoints
labels
annotations
snapshots
```

通用接口：

```text
GET    /api/business-data
GET    /api/business-data/{type}
POST   /api/business-data/{type}
GET    /api/business-data/{type}/{id}
PUT    /api/business-data/{type}/{id}
DELETE /api/business-data/{type}/{id}
```

`GET /api/business-data` 返回当前存储后端、schemaVersion 和支持的数据类型，可用于部署验收。

列表查询支持过滤参数：

```text
tenantId
projectId
modelId
versionId
localId
globalId
status
createdBy
```

创建标签示例：

```http
POST /api/business-data/labels
Content-Type: application/json

{
  "projectId": "demo-project",
  "modelId": "demo-model",
  "versionId": "v1",
  "localId": 123,
  "globalId": "0Jk8...",
  "title": "业务标签",
  "position": [0, 0, 0],
  "content": {
    "subtitle": "设备巡检"
  }
}
```

查询当前模型批注：

```text
GET /api/business-data/annotations?projectId=demo-project&modelId=demo-model&versionId=v1
```

## 服务边界

Viewer 应该通过 URL 或本地文件选择消费转换生成的 `.frag` 文件。该服务不应该托管 Viewer 页面。
当前 HTTP 服务负责转换任务、状态、产物、报告和第一版业务数据持久化；仍不负责 Viewer 页面、正式业务权限、审批流和多人协同。
