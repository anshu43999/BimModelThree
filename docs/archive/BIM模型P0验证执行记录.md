# BIM 模型 P0 验证执行记录

更新时间：2026-07-16

## 0. 当前进度修订

文档状态：当前有效，尚无正式实测结论。

截至 2026-07-16，P0 验证所需的主要前端入口和自动化基础已经进一步补齐：

- 模型树已支持 `models / objects / classes / storeys` tabs、懒加载、详细树弹窗和节点联动高亮。
- 属性面板与详细树已经能展示 localId、GlobalId、type、entityName 等核心字段。
- 框选、点击选择、右键菜单、显隐/隔离/着色/透明等构件操作已有基础版。
- 捕捉、点到点距离测量、标签、批注、基础剖切已具备演示入口，可作为 P0/P1 交互稳定性验收的附加观察项。

Viewer 全量 Node 测试已达到 `109 passed / 0 failed`，但本文件的结论仍保持不变：T003 属性完整度、T004 ID 稳定性、大模型树性能、框选准确性、右键菜单准确性尚未形成真实项目模型的正式实测记录。后续验收必须补充模型来源、构件数量、文件大小、浏览器环境、耗时、错误日志和人工核对结果。

## 1. 文档目的

本文档用于记录 `BimModelThree` 当前 BIM Viewer MVP 的 P0 高优先级验证执行口径和首版记录模板，覆盖：

- T003 属性完整度验证。
- T004 ID 稳定性验证。
- 大模型树性能验证。
- 框选验证。
- 右键菜单准确性验证。

本文档不是已完成验收报告。当前项目已有可观测入口和部分实现基础，但尚未在真实项目模型上形成完整实测数据；所有未采集数据均标记为“待实测”。

## 2. 验证依据与当前实现入口

参考文档：

- `docs/BIM模型项目进度评估与进度计划表.md`
- `docs/BIM-Three与Fragments架构功能扩展可行性评估.md`

当前代码可直接使用的入口：

| 入口 | 位置 | 可观测内容 |
|---|---|---|
| 模型加载 | `viewer-service/viewer/index.html` 的 `.frag` 文件、URL、Manifest 加载入口 | 加载状态、文件名、加载耗时、构件数量、模型包围盒 |
| 模型树 | `viewer-service/viewer/index.html` 左侧“模型树”，tab 包含 `models`、`objects`、`classes`、`storeys` | 树结构、节点数量、可选择 localIds、展开/折叠表现 |
| 详细树 | `viewer-service/viewer/index.html` 左侧“详细树”按钮，`TreeDialogEngine` | localId、GlobalId、类型、名称、楼层、父级、常见属性候选值 |
| 属性面板 | `viewer-service/viewer/index.html` 的“基础信息”“属性与材质”区域 | localId、GUID/GlobalId、Category、Name、Description、ObjectType、PredefinedType、属性、材质 |
| 运行日志 | `viewer-service/viewer/index.html` 的“运行日志”区域，`main-mvp.js` 的 `log()` | 加载、语义数据、树渲染、拾取、框选、选择、显隐、隔离、着色等日志 |
| 框选 | `viewer-service/viewer/index.html` 的“框选”按钮，`InteractionEngine.rectanglePick()` | 框选矩形尺寸、返回 localIds 数量、选择结果、高亮结果 |
| 点击拾取 | Canvas 点击，`InteractionEngine.pick()` / Fragments `raycast()` | raycast hit/miss、localId、itemId、耗时 |
| 右键菜单 | Canvas 右键，菜单动作：定位、隔离、隐藏、着色、全部显示 | 右键命中对象、菜单动作对象、选择状态、视觉结果 |

当前代码中的关键数据路径：

- `viewer-service/viewer/engines/semantic-query-engine.js`
  - `getTree(mode)` 生成 `models`、`objects`、`classes`、`storeys` 树。
  - `getItemInfo(localId)` 读取 GlobalId、分类、名称、描述、ObjectType、PredefinedType、属性、材质和原始数据。
  - `getGlobalId(localId)` 与 `getLocalIdByGlobalId(globalId)` 支撑 ID 映射验证。
