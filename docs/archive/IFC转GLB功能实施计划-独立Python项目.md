# IFC 转 GLB 功能实施计划（独立 Python 项目）

## 1. 概述

在 BimModelThree 仓库下新建独立的 `ifc-to-glb-converter` Python 项目，纯 Python 实现 IFC → GLB 转换。使用 IfcOpenShell 做几何解析和三角剖分，trimesh 做场景组装和 GLB 导出。作为独立的命令行工具运行，与 converter-service / viewer-service 平行存在，互不依赖。

---

## 2. 项目定位

```
BimModelThree/
├── converter-service/          ← Node.js，IFC → .frag（已有，不动）
├── viewer-service/             ← 浏览器端模型查看器（已有，不动）
├── ifc-to-glb-converter/       ← 新增，Python，IFC → .glb
├── docs/                       ← 项目文档
└── README.md
```

`ifc-to-glb-converter` 是 BimModelThree 仓库下的第三个子项目，独立的 Python 项目，有自己的虚拟环境、依赖管理和 CLI 入口。与 converter-service 共享测试 IFC 文件，但运行时互不依赖。

---

## 3. 技术栈

| 组件 | 选型 | 用途 |
|------|------|------|
| 语言 | Python 3.11+ | 主体开发语言 |
| IFC 解析 + 几何 | `ifcopenshell` | 解析 IFC、OpenCASCADE 三角剖分 |
| 场景组装 + GLB 导出 | `trimesh` | 构建场景图、导出 .glb |
| GLB 后处理 | `pygltflib` | 注入 extras（BIM 属性）、微调 glTF JSON |
| 数组运算 | `numpy` | trimesh 依赖、顶点数据处理 |
| CLI 框架 | `typer` | 命令行参数解析、帮助文档 |
| 包管理 | `uv` 或 `pip` + `venv` | 依赖安装、虚拟环境 |

**为什么选 typer**：基于类型注解自动生成 CLI，比 argparse 少写样板代码，自带 rich 美化输出，适合工具类项目。依赖极小（仅 typer + click）。

---

## 4. 项目结构

```
ifc-to-glb-converter/
├── pyproject.toml                # 项目元数据 + 依赖声明
├── requirements.txt              # 精确依赖锁定（pip freeze）
├── README.md                     # 使用说明
├── .gitignore
├── .python-version               # Python 版本声明（uv/pyenv 使用）
│
├── ifc_to_glb/                   # 主包
│   ├── __init__.py
│   ├── cli.py                    # CLI 入口（typer 命令定义）
│   ├── converter.py              # 转换主流程编排
│   ├── geometry.py               # 几何提取（IfcOpenShell iterator 封装）
│   ├── materials.py              # IFC 类型 → 材质颜色映射
│   ├── hierarchy.py              # 空间层级树构建
│   ├── properties.py             # BIM 属性提取
│   └── exporter.py               # trimesh 场景组装 + GLB 导出
│
├── tests/
│   ├── __init__.py
│   ├── test_geometry.py
│   ├── test_hierarchy.py
│   ├── test_materials.py
│   └── test_converter.py
│
├── scripts/
│   └── convert.sh                # 便捷脚本（可选）
│
└── output/                       # 默认输出目录（gitignore）
```

---

## 5. 模块设计

### 5.1 cli.py — 命令行入口

使用 typer 定义命令，约 60 行。

```python
import typer
from pathlib import Path

app = typer.Typer(
    name="ifc-to-glb",
    help="Convert IFC files to glTF Binary (.glb) format",
)

@app.command()
def convert(
    input: Path = typer.Argument(..., help="Input IFC file path", exists=True),
    output: Path = typer.Option(None, help="Output .glb file path"),
    color: bool = typer.Option(False, "--color", help="Apply color based on IFC type"),
    no_hierarchy: bool = typer.Option(False, "--no-hierarchy", help="Flat output, no spatial tree"),
    no_properties: bool = typer.Option(False, "--no-properties", help="Skip BIM property embedding"),
):
    """Convert an IFC file to GLB."""
    from .converter import convert_ifc_to_glb

    if output is None:
        output = Path("output") / f"{input.stem}.glb"

    convert_ifc_to_glb(
        input_path=str(input.resolve()),
        output_path=str(output.resolve()),
        use_color=color,
        include_hierarchy=not no_hierarchy,
        include_properties=not no_properties,
    )

@app.command()
def info(input: Path = typer.Argument(..., help="IFC file path", exists=True)):
    """Print summary info about an IFC file."""
    # 输出: 构件数量、IFC schema 版本、空间结构摘要
    ...

def main():
    app()

if __name__ == "__main__":
    main()
```

