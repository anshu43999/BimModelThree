# IFC 转 GLB 功能实施计划（修订版：纯 web-ifc 路线）

## 1. 概述

在现有 `converter-service` 中新增 `convert-ifc-to-glb.js`，**仅依赖 `web-ifc` + `three` 两个库**，实现 IFC 文件直接转换为 glTF Binary（.glb）格式，不经过 `.frag` 中间格式。

---

## 2. 技术路线：web-ifc（解析+几何提取）→ three.js（场景构建+GLB 导出）

```
[IFC 源文件（Uint8Array）]
      |
      v
[web-ifc IfcAPI]
      ├── OpenModel()           → modelID（解析 IFC 到 WASM 内存）
      ├── StreamAllMeshes()     → 遍历所有 FlatMesh（expressID + 颜色 + geometry引用列表）
      ├── GetGeometry()         → 每个 geometry 的顶点/索引 WASM 堆指针
      ├── GetVertexArray()      → 从 WASM 堆拷贝顶点 Float32Array
      ├── GetIndexArray()       → 从 WASM 堆拷贝索引 Uint32Array
      ├── GetSpatialStructure() → 空间层级树（Project→Site→Building→Storey→Elements）
      ├── GetLine()             → 按 expressID 读取 IFC 实体原始属性
      └── CloseModel()          → 释放 WASM 内存
      |
      v
[Three.js 场景构建]
      ├── flatTransformation（16个float）→ THREE.Matrix4
      ├── 顶点+索引 → THREE.BufferGeometry
      ├── 按 IFC 类型创建共享材质（THREE.MeshPhongMaterial）
      ├── 空间树 → THREE.Group 层级
      ├── IFC 属性 → mesh.userData（→ GLB node extras）
      └── PlacedGeometry.color → 备选颜色来源
      |
      v
[THREE.GLTFExporter] → .glb ArrayBuffer → 写入磁盘
```

**全程不触及 `@thatopen/fragments`。** 只依赖项目已有的 `web-ifc`（v0.0.77），并显式添加 `three` 为 converter-service 的直接依赖。

---

## 3. 架构设计

### 3.1 文件规划

```
converter-service/
├── src/
│   ├── convert-ifc-to-fragments.js   ← 已有（不动）
│   ├── convert-ifc-to-glb.js         ← 新增（入口）
│   └── lib/
│       ├── ifc-api.js                ← 封装 web-ifc IfcAPI：初始化、打开模型、流式遍历
│       ├── geometry-builder.js       ← FlatMesh + IfcGeometry → THREE.BufferGeometry
│       ├── material-mapper.js        ← IFC 类型 → 材质颜色映射
│       ├── hierarchy-builder.js      ← GetSpatialStructure → THREE.Group 层级树
│       └── glb-exporter.js           ← GLTFExporter 封装
├── node_modules/
│   ├── web-ifc/                      ← 已有
│   └── three/                        ← 新增直接依赖（安装后）
└── package.json                      ← 新增 "three" 依赖 + npm scripts
```

### 3.2 模块职责

#### ifc-api.js（约 100 行）

封装 `web-ifc` 的 `IfcAPI` 生命周期，对外暴露简洁接口：

```javascript
// 导出
export async function initIfcApi(wasmDir)   // 初始化 WASM，返回 IfcAPI 实例
export function openModel(ifcApi, data)     // 返回 modelID
export function streamAllMeshes(ifcApi, modelID, callback)  // 遍历 FlatMesh
export function getGeometryData(ifcApi, modelID, geomExpressID)  // 返回 { positions, indices, normals? }
export function getSpatialTree(ifcApi, modelID)  // 返回空间树 JSON
export function getEntityProps(ifcApi, modelID, expressID)  // 返回属性对象
export function closeModel(ifcApi, modelID)  // 释放内存
```

核心实现细节：