- `viewer-service/viewer/engines/interaction-engine.js`
  - `pick(clientX, clientY)` 调用 Fragments `raycast()` 并同步选择。
  - `rectanglePick(rect)` 调用 Fragments `rectangleRaycast()` 并同步选择。
  - `selectLocalIds()`、`hideSelected()`、`isolateSelected()`、`colorSelected()`、`setSelectedOpacity()` 支撑菜单动作验证。
- `viewer-service/viewer/engines/tree-dialog-engine.js`
  - 详细树按批渲染节点，并按需通过 `semanticEngine.getItemInfo()` 补齐常见字段。

## 3. 通用执行约束

| 项 | 要求 |
|---|---|
| 验证样本 | 至少 2-3 个真实项目模型，覆盖小模型、中模型、大模型；当前为待提供。 |
| 记录原则 | 只记录实际观测结果；没有真实模型或没有采集的数据写“待实测”。 |
| ID 策略 | 业务绑定优先验证 `GlobalId`；`localId` 只作为前端运行时操作 ID。 |
| 操作影响 | 每项验证不得破坏模型加载、相机、选择、显隐、隔离、着色、透明度和属性面板。 |
| 性能采集 | 使用运行日志、浏览器 DevTools Performance、浏览器内存面板共同记录。 |
| 数据保留 | 每次执行记录模型来源、模型大小、构件数量、浏览器、机器配置、操作人、日期。 |

## 4. 执行记录总表

| 任务 | 当前状态 | 本轮结论 | 证据位置 | 后续动作 |
|---|---|---|---|---|
| T003 属性完整度验证 | Viewer 抽样验证和报告导出已实现，待真实模型对比 | 待实测 | 属性面板、详细树、运行日志、模型验证 JSON/Markdown 报告、`SemanticQueryEngine.getItemInfo()` | 提供 IFC 原始属性基准和真实 `.frag` 样本 |
| T004 ID 稳定性验证 | Viewer 单批次 GlobalId 覆盖/重复/回查报告已实现，跨批次仍待实测 | 待实测 | 属性面板、详细树、运行日志、模型验证 JSON/Markdown 报告、`getGlobalId()`、`getLocalIdByGlobalId()` | 对同一 IFC 多次转换并对比导出报告 |
| 大模型树性能验证 | 已有懒加载、分批渲染、详细树入口 | 待实测 | 模型树、详细树、运行日志、浏览器 Performance | 用大模型记录展开、切 tab、详细树打开耗时 |
| 框选验证 | 已实现框选入口，待真实模型验证 | 待实测 | 框选按钮、HUD、运行日志、属性面板 | 记录不同视角、不同框选面积的准确率和耗时 |
| 右键菜单准确性验证 | 已实现右键菜单初版，待真实模型验证 | 待实测 | Canvas 右键菜单、运行日志、属性面板、视觉结果 | 验证命中对象与定位/隐藏/隔离/着色动作一致 |

## 5. T003 属性完整度验证

| 项 | 内容 |
|---|---|
| 验证目标 | 确认 `.frag` 中可读取的 BIM 语义属性范围，判断是否满足属性面板、搜索过滤、标签、批注、分区可视化等后续功能依赖。 |
| 输入模型 | 待实测：同一项目的 IFC 原始文件、转换后的 `.frag`、可选 `manifest.json`、转换报告或 IFC 属性导出基准。 |
| 执行步骤 | 1. 在 Viewer 加载 `.frag` 或 Manifest。2. 记录模型名称、文件大小、加载耗时、localIds 数量。3. 分别从模型树 `models`、`objects`、`classes`、`storeys` 选择典型构件。4. 打开详细树查看 localId、GlobalId、类型、名称、楼层等字段。5. 在属性面板记录基础信息和属性与材质表。6. 与 IFC 原始属性或后端导出属性基准逐项对比。7. 记录缺失字段、空字段、字段路径差异和显示异常。 |
| 采集指标 | localIds 总数、可获取 GlobalId 数量、Name 覆盖率、Category 覆盖率、Description 覆盖率、ObjectType 覆盖率、PredefinedType 覆盖率、PSet/属性集覆盖情况、材质信息覆盖情况、楼层字段覆盖情况、属性读取错误数。 |
| 通过标准 | 关键构件可稳定展示 `localId`、`GlobalId`、`Category`、`Name`；业务候选字段有明确覆盖率；属性缺失原因可追溯到转换参数、IFC 原始数据或前端读取路径；属性读取失败不导致 Viewer 卡死或选择状态错乱。 |
| 当前项目可观测入口 | 属性面板“基础信息”“属性与材质”；详细树；模型树四类 tab；左侧“模型验证”运行/导出；运行日志；`SemanticQueryEngine.getItemInfo(localId)` 中的 `raw.attributes`、`raw.data`、`properties`、`materials`。 |
| 缺口/后续动作 | 待提供真实 IFC 与转换后 `.frag` 对照样本；待定义业务必需字段清单，例如编码、楼层、专业、系统、材质、房间/空间关系；待将导出报告与 IFC 基准逐项对比。 |
| 当前执行结果 | 待实测。 |