**使用方式**：

```bash
# 安装后可全局调用
ifc-to-glb convert model.ifc --color
ifc-to-glb convert model.ifc --output result.glb --color --no-hierarchy
ifc-to-glb info model.ifc

# 开发阶段直接运行
python -m ifc_to_glb.cli convert ../converter-service/models/20210219Architecture.ifc --color
```

### 5.2 geometry.py — 几何提取

封装 IfcOpenShell 的 geometry iterator，返回结构化的几何数据。约 120 行。

```python
import ifcopenshell
import ifcopenshell.geom
from dataclasses import dataclass
from typing import Iterator, Optional
import numpy as np


@dataclass
class MeshData:
    """单个 IFC 构件的几何数据"""
    express_id: int
    ifc_type: str
    global_id: str
    name: str
    vertices: np.ndarray      # (N, 3) float32
    faces: np.ndarray          # (M, 3) int32
    matrix: np.ndarray         # (4, 4) float64 变换矩阵（行主序）
    color: Optional[tuple]     # (r, g, b, a) 0-255，来自 IFC 材质


def create_geometry_settings() -> ifcopenshell.geom.settings:
    """创建几何提取配置。"""
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_PYTHON_OPENCASCADE, True)
    settings.set(settings.WELD_VERTICES, True)
    settings.set(settings.USE_WORLD_COORDS, True)
    return settings


def iter_geometry(
    model: ifcopenshell.file,
    settings: Optional[ifcopenshell.geom.settings] = None
) -> Iterator[MeshData]:
    """遍历 IFC 中所有含几何的构件，生成 MeshData。"""
    
    if settings is None:
        settings = create_geometry_settings()
    
    iterator = ifcopenshell.geom.iterator(settings, model)
    if not iterator.initialize():
        return
    
    while True:
        shape = iterator.get()
        entity = model.by_id(shape.id)
        
        geo = shape.geometry
        verts = np.array(geo.verts, dtype=np.float32).reshape(-1, 3)
        faces = np.array(geo.faces, dtype=np.int32).reshape(-1, 3)
        
        # 提取变换矩阵（行主序 16 元素 → 4×4）
        matrix = np.array(shape.transformation.matrix.data, dtype=np.float64).reshape(4, 4)
        
        # IFC 材质颜色（如果存在）
        color = None
        if hasattr(entity, 'HasAssociations'):
            # 从关联的材质定义中提取颜色
            ...
        
        yield MeshData(
            express_id=shape.id,
            ifc_type=entity.is_a(),
            global_id=getattr(entity, 'GlobalId', ''),
            name=getattr(entity, 'Name', '') or '',
            vertices=verts,
            faces=faces,
            matrix=matrix,
            color=color,
        )
        
        if not iterator.next():
            break
```

**关键设计决策**：
- `USE_WORLD_COORDS = True`：几何顶点已包含世界变换，无需手动应用 matrix。matrix 保留用于表达在层级中的相对位置。
- 返回 `np.ndarray` 而非 Python list：方便直接传给 trimesh，避免二次转换。
- `MeshData` 用 dataclass：类型清晰，IDE 友好。

### 5.3 materials.py — 材质颜色映射

约 80 行。与之前方案一致，改为 Python 实现。

