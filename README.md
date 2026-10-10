# 初咏的小窝

React / Vite 个人网站，提供首页、动态、联系三个页面，支持中文、日文、英文。联系页唯一邮箱为 `fyh20071004@gmail.com`。

2026-10-11：商务页及其入口已移除，联系页已精简为上述唯一邮箱。自定义右键菜单已移除，补充了分享预览（OG）标签。本轮修改保留在本地，尚未发布。

## 仓库与发布

- GitHub：[loveyong07/my-little-nest](https://github.com/loveyong07/my-little-nest)，私有仓库，生产分支 `master`。
- 正式站：[loveyong07.top](https://loveyong07.top)。
- Vercel：[my-little-nest](https://vercel.com/fyh2026s-projects/my-little-nest)，推送 `master` 后自动构建并部署。
- 2026-10-09 已通过提交 `7579e82` 实测改名后的自动部署成功，Vercel 仓库绑定已更新为 `loveyong07`。
- Vercel 空间地址仍为 `fyh2026s-projects`，属于有效地址。

## 本地开发与检查

```powershell
npm install
npm run dev:proxy -- --host 127.0.0.1 --port 4173 --strictPort
```

打开 http://127.0.0.1:4173/。本机访问 X 使用现有网络代理；无需代理的环境可使用 `npm run dev`。

```powershell
npm test
npm run build
npm run test:sites
git diff --check
```

页面构建产物位于 `dist/client`，Sites 兼容产物位于 `dist/server` 和 `dist/.openai`。

## 维护入口

- `src/constants/locales.js`：三语通用文案；`src/constants/site.js`：站点与联系方式配置。
- `src/components/HeroSection.jsx`：首页；`src/pages/PostsPage.jsx`：动态页；`src/pages/ContactPage.jsx`：联系页。
- `src/hooks/`、`src/routes/`：动态、资料、语言和站内导航。
- `src/styles.css`、`src/styles/`：样式；`server/`、`api/`：X 服务与 Vercel 接口。
- `build/scene-preloads.mjs`：场景预载插件；`build/` 是源码目录。
- `public/assets/`：在线资源；`archive/`、`design-reference.png`：保留的原始素材及设计参考。
- `public/assets/audio/SOURCES.md`：音乐来源与使用说明。
- `AGENTS.md`：项目约定；`网站设计进度交接.md`：当前维护交接。

## X 动态、媒体与密钥

`/api/x-profile` 通过稳定用户 ID 查询账号资料；`/api/x-posts` 获取置顶和日常原创帖。前端定期刷新，接口失败时使用已有缓存或明确标注的快照，不代表秒级同步。

`/api/x-media`、`/api/x-video` 为同源媒体接口。服务端为本站媒体生成签名并校验源地址、类型、有效期和签名；精确旧媒体名单提供缓存兼容。保留原图画质、视频 Range 和缓存寿命限制。

本地密钥放在 `.env.local`，可参考 `.env.example`；线上密钥配置在 Vercel 服务端环境变量。禁止提交密钥或添加 `VITE_` 前缀。媒体签名优先使用 `X_MEDIA_SIGNING_SECRET`，否则从服务端 X 凭据派生。

## 项目约定

遵循 `AGENTS.md`，保留三语内容、原始素材与既有交互。当前使用 GitHub / Vercel 发布，不使用 Cloudflare；Sites 兼容文件按约定保留。旧实施记录与 QA 过程文件已清理，已提交的历史可从 Git 历史查看。