### T003 记录表

| 模型 | localId | GlobalId | Category | Name | 楼层 | PSet/属性集 | 材质 | 与 IFC 基准是否一致 | 问题 |
|---|---:|---|---|---|---|---|---|---|---|
| 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 |

## 6. T004 ID 稳定性验证

| 项 | 内容 |
|---|---|
| 验证目标 | 验证同一 IFC 在不同转换批次、不同加载会话中 `GlobalId` 与 `localId` 的稳定性，确认业务主键使用 `GlobalId`，前端运行时操作使用 `localId` 的策略是否成立。 |
| 输入模型 | 待实测：同一 IFC 至少转换 2-3 次得到的 `.frag`；如果存在不同模型版本，应额外提供版本 A/B。 |
| 执行步骤 | 1. 分别加载同一 IFC 多次转换得到的 `.frag`。2. 在模型树和详细树抽样同类构件。3. 记录每个样本的 `localId`、`GlobalId`、Category、Name、树路径。4. 使用属性面板确认选中构件与 GlobalId 一致。5. 对比不同转换批次中的 `GlobalId -> localId` 映射。6. 对同一 `GlobalId` 执行定位、选择、属性查看，确认可回查当前运行时 localId。 |
| 采集指标 | GlobalId 覆盖率、重复 GlobalId 数量、空 GlobalId 数量、同一 GlobalId 在多次转换中的 localId 是否变化、树路径是否变化、`getLocalIdByGlobalId()` 回查成功率、选择后属性面板 ID 一致率。 |
| 通过标准 | 同一真实构件的 `GlobalId` 在多次转换中保持一致；`localId` 允许变化但必须只用于当前加载会话；不存在影响业务绑定的空 GlobalId 或重复 GlobalId，若存在必须记录范围和规避策略；通过 GlobalId 能回查当前会话可操作 localId。 |
| 当前项目可观测入口 | 属性面板 `GUID`；详细树 `globalId`；左侧“模型验证”运行/导出；运行日志 `Selection updated`；`SemanticQueryEngine.getGlobalId(localId)`；`SemanticQueryEngine.getLocalIdByGlobalId(globalId)`；选择事件中的 `globalIds`。 |
| 缺口/后续动作 | 待生成多批次转换产物；待分别导出多批次 JSON/Markdown 报告并对比；待确定空 GlobalId 或重复 GlobalId 的业务处置规则。 |
| 当前执行结果 | 待实测。 |

### T004 记录表

| 模型批次 | 构件描述 | GlobalId | localId | Category | Name | 树路径 | 回查是否成功 | 备注 |
|---|---|---|---:|---|---|---|---|---|
| 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 |

## 7. 大模型树性能验证

