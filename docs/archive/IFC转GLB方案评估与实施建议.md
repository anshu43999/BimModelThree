# IFC 转 GLB 方案评估与实施建议

更新时间：2026-07-16

文档状态：辅助路线评估。GLB 不作为当前核心 BIM Viewer 主格式。

## 0. 当前进度修订

截至 2026-07-16，当前项目主线仍为：

```text
IFC -> Fragments .frag -> manifest.json -> Three.js + @thatopen/fragments Viewer
```

GLB 仍定位为辅助预览、轻量分享或外部系统交换格式，不作为当前 BIM Viewer 的主业务格式。当前 Viewer 已围绕 `.frag` 建立模型树、属性、选择、高亮、标签、批注、测量、剖切等能力；如果切换 GLB，需要重新设计构件 ID、属性、楼层树、选择和业务绑定，因此不建议在当前 MVP 阶段推进 GLB 替代 `.frag`。

## 1. 当前结论

当前 BIM Viewer 主格式仍建议使用 `.frag`，GLB 定位为辅助导出格式。

```text
主链路：IFC -> .frag -> Viewer
辅助链路：IFC / .frag / Blender -> GLB
```

GLB 适合第三方预览、轻量分享、移动端展示和外部平台交换；不适合作为当前 BIM Viewer 的主业务格式，因为完整属性、构件 ID、楼层树、选择操作和业务绑定都需要额外封装。

## 2. 可选路线

| 路线 | 可行性 | 推荐程度 | 说明 |
|---|---:|---:|---|
| `.frag -> GLB` | 中高 | 高 | 复用当前转换链路，适合辅助导出 PoC |
| Blender -> GLB | 高 | 高 | 已可通过 Blender 转出 GLB，适合视觉导出和兜底 |
| IfcOpenShell/Python -> GLB | 中高 | 中高 | 适合稳定服务端转换，但需要 Python 依赖和属性后处理 |
| web-ifc -> Three.js -> GLB | 中 | 中低 | 纯 JS 路线可做 PoC，但空间树、属性、内存风险较高 |
| 云转换服务 | 中 | 低 | 成本、数据合规和格式控制风险较高 |

## 3. 推荐方案

### 第一选择：Blender 转出的 GLB 先接入 Viewer

你已经通过 Blender 转出 GLB，因此短期最务实的验证是：

```text
20210219Architecture.glb
 -> viewer-service 使用 Three.js GLTFLoader 加载
 -> 验证模型是否正常显示、大小、方向、材质和性能
```

Three.js 可以直接渲染 GLB，但需要单独用 `GLTFLoader` 加载，不能走当前 Fragments `.frag` 加载逻辑。

### 第二选择：`.frag -> GLB` PoC

目标是复用当前 `.frag` 转换结果，导出一个通用 GLB：

```text
IFC -> .frag -> Fragments/Three.js 场景 -> GLTFExporter -> GLB
```

这个方案更贴近当前系统，但要验证 Fragments 模型是否能稳定导出为普通 Three.js mesh。

### 第三选择：IfcOpenShell/Python 转换服务

如果后续要做稳定 IFC 到 GLB 服务，IfcOpenShell 更适合长期方案：

```text
IFC -> IfcOpenShell -> trimesh / pygltflib -> GLB
```

它更适合复杂几何和服务端批处理，但需要处理 Python 环境、内存、节点 extras 和属性映射。

## 4. 不建议当前推进的方案

### 不建议 GLB 替代 `.frag`

原因：

- GLB 原生不提供 BIM 查询能力。
- 属性和关系需要写入 `extras` 或旁路 JSON。
- 构件选择、楼层树、分类树、批注绑定都要重新设计。
- 当前 Viewer 已经围绕 Fragments API 建立。

### 不建议优先纯 web-ifc 直转 GLB

原因：

- `web-ifc` 0.0.77 的空间树能力不能按 `GetSpatialStructure()` 作为稳定前提。
- 顶点布局、属性解析、PSet、空间层级都需要自研适配。
- 大模型内存风险更高。

## 5. GLB 文件体积预估

GLB 体积主要取决于三角面数量、是否保留材质、是否嵌入纹理、是否压缩。

以当前项目样本粗略估计：

| IFC 文件 | IFC 大小 | 预估 GLB 大小 |
|---|---:|---:|
| `20210219Architecture.ifc` | 约 108 MB | 约 15-40 MB |
| `西单商场_AS.ifc` | 约 152 MB | 约 25-60 MB |

如果启用 Draco 或 meshopt 压缩，体积可能进一步降低；如果嵌入纹理，体积可能明显增加。

## 6. 验证清单

GLB 接入前至少验证：

- Three.js 能正常加载。
- 模型方向正确。
- 模型尺度正确。
- 材质和透明度可接受。
- 相机 fit 后能看到完整模型。
- 浏览器内存和帧率可接受。
- 是否需要构件级选择。
- 是否存在 `GlobalId` 或可追踪节点名称。

## 7. 实施建议

1. 先在 `viewer-service` 新增 GLB 加载测试页或在现有 Demo 中增加 GLB 模式。
2. 用 `E:\BimModelThree\converter-service\models\20210219Architecture.glb` 验证渲染。
3. 记录 GLB 文件大小、加载耗时、首帧耗时和内存。
4. 如果只是展示，GLB 可作为辅助预览格式。
5. 如果要构件级业务能力，继续以 `.frag` 作为主格式。

## 8. 历史来源

本文件合并整理自：

- `IFC转GLB功能实施计划.md`
- `IFC转GLB功能实施计划-IfcOpenShell.md`
- `IFC转GLB功能实施计划-独立Python项目.md`
