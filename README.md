# My little nest

初咏的个人社交名片网站。视觉以项目根目录的 `design-reference.png` 为准；页面使用独立生成的蓝天主视觉和海边插画。

## 本地预览

```powershell
npm install
npm run dev:proxy -- --host 127.0.0.1 --port 4173 --strictPort
```

打开 `http://127.0.0.1:4173/`。网站目前提供中文、日文、英文切换和可点击的联系方式。微信与 QQ 按钮会复制账号；三个邮箱可通过 `mailto:` 打开邮件应用。

**当前交接状态（2026-09-26）：** Vercel 根域名首页、`/posts`、`/contact` 当前均可通过 HTTPS 访问；线上 X 接口本轮实测 HTTP 200、`status: ok`、6 条。Vercel 已连接 GitHub 私有仓库 `fyh2026/my-little-nest` 的 `master` 分支；2026-09-26 自动部署实测通过：提交 `3e9bd1d` 推送后，GitHub 上 Vercel 状态变为 success，并生成生产部署 `CRNHUn4kSuk1RKrkykebDoB2oLtX`。`www.loveyong07.top` 已绑定到项目并设置 308 永久跳转到根域名；HTTPS/TLS 与 `/posts` 路径跳转复核通过。没有修改 DNS。详情见仓库内的 [网站设计进度交接.md](网站设计进度交接.md)。

**当前代码：** 动态卡片增加帖内图片切换，日常帖取消六条限制，并已在本地加入 X MP4 视频同源代理和播放器；视频改动尚未部署。上方线上部署与 6 条帖子是更早版本的记录。

## 域名与上线状态