| 项 | 内容 |
|---|---|
| 验证目标 | 验证大模型下模型树生成、tab 切换、节点展开、详细树打开和批量选择不会造成明显卡死，并确认当前懒加载、分批渲染、详细树弹窗策略是否满足 P0。 |
| 输入模型 | 待实测：至少一个大模型，建议构件数、IFC 实体数、楼层数和专业范围明确。 |
| 执行步骤 | 1. 加载大模型并记录 `Model semantic data ready` 的耗时和 localIds 数量。2. 依次切换 `models`、`objects`、`classes`、`storeys` tab。3. 展开不同层级节点，记录首批渲染和“加载更多”的响应。4. 点击分组节点和叶子节点，确认选择状态、HUD、属性面板同步。5. 打开详细树，展开大分组并记录是否卡顿。6. 使用浏览器 Performance 记录长任务、内存变化和明显掉帧点。 |
| 采集指标 | 模型语义数据初始化耗时、各 tab 树生成耗时、树节点总数、localIds 数量、单次展开耗时、加载更多耗时、详细树打开耗时、详细树展开耗时、DOM 节点峰值、内存峰值、长任务次数、是否出现页面无响应。 |
| 通过标准 | 大模型加载后模型树可交互；tab 切换、展开、详细树打开不造成页面长时间无响应；分组节点选择不会误导属性面板为单构件属性；运行日志能定位慢操作；若性能不达标，能明确需要虚拟滚动、搜索过滤、后端树索引或属性批量缓存。 |
| 当前项目可观测入口 | 模型树四类 tab；“展开”按钮；“详细树”按钮；运行日志 `Model semantic data ready`、`Tree tab rendered`、`Selection updated`；`SemanticQueryEngine.getTree()`；`TreeDialogEngine` 批量渲染。 |
| 缺口/后续动作 | 待真实大模型性能数据；待补充统一性能记录表；如实测卡顿，后续考虑虚拟滚动、仅保留展开路径 DOM、搜索过滤、后端预生成树索引。 |
| 当前执行结果 | 待实测。 |

### 大模型树性能记录表

| 模型 | localIds | 树 tab | 节点数 | 生成耗时 | 展开耗时 | 详细树耗时 | 内存峰值 | 结论 |
|---|---:|---|---:|---:|---:|---:|---:|---|
| 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 |

## 8. 框选验证

| 项 | 内容 |
|---|---|
| 验证目标 | 验证当前框选工具在不同模型、不同视角、不同选择范围下的准确性和耗时，确认 `rectangleRaycast()` 返回结果与用户框选区域一致。 |
| 输入模型 | 待实测：包含密集构件、遮挡构件、楼层/专业差异明显的真实模型。 |
| 执行步骤 | 1. 加载模型并切换到典型视角：等轴测、顶视图、前视图、局部放大视图。2. 点击“框选”进入 Box 模式，确认 OrbitControls 被禁用且 HUD 显示 Box。3. 框选小范围、中范围、大范围构件。4. 记录工具 HUD 中的框选数量/耗时。5. 记录运行日志中的 `Box select start`、`Box select finish`、`Box select result`、`Box select complete` 或失败日志。6. 检查高亮数量、HUD 选中数量、属性面板 primary localId。7. 与人工预期或详细树/属性面板核对结果。8. 退出框选模式，确认浏览和点击选择恢复正常。 |
| 采集指标 | 框选矩形宽高、返回 localIds 数量、框选耗时、误选数量、漏选数量、重复选择数量、空选结果、框选后属性面板同步耗时、框选模式与浏览模式冲突情况。 |
| 通过标准 | 框选区域内可见/目标构件的选择结果稳定；大范围框选不会导致页面卡死；框选模式下不会误触发模型旋转；退出框选后点击选择、右键菜单和相机控制恢复；工具 HUD 能显示最近一次框选数量/耗时；运行日志能显示矩形范围、数量、耗时、样例 localId 和失败原因。 |
| 当前项目可观测入口 | “框选”按钮；Canvas 选择矩形；工具 HUD 框选数量/耗时；HUD 选中数量；属性面板；运行日志；`InteractionEngine.rectanglePick()` 调用 Fragments `rectangleRaycast()`。 |
| 缺口/后续动作 | 待真实模型准确率基准；待定义“完全包含”和“部分相交”的业务口径；待补充框选耗时细分日志；如需要精确核对，后续可新增非侵入式验证脚本导出框选结果。 |
| 当前执行结果 | 待实测。 |

### 框选验证记录表

| 模型 | 视角 | 框选范围 | 返回数量 | 样例 localId | 人工预期数量 | 误选 | 漏选 | 耗时 | 结论 |
|---|---|---|---:|---|---:|---:|---:|---:|---|
| 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 |

## 9. 右键菜单准确性验证