```python
from typing import Tuple

RGBA = Tuple[int, int, int, int]

# 约 40 种类型映射
IFC_COLORS: dict[str, RGBA] = {
    "IfcWall":               (192, 192, 192, 255),
    "IfcWallStandardCase":   (192, 192, 192, 255),
    "IfcSlab":               (176, 176, 176, 255),
    "IfcBeam":               (160, 160, 160, 255),
    "IfcColumn":             (208, 208, 208, 255),
    "IfcWindow":             (135, 206, 235, 200),
    "IfcDoor":               (139,  69,  19, 255),
    "IfcStair":              (218, 165,  32, 255),
    "IfcStairFlight":        (218, 165,  32, 255),
    "IfcRailing":            (112, 128, 144, 255),
    "IfcRoof":               (205, 133,  63, 255),
    "IfcCurtainWall":        (173, 216, 230, 255),
    "IfcCovering":           (245, 222, 179, 255),
    "IfcMember":             (160,  82,  45, 255),
    "IfcPlate":              (192, 192, 192, 255),
    "IfcFlowSegment":        (100, 149, 237, 255),
    "IfcFlowFitting":        (100, 149, 237, 255),
    "IfcDuctSegment":        (70,  130, 180, 255),
    "IfcPipeSegment":        (70,  130, 180, 255),
    "IfcSpace":              (255, 255, 255, 30),
    # ... 共约 40 种
}

DEFAULT_COLOR: RGBA = (128, 128, 128, 255)


def get_color(ifc_type: str, use_color: bool = True) -> RGBA:
    """返回 RGBA 颜色元组，值域 0-255。"""
    if not use_color:
        return DEFAULT_COLOR
    if ifc_type in IFC_COLORS:
        return IFC_COLORS[ifc_type]
    # 模糊匹配
    for base_type in IFC_COLORS:
        if ifc_type.startswith(base_type):
            return IFC_COLORS[base_type]
    return DEFAULT_COLOR
```

### 5.4 hierarchy.py — 空间层级构建

约 100 行。通过 IFC 关系实体遍历空间结构。

```python
from typing import Any

# 空间容器类型
SPATIAL_CONTAINERS = {
    "IfcProject", "IfcSite", "IfcBuilding",
    "IfcBuildingStorey", "IfcSpace",
}

def build_spatial_tree(model) -> list[dict[str, Any]]:
    """构建 IFC 空间层级树。
    
    返回列表（通常只有一个 IfcProject 根节点），每个节点格式:
    {
        "type": "IfcBuildingStorey",
        "expressID": 123,
        "GlobalId": "...",
        "Name": "Level 1",
        "children": [...]
    }
    """
    def get_children(entity) -> list:
        """获取实体的空间子节点。"""
        children = []
        # 通过 IfcRelAggregates 获取空间子节点
        for rel in getattr(entity, "IsDecomposedBy", []):
            children.extend(rel.RelatedObjects)
        return children
    
    def get_contained_elements(entity) -> list:
        """获取空间内的构件。"""
        elements = []
        for rel in getattr(entity, "ContainsElements", []):
            elements.extend(rel.RelatedElements)
        return elements
    
    def build_node(entity) -> dict:
        node = {
            "type": entity.is_a(),
            "expressID": entity.id(),
            "GlobalId": getattr(entity, "GlobalId", ""),
            "Name": getattr(entity, "Name", "") or "",
            "children": [],
        }
        
        # 递归处理空间子节点
        for child in get_children(entity):
            if child.is_a() in SPATIAL_CONTAINERS:
                node["children"].append(build_node(child))
        
        # 添加空间内的构件
        for element in get_contained_elements(entity):
            node["children"].append({
                "type": element.is_a(),
                "expressID": element.id(),
                "GlobalId": getattr(element, "GlobalId", ""),
                "Name": getattr(element, "Name", "") or "",
                "children": [],
            })
        
        return node
    
    projects = model.by_type("IfcProject")
    return [build_node(p) for p in projects]
```

### 5.5 properties.py — BIM 属性提取

约 50 行。

```python
PROPERTY_KEYS = [
    "GlobalId", "Name", "Description", "ObjectType",
    "PredefinedType", "Tag", "LongName",
]

def extract_properties(entity) -> dict[str, str]:
    """从 IFC 实体提取关键 BIM 属性。"""
    props = {}
    for key in PROPERTY_KEYS:
        value = getattr(entity, key, None)
        if value is not None and value != "":
            props[key] = str(value)
    return props
```