- **WASM 路径**：`web-ifc` 的 WASM 文件在 `node_modules/web-ifc/` 下，通过 `Init()` 的 `customLocateFileHandler` 参数指定绝对路径，与 `convert-ifc-to-fragments.js` 中的配置方式一致。
- **StreamAllMeshes**：`ifcApi.StreamAllMeshes(modelID, (flatMesh) => { ... })`，回调接收 `FlatMesh` 对象，每条包含 `expressID`、`geometries: Vector<PlacedGeometry>`。
- **GetGeometry**：`ifcApi.GetGeometry(modelID, geometryExpressID)` 返回 `IfcGeometry`，通过 `GetVertexData()` / `GetVertexDataSize()` / `GetIndexData()` / `GetIndexDataSize()` 获取 WASM 堆指针。
- **GetVertexArray / GetIndexArray**：`ifcApi.GetVertexArray(ptr, size)` 从 WASM 堆拷贝出 JS 可用的 `Float32Array`；`GetIndexArray` 拷贝 `Uint32Array`。

#### geometry-builder.js（约 200 行）

将 web-ifc 的原始几何数据转换为 `THREE.BufferGeometry`：

**输入数据结构（来自 web-ifc）**：

```
FlatMesh {
  expressID: number,                    // IFC 实体 ID
  geometries: Vector<PlacedGeometry>    // 可能有多个（如开洞）
}

PlacedGeometry {
  color: { x, y, z, w },               // RGBA
  geometryExpressID: number,           // 指向 IfcGeometry
  flatTransformation: Float32Array(16) // 4×4 变换矩阵，列主序
}

IfcGeometry (通过 GetGeometry 获取) {
  GetVertexData(): number,              // WASM 堆指针
  GetVertexDataSize(): number,          // 字节数
  GetIndexData(): number,
  GetIndexDataSize(): number,
}
```

**核心转换逻辑**：

```
For each FlatMesh:
  ├── 通过 GetLine 获取 IFC 类型名 → 确定材质
  ├── For each PlacedGeometry:
  │     ├── GetGeometry(modelID, placed.geometryExpressID)
  │     ├── GetVertexArray(ptr, size) → Float32Array
  │     │     └── 每顶点 6 个 float：x, y, z, nx, ny, nz（交错存储）
  │     ├── GetIndexArray(ptr, size) → Uint32Array
  │     ├── 分离 position（前3分量）和 normal（后3分量）
  │     ├── 构建 THREE.BufferGeometry
  │     ├── flatTransformation → THREE.Matrix4 → applyMatrix4()
  │     └── 收集到该构件的 geometry 列表
  └── 如果构件有多个 PlacedGeometry → merge 为一个 BufferGeometry
      如果只有一个 → 直接使用
  └── 创建 THREE.Mesh(mergedGeom, material)
```

**顶点布局**：web-ifc 的 `GetVertexArray` 返回的交错顶点格式为每顶点 6 个 float：`[x, y, z, nx, ny, nz]`。需要拆分为：
- `position`: 取每 6 个的前 3 个，stride = 6
- `normal`: 取每 6 个的后 3 个，stride = 6，offset = 3

**法线验证**：web-ifc 可能不提供法线（取决于 IFC 文件），此时需用 `THREE.BufferGeometry.computeVertexNormals()` 自行计算。

**多几何体合并**：使用 `THREE.BufferGeometryUtils.mergeGeometries()` 将同一构件的多个 `PlacedGeometry` 合并，减少 GLB 节点数。如果合并失败（geometry 不兼容），则降级为同一 Group 下的多个子 Mesh。

#### material-mapper.js（约 100 行）

- 维护 IFC 类型 → 颜色映射表（预设 40+ 种常见类型）
- 为每种 IFC 类型创建**一个共享的** `THREE.MeshPhongMaterial` 实例（减少 GLB 材质数量）
- 支持两种颜色来源（优先级从高到低）：
  1. `PlacedGeometry.color`（IFC 文件中定义的材质颜色，如存在且启用 `--color`）
  2. 预设类型映射表（如启用 `--color`）
  3. 默认灰色（`#808080`）
- 材质的 `name` 属性设置为 IFC 类型名，方便 GLB 中识别

核心映射表片段：

