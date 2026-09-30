# My little nest

初咏的个人社交名片网站。当前采用蓝白手账风格和彩色按钮，保留原插画、三语与受限 X 代理。

**2026-09-30 本轮发布：** 移除看板娘入口，首页背景固定；保留樱花，动态页增加白色六角飘雪；联系页 X 使用黑底白标。音乐尝试自动播放，默认播放器最大音量，受浏览器自动播放策略限制。装饰图低优先级、附加效果延后、弱网下省略额外正文装饰字体。生产构建与测试通过；国内真机速度尚未量化。历史重构验收见 [实施记录](二次元视觉重构实施与验收_2026-09-30.md)。

**2026-09-30 整体重构已上线：** 统一请求与缓存节奏、媒体尺寸占位、场景预载、三页视觉规则、动态历史阅读及首页/联系布局。代码提交 [`bf01039`](https://github.com/fyh2026/my-little-nest/commit/bf01039333a59aa92cedf558806584ef0313d8e3) 的 [Vercel 生产部署](https://vercel.com/fyh2026s-projects/my-little-nest/BhWre6c7bZKUw7Qc5mCKiZFyD4CC) 状态为 success。82 项测试与生产构建通过；正式站三页、资源、场景预载和缓存响应头已核实，动态与置顶均为 ok。实施范围、证据及待测项见 [本轮重构记录](重构实施与验收记录_2026-09-30.md)。下方记录为此前发布历史。

**2026-09-30 较早发布：** 组件与样式已按职责拆分，动态页和联系页按路由加载；未使用的原图移至 `archive/assets-raw/` 保留。代码提交 [`81ea292`](https://github.com/fyh2026/my-little-nest/commit/81ea2926943badef8015d26a3fa69b670c4de1f4) 的 [Vercel 部署](https://vercel.com/fyh2026s-projects/my-little-nest/C1DtYZoxc1Jojt3aKVmZeMHAUxAv) 已成功，正式站三页与新 JS/CSS 均返回 HTTP 200；详情见[网站设计进度交接.md](网站设计进度交接.md)。

**2026-09-28 已上线：** 首页/内页、手机布局和同源场景资源优化由提交 [`8de1dad`](https://github.com/fyh2026/my-little-nest/commit/8de1dad24ed72b5a1fa3270eb2fc4cb0537d65b6) 发布。改动、截图、代理规则及验证边界见 [升级实施与验收记录_2026-09-28.md](升级实施与验收记录_2026-09-28.md)。实际项目目录为 `D:\chatGPT\design\my-little-nest`；旧资料里的 `hello-nice-site` 路径已过时。

## 本地预览

```powershell
npm install
npm run dev:proxy -- --host 127.0.0.1 --port 4173 --strictPort
```

打开 `http://127.0.0.1:4173/`。网站目前提供中文、日文、英文切换和可点击的联系方式。微信与 QQ 按钮会复制账号；三个邮箱可通过 `mailto:` 打开邮件应用。

**历史生产记录（2026-09-27）：** 手机直连切页与资源加载优化提交 [`e65c31c`](https://github.com/fyh2026/my-little-nest/commit/e65c31c) 已部署至[正式站](https://loveyong07.top/)。站内三页使用客户端切换；四个 X API 函数固定到香港区；图片代理启用 1 天浏览器/CDN 缓存，并可后台更新 7 天。已知长度的图片边收边传，仍保留 12 MB 限制；没有长度信息时继续先校验完整图片。部署 [`tXHYrBbRjLaRtr5pPJ9xuQFAUUrx`](https://vercel.com/fyh2026s-projects/my-little-nest/tXHYrBbRjLaRtr5pPJ9xuQFAUUrx) 状态为 success。生产动态接口返回 `status: ok`、置顶 `ok`、23 条动态；图片接口连续直连请求从 `MISS` 转为 `HIT`。详细记录见[网站设计进度交接.md](网站设计进度交接.md)。

**当前代码：** 动态卡片支持帖内图片切换、完整原创帖轮播、图片和视频放大预览，以及 X MP4 视频同源代理播放。文档中更早的 6 条帖子记录仅作历史参考。

## 域名与上线状态

- **GitHub 仓库：** [fyh2026/my-little-nest](https://github.com/fyh2026/my-little-nest)，私有仓库，生产分支 `master`。`.env.local` 不在仓库中。
- **Vercel 生产部署：** [打开正式站点](https://loveyong07.top)。代码提交 `bf01039` 对应的[部署](https://vercel.com/fyh2026s-projects/my-little-nest/BhWre6c7bZKUw7Qc5mCKiZFyD4CC)状态为 `success`；首页、`/posts`、`/contact` 及内页尾斜杠路径均返回 HTTP 200，入口 JS/CSS 与本地构建完全一致。`.vercel.app` 地址受 Vercel 登录保护。
- **GitHub 自动部署：** Vercel 项目连接私有仓库 `fyh2026/my-little-nest` 的 `master` 分支。带构建哈希的 JS/CSS/字体使用一年 immutable 缓存；已验证新 JS/CSS 响应头。固定名场景图仍为 `public, max-age=86400, stale-while-revalidate=604800`。图片代理函数保留香港区，历史连续请求曾验证 `MISS` 后 `HIT`。
- **根域名与 SSL：** `https://loveyong07.top` 正常访问；此前已核实 Vercel DNS 与证书配置。本轮没有修改 DNS。
- **`www` 子域名：已完成。** 已添加到 `my-little-nest`，Vercel 状态为 `configured-correctly`、`verified: true`，并设置 HTTP 308 永久跳转到 `https://loveyong07.top`。公网请求 `https://www.loveyong07.top/` 返回 308；`/posts?from=www` 保留路径和查询参数跳转，最终目标返回 HTTP 200，HTTPS/TLS 成功。没有修改 DNS。
- **线上 X 动态：** 2026-09-30 发布后对 `https://loveyong07.top/api/x-posts` 请求一次，返回 `status: ok`、`pinnedStatus: ok`、27 条动态；未复制帖子正文或令牌。`X_BEARER_TOKEN` 仅保存在 Vercel Production 服务端环境变量中。
- **兼容文件：** Cloudflare Workers 配置已撤回，项目不使用 Cloudflare 部署。`.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs` 和 Sites 测试文件仍按项目兼容约定保留。

## X 置顶帖与日常原创帖同步

本地页面在没有 X API 凭据时显示一条标明日期的公开帖子快照，**不是实时同步**。本站读取公开帖子需要的是 **App-Only Authentication → Bearer Token**，不是 OAuth 1.0 的 Consumer Key（API Key）。在 [X Developer Console](https://console.x.com/) 打开 Apps → 对应应用 → Keys & Tokens，生成 Bearer Token 并自行安全保存。X 官方的[开通说明](https://docs.x.com/x-api/getting-started/getting-access)列出了创建应用和获取令牌的步骤。

当前机器的 `.env.local` 已配置 `X_BEARER_TOKEN`；在新环境若文件不存在，可从 `.env.example` 复制。令牌不要加 `VITE_` 前缀，也不要粘贴到聊天或提交到仓库。重启本地开发服务器后，打开 `/posts`，或在 PowerShell 只查看接口状态和条数：

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
notepad .env.local
npm run dev:proxy -- --host 127.0.0.1 --port 4173 --strictPort
(Invoke-RestMethod http://127.0.0.1:4173/api/x-posts) | Select-Object status, pinnedStatus, @{Name='dailyCount';Expression={$_.posts.Count}}, @{Name='hasPinnedPost';Expression={$null -ne $_.pinnedPost}}
```

若端口 4173 已有开发服务器，先在原终端停止并重启，让它读入新令牌。本机访问 X API 需要使用现有代理，所以上述命令使用 Node 24 的 `--use-env-proxy`；没有代理需求的环境仍可用 `npm run dev`。`status: ok` 且日常帖子条数大于 0 说明已取得原创帖；`pinnedStatus: ok` 且 `hasPinnedPost: True` 说明已取得当前置顶帖。`unavailable` 表示还需检查令牌、接口权限、余额或网络。不要把接口返回的完整帖子或令牌发到聊天中。

接口 `/api/x-posts` 从 [X 官方用户查询](https://docs.x.com/x-api/users/get-user-by-username)读取 @loveyong07 的当前置顶帖 ID，再读取该帖的媒体。动态页将它固定在上方的独立卡片；下方按同步到的原创帖数量轮播，且不会重复展示置顶帖。置顶被更换或取消后，下一次成功同步会更新上方卡片；取不到置顶时显示明确的状态，不会把日期快照冒充置顶。日常帖从[用户时间线](https://docs.x.com/x-api/users/get-posts)读取，排除回复、转发和引用帖；每页最多 100 条，逐页读取至结束，X 官方时间线最多提供最近 3,200 条帖子。服务端缓存与用户资料缓存均为 15 分钟，后续请求使用 `since_id` 增量读取新帖，每 24 小时完整核对一次以移除已删除的帖子；前端每 15 分钟请求一次，页面重新变为可见时也会检查。因此这是自动同步，不是秒级更新。暂时断线时显示上次成功同步的内容；日常帖首次失败仍回退到标明日期的公开快照。2026-09-27 线上验证 `api/x-posts` 可返回包含媒体的动态；香港函数区部署后，图片接口返回 200。

同一帖子 API 请求还读取 `attachments.media_keys` 和媒体扩展，将照片、视频与对应帖子关联。置顶和日常卡片的图片区域都有左右切换按钮：多图帖子按附件顺序切换，单图帖子也显示按钮但按下后仍是同一张。访客浏览器通过本站 `/api/x-media` 加载 X 照片、头像和视频预览图；该接口仅接收 HTTPS 地址，仅允许 `pbs.twimg.com`、`video.twimg.com` 和 `abs.twimg.com` 三个主机，并继续只返回受支持的图片类型，不使用 X Bearer Token。已知长度的图片边收边传，并对传输及完整图片都保留 12 MB 限制；上游未提供长度时会先完整校验再返回。图片响应使用浏览器 1 天缓存、Vercel CDN 1 天缓存并后台更新 7 天。X 的 MP4 视频通过同源 `/api/x-video` 加载；该路由只允许 `video.twimg.com` 的视频路径，透传单段 HTTP `Range` 请求并流式返回视频数据，供浏览器缓冲和拖动进度；视频仍使用浏览器 30 分钟、共享 CDN 12 小时缓存，不会永久保存到项目。图片或视频代理失败时显示本地错误提示；头像失败时回退到项目图片。X 的视频按最高可用 MP4 码率播放；无 MP4 变体的视频和 GIF 暂不展示。日期快照继续使用明确标记的**网站装饰插画**，不冒充帖子配图。[X 媒体字段说明](https://docs.x.com/x-api/fundamentals/data-dictionary)。

当帖子配图已经展示时，接口根据 X 返回的 `entities.urls` 只隐藏指向**本帖照片**的 `t.co` 短链；普通网页链接保留。2026-09-26 实测六条帖子中原有四条图片短链已从卡片正文消失，照片仍显示。

**浏览网页本身不直接向 X 计费。** 访问 `/posts` 会请求网站自己的 `/api/x-posts`；只有服务端实际向 X API 取回资源时，才可能计入 X API 用量。X 当前实行按读取资源计费，普通帖子和用户资料有不同单价，同一资源在 UTC 日内通常去重但不是绝对保证。启用前请在[官方计费说明](https://docs.x.com/x-api/getting-started/pricing)和 Developer Console 核对现价、余额与消费上限；余额为零时，令牌生成后也可能无法取回帖子。不要开启自动充值，除非你明确希望这样做。

本地 Vite 开发服务器、Vite 构建预览和 Sites Worker 都提供 `/api/x-posts`、`/api/x-media` 与 `/api/x-video`；Vercel 分别使用 `api/x-posts.js`、`api/x-profile.js`、`api/x-media.js` 和 `api/x-video.js` 提供接口，并在 `vercel.json` 中统一指定香港 `hkg1` 函数区。Vercel Production 的 `X_BEARER_TOKEN` 已作为仅服务端可见的环境变量配置，令牌不会进入 GitHub 或前端构建文件。函数内存缓存只在各运行实例有效，不是全站统一缓存；公开访问量增加时需重新评估 API 用量。

主页头像、X 显示名和用户名从 `/api/x-profile` 获取。服务端以账号的稳定用户 ID 查询，因此修改 X 用户名后仍能找到同一账号；资料缓存 15 分钟，网页每 15 分钟及重新可见时检查更新。X 接口不可用时，主页保留当前页面上次成功读取的资料；首次读取失败时使用项目内的头像和“初咏 / @loveyong07”作为后备。Vite、Sites Worker 和 Vercel 均提供这个接口。

## 后续修改

- 三语文案：`src/constants/locales.js`；语言保存与页面语言设置：`src/hooks/useI18n.js`。
- 首页、动态、联系页：`src/components/HeroSection.jsx`、`src/pages/PostsPage.jsx`、`src/pages/ContactPage.jsx`。动态和联系页由 `src/App.jsx` 按路由懒加载。
- 联系方式：`src/pages/ContactPage.jsx` 中的 `socials` 与 `src/constants/site.js` 中的 `mailboxes`。
- 默认帖子快照：`src/constants/site.js` 中的 `SNAPSHOT`；动态获取与缓存：`src/hooks/useXFeed.js`。
- 三条站内路由与背景预加载：`src/hooks/useSiteRoute.js`、`src/routes/site-route.js`。
- 布局和颜色：`src/styles.css` 按原级联顺序引入 `src/styles/` 下的场景与组件样式。
- 当前页面插画：`public/assets/`；未使用的原图：`archive/assets-raw/`，不进入生产构建产物。

页面保留帖子正文内容，只隐藏已展示照片对应的 X 短链；海边图片标为网站装饰插画，与帖子的媒体内容区分。
