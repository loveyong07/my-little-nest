# 样式维护

`src/styles.css` 是入口。导入顺序影响层叠，调整前应先检查后续同名选择器、媒体条件与 `@supports`。

| 层次 | 文件 | 职责 |
| --- | --- | --- |
| 基础 | `globals.css`、`scenes.css`、`hero-scene.css` | 变量、全局约定、场景与背景 |
| 组件与页面 | `header.css`、`hero.css`、`panels.css`、`posts.css`、`media-lightbox.css`、`contact.css`、`routes.css` | 导航、页面结构、帖子、灯箱与联系交互 |
| 材质与装饰 | `glass.css`、`glass-florals.css`、`articles.css`、`desktop-stationery.css` | 共用玻璃效果、花饰、文章和桌面装饰 |
| 桌面构图 | `desktop-design.css` | 宽屏首页、导航、路由标题与外层面板 |
| 桌面功能 | `sky-letter.css` | 阅读目录、搜索抽屉、联系方式和信件草稿 |
| 触屏布局 | `mobile-letter.css` | 小屏或粗指针设备上的手帐、阅读与来信布局 |

`desktop-design.css` 和 `sky-letter.css` 的主布局条件为宽度至少 901px 且精细指针；`mobile-letter.css` 的主条件为宽度至多 900px，或粗指针、无指针设备。键盘焦点、减少动画与强制颜色规则仍需保留。脚本断点配置在 `src/constants/media-queries.js`。

`fantasy-extras.css` 由附加组件单独引入，`post-font.css` 按阅读需要加载，不属于上述入口的静态导入列表。

不要仅因选择器在静态 JSX 中搜索不到就删除：路由、语言、媒体和交互状态存在动态拼接的类名。也不要把某个断点下未生效的基础规则视作全局废弃规则。

## 修改前后对比

先确认工作区基线，再分别构建并使用同一采集器。每轮使用独立目录，保留原始 manifest、计算样式与截图：

```powershell
npm run build
npm run qa:styles -- capture qa/styles/before
# 修改源码后再次构建
npm run build
npm run qa:styles -- capture qa/styles/after
npm run qa:styles -- compare qa/styles/before qa/styles/after
```

采集器固定接口数据、时间、随机数、语言与浏览器条件，覆盖桌面、短屏、手机、三语和交互状态。比较报告中的预期布局变化也需解释；纯 CSS 清理应先单独比较，再混入有意的组件调整。
