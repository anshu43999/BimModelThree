# IFC 转 GLB 功能实施计划（IfcOpenShell 路线）

## 1. 概述

在现有 `converter-service` 中新增 `convert-ifc-to-glb.js`，通过 **Python 桥接**方式调用 IfcOpenShell 解析 IFC，使用 `trimesh` 库构建场景并导出 .glb 格式。Node.js 侧仅负责 CLI 入口、子进程调度、进度上报和 manifest 生成。

**技术选型理由**：IfcOpenShell 是 IFC 领域最成熟的几何引擎，基于 OpenCASCADE 内核，三角剖分质量远优于 web-ifc（后者在复杂曲面、开洞等场景下常有几何缺陷）。Python 桥接方式既利用了 IfcOpenShell 的成熟度，又保持了与现有 Node.js converter-service 的集成。

---

## 2. 技术路线

```
[IFC 源文件]
      │
      ▼
[convert-ifc-to-glb.js]  ← Node.js CLI 入口
      │
      ├── 解析参数、验证输入
      ├── 构建 Python 命令
      ├── child_process.execFile("python", ["ifc_to_glb.py", ...])
      ├── 监听 stdout 获取进度
      ├── 监听 stderr 获取错误
      └── 生成 manifest.json + conversion-report.json
      │
      ▼
[python/ifc_to_glb.py]  ← Python 核心转换脚本
      │
      ├── ifcopenshell.open(input)           → 解析 IFC
      ├── ifcopenshell.geom.iterator()       → 遍历所有构件的三角剖分几何
      ├── model.by_type("IfcBuildingElement") → 获取构件列表
      ├── 获取空间层级：Project→Site→Building→Storey→Elements
      ├── 提取 GlobalId, Name, Description 等 BIM 属性
      ├── 按 IFC 类型分配材质颜色
      ├── trimesh.Trimesh(verts, faces)      → 构建每个构件的几何
      ├── trimesh.Scene()                     → 组装层级场景
      └── scene.export(output, "glb")         → 输出 .glb
```

**全程不依赖 web-ifc 和 @thatopen/fragments。** IFC 解析和几何提取全部由 IfcOpenShell 在 Python 侧完成。

---

## 3. 环境依赖

### 3.1 需要安装的 Python 包

```bash
pip install ifcopenshell trimesh numpy
```

| 包 | 用途 | 预估大小 |
|---|------|---------|
| `ifcopenshell` | IFC 解析 + 几何三角剖分（基于 OpenCASCADE） | ~50 MB |
| `trimesh` | 场景组装 + GLB 导出 | ~10 MB |
| `numpy` | trimesh 依赖，数组运算 | ~15 MB |

IfcOpenShell 的 pip 包（`ifcopenshell`）预编译了 OpenCASCADE 内核，无需单独安装 OCCT。支持 Windows x64、Python 3.7~3.14。

### 3.2 对现有 Node.js 项目的影响

- `package.json` 无需新增任何依赖
- `node_modules/` 无变化
- 仅在 `converter-service/` 下新增 `python/` 目录

---

## 4. 架构设计

### 4.1 文件规划

```
converter-service/
├── src/
│   ├── convert-ifc-to-fragments.js   ← 已有（不动）
│   └── convert-ifc-to-glb.js         ← 新增（Node.js CLI 入口，约 200 行）
├── python/
│   └── ifc_to_glb.py                 ← 新增（Python 核心转换，约 350 行）
├── node_modules/                     ← 无变化
├── models/                           ← 已有（测试 IFC 文件）
├── output/                           ← 已有（输出目录）
└── package.json                      ← 仅新增 npm scripts（不变更 dependencies）
```

### 4.2 模块职责

#### convert-ifc-to-glb.js（Node.js 入口，约 200 行）

负责参数解析、Python 子进程调度、进度上报和元数据生成。保持与 `convert-ifc-to-fragments.js` 一致的 CLI 风格。