### 5.6 exporter.py — GLB 装配与导出

约 200 行。核心模块，负责几何→trimesh 转换、场景组装、属性注入、GLB 写入。

```python
import trimesh
import numpy as np
from pathlib import Path
from typing import Optional

from .geometry import MeshData
from .materials import get_color
from .hierarchy import build_spatial_tree
from .properties import extract_properties


def assemble_glb(
    model,                        # ifcopenshell.file
    meshes: list[MeshData],       # geometry.iter_geometry 的输出
    output_path: str,
    use_color: bool = True,
    include_hierarchy: bool = True,
    include_properties: bool = True,
):
    """组装场景并导出 GLB。"""
    
    # 构建 expressID → trimesh 对象映射
    mesh_map: dict[int, trimesh.Trimesh] = {}
    type_map: dict[int, str] = {}
    
    for md in meshes:
        if len(md.vertices) == 0 or len(md.faces) == 0:
            continue
        
        tri_mesh = trimesh.Trimesh(
            vertices=md.vertices,
            faces=md.faces,
        )
        
        if use_color:
            rgba = md.color if md.color else get_color(md.ifc_type)
            tri_mesh.visual = trimesh.visual.ColorVisuals(
                mesh=tri_mesh,
                vertex_colors=np.tile(
                    np.array(rgba[:3], dtype=np.uint8),
                    (len(md.vertices), 1)
                ),
            )
        
        mesh_map[md.express_id] = tri_mesh
        type_map[md.express_id] = md.ifc_type
    
    # 构建场景
    scene = trimesh.Scene()
    
    if include_hierarchy:
        tree = build_spatial_tree(model)
        _add_hierarchy_nodes(scene, model, tree, mesh_map, type_map, include_properties)
    else:
        for express_id, tri_mesh in mesh_map.items():
            node_name = f"{type_map.get(express_id, 'Unknown')}_{express_id}"
            scene.add_geometry(tri_mesh, node_name=node_name)
    
    # 导出
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)
    scene.export(output_path, file_type="glb")
    
    # 如果 trimesh 不支持 extras，用 pygltflib 后处理注入属性
    if include_properties:
        _inject_extras(output_path, model, mesh_map)


def _add_hierarchy_nodes(
    scene: trimesh.Scene,
    model,
    tree_nodes: list[dict],
    mesh_map: dict[int, trimesh.Trimesh],
    type_map: dict[int, str],
    include_properties: bool,
    parent_frame: Optional[str] = None,
):
    """递归添加层级节点到场景。"""
    for node in tree_nodes:
        express_id = node["expressID"]
        node_name = node.get("Name") or f"{node['type']}_{express_id}"
        
        if express_id in mesh_map:
            # 构件节点：添加 mesh
            scene.add_geometry(
                mesh_map[express_id],
                node_name=node_name,
                parent=parent_frame,
            )
        else:
            # 空间容器：创建空 Group
            # trimesh 创建空 Group 的方式：add_geometry(None, ...)
            # 或者创建一个隐藏的小几何体作为占位
            scene.add_geometry(None, node_name=node_name, parent=parent_frame)
        
        # 递归子节点
        children = node.get("children", [])
        if children:
            _add_hierarchy_nodes(
                scene, model, children,
                mesh_map, type_map, include_properties,
                parent_frame=node_name,
            )


def _inject_extras(
    glb_path: str,
    model,
    mesh_map: dict[int, trimesh.Trimesh],
):
    """用 pygltflib 重新打开 GLB，为每个 node 注入 BIM 属性到 extras。"""
    try:
        import pygltflib
    except ImportError:
        print("  [WARN] pygltflib not installed, skipping extras injection")
        return
    
    # 构建 expressID → properties 映射
    props_map = {}
    for express_id in mesh_map:
        entity = model.by_id(express_id)
        props_map[express_id] = extract_properties(entity)
    
    # 打开 GLB，遍历 nodes，按名称中的 expressID 匹配并注入
    gltf = pygltflib.GLTF2().load(glb_path)
    
    for node in gltf.nodes:
        # node.name 格式: "{type}_{expressID}" 或 "{name}_{type}_{expressID}"
        # 从中提取 expressID
        if node.name:
            parts = node.name.rsplit("_", 1)
            if parts[-1].isdigit():
                express_id = int(parts[-1])
                if express_id in props_map:
                    node.extras = props_map[express_id]
    
    gltf.save(glb_path)
```

