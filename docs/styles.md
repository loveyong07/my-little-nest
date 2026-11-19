# 样式维护

`src/styles.css` 是首页与公共样式入口；动态页与联系页的专属样式分别通过 `posts-route.css` 和 `contact-route.css` 随懒加载路由按需拆包，同时保持原有层叠顺序。调整前应先检查后续同名选择器、媒体条件与 `@supports`。

| 层次 | 文件 | 职责 |
| --- | --- | --- |
| 基础与首页入口 | `globals.css`、`scenes.css`、`hero-scene.css`、`header.css`、`hero.css`、`starrygal-balloon.css`、`panels.css`、`routes.css`、`glass.css`、`glass-florals.css`、`desktop-stationery.css`、`desktop-design.css`、`mobile-letter.css`、`swipe-switch.css` | 全局变量、场景、导航滑动切换、首页信笺与手记、公共路由外壳与玻璃基座 |
| 动态页按需包（`posts-route.css`） | `posts.css`、`media-lightbox.css`、`glass-posts.css`、`articles.css`、`posts-desktop.css`、`posts-mobile.css`、`translation.css` | 帖子、转帖、文章、灯箱、目录与搜索抽屉、端侧翻译 |
| 联系页按需包（`contact-route.css`） | `contact.css`、`glass-contact.css`、`contact-desktop.css`、`contact-mobile.css` | 社交渠道卡片、写信草稿与联系页玻璃/响应布局 |

`desktop-design.css`、`posts-desktop.css` 和 `contact-desktop.css` 的主布局条件为宽度至少 901px 且精细指针；`mobile-letter.css`、`posts-mobile.css` 和 `contact-mobile.css` 的主条件为宽度至多 900px，或粗指针、无指针设备。键盘焦点、减少动画与强制颜色规则仍需保留。脚本断点配置在 `src/constants/media-queries.js`。

`fantasy-extras.css` 由附加组件单独引入，`post-font.css` 按阅读需要加载，不属于上述入口的静态导入列表。

首页在短桌面窗口中优先压缩装饰和留白，高度不超过 650px 时让原有信笺与手记并排，再应用一屏适配，避免把正文整体缩成小字。气球根据文字卡片与页头的实际边界选择安全区域，空间不足时不覆盖阅读内容。首页粒子层位于 Hero 内部，其他路由粒子位于内容面板之后；不在视频或照片上叠加雪花。手机长文中提供“返回目录”按钮，并保留 44px 以上触控高度。

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