```javascript
// 核心流程
main(inputPath, outputPath, options):
  1. 验证 IFC 文件存在
  2. 确定 Python 解释器路径（优先虚拟环境，其次系统 python）
  3. 确定 ifc_to_glb.py 脚本路径
  4. 构建命令行参数数组
  5. child_process.execFile("python", args, { maxBuffer })
  6. 监听 stdout → 解析 JSON 行 → 输出进度日志
  7. 监听 stderr → 收集错误信息
  8. 等待进程结束 → 检查退出码
  9. 验证输出 .glb 文件存在
  10. 生成 manifest.json + conversion-report.json
```

**Python 路径查找策略**：
1. 检查项目目录下是否有 `.venv/` 虚拟环境
2. 回退到系统 `python` / `python3`

#### ifc_to_glb.py（Python 核心，约 350 行）

```python
# 导出
def convert(input_path, output_path, *, 
            use_color=True, 
            include_hierarchy=True, 
            include_properties=True):
    """
    将 IFC 文件转换为 GLB。
    
    Args:
        input_path: IFC 文件路径
        output_path: 输出 .glb 路径
        use_color: 是否按 IFC 类型着色
        include_hierarchy: 是否构建空间层级
        include_properties: 是否嵌入 BIM 属性到 extras
    """
```

**内部模块划分**（单一文件内，按函数组织）：

1. **geometry_extractor** — 几何提取
2. **material_mapper** — 材质颜色映射
3. **hierarchy_builder** — 空间层级构建
4. **property_extractor** — BIM 属性提取
5. **glb_assembler** — 场景组装与 GLB 导出

---

## 5. 核心技术实现

### 5.1 几何提取（geometry_extractor）

使用 `ifcopenshell.geom.iterator()` 遍历所有构件，获取三角剖分后的顶点和面索引。

```python
import ifcopenshell
import ifcopenshell.geom

def extract_geometry(model):
    """遍历 IFC 中所有含几何的构件，返回 (express_id, verts, faces, matrix, ifc_type) 生成器。"""
    
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_PYTHON_OPENCASCADE, True)
    # 使用 WELD_VERTICES 减少重复顶点
    settings.set(settings.WELD_VERTICES, True)
    # 使用世界坐标，避免手动应用局部变换
    settings.set(settings.USE_WORLD_COORDS, True)
    
    iterator = ifcopenshell.geom.iterator(settings, model)
    if not iterator.initialize():
        return
    
    while True:
        shape = iterator.get()
        
        # shape.id 是 IFC 实体的 expressID
        express_id = shape.id
        
        # 获取 IFC 类型名（如 "IfcWallStandardCase"）
        entity = model.by_id(express_id)
        ifc_type = entity.is_a()
        
        # 几何数据
        geometry = shape.geometry
        verts = geometry.verts   # list[float]: [x1,y1,z1, x2,y2,z2, ...]
        faces = geometry.faces   # list[int]:   [v1,v2,v3, v4,v5,v6, ...]
        
        # 变换矩阵（形状的局部→全局变换）
        matrix = shape.transformation.matrix.data  # tuple[float] × 16，行主序
        
        yield express_id, verts, faces, matrix, ifc_type
        
        if not iterator.next():
            break
```

**关键决策**：
- `USE_WORLD_COORDS = True`：让 IfcOpenShell 将几何直接转换到世界坐标，vert 数据中已包含位置变换，无需额外应用 `matrix`。但 `matrix` 仍保留，用于在层级结构中表达构件的相对空间关系。
- `WELD_VERTICES = True`：合并重复顶点，减少 GLB 体积。
- 顶点格式：IfcOpenShell 返回的 `verts` 是扁平的 float 列表（每 3 个一组为 xyz），`faces` 是扁平的 int 列表（每 3 个一组为三角形索引）。

### 5.2 材质颜色映射（material_mapper）

按 IFC 类型分配颜色，与之前的方案一致，但改用 Python 实现。