| IFC 类型 | 颜色 | 说明 |
|----------|------|------|
| IfcWall, IfcWallStandardCase | #C0C0C0 | 浅灰 |
| IfcSlab, IfcFloor | #B0B0B0 | 灰色 |
| IfcBeam | #A0A0A0 | 深灰 |
| IfcColumn | #D0D0D0 | 浅灰 |
| IfcWindow | #87CEEB | 天蓝 |
| IfcDoor | #8B4513 | 棕色 |
| IfcStair, IfcStairFlight | #DAA520 | 金色 |
| IfcRailing | #708090 | 灰蓝 |
| IfcRoof | #CD853F | 秘鲁色 |
| IfcCurtainWall | #ADD8E6 | 淡蓝 |
| IfcCovering | #F5DEB3 | 麦色 |
| IfcMember | #A0522D | 赭色 |
| ... | ... | 共约 40 种 |

#### hierarchy-builder.js（约 150 行）

从 `ifcApi.GetSpatialStructure(modelID)` 获取空间树，构建 GLB 节点层级。

**web-ifc 空间树结构**（推测，需运行时验证）：

```javascript
{
  type: "IFCPROJECT",
  expressID: 123,
  GlobalId: "xxx",
  Name: "Project Name",
  children: [
    {
      type: "IFCSITE",
      expressID: 456,
      children: [
        {
          type: "IFCBUILDING",
          expressID: 789,
          children: [
            {
              type: "IFCBUILDINGSTOREY",
              expressID: 1011,
              Name: "Level 1",
              children: [
                { type: "IFCWALL", expressID: 2001 },   // 构件引用
                { type: "IFCSLAB", expressID: 2002 },
                ...
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**构建策略**：

```
遍历空间树，对每个节点：
  ├── 如果是空间容器（IfcProject/Site/Building/Storey）
  │     → 创建 THREE.Group，name = 类型 + 名称
  │     → 递归处理 children
  ├── 如果是构件（IfcWall/Slab/Beam/...）
  │     → 从 expressID → Mesh 映射表中取出已创建的 Mesh
  │     → 添加到当前 Group
  └── 将 BIM 属性写入 Group/Mesh 的 userData
```

**关键点**：需要维护一个 `expressID → THREE.Mesh` 的映射表，在 geometry-builder 阶段创建 Mesh 时注册，在 hierarchy-builder 阶段按 expressID 取出并挂载。

#### glb-exporter.js（约 60 行）

```javascript
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export function exportToGlb(scene) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        // result is ArrayBuffer for binary (glb) mode
        resolve(Buffer.from(result));
      },
      (error) => reject(error),
      {
        binary: true,           // 输出 .glb
        onlyVisible: false,     // 导出全部
        truncateDrawRange: true,
        maxTextureSize: 1024,
        includeCustomExtensions: false,
      }
    );
  });
}
```

#### convert-ifc-to-glb.js（入口，约 180 行）

编排整个流水线：

```
main(inputPath, outputPath, options):
  1. 读取 IFC 文件 → Uint8Array
  2. 初始化 IfcAPI (WASM)
  3. 打开模型 → modelID
  4. 第一阶段：遍历所有 FlatMesh，构建 Mesh
     ├── StreamAllMeshes → 每个 FlatMesh
     ├── 解析 IFC 类型（GetLine → 获取 class name）
     ├── 提取几何数据 → 构建 BufferGeometry
     ├── 应用变换 + 合并多几何体
     ├── 分配材质
     ├── 注册到 expressID → Mesh 映射表
  5. 第二阶段：构建空间层级
     ├── GetSpatialStructure → 空间树
     ├── 遍历树创建 Group 层级
     ├── 从映射表取出 Mesh 挂载到对应节点
     ├── 写入 userData（BIM 属性）
  6. 第三阶段：导出 GLB
     ├── 将根 Group 传给 GLTFExporter
     ├── 写入 .glb 文件
  7. 清理：CloseModel → 释放 WASM 内存
  8. 输出报告：耗时、mesh 数、文件大小