### 5.7 converter.py — 主流程编排

约 80 行。

```python
import time
import ifcopenshell
from pathlib import Path

from .geometry import create_geometry_settings, iter_geometry, MeshData
from .exporter import assemble_glb


def convert_ifc_to_glb(
    input_path: str,
    output_path: str,
    use_color: bool = True,
    include_hierarchy: bool = True,
    include_properties: bool = True,
):
    """主转换流程。"""
    
    t0 = time.perf_counter()
    
    # 打开 IFC
    print(f"Opening IFC: {input_path}")
    model = ifcopenshell.open(input_path)
    schema = model.schema
    print(f"  Schema: {schema}")
    
    # 提取几何
    print("Extracting geometry...")
    meshes: list[MeshData] = []
    settings = create_geometry_settings()
    for md in iter_geometry(model, settings):
        meshes.append(md)
    print(f"  {len(meshes)} elements with geometry")
    
    # 统计
    total_verts = sum(len(m.vertices) for m in meshes)
    total_faces = sum(len(m.faces) for m in meshes)
    print(f"  {total_verts:,} vertices, {total_faces:,} triangles")
    
    t1 = time.perf_counter()
    print(f"  Geometry extraction: {t1 - t0:.1f}s")
    
    # 组装 GLB
    print("Assembling GLB...")
    assemble_glb(
        model=model,
        meshes=meshes,
        output_path=output_path,
        use_color=use_color,
        include_hierarchy=include_hierarchy,
        include_properties=include_properties,
    )
    
    t2 = time.perf_counter()
    
    # 输出统计
    output_size = Path(output_path).stat().st_size
    input_size = Path(input_path).stat().st_size
    
    print(f"\nDone: {output_path}")
    print(f"  Output size:  {output_size / 1024 / 1024:.1f} MB")
    print(f"  Ratio:        {input_size / output_size:.1f}:1")
    print(f"  Total time:   {t2 - t0:.1f}s")
    print(f"  Meshes:       {len(meshes)}")
```

---

## 6. 项目配置文件

### 6.1 pyproject.toml

```toml
[project]
name = "ifc-to-glb-converter"
version = "0.1.0"
description = "Convert IFC building models to glTF Binary (.glb)"
requires-python = ">=3.11"
dependencies = [
    "ifcopenshell>=0.7.0",
    "trimesh>=4.0.0",
    "numpy>=1.24",
    "typer>=0.9.0",
    "pygltflib>=1.16",
]

[project.scripts]
ifc-to-glb = "ifc_to_glb.cli:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["ifc_to_glb*"]
```

### 6.2 .gitignore

```
__pycache__/
*.pyc
.venv/
venv/
output/
*.glb
dist/
*.egg-info/
```

---

## 7. 安装与使用

### 7.1 初始安装

```bash
cd ifc-to-glb-converter

# 创建虚拟环境
python -m venv .venv

# 激活（Windows）
.venv\Scripts\activate
# 激活（macOS/Linux）
source .venv/bin/activate

# 安装依赖
pip install -e .

# 验证
ifc-to-glb --help
```

### 7.2 日常使用

```bash
# 基本转换
ifc-to-glb convert model.ifc

# 指定输出 + 着色
ifc-to-glb convert model.ifc --output result.glb --color

# 扁平模式（无层级）
ifc-to-glb convert model.ifc --color --no-hierarchy

# 仅几何（无属性、无层级、无颜色）
ifc-to-glb convert model.ifc --no-hierarchy --no-properties

# 查看 IFC 信息
ifc-to-glb info model.ifc
```

---

## 8. 测试策略

### 8.1 测试文件

使用 converter-service 已有的 IFC 测试文件，通过相对路径引用：

```
converter-service/models/20210219Architecture.ifc
converter-service/models/北辰长沙A2项目-结构-1#楼.ifc
converter-service/models/西单商场_AS.ifc
```