```python
IFC_COLORS = {
    "IfcWall":              [192, 192, 192, 255],  # 浅灰
    "IfcWallStandardCase":  [192, 192, 192, 255],
    "IfcSlab":              [176, 176, 176, 255],  # 灰色
    "IfcFloor":             [176, 176, 176, 255],
    "IfcBeam":              [160, 160, 160, 255],  # 深灰
    "IfcColumn":            [208, 208, 208, 255],  # 浅灰
    "IfcWindow":            [135, 206, 235, 200],  # 天蓝（半透明）
    "IfcDoor":              [139,  69,  19, 255],  # 棕色
    "IfcStair":             [218, 165,  32, 255],  # 金色
    "IfcStairFlight":       [218, 165,  32, 255],
    "IfcRailing":           [112, 128, 144, 255],  # 灰蓝
    "IfcRoof":              [205, 133,  63, 255],  # 秘鲁色
    "IfcCurtainWall":       [173, 216, 230, 255],  # 淡蓝
    "IfcCovering":          [245, 222, 179, 255],  # 麦色
    "IfcMember":            [160,  82,  45, 255],  # 赭色
    # ... 共约 40 种
}

def get_color(ifc_type, use_color=True):
    """返回 RGBA list [r,g,b,a]，值域 0-255。"""
    if not use_color:
        return [128, 128, 128, 255]  # 默认灰色
    
    # 精确匹配
    if ifc_type in IFC_COLORS:
        return IFC_COLORS[ifc_type]
    
    # 模糊匹配（处理 IfcWallStandardCase → 匹配 IfcWall ）
    for base_type in IFC_COLORS:
        if ifc_type.startswith(base_type):
            return IFC_COLORS[base_type]
    
    return [128, 128, 128, 255]
```

### 5.3 空间层级构建（hierarchy_builder）

IfcOpenShell 不提供 `GetSpatialStructure()` 等价方法。需要通过 IFC 关系实体遍历来构建层级。

```python
def build_spatial_tree(model):
    """从 IFC 关系遍历构建空间层级树。
    
    返回:
        list of dict: 每个 dict 包含 {type, expressID, GlobalId, Name, children}
    """
    
    # 1. 找到 IfcProject
    project = model.by_type("IfcProject")[0]
    
    # 2. 通过 IfcRelAggregates 关系逐层下钻
    def get_children(entity):
        """获取实体的空间子节点（通过 IsDecomposedBy 反向关系）"""
        children = []
        for rel in getattr(entity, "IsDecomposedBy", []):
            for child in rel.RelatedObjects:
                children.append(child)
        return children
    
    def build_node(entity):
        """递归构建节点"""
        node = {
            "type": entity.is_a(),
            "expressID": entity.id(),
            "GlobalId": getattr(entity, "GlobalId", ""),
            "Name": getattr(entity, "Name", "") or "",
            "children": []
        }
        
        # 空间容器（Project/Site/Building/Storey）继续递归
        for child in get_children(entity):
            if child.is_a() in SPATIAL_CONTAINERS:
                node["children"].append(build_node(child))
        
        # 空间内的构件（通过 IfcRelContainedInSpatialStructure）
        for rel in getattr(entity, "ContainsElements", []):
            for element in rel.RelatedElements:
                node["children"].append({
                    "type": element.is_a(),
                    "expressID": element.id(),
                    "GlobalId": getattr(element, "GlobalId", ""),
                    "Name": getattr(element, "Name", "") or "",
                    "children": []
                })
        
        return node
    
    SPATIAL_CONTAINERS = {
        "IfcProject", "IfcSite", "IfcBuilding",
        "IfcBuildingStorey", "IfcSpace"
    }
    
    return [build_node(project)]
```

**关键点**：
- IFC 的空间层级是隐式的，通过关系实体表达，需要手动遍历
- `IfcRelAggregates` 表达组合关系（Project→Site→Building→Storey）
- `IfcRelContainedInSpatialStructure` 表达构件与楼层的包含关系
- 构件可能不在任何空间中（如未正确建模），此时降级为按类型分组

### 5.4 BIM 属性提取（property_extractor）

从 IFC 实体中提取关键属性，存入 GLB node extras。