| 项 | 内容 |
|---|---|
| 验证目标 | 验证不同视角和复杂遮挡情况下右键命中构件是否准确，右键菜单动作是否作用于当前命中/选中构件，且不会与框选模式、选择状态、属性面板发生错乱。 |
| 输入模型 | 待实测：包含密集构件、遮挡构件、不同分类构件和多楼层构件的真实模型。 |
| 执行步骤 | 1. 加载模型，选择典型视角和局部放大位置。2. 在单个清晰构件上右键，通过菜单顶部命中信息记录 localId、GlobalId、Category、名称。3. 对同一构件依次执行查看属性、定位、隔离、隐藏、着色、复制构件信息、创建标签、创建批注、全部显示。4. 在密集构件边界、遮挡区域、空白区域分别右键，记录 hit/miss 和菜单表现。5. 开启框选模式后右键，确认菜单不触发或不与框选冲突。6. 每次动作后检查模型视觉结果、属性面板、模型树选中态、标签/批注气泡、运行日志是否一致。 |
| 采集指标 | 右键 hit/miss 次数、命中 localId 与预期一致率、菜单动作成功率、动作对象一致率、属性面板同步率、空白区域误命中次数、框选模式冲突次数、操作后恢复成功率。 |
| 通过标准 | 右键命中的构件与鼠标位置一致；查看属性、定位、隔离、隐藏、着色、复制、创建标签、创建批注、全部显示均作用于当前选中对象；复制内容包含 localId、GlobalId、Category、名称；标签/批注气泡绑定当前构件；空白区域不产生错误操作；框选模式下右键菜单不干扰框选；运行日志和属性面板可以追溯每次动作对象。 |
| 当前项目可观测入口 | Canvas 右键菜单顶部命中信息；菜单动作 `showProperties`、`locate`、`isolate`、`hide`、`color`、`copyInfo`、`createLabel`、`createAnnotation`、`showAll`；运行日志 `Raycast hit`、`Selection updated`、`Selected isolated`、`Selected hidden`、`Selected colored`、`Component info copied`、`Label added`、`Annotation created`、`All items visible`；属性面板；模型树选中态；标签/批注气泡。 |
| 缺口/后续动作 | 待真实模型命中准确率数据；待补充右键菜单命中失败时是否显示菜单的产品口径；待定义遮挡情况下优先命中前景、最近构件还是业务可选构件。 |
| 当前执行结果 | 待实测。 |

### 右键菜单验证记录表

| 模型 | 视角/位置 | 右键目标 | 命中 localId | 命中 GlobalId | 命中 Category | 动作 | 视觉结果 | 面板是否一致 | 结论 |
|---|---|---|---:|---|---|---|---|---|---|
| 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 待实测 | 查看属性 / 定位 / 隐藏 / 隔离 / 着色 / 复制 / 标签 / 批注 / 显示全部 | 待实测 | 待实测 | 待实测 |

## 10. 缺口汇总与后续动作

| 缺口 | 影响 | 后续动作 | 优先级 |
|---|---|---|---|
| 缺少真实模型实测数据 | 无法形成正式验收结论 | 提供至少 2-3 个真实项目模型和对应 IFC/转换产物 | P0 |
| 缺少 IFC 原始属性基准 | T003 只能看到 Viewer 可读属性，无法判断转换丢失 | 从转换服务或 IFC 解析工具导出属性基准 | P0 |
| 缺少多批次转换映射 | T004 无法判断 localId/GlobalId 跨转换稳定性 | 对同一 IFC 重复转换并导出映射 | P0 |
| 性能指标未统一 | 大模型树、框选耗时难以横向比较 | 固定记录浏览器、机器、模型大小、localIds、耗时、内存 | P0 |
| 框选准确率缺少人工基准 | 难以判断误选和漏选 | 选取固定视角和固定区域截图，人工标注预期构件 | P0 |
| 右键遮挡命中规则未定义 | 边界场景验收口径不一致 | 明确右键命中最近构件、前景构件或业务可选构件 | P0 |

## 11. 首版结论

当前项目已经具备 P0 验证所需的主要手工观测入口：模型树、详细树、属性面板、运行日志、框选和右键菜单；`SemanticQueryEngine` 与 `InteractionEngine` 也提供了属性读取、ID 映射、点击拾取、框选和选择动作的代码路径。

但截至本文档首版，尚未基于真实项目模型完成 T003、T004、大模型树性能、框选、右键菜单准确性的完整实测。因此 P0 当前结论为：验证入口已具备，执行数据待实测，不能声明真实模型验证已完成。