- **GitHub 仓库：** [fyh2026/my-little-nest](https://github.com/fyh2026/my-little-nest)，私有仓库，生产分支 `master`。`.env.local` 不在仓库中。
- **Vercel 生产部署：** [打开正式站点](https://loveyong07.top) · [本轮自动部署详情](https://vercel.com/fyh2026s-projects/my-little-nest/CRNHUn4kSuk1RKrkykebDoB2oLtX)。本轮生产部署完成；首页、`/posts`、`/contact` 均返回 200。`.vercel.app` 地址受 Vercel 登录保护。
- **GitHub 自动部署：** Vercel 项目已连接私有仓库 `fyh2026/my-little-nest`，生产分支为 `master`。已实测通过：提交 `3e9bd1d` 推送至 `master` 后自动生成 [Vercel 生产部署](https://vercel.com/fyh2026s-projects/my-little-nest/CRNHUn4kSuk1RKrkykebDoB2oLtX)，GitHub Vercel check 为 success（Deployment has completed）。部署后正式站三条路由均为 HTTP 200。
- **根域名与 SSL：** `https://loveyong07.top` 正常访问；此前已核实 Vercel DNS 与证书配置。本轮没有修改 DNS。
- **`www` 子域名：已完成。** 已添加到 `my-little-nest`，Vercel 状态为 `configured-correctly`、`verified: true`，并设置 HTTP 308 永久跳转到 `https://loveyong07.top`。公网请求 `https://www.loveyong07.top/` 返回 308；`/posts?from=www` 保留路径和查询参数跳转，最终目标返回 HTTP 200，HTTPS/TLS 成功。没有修改 DNS。
- **线上 X 动态：** 2026-09-26 本轮对 `https://loveyong07.top/api/x-posts` 仅请求一次，HTTP 200，返回 `status: ok` 和 6 条帖子；未复制帖子正文或令牌。`X_BEARER_TOKEN` 仅保存在 Vercel Production 服务端环境变量中。
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

接口 `/api/x-posts` 从 [X 官方用户查询](https://docs.x.com/x-api/users/get-user-by-username)读取 @loveyong07 的当前置顶帖 ID，再读取该帖的图文。动态页将它固定在上方的独立卡片；下方按同步到的原创帖数量轮播，且不会重复展示置顶帖。置顶被更换或取消后，下一次成功同步会更新上方卡片；取不到置顶时显示明确的状态，不会把日期快照冒充置顶。日常帖从[用户时间线](https://docs.x.com/x-api/users/get-posts)读取，排除回复、转发和引用帖；每页最多 100 条，逐页读取至结束，X 官方时间线最多提供最近 3,200 条帖子。服务端缓存与用户资料缓存均为 15 分钟，后续请求使用 `since_id` 增量读取新帖，每 24 小时完整核对一次以移除已删除的帖子；前端每 15 分钟请求一次，页面重新变为可见时也会检查。因此这是自动同步，不是秒级更新。暂时断线时显示上次成功同步的内容；日常帖首次失败仍回退到标明日期的公开快照。2026-09-26 本地新代码实测：`status: ok`、`pinnedStatus: ok`、22 条日常帖，置顶未重复出现。一次完整读取若涉及大量历史帖，会增加 X API 读取量和首次加载时间。

同一帖子 API 请求还读取 `attachments.media_keys` 和媒体扩展，将照片、视频与对应帖子关联。置顶和日常卡片的图片区域都有左右切换按钮：多图帖子按附件顺序切换，单图帖子也显示按钮但按下后仍是同一张。访客浏览器通过本站 `/api/x-media` 加载 X 照片、头像和视频预览图；服务端只允许 `pbs.twimg.com` 的 `/media/`、`/profile_images/` 与 `/ext_tw_video_thumb/` 路径，不接受任意网址，也不使用 X Bearer Token。X 的 MP4 视频通过同源 `/api/x-video` 加载；该路由只允许 `video.twimg.com` 的视频路径，透传单段 HTTP `Range` 请求并流式返回视频数据，供浏览器缓冲和拖动进度。图片与视频均使用浏览器 30 分钟、共享 CDN 12 小时缓存，不会永久保存到项目。图片或视频代理失败时显示本地错误提示；头像失败时回退到项目图片。X 的视频按最高可用 MP4 码率播放；无 MP4 变体的视频和 GIF 暂不展示。日期快照继续使用明确标记的**网站装饰插画**，不冒充帖子配图。[X 媒体字段说明](https://docs.x.com/x-api/fundamentals/data-dictionary)。

当帖子配图已经展示时，接口根据 X 返回的 `entities.urls` 只隐藏指向**本帖照片**的 `t.co` 短链；普通网页链接保留。2026-09-26 实测六条帖子中原有四条图片短链已从卡片正文消失，照片仍显示。

**浏览网页本身不直接向 X 计费。** 访问 `/posts` 会请求网站自己的 `/api/x-posts`；只有服务端实际向 X API 取回资源时，才可能计入 X API 用量。X 当前实行按读取资源计费，普通帖子和用户资料有不同单价，同一资源在 UTC 日内通常去重但不是绝对保证。启用前请在[官方计费说明](https://docs.x.com/x-api/getting-started/pricing)和 Developer Console 核对现价、余额与消费上限；余额为零时，令牌生成后也可能无法取回帖子。不要开启自动充值，除非你明确希望这样做。

本地 Vite 开发服务器、Vite 构建预览和 Sites Worker 都提供 `/api/x-posts`、`/api/x-media` 与 `/api/x-video`；Vercel 分别使用 `api/x-posts.js`、`api/x-profile.js`、`api/x-media.js` 和 `api/x-video.js` 提供接口。Vercel Production 的 `X_BEARER_TOKEN` 已作为仅服务端可见的环境变量配置；上方 6 条帖子是旧版线上验证记录，令牌不会进入 GitHub 或前端构建文件。函数内存缓存只在各运行实例有效，不是全站统一缓存；公开访问量增加时需重新评估 API 用量。

主页头像、X 显示名和用户名从 `/api/x-profile` 获取。服务端以账号的稳定用户 ID 查询，因此修改 X 用户名后仍能找到同一账号；资料缓存 15 分钟，网页每 15 分钟及重新可见时检查更新。X 接口不可用时，主页保留当前页面上次成功读取的资料；首次读取失败时使用项目内的头像和“初咏 / @loveyong07”作为后备。Vite、Sites Worker 和 Vercel 均提供这个接口。

## 后续修改

- 个人简介和三语文案：`src/App.jsx` 中的 `copy`。
- 联系方式：`src/App.jsx` 中的 `socials` 和 `mailboxes`。
- 默认帖子快照：`src/App.jsx` 中的 `SNAPSHOT`。
- 布局和颜色：`src/styles.css`。
- 页面插画：`public/assets/`。

页面保留帖子正文内容，只隐藏已展示照片对应的 X 短链；海边图片标为网站装饰插画，与帖子的媒体内容区分。