```python
PROPERTY_KEYS = [
    "GlobalId", "Name", "Description", "ObjectType",
    "PredefinedType", "Tag", "LongName"
]

def extract_properties(entity):
    """提取单个 IFC 实体的关键属性。"""
    props = {}
    for key in PROPERTY_KEYS:
        value = getattr(entity, key, None)
        if value is not None:
            props[key] = str(value) if not isinstance(value, str) else value
    # 过滤空值
    return {k: v for k, v in props.items() if v}
```

注意：IfcOpenShell 的属性值可能是 IFC 枚举/引用类型，需要 `str()` 转换。

### 5.5 GLB 场景组装与导出（glb_assembler）

使用 `trimesh` 组装场景并导出。trimesh 的 `Scene` 支持节点层级，这与 glTF 的 node tree 天然对应。

```python
import trimesh
import numpy as np

def assemble_and_export(
    model, output_path,
    use_color=True,
    include_hierarchy=True,
    include_properties=True
):
    """组装场景并导出 GLB。
    
    策略：
    - 如果 include_hierarchy=True：按空间树构建 Scene graph
    - 如果 include_hierarchy=False：所有 mesh 平铺到根节点
    """
    
    # === 阶段 1：提取所有几何 ===
    mesh_map = {}  # expressID → trimesh.Trimesh
    type_map = {}  # expressID → IFC 类型
    
    for express_id, verts, faces, matrix, ifc_type in extract_geometry(model):
        if not verts or not faces:
            continue
        
        # 构建 trimesh 对象
        vertices = np.array(verts, dtype=np.float32).reshape(-1, 3)
        triangles = np.array(faces, dtype=np.int32).reshape(-1, 3)
        
        mesh = trimesh.Trimesh(vertices=vertices, faces=triangles)
        
        # 设置材质颜色
        if use_color:
            rgba = get_color(ifc_type)
            mesh.visual = trimesh.visual.ColorVisuals(
                mesh=mesh,
                vertex_colors=np.tile(
                    np.array(rgba[:3], dtype=np.uint8),
                    (len(vertices), 1)
                )
            )
        
        mesh_map[express_id] = mesh
        type_map[express_id] = ifc_type
    
    # === 阶段 2：构建场景 ===
    scene = trimesh.Scene()
    
    if include_hierarchy:
        # 构建空间树，将 mesh 挂载到对应节点
        tree = build_spatial_tree(model)
        
        def add_node(parent_frame, node_data):
            """递归添加节点到场景"""
            express_id = node_data["expressID"]
            name = f"{node_data['type']}_{node_data.get('Name', express_id)}"
            
            if express_id in mesh_map:
                # 这是构件节点 → 添加 mesh
                mesh = mesh_map[express_id]
                frame = f"{name}_{express_id}"
                scene.add_geometry(
                    mesh,
                    node_name=name,
                    parent=parent_frame,
                    geom_name=name,
                    extras=extract_properties(model.by_id(express_id))
                        if include_properties else None
                )
            else:
                # 这是空间容器 → 创建空 Group
                frame = f"{name}_{express_id}"
                scene.add_geometry(
                    None,  # 空 geometry = Group
                    node_name=name,
                    parent=parent_frame,
                    extras=extract_properties(model.by_id(express_id))
                        if include_properties else None
                )
            
            for child in node_data.get("children", []):
                add_node(frame, child)
        
        for root_node in tree:
            add_node(None, root_node)
    else:
        # 扁平模式：所有 mesh 直接添加到 root
        for express_id, mesh in mesh_map.items():
            entity = model.by_id(express_id)
            name = f"{type_map[express_id]}_{express_id}"
            scene.add_geometry(mesh, node_name=name)
    
    # === 阶段 3：导出 ===
    scene.export(output_path, file_type="glb")
```

**trimesh 的 glTF extras 支持**：`scene.add_geometry()` 不直接支持 extras 参数（trimesh 的 Scene graph 模型与 glTF node extras 不完全对应）。此处的 extras 传递可能需要通过以下方式实现：

