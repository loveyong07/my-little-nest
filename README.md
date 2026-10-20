# 初咏的小窝

React / Vite 个人网站，提供首页、动态、联系三个页面，支持中文、日文、英文。联系页唯一邮箱为 `fyh20071004@gmail.com`。

当前重构已统一三语与联系方式配置、按组件整理样式并集中颜色变量；Vercel、Vite 和 Sites 共用 API 路由与媒体规则。卡片和灯箱共用媒体请求状态，保留独立重试、图片切换与键盘焦点。完整检查包含 lint、格式、逻辑测试和构建兼容性。本轮已通过本地验收，后续由生产分支 `master` 触发 Vercel 发布；当前线上版本以该分支最新成功的 Production 部署为准。

2026-10-20 的代码审核与内容润色已通过本地验收，用户随后授权经 `master` 发布，具体部署结果以对应提交的 Vercel Production 状态为准。首页补充小窝说明，联系页增加来信引导与复制邮箱，动态页末尾增加交流入口；账号目标和脚本断点统一配置，复制交互防止旧请求覆盖新反馈。审核范围与验收边界见 [代码审核与内容润色-2026-10-20.md](代码审核与内容润色-2026-10-20.md)。

## 仓库与发布

- GitHub：[loveyong07/my-little-nest](https://github.com/loveyong07/my-little-nest)，私有仓库，生产分支 `master`。
- 正式站：[loveyong07.top](https://loveyong07.top)。
- Vercel：[my-little-nest](https://vercel.com/fyh2026s-projects/my-little-nest)，推送 `master` 后自动构建并部署。
- 2026-10-09 已通过提交 `7579e82` 实测改名后的自动部署成功，Vercel 仓库绑定已更新为 `loveyong07`。
- Vercel 空间地址仍为 `fyh2026s-projects`，属于有效地址。
- 修复前生产基线（2026-10-11 23:43，北京时间）：远端 `master` 与当时最新成功的 Vercel Production 部署均为 `8c58c67de3dcadd6dfd22ff51bb29423594debe3`，正式域名 HTTP 200。该版本已包含商务页删除、邮箱精简与此前维护修复；当时本地 `8a322eb` 比该版本多 12 个提交，另有未提交的收尾与本次修复。这是修复和视觉比较的历史基线，不代表后续发布后的当前线上提交。

## 本地开发与检查

```powershell
npm install
npm run dev:proxy -- --host 127.0.0.1 --port 4173 --strictPort
```

打开 http://127.0.0.1:4173/。本机访问 X 使用现有网络代理；无需代理的环境可使用 `npm run dev`。

```powershell
npm test              # 逻辑测试，不需要 dist
npm run lint          # JavaScript、React Hooks 与 CSS 检查，警告也会失败
npm run lint:css      # Biome 结构检查与 CSS 语法约定检查
npm run format:check  # 格式检查
npm run build         # 生成 dist/client、dist/server、dist/.openai
npm run test:build    # 构建产物检查，必须在上一步之后运行
npm run test:sites    # Sites/Worker 兼容检查
npm run check         # lint → 格式 → 逻辑 → 构建 → 构建产物 → Sites，CI 与交付使用
git diff --check
npm audit --audit-level=high
```

`npm test` 只跑不依赖构建产物的逻辑测试，因此干净检出后可直接运行；`test:build` 读取 `dist/`，缺产物时会明确报错而不是静默跳过。CI 门禁包含 `npm run check` 和 `npm audit --audit-level=high`（见 `.github/workflows/check.yml`），审计同时覆盖开发与生产依赖。`vercel.json` 的构建命令保持 `npm run build`：`.vercelignore` 只上传构建输入，测试在 CI 中执行。

CSS 检查已迁移到固定版本的 Biome 2.5.15，移除了 Stylelint 引入的 `micromatch → braces` 漏洞链。`biome.json` 检查重复选择器、重复属性、简写覆盖、空规则和关键帧错误；`scripts/check-css-syntax.mjs` 使用 CSS AST 补充数学运算空格与双冒号伪元素检查。图片格式回退使用 `@supports`，保留 JPEG 回退与 WebP 优先选择，无需关闭重复属性规则。`tests/css-lint.test.mjs` 验证门禁能拦截错误并放行合法的响应式覆盖和图片回退。

2026-10-11 发布前修复实测：`npm run check` 的 lint、格式、210 项逻辑测试、7 项构建产物检查和 6 项 Sites 检查全部通过，`npm audit --audit-level=high` 为 **0 项漏洞**，`git diff --check` 通过。使用已有依赖安装。以上记录本地验证；线上 CI 和部署须按发布提交单独确认。

CSS、布局或组件结构修改必须另做视觉比较；`npm run check` 不包含浏览器截图，不能用其全绿证明外观一致。保留外观的重构可使用 `npm run qa:styles -- capture qa/styles/before` 在构建后采集，再修改、构建并采集 `qa/styles/after`，最后用 `npm run qa:styles -- compare qa/styles/before qa/styles/after` 比较。保留原有 66 个固定场景，另加 4 个短横屏关闭按钮、短屏菜单 Contact 点击与桌面/手机照片键盘焦点场景。模拟的网络失败不会掩盖真实页面错误，采集遇到真实错误会返回失败。

采集清单保存源提交、工作区状态、源码与构建摘要、采集脚本与固定数据摘要、浏览器版本和时区。可用 `QA_ROOT` 指向隔离检出的源码，以同一脚本和固定数据采集基线；用 `QA_SOURCE_REVISION` 和 `QA_SOURCE_STATE` 标注该源码来源，采集前分别构建两个版本。比较会校验浏览器和采集条件，并保存 `comparison.json`；未知来源的旧截图不能代表生产基线。视频场景使用失败响应，不能代替真实视频播放和真实网络 Range 验收。

本次以生产提交 `8c58c67` 为源码基线，两个版本各采集 70 个场景和 32 张截图；无元素位置、尺寸或文案变化。严格比较仍保留颜色归并、无效样式删除和置顶重试按钮退避状态等预期差异；一张截图的 38 个文字差异像素经同版本重采确认是采集噪声，不将严格比较记为完全一致。详细文件和证据见 [重构修复验收-2026-10-11.md](重构修复验收-2026-10-11.md)。

页面构建产物位于 `dist/client`，Sites 兼容产物位于 `dist/server` 和 `dist/.openai`。

重复构建会清除 `dist/server` 和 `dist/shared` 中已不属于当前源码的 `.mjs` 模块，保留其他文件；Sites 运行时对未知 `/api` 和 `/api/` 路径直接返回不缓存的 404，不进入页面回退。

## 维护入口

- `src/constants/locales.js`：三语通用文案、首页小窝说明与来信引导；`src/constants/site.js`：站点、联系方式与社交链接配置。
- `src/components/HeroSection.jsx`：首页；`src/pages/PostsPage.jsx`：动态页；`src/pages/ContactPage.jsx`：联系页。
- `src/components/DesktopStationery.jsx` 与 `src/styles/desktop-stationery.css`：三页共用的纸飞机、星星挂饰和信封装饰，仅在至少 1366 × 680 的精细指针视口显示，不占用内容布局；断点与 `src/constants/media-queries.js` 同步。
- `src/components/ScrapbookAccents.jsx`：信纸右侧的小帆船邮戳、动态和联系页标题旁的手帐挂绳，以及联系页底部的淡蓝信笺与心形邮戳；在至少 901px 的精细指针桌面布局显示，尺寸随窗口收缩，不限制窗口高度。手机与触摸平板隐藏，不新增内容或网络资源。外侧 `DesktopStationery` 仍保留至少 1366 × 680 的空间条件。
- `src/hooks/`、`src/routes/`：动态、资料、语言、站内导航与共享媒体请求状态。
- `src/styles.css`、`src/styles/`：按组件组织样式，颜色变量位于 `globals.css`。
- `src/styles/glass.css`：参考 ColorOS 桌面/控制中心；首页使用水滴式通透玻璃，动态和联系页保持透明底层，上层卡片逐级增加轻磨砂。高光、底色和磨砂强度集中在这里，大面板与长帖子复用 `scenes.css` 的静态插画。参数与验证范围见 [玻璃质感验收-2026-10-14.md](玻璃质感验收-2026-10-14.md)。
- 动态照片容器使用独立的 `glass-media-backdrop`：窄图或混合比例轮播的留白透出分层磨砂背景，取代纯浅蓝填充。仅静态场景副本使用桌面 `10px` / 手机 `8px` 模糊，叠加柔白渐变和细亮边；照片仍以原图 `object-fit: contain` 完整显示，切图、放大及视频沿用原有行为。
- `biome.json`、`scripts/check-css-syntax.mjs`：CSS 结构和语法检查，JavaScript/React Hooks 仍由 ESLint 检查，格式仍由 Prettier 检查。
- `server/api-handler.mjs`：四个 API 的共享入口；`server/x-feed-service.mjs`：X 资料和动态服务。
- `api/`、`server/vite-api-plugin.mjs`、`worker/index.js`：Vercel、Vite 与 Sites 的运行环境适配。
- `shared/`：浏览器和服务端共用的 X 账号与媒体来源规则。
- `build/scene-preloads.mjs`：场景预载插件；`build/` 是源码目录。
- `public/assets/`：在线资源；`archive/`、`design-reference.png`：保留的原始素材及设计参考。
- `public/assets/audio/SOURCES.md`：音乐来源与使用说明。
- `AGENTS.md`：项目约定；`网站设计进度交接.md`：当前维护交接。

脚本媒体查询见 `src/constants/media-queries.js`；CSS 的 700px、900px / 901px 与 `(pointer: fine)` 条件保持同步。700px 及以下使用手机场景与紧凑布局，900px 及以下使用折叠菜单，901px 及以上且精细指针才启用首页一屏适配。修改断点时同时检查脚本与 CSS，避免引入额外的生成工具。ESLint 负责 JavaScript/React Hooks，Biome 负责 CSS 结构，CSS AST 检查器补充语法约定，Prettier 负责格式；新增 CSS 检查规则必须覆盖合法语法，保留现有门禁。

## X 动态、媒体与密钥

置顶、日常帖子和文章的现有及后续静态配图统一请求 X 的 `name=orig` 原始像素，卡片与放大预览通过同源签名 URL 的 `format=webp` 输出高质量 WebP（quality 90，不缩放）；该输出格式也绑定在签名中，不能随意追加或移除。转换失败或运行环境没有原生编码器时返回原尺寸原图。头像、视频封面、视频和动图不重新编码。文章里的图片位置引用随原图 URL 一同规范化，保留原文图文顺序。

`/api/x-profile` 通过稳定用户 ID 查询账号资料；`/api/x-posts` 获取置顶、日常原创帖和 X Articles。文章来自同一次时间线请求的 `article` / `article_title` 字段，与普通长帖分开，响应包含 `articles` 和 `articlesStatus`（`ok` / `none` / `stale` / `unavailable`）。文章优先展示 API 提供的纯文本正文，缺少正文时展示预览，并提供 X 原文链接；封面沿用同源签名媒体代理。前端定期刷新，接口失败时使用已有缓存或明确标注的快照，不代表秒级同步。

动态页在日常帖子下方显示「随心分享 · X 文章」。文章的日期时间线、月份选择和上一篇／下一篇独立于帖子，后台刷新保留用户手动选择的文章。只有成功确认无文章才显示「X当前没有文章」；同步失败显示不可用状态，已有文章保留并标注过期。旧版缓存缺少文章字段时重新同步，不据此推断文章为空。

资料和动态响应对浏览器使用 `Cache-Control: no-store`，但浏览器应用层仍有内存和 localStorage 缓存。保留当前偏向复用、减少重复查询的策略：Vercel CDN 对完整成功响应使用 `s-maxage=300, stale-while-revalidate=600`；整体过期/不可用，或置顶过期/不可用/状态缺失及异常时使用 `s-maxage=60`。动态只有整体 `ok`、置顶和文章均为 `ok` / `none` 才算完整成功，`none` 表示已确认该部分为空；资料只判断自身状态。异常响应也用短缓存。

服务端时间线和用户资料成功缓存为 15 分钟，时间线每 24 小时完整核对；前端完整成功数据的刷新窗口也为 15 分钟，页面可见时每分钟检查一次。因此单层 CDN 的 5 分钟不是端到端同步时限，缓存窗口可能叠加。`stale-while-revalidate` 允许过期缓存被使用并在后台更新，不表示每次请求固定再等待 10 分钟。尚无线上命中、费用或冷启动数据证明延长缓存有显著收益，接受其可能增加同步等待的取舍。

置顶部分失败保留可用日常动态：服务端从该次失败完成起退避 60 秒，到期后的下一次请求只重查同一置顶详情，不重抓用户或时间线，并合并并发；继续失败则再退避 60 秒。置顶恢复不会重置时间线缓存时钟。浏览器保存可用动态，但部分失败不进入 15 分钟完整成功窗口，沿用 30 秒失败退避及可见页面每分钟检查。恢复为 `ok` / `none` 后回到正常缓存。上述均按请求触发，CDN、页面可见性、函数实例和上游响应还会影响用户看到恢复的时间，不保证一分钟内端到端恢复。

文章部分失败同样退避 60 秒，之后合并并发并完整重扫时间线以恢复旧文章。若 X 拒绝可选文章字段，则回退普通帖子字段，保留可用帖子及旧文章的过期状态；整次重试失败不延长原成功缓存的寿命。完整采集成功后按新结果更新帖子和文章。无服务端凭据或整体异常且无缓存时，保留兼容响应 `{status: "unavailable", posts: []}`，前端将缺少的文章状态视为不可用。

共享 handler 表示源码规则相同。四个 Vercel 函数分别创建 handler，内存缓存仅限各自实例；不能假定跨函数、实例或运行环境共享内存。当前不额外引入数据库或外部缓存服务。

`/api/x-media`、`/api/x-video` 为同源媒体接口。服务端为本站媒体生成签名并校验源地址、类型、有效期和签名；精确旧媒体名单提供缓存兼容。保留原始像素尺寸、视频 Range 和缓存寿命限制。

图片代理的连接超时为 10 秒，每次等待上游数据的空闲超时为 10 秒，总请求时限为 60 秒；持续传输可超过 10 秒，客户端背压不计为空闲读取超时，但仍受总时限和 12 MiB 大小限制。响应结束、失败或取消后释放计时器和断开监听，客户端取消时中止上游请求。

媒体来源策略集中在 `server/media-request-policy.mjs`：现代浏览器只接受 `Sec-Fetch-Site: same-origin` 或直接导航的 `none`，不把兄弟子域的 `same-site` 视作同源。成功响应带 `Vary: Sec-Fetch-Site`，避免同源缓存被跨站请求复用，并保留 `Cross-Origin-Resource-Policy: same-origin`。无 Fetch Metadata 时检查存在的 Origin / Referer 是否与请求 URL 严格同源；没有来源头仍可直接访问，但该类成功响应对浏览器和 Vercel CDN 均为 `no-store`，避免回退规则被缓存跳过，也避免按完整 Referer 分裂缓存。普通浏览器的原缓存期限不变。非浏览器客户端可伪造这些头，因此这不是身份认证、限流或费用上限。

资料和动态接口不接受查询参数；带参数返回不缓存的 400，且不初始化上游服务。JSON 响应带 `nosniff` 与同源资源策略。新生成的媒体项显式使用 `type: "photo"` / `"video"`；旧快照和旧浏览器缓存继续兼容。

生产构建显式关闭 sourcemap，`test:build` 检查公共产物中的环境文件、服务端目录、source map、密钥标记和已提供的服务端环境变量值。CI 在检查步骤使用非真实的凭据哨兵，防止未来误把服务端变量打包给浏览器；这只是回归门禁，不能代替全面的凭据扫描。`node scripts/qa/security-smoke.mjs` 使用本机 Edge 和本地模拟上游验证浏览器缓存、来源拒绝及 Range 传输，不调用真实 X API；可用 `QA_BROWSER=chrome` 切换已安装的浏览器。详细取舍与验收见 [安全加固评估-2026-10-13.md](安全加固评估-2026-10-13.md)。

本地密钥放在 `.env.local`，可参考 `.env.example`；线上密钥配置在 Vercel 服务端环境变量。禁止提交密钥或添加 `VITE_` 前缀。媒体签名优先使用 `X_MEDIA_SIGNING_SECRET`，否则从服务端 X 凭据派生。

## 项目约定

遵循 `AGENTS.md`，保留三语内容、原始素材与既有交互。当前使用 GitHub / Vercel 发布，不使用 Cloudflare；Sites 兼容文件按约定保留。`qa/` 是不提交的本地验证输出；已提交的旧实施记录可从 Git 历史查看。
