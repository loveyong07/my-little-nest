# Welcome to my little nest！

初咏的本地个人社交名片。视觉以项目根目录的 `design-reference.png` 为准；页面使用独立生成的蓝天主视觉和海边插画。

## 本地预览

```powershell
npm install
npm run dev:proxy -- --host 127.0.0.1 --port 4173 --strictPort
```

打开 `http://127.0.0.1:4173/`。网站目前提供中文、日文、英文切换和可点击的联系方式。微信与 QQ 按钮会复制账号；三个邮箱可通过 `mailto:` 打开邮件应用。

**当前交接状态（2026-09-26）：** 本机 `/posts` 已真实同步 6 条 X 原创帖及其照片，并隐藏已展示照片对应的短链；尚未公开部署。最新完成/未完成清单见项目父目录的 `网站设计进度交接.md`。

## X 原创帖同步

本地页面在没有 X API 凭据时显示一条标明日期的公开帖子快照，**不是实时同步**。本站读取公开帖子需要的是 **App-Only Authentication → Bearer Token**，不是 OAuth 1.0 的 Consumer Key（API Key）。在 [X Developer Console](https://console.x.com/) 打开 Apps → 对应应用 → Keys & Tokens，生成 Bearer Token 并自行安全保存。X 官方的[开通说明](https://docs.x.com/x-api/getting-started/getting-access)列出了创建应用和获取令牌的步骤。

当前机器的 `.env.local` 已配置 `X_BEARER_TOKEN`；在新环境若文件不存在，可从 `.env.example` 复制。令牌不要加 `VITE_` 前缀，也不要粘贴到聊天或提交到仓库。重启本地开发服务器后，打开 `/posts`，或在 PowerShell 只查看接口状态和条数：

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
notepad .env.local
npm run dev:proxy -- --host 127.0.0.1 --port 4173 --strictPort
(Invoke-RestMethod http://127.0.0.1:4173/api/x-posts) | Select-Object status, @{Name='count';Expression={$_.posts.Count}}
```

若端口 4173 已有开发服务器，先在原终端停止并重启，让它读入新令牌。本机访问 X API 需要使用现有代理，所以上述命令使用 Node 24 的 `--use-env-proxy`；没有代理需求的环境仍可用 `npm run dev`。`status: ok` 且条数大于 0 才说明这台机器已经取得原创帖；`unavailable` 表示还需检查令牌、接口权限、余额或网络。不要把接口返回的完整帖子或令牌发到聊天中。

接口 `/api/x-posts` 从 [X 官方 API](https://docs.x.com/x-api/users/get-posts) 读取 @loveyong07 的帖子，排除回复、转发和引用帖；最多按需读取两页、每页 10 条，显示最多 6 条原创帖。服务端缓存 15 分钟，后续请求使用 `since_id` 只找新帖，并把用户资料缓存 24 小时。前端每 15 分钟请求一次，在页面重新变为可见时也会检查。暂时断线时保留本次进程上次成功同步的帖子并标为“显示上次同步”；首次失败则展示日期快照。2026-09-26 已用本机令牌实测：`/api/x-posts` 返回 `status: ok` 和 6 条原创帖，浏览器动态页显示“X 原创帖 · 自动同步”。

同一帖子 API 请求还读取 `attachments.media_keys` 和媒体扩展，将照片与对应帖子关联。页面直接加载 X 图片 CDN 的 HTTPS 地址，不将图片文件永久保存到项目；无照片的帖子只显示文字，视频与 GIF 暂不展示封面。2026-09-26 实测六条帖子各带一张照片，浏览器已确认图片加载。日期快照继续使用明确标记的**网站装饰插画**，不冒充帖子配图。[X 媒体字段说明](https://docs.x.com/x-api/fundamentals/data-dictionary)。

当帖子配图已经展示时，接口根据 X 返回的 `entities.urls` 只隐藏指向**本帖照片**的 `t.co` 短链；普通网页链接保留。2026-09-26 实测六条帖子中原有四条图片短链已从卡片正文消失，照片仍显示。

**浏览网页本身不直接向 X 计费。** 访问 `/posts` 会请求网站自己的 `/api/x-posts`；只有服务端实际向 X API 取回资源时，才可能计入 X API 用量。X 当前实行按读取资源计费，普通帖子和用户资料有不同单价，同一资源在 UTC 日内通常去重但不是绝对保证。启用前请在[官方计费说明](https://docs.x.com/x-api/getting-started/pricing)和 Developer Console 核对现价、余额与消费上限；余额为零时，令牌生成后也可能无法取回帖子。不要开启自动充值，除非你明确希望这样做。

本地 Vite 开发服务器、Vite 构建预览和项目自带的 Sites Worker 都提供 `/api/x-posts`；公开部署时必须在托管环境中另外设置仅服务端可见的 `X_BEARER_TOKEN`，再验证实际接口。项目不会把令牌打进前端文件。当前未公开部署，也未在 Sites 环境验证此绑定。Worker 的内存缓存只在各自运行实例内有效，不是全站统一缓存；公开访问量增加时需重新评估 API 用量。

## 后续修改

- 个人简介和三语文案：`src/App.jsx` 中的 `copy`。
- 联系方式：`src/App.jsx` 中的 `socials` 和 `mailboxes`。
- 默认帖子快照：`src/App.jsx` 中的 `SNAPSHOT`。
- 布局和颜色：`src/styles.css`。
- 页面插画：`public/assets/`。

页面保留帖子正文内容，只隐藏已展示照片对应的 X 短链；海边图片标为网站装饰插画，与帖子的媒体内容区分。