```python
# 方案 A：在 trimesh scene 上后处理（修改场景的内部图结构）
# 方案 B：使用 pygltflib 直接构建 glTF JSON
# 方案 C：导出 .glb 后，用 pygltflib 重新打开并注入 extras
```

**推荐方案 C**：先用 trimesh 导出几何+层级，再用 pygltflib 打开 GLB 注入 extras。这样充分利用 trimesh 的几何处理能力，同时获得精确的 extras 控制。

或者如果 trimesh 的 extras 支持不够理想，可以直接用 `pygltflib` 作为导出后备，逐一构建 accessors、bufferViews、meshes、nodes。

---

## 6. CLI 接口设计

### 6.1 命令格式

```bash
node src/convert-ifc-to-glb.js <input.ifc> [options]
```

### 6.2 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `<input>` | string | 必填 | IFC 文件路径 |
| `--output <path>` | string | `output/<basename>.glb` | 输出路径 |
| `--color` | flag | false | 启用基于 IFC 类型的颜色映射 |
| `--no-hierarchy` | flag | false | 不构建空间层级（所有 mesh 平铺） |
| `--no-properties` | flag | false | 不嵌入 BIM 属性到 extras |
| `--python <path>` | string | `python` | Python 解释器路径 |

### 6.3 npm scripts

```json
{
  "convert:glb":       "node src/convert-ifc-to-glb.js",
  "convert:glb:color": "node src/convert-ifc-to-glb.js --color",
  "convert:glb:flat":  "node src/convert-ifc-to-glb.js --color --no-hierarchy"
}
```

### 6.4 Node.js ↔ Python 通信协议

Node.js 通过 `child_process.execFile` 调用 Python 脚本。通信通过以下渠道：

- **stdin**：不适用（参数通过命令行传递）
- **stdout**：Python 逐行输出 JSON 日志，Node.js 解析并转发
  ```json
  {"type":"progress","phase":"geometry","current":100,"total":500}
  {"type":"progress","phase":"hierarchy","message":"Building spatial tree..."}
  {"type":"progress","phase":"export","message":"Writing GLB..."}
  {"type":"done","output":"/path/to/output.glb","stats":{"meshes":500,"sizeBytes":12345678}}
  ```
- **stderr**：错误和警告信息
- **退出码**：0 = 成功，非 0 = 失败

---

## 7. 数据的流向

```
IFC 文件
  │
  ▼
convert-ifc-to-glb.js (Node.js)
  │
  │ child_process.execFile("python", ["ifc_to_glb.py", input, "--output", output, ...])
  │
  ▼
ifc_to_glb.py (Python)
  │
  ├── ifcopenshell.open(input)           → model 对象（解析 IFC 到内存）
  │
  ├── ifcopenshell.geom.iterator()       → 遍历构件
  │     └── 每个构件:
  │           ├── shape.geometry.verts   → list[float] (扁平 xyz)
  │           ├── shape.geometry.faces   → list[int] (扁平三角形索引)
  │           └── entity.is_a()          → IFC 类型名
  │
  ├── 构建空间层级树 (IfcRelAggregates + IfcRelContainedInSpatialStructure)
  │
  ├── 提取 BIM 属性 (GlobalId, Name, etc.)
  │
  ├── trimesh.Trimesh(verts, faces)      → 每个构件一个 mesh
  ├── 材质颜色映射 (IFC 类型 → RGBA)
  │
  ├── trimesh.Scene()
  │     └── add_geometry(mesh, node_name, parent)
  │
  ├── scene.export(output, "glb")        → .glb 文件
  │
  │  stdout: JSON 进度日志
  ▼
convert-ifc-to-glb.js (回到 Node.js)
  │
  ├── 解析进度日志
  ├── 验证输出文件
  ├── manifest.json
  └── conversion-report.json
```

---

## 8. 关键技术挑战与对策

### 8.1 trimesh GLB extras 支持有限

**风险**：trimesh 的 `Scene` 模型不原生支持 glTF node extras，BIM 属性可能无法直接写入 GLB。