```

---

## 4. CLI 接口设计

### 4.1 命令格式

```bash
node src/convert-ifc-to-glb.js <input.ifc> [options]
node src/convert-ifc-to-glb.js models/building.ifc --output output/building.glb --color
```

### 4.2 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `<input>` | string | 必填 | IFC 文件路径 |
| `--output <path>` | string | `output/<basename>.glb` | 输出路径 |
| `--color` | flag | false | 启用基于 IFC 类型的颜色映射 |
| `--no-hierarchy` | flag | false | 不构建空间层级（所有 mesh 平铺） |
| `--no-properties` | flag | false | 不嵌入 BIM 属性到 extras |
| `--wasm <dir>` | string | `node_modules/web-ifc/` | WASM 文件目录 |

### 4.3 npm scripts

```json
{
  "convert:glb":       "node src/convert-ifc-to-glb.js",
  "convert:glb:color": "node src/convert-ifc-to-glb.js --color",
  "convert:glb:8g":    "node --max-old-space-size=8192 src/convert-ifc-to-glb.js",
  "convert:glb:16g":   "node --max-old-space-size=16384 src/convert-ifc-to-glb.js"
}
```

---

## 5. 详细实施步骤

### 阶段一：环境与骨架（步骤 1-2）

**步骤 1：添加 three 依赖，创建模块骨架**

- 为 `converter-service` 添加 `three` 直接依赖：`npm install three`（与已有的 v0.184.0 版本一致）
- 创建 `converter-service/src/lib/` 目录
- 创建 5 个模块文件的骨架，定义导出接口
- 创建 `convert-ifc-to-glb.js` 入口骨架（参数解析 + main 函数框架）

**步骤 2：实现 ifc-api.js**

- 参照 `convert-ifc-to-fragments.js` 中的 WASM 路径配置方式，初始化 `IfcAPI`
- 实现 `initIfcApi(wasmDir)`：定位 WASM 文件 → `new IfcAPI()` → `await api.Init()`
- 实现 `openModel(ifcApi, filePath)`：读取 IFC 文件 → `api.OpenModel(data)` → 返回 modelID
- 实现 `streamAllMeshes(ifcApi, modelID, callback)`：封装回调遍历
- 实现 `getGeometryData(ifcApi, modelID, geomExpressID)`：
  - 调用 `GetGeometry()` → 获取 IfcGeometry
  - 调用 `GetVertexData()` + `GetVertexDataSize()` → 获取顶点指针和大小
  - 调用 `GetIndexData()` + `GetIndexDataSize()` → 获取索引指针和大小
  - 使用 `GetVertexArray()` / `GetIndexArray()` 拷贝数据
  - 返回 `{ positions: Float32Array, indices: Uint32Array, vertexSize: number }`
- 实现 `getSpatialTree(ifcApi, modelID)`：调用 `GetSpatialStructure()` 并序列化为纯 JSON
- 实现 `getEntityProps(ifcApi, modelID, expressID)`：调用 `GetLine()` 提取关键属性
- 实现 `closeModel(ifcApi, modelID)`：释放 WASM 资源

### 阶段二：几何转换（步骤 3-5）

**步骤 3：实现 geometry-builder.js（核心）**

```
buildAllMeshes(ifcApi, modelID, materialMap):
  ├── 创建 expressID → Mesh 映射表
  ├── 调用 streamAllMeshes 遍历每个 FlatMesh:
  │     ├── 解析 expressID 的 IFC 类型（GetLine → class name）
  │     ├── 确定材质（materialMap[ifcType] 或默认）
  │     ├── 遍历 flatMesh.geometries (Vector<PlacedGeometry>):
  │     │     ├── getGeometryData(ifcApi, modelID, placed.geometryExpressID)
  │     │     ├── 从交错顶点布局中分离 position 和 normal
  │     │     ├── 构建 THREE.BufferGeometry
  │     │     ├── 解析 flatTransformation → Matrix4 → applyMatrix4
  │     │     └── collection.push({ geometry, placed })
  │     ├── 合并构件的多个 geometry → 一个 BufferGeometry
  │     └── 创建 THREE.Mesh(mergedGeom, material)
  │     └── mesh.name = `${ifcType}_${expressID}`
  │     └── 写入映射表
  └── 返回 { meshes, expressIdToMesh }
