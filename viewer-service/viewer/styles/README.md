# Viewer CSS Modules

`index.html` 按以下顺序直接加载样式模块。顺序属于页面级联契约，调整模块位置前必须完成桌面和移动端回归。

| 模块 | 职责 |
|---|---|
| `01-foundation.css` | 颜色变量、基础元素、嵌入模式和早期响应式规则 |
| `02-viewer-core.css` | Viewer 主体控件、模型树、视口覆盖层、测量和基础面板 |
| `03-workspace-drawers.css` | 业务抽屉、设置抽屉及其 Tab |
| `04-feature-panels.css` | 多模型、版本对比、气泡、详细树等功能面板 |
| `05-layout.css` | 两栏兼容布局、当前三栏布局、视口工具栏和响应式布局 |
| `06-right-inspector.css` | 右侧检查器、设置日志面板及最后级联覆盖 |
| `07-responsive-overlays.css` | 最终断点、单栏工作流及视口浮层避让规则 |
| `08-left-sidebar.css` | 左侧品牌、模型状态、多模型管理和模型树的最终布局 |

根目录的 `style.css` 仅作为旧集成的兼容聚合入口。Viewer 页面应直接加载模块，避免 `@import` 串行请求。