**对策**（按优先级）：
1. 先尝试 trimesh 的 `metadata` 机制，验证导出后 extras 是否保留
2. 如不保留，使用"方案 C"：trimesh 导出几何 → pygltflib 打开 GLB → 遍历 nodes 对应的 expressID → 注入 extras → 重新保存
3. 如 pygltflib 操作复杂，降级为"属性不嵌入 extras，而是单独输出 properties.json 文件"

### 8.2 IfcOpenShell 安装

**风险**：`pip install ifcopenshell` 在某些环境下可能失败（缺少 VC++ 运行时、Python 版本不兼容等）。

**对策**：
- 确认 Python 3.14 在 IfcOpenShell 支持范围内（截至 2026，IfcOpenShell 支持到 3.14）
- 提供 conda 安装备选：`conda install -c conda-forge ifcopenshell`
- 在方案文档中写明系统要求和安装步骤

### 8.3 大文件内存

**风险**：大 IFC（> 500MB）解析后几何数据可能占用数 GB 内存。

**对策**：
- IfcOpenShell 的 iterator 模式天然支持逐构件处理，不一次性加载所有几何
- 当前计划是"先全部收集、再统一导出"，对大文件可改为"边收集边写入"的流式模式
- 作为底线，Node.js 侧提供 `--max-old-space-size` 参数（虽然 Python 侧不受影响）

### 8.4 空间层级可能不完整

**风险**：部分 IFC 文件的 `IfcRelContainedInSpatialStructure` 关系可能缺失，导致构件无法挂载到楼层。

**对策**：
- 对未挂载到任何空间的构件，降级为按 IFC 类型分组（如创建 `Orphaned_IfcWall` Group）
- 记录警告日志，告知用户哪些构件未正确关联空间

### 8.5 坐标系

**风险**：IFC 使用右手坐标系（Z-up 或 Y-up 取决于项目），glTF 使用 Y-up 右手坐标系。

**对策**：
- IfcOpenShell 的 `USE_WORLD_COORDS` 确保几何在世界坐标中
- 检查导出的 GLB 在标准查看器（如 gltf-viewer.donmccurdy.com）中的方向
- 如有偏差，在 Python 侧添加坐标轴转换（如将 Z-up 旋转为 Y-up）

### 8.6 构件在层级中重复引用

**风险**：同一构件可能属于多个空间（如跨越两个楼层的柱子）。

**对策**：
- 只在第一个遇到的父节点下挂载 mesh
- 后续引用仅记录 expressID 引用关系，或创建 mesh 引用（glTF 支持多个 node 引用同一 mesh）

---

## 9. 实施步骤

### 阶段一：环境准备（步骤 1）

**步骤 1：安装 Python 依赖，创建文件骨架**

- 安装 `ifcopenshell`、`trimesh`、`numpy`
- 创建 `converter-service/python/` 目录
- 创建 `ifc_to_glb.py` 骨架（main 函数 + 参数解析）
- 创建 `convert-ifc-to-glb.js` 骨架（CLI 参数解析 + Python 调用框架）
- 用小型 IFC 文件验证 IfcOpenShell 可正常导入和解析

### 阶段二：Python 核心（步骤 2-5）

**步骤 2：实现几何提取**

- 在 `ifc_to_glb.py` 中实现 `extract_geometry()` 生成器
- 用测试 IFC 验证 verts/faces 数据的形状和范围
- 输出中间统计：构件数、总顶点数、总三角面数

**步骤 3：实现材质颜色映射**

- 定义 40+ 种 IFC 类型颜色映射表
- 实现 `get_color()` 函数（精确匹配 + 模糊匹配）

**步骤 4：实现空间层级构建**

- 实现 `build_spatial_tree()` 递归遍历
- 用测试 IFC 打印空间树 JSON，人工验证结构正确性
- 处理边界：无层级、多层嵌套、空楼层

**步骤 5：实现 GLB 装配与导出**

- 实现 `assemble_and_export()` 主函数
- 验证 trimesh 导出的 GLB 可在标准查看器中打开
- 处理 trimesh GLB extras 问题（决定最终方案）