### 8.2 测试用例

| 测试 | 内容 | 验证方式 |
|------|------|---------|
| 几何完整性 | 构件数、顶点数、三角面数与 IfcOpenShell 统计一致 | `pytest` 断言 |
| GLB 可打开 | 导出的 .glb 在标准查看器中正常渲染 | 手动拖入 gltf-viewer.donmccurdy.com |
| 空间层级 | IFC 的 Project→Site→Building→Storey 层级在 GLB node tree 中体现 | glTF Validator + 手动检查 |
| 属性注入 | node.extras 包含 GlobalId, Name | `pygltflib` 读取 GLB 并断言 |
| 材质颜色 | 不同 IFC 类型对应不同颜色 | 视觉对比 |
| 大型文件 | 500MB+ IFC 可正常完成不崩溃 | 运行并检查退出码 |

### 8.3 测试框架

使用 `pytest`：

```bash
pip install pytest
pytest tests/ -v
```

---

## 9. 与 converter-service 的关系

两个项目**完全独立运行，互不依赖**：

| 维度 | converter-service | ifc-to-glb-converter |
|------|------------------|---------------------|
| 运行时 | Node.js | Python 3.11+ |
| 依赖管理 | npm / package.json | pip / pyproject.toml |
| 输出格式 | .frag（私有二进制） | .glb（开放标准） |
| 几何引擎 | web-ifc | IfcOpenShell (OpenCASCADE) |
| 使用场景 | BimModelThree 查看器内加载 | 通用 GLB 查看器 / 其他平台 |

共享的只有：
- 测试 IFC 文件（`converter-service/models/`，通过文件路径引用）
- 项目文档（`BimModelThree/docs/`）
- Git 仓库

---

## 10. 工作量估算

| 阶段 | 内容 | 时间 |
|------|------|------|
| 项目初始化 | pyproject.toml、虚拟环境、目录结构 | 0.5 天 |
| geometry.py | IfcOpenShell iterator 封装 + 测试 | 1 天 |
| materials.py | 颜色映射表 | 0.5 天 |
| hierarchy.py | 空间层级遍历 + 测试 | 1 天 |
| properties.py | 属性提取 | 0.5 天 |
| exporter.py | trimesh 场景组装 + pygltflib extras 注入 | 1.5 天 |
| converter.py + cli.py | 主流程 + typer CLI | 1 天 |
| 集成测试 | 5 个测试 IFC 端到端验证 | 1 天 |
| 文档 | README + 使用说明 | 0.5 天 |
| **合计** | | **约 7 天** |

比 Python 桥接方案（7.5 天）少 0.5 天，因为省掉了 Node.js 桥接层的开发和跨进程通信调试。

---

## 11. 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| trimesh 空 Group 创建 | 高 | 层级结构丢失 | trimesh 不支持空 Group → 改用微小几何体占位，或用 pygltflib 直接构建 |
| trimesh GLB extras 不保留 | 高 | 属性无法嵌入 | pygltflib 后处理注入 |
| ifcopenshell 安装失败 | 中 | 无法开始 | 提供 conda 备选；检查 Python 版本兼容性 |
| 大 IFC 内存溢出 | 中 | 转换崩溃 | iterator 逐构件处理 + 分批导出 |
| 空间层级不完整 | 中 | 部分构件挂载到错误位置 | 记录警告 + 降级为平铺 |
| glTF 坐标系不一致 | 低 | 模型方向错误 | 验证 + 坐标轴转换矩阵 |

---

## 12. todo（实施时细化）

- [ ] 确认 IfcOpenShell Python 包在目标环境可正常安装
- [ ] 用小型 IFC 先验证完整的 解析→几何→GLB 链路
- [ ] 验证 trimesh 导出 GLB 的 extras 是否保留（决定是否需要 pygltflib 后处理）
- [ ] 验证空间层级树的正确性（与 IFC 查看器对比）
- [ ] 处理 IFC 构件在层级中重复引用的问题
- [ ] 大文件内存优化
- [ ] 支持 Draco 压缩（后续扩展）