```

**步骤 4：顶点布局解析**

web-ifc 返回的交错顶点格式需要通过实验确认。预计两种可能：

- **格式 A**：每顶点 6 个 float，依次为 `x, y, z, nx, ny, nz`
  ```javascript
  const stride = 6;
  const posAttr = new THREE.BufferAttribute(
    new Float32Array(positions.buffer, 0, positions.length / stride * 3), 3
  );
  // 需要手动分离
  ```
- **格式 B**：每顶点 3 个 float（仅位置），法线需自行计算
  ```javascript
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  ```

实现时先用格式 A 尝试，如果法线数据异常则降级到格式 B + computeVertexNormals。

**步骤 5：flatTransformation → Matrix4**

web-ifc 的 `PlacedGeometry.flatTransformation` 是一个 `Float32Array(16)`，列主序 4×4 矩阵。转换为 Three.js Matrix4：

```javascript
function flatTransformToMatrix4(flatTransform) {
  const m = new THREE.Matrix4();
  m.fromArray(flatTransform);  // Three.js fromArray 默认列主序
  return m;
}
```

注意：需要验证 `flatTransformation` 的布局是否与 Three.js 一致。如果不一致（如行主序），需要先转置。

### 阶段三：层级与属性（步骤 6-7）

**步骤 6：实现 hierarchy-builder.js**

```
buildHierarchy(spatialTree, expressIdToMesh, includeProperties, ifcApi, modelID):
  ├── 创建根 Group (name = "IfcProject")
  ├── 遍历空间树节点 (DFS):
  │     ├── 创建 Group，设置 name
  │     ├── 如果是空间容器 → 递归处理 children
  │     ├── 如果是构件 → 从 expressIdToMesh 取出 Mesh → add 到父 Group
  │     ├── 如果 includeProperties → 调用 getEntityProps → 写入 node.userData
  └── 返回根 Group