### 阶段三：属性提取（步骤 6）

**步骤 6：实现 BIM 属性提取**

- 实现 `extract_properties()` 函数
- 将属性注入 GLB node extras
- 验证：在 glTF 查看器中检查 node extras 内容

### 阶段四：Node.js 集成（步骤 7-8）

**步骤 7：实现 Node.js CLI 入口**

- 实现参数解析、Python 进程调用、进度日志解析
- 输出 manifest.json 和 conversion-report.json（与 convert-ifc-to-fragments.js 格式一致）

**步骤 8：添加 npm scripts**

- 在 `package.json` 的 scripts 中新增 `convert:glb` 等命令

### 阶段五：验证（步骤 9）

**步骤 9：端到端测试**

| 验证项 | 方法 | 预期 |
|--------|------|------|
| 可打开 | 拖入 gltf-viewer.donmccurdy.com | 正常渲染 |
| Mesh 数量 | 统计 GLB mesh 数 vs IFC 构件数 | 一致 |
| 空间层级 | 查看 GLB node tree | Project→Site→Building→Storey→Elements |
| 属性嵌入 | 检查 node extras | GlobalId、Name 正确 |
| 材质颜色 | 视觉检查 | 按类型着色正确 |
| 几何质量 | 旋转缩放观察 | 无缺面、无错位、曲面平滑 |

---

## 10. 工作量估算

| 阶段 | 内容 | 时间 |
|------|------|------|
| 环境准备 | pip install + 文件骨架 + 验证可导入 | 0.5 天 |
| 几何提取 | extract_geometry + 数据验证 | 1 天 |
| 材质映射 | IFC_COLORS 表 + get_color | 0.5 天 |
| 空间层级 | build_spatial_tree 递归遍历 | 1 天 |
| GLB 装配+导出 | trimesh Scene + GLB extras 方案 | 1.5 天 |
| 属性提取 | extract_properties + extras 注入 | 0.5 天 |
| Node.js CLI | 参数解析 + 进程调用 + 日志 | 1 天 |
| npm scripts + 文档 | package.json + 使用说明 | 0.5 天 |
| 集成测试 | 5 个测试 IFC 端到端验证 | 1 天 |
| **合计** | | **约 7.5 天** |

相比纯 web-ifc 方案（7 天），多了约 0.5 天，主要增加在 Python/Node.js 跨进程通信和 trimesh extras 适配上。但几何质量显著提升，且 IfcOpenShell 作为成熟引擎，边缘情况更少。

---

## 11. 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| trimesh GLB extras 不支持 | 高 | 属性无法嵌入 | pygltflib 后处理注入 |
| ifcopenshell pip 安装失败 | 中 | 无法开始开发 | conda 备选 / 预编译 wheel |
| 大 IFC 内存溢出 | 中 | 转换中断 | 流式处理 / 分批导出 |
| 空间层级不完整 | 中 | 部分构件孤立 | 降级为按类型分组 |
| 坐标系偏差 | 低 | 模型倒置或旋转 | 坐标轴转换 |
| Python 进程崩溃 | 低 | 转换失败 | Node.js 捕获退出码 + 日志 |

---

## 12. 与已有方案的对比

| 维度 | web-ifc 方案 | IfcOpenShell 方案 |
|------|-------------|-------------------|
| 几何质量 | 一般（简易三角剖分） | 优秀（OpenCASCADE 内核） |
| 曲面/开洞处理 | 常有缺陷 | 成熟稳定 |
| 依赖复杂度 | 纯 JS（web-ifc + three） | Python（ifcopenshell + trimesh） |
| 安装门槛 | npm install 即可 | 需 pip install + Python 环境 |
| 跨平台 | Node.js WASM（天然跨平台） | Python + 原生库（需平台预编译包） |
| 大文件支持 | WASM 堆限制 | 原生内存，更稳定 |
| 工作量 | 7 天 | 7.5 天 |
| 社区活跃度 | web-ifc 更新频繁 | IfcOpenShell 10+ 年历史，BIM 行业标准工具 |