```

**步骤 7：BIM 属性提取（GetLine 解析）**

`web-ifc` 的 `GetLine(modelID, expressID)` 返回原始 IFC STEP 数据。需要解析以下关键字段并写入 `userData`（将映射为 GLB node extras）：

| IFC 属性 | userData key | 说明 |
|----------|-------------|------|
| GlobalId | `GlobalId` | 全局唯一标识 |
| Name | `Name` | 构件名称 |
| LongName | `LongName` | 长名称 |
| Description | `Description` | 描述 |
| ObjectType | `ObjectType` | 对象类型 |
| PredefinedType | `PredefinedType` | 预定义类型 |
| Tag | `Tag` | 标签 |

解析策略：`GetLine` 返回的是一个包含属性 ID 和值的结构，需要通过 `GetNameFromTypeCode` 或类型定义来解析字段名。这一步的具体 API 细节需要在实施时根据 `web-ifc` v0.0.77 的实际返回格式调整。

备选方案：使用 `ifcApi.GetHeaderLine(modelID, expressID, ...)` 系列方法，或直接解析 STEP 字符串。

### 阶段四：材质与导出（步骤 8-9）

**步骤 8：实现 material-mapper.js**

- 定义 40+ 种 IFC 类型的颜色映射
- 使用工厂模式：`getMaterial(ifcType, useColor)` → 返回共享材质实例
- 如果 `useColor` 为 false，所有构件返回同一个灰色默认材质
- 从 `PlacedGeometry.color` 提取原始颜色（rgba 四分量，归一化到 0-1）

**步骤 9：实现 glb-exporter.js + 主流程串联**

- 封装 `GLTFExporter.parse()` 为 Promise
- 在 `convert-ifc-to-glb.js` 的 `main()` 中串联全部流程
- 添加详细的进度日志和指标输出

### 阶段五：验证（步骤 10）

**步骤 10：端到端测试与验证**

- 使用项目现有的测试 IFC 文件（`converter-service/models/` 下）
- 验证项：
  - GLB 文件可在标准查看器中打开
  - 构件数量与 IFC 中的 `IfcBuildingElement` 数量匹配
  - 空间层级树结构正确
  - GlobalId、Name 等属性出现在 node extras 中
  - 材质颜色与映射表一致
  - 几何体无明显错位或变形

---

## 6. 关键技术挑战与对策

### 6.1 顶点数据布局不确定

**风险**：web-ifc v0.0.77 在不同 IFC 版本/编码下，`GetVertexArray` 返回的每顶点 float 数量可能不同（3 或 6 或包含 UV 等）。

**对策**：
- 通过 `GetVertexDataSize() / indexCount` 反推每顶点 float 数
- 实现自适应解析：检测 vertexSize → 选择对应的布局策略
- 如果法线缺失 → 降级为 `computeVertexNormals()`

### 6.2 WASM 内存管理

**风险**：web-ifc 的几何数据存在 WASM 堆中，`GetVertexArray` 会拷贝一份到 JS 堆。大型 IFC 可能导致双份内存占用。

**对策**：
- 在 `StreamAllMeshes` 回调中逐个处理，处理完一个构件后立即让 JS 引用可被 GC
- 及时调用 `CloseModel()` 释放 WASM 内存
- 提供大堆内存 npm scripts

### 6.3 GLTFExporter Node.js 兼容性

**风险**：`three/examples/jsm/exporters/GLTFExporter.js` 的模块导入路径在 Node.js ESM 下可能解析失败。

**对策**（按优先级）：
1. 使用 `import` 语法 + `"type": "module"`（与其他源文件一致）
2. 如失败，手动复制 GLTFExporter.js 到项目中并修正导入路径
3. 如仍失败，改用 `@gltf-transform/core` 手动构建 glTF JSON + 二进制 buffer

### 6.4 空间树 API 返回格式

**风险**：`GetSpatialStructure()` 的返回结构在不同 web-ifc 版本和 IFC schema 下可能不同。

**对策**：
- 先用小型 IFC 测试，打印完整的空间树 JSON
- 实现通用递归遍历，不依赖特定的节点字段名（使用 `type`/`children` 的通用约定）
- 如果没有 `GetSpatialStructure` 方法，改用 `GetLineIDsWithType` 按类型查询 + 手动构建层级

### 6.5 构件在多处引用

**风险**：部分 IFC 构件（如楼梯、栏杆）可能在空间树中被多处引用，同一个 expressID 对应多个 Group 子节点。

**对策**：
- 当前架构中一个 Mesh 只能挂在一个 Group 下
- 检测重复引用 → 对后续引用创建该 Mesh 的 clone（共享 geometry，不复制顶点数据）
- 记录警告日志

### 6.6 坐标系

**风险**：`flatTransformation` 表达的坐标系可能与 Three.js / glTF 不一致。

**对策**：
- Three.js 和 glTF 都是 Y-up 右手坐标系
- IFC 也是 Y-up 右手坐标系
- 但 `flatTransformation` 可能需要根据 web-ifc 的行为进行微调
- 用已知几何体（如对齐坐标轴的墙）进行视觉验证

---

## 7. 依赖变更

| 依赖 | 变更 | 说明 |
|------|------|------|
| `web-ifc` (0.0.77) | 不变 | 已有，本次核心依赖 |
| `three` | **新增直接依赖** | 需 `npm install three`，用于 BufferGeometry 构建和 GLTFExporter |
| `@thatopen/fragments` | **不引用** | GLB 转换不导入，但保留在项目中（IFC→FRAG 功能仍需） |

---

## 8. 输出 GLB 结构示意

```
GLB Binary
├── JSON Chunk
│   ├── scenes: [{ nodes: [0] }]
│   ├── nodes: [
│   │   { name: "Default Project", children: [1] },      // IfcProject (Group)
│   │   { name: "Default Site", children: [2] },          // IfcSite
│   │   { name: "Building A", children: [3,4] },          // IfcBuilding
│   │   { name: "Level 1", children: [5,6,7,...] },       // IfcBuildingStorey
│   │   ...,
│   │   { name: "IfcWall_2001", mesh: 0, extras: {        // 构件 Mesh
│   │       GlobalId: "3E8cGvXqj7Bvw...",
│   │       Name: "Basic Wall:Interior-4",
│   │       ObjectType: "IfcWallStandardCase",
│   │       PredefinedType: "NOTDEFINED"
│   │   }},
│   │   { name: "IfcSlab_2002", mesh: 1, extras: { ... }},
│   │   ...
│   ]
│   ├── meshes: [
│   │   { primitives: [{
│   │       attributes: { POSITION: 0, NORMAL: 1 },
│   │       indices: 2,
│   │       material: 0
│   │   }]},
│   │   ...
│   ]
│   ├── materials: [
│   │   { name: "IfcWall", pbrMetallicRoughness: {
│   │       baseColorFactor: [0.75, 0.75, 0.75, 1],
│   │       metallicFactor: 0, roughnessFactor: 1
│   │   }},
│   │   ...
│   ]
│   ├── accessors: [...]
│   └── bufferViews: [...]
├── Binary Chunk (顶点 position + normal + index 数据)
```

---

## 9. 验证计划

### 9.1 功能验证

| 验证项 | 方法 | 预期 |
|--------|------|------|
| 可打开 | 拖入 gltf-viewer.donmccurdy.com | 正常渲染，无报错 |
| Mesh 数量 | 在查看器中统计 mesh 数 vs IFC 构件数 | 一致（非空构件） |
| 空间层级 | 查看 GLB node tree | Project > Site > Building > Storey > Elements |
| 属性嵌入 | 检查 node extras JSON | GlobalId、Name 等字段存在且值正确 |
| 材质颜色 | 视觉检查 | 墙灰色、窗蓝色、门棕色等 |
| 几何正确 | 旋转查看模型各个方向 | 无错位、无翻转、无缺失面 |

### 9.2 性能基准

- 使用项目已有 IFC 测试文件
- 记录：IFC 解析耗时、几何提取耗时、GLB 导出耗时、输出文件大小
- 与 `.frag` 转换对比（耗时 / 文件大小）

---

## 10. 工作量估算

| 阶段 | 内容 | 时间 |
|------|------|------|
| 环境搭建 | npm install three、创建模块骨架 | 0.5 天 |
| ifc-api 封装 | WASM 初始化、模型加载、几何提取、空间树 | 1 天 |
| geometry-builder | 顶点解析、变换应用、多几何体合并 | 1.5 天 |
| material-mapper | 颜色映射表 + 材质工厂 | 0.5 天 |
| hierarchy-builder | 空间树遍历 + Group 构建 | 1 天 |
| BIM 属性 | GetLine 解析 + userData 写入 | 0.5 天 |
| GLB 导出 | GLTFExporter 封装 + 主流程串联 | 0.5 天 |
| 集成调试 | 端到端联调、边缘情况修复 | 1 天 |
| 验证测试 | 编写测试、输出验证 | 0.5 天 |
| **合计** | | **约 7 天** |

相比 fragments 中间层方案多出约 2 天，主要增加在几何数据底层适配和属性解析上，但换来了更干净的架构和更少的依赖。

---

## 11. 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 顶点布局与预期不符 | 高 | 几何错误/崩溃 | 自适应检测，多布局兼容 |
| GetLine 返回格式不确定 | 高 | 属性提取失败 | 先打印原始数据，再编写解析器 |
| GLTFExporter Node.js 不兼容 | 中 | 导出失败 | 备选 @gltf-transform 或内联代码 |
| 大 IFC 内存溢出 | 中 | 转换中断 | 大堆脚本 + 逐构件 GC 策略 |
| GetSpatialStructure 不存在 | 低 | 无层级结构 | 降级为按 IFC 类型分组 |
| flatTransformation 坐标系差异 | 低 | 构件位置偏移 | 视觉验证 + 矩阵修正 |

---

## 12. 后续扩展（可选）

1. **Draco 压缩**：对顶点数据应用 Draco 压缩，GLB 体积可再减小 5-10 倍
2. **分文件导出**：`--split-by-storey` / `--split-by-type`
3. **属性全量导出**：不仅是关键字段，而是所有 IFC 属性集（PropertySets）
4. **纹理支持**：提取 IFC 中的材质纹理引用并嵌入 GLB
5. **浏览器端导出**：在 viewer-service 中增加"导出 GLB"按钮
