# 初咏的小窝

React / Vite 个人网站，包含首页、动态、联系三个页面，支持中文、日文和英文。

动态页完整展示每个视频和 GIF 附件，各自独立重试、放大和恢复播放状态；GIF 自动播放遵循系统减少动画偏好。动态刷新采用前后端统一时限，慢请求及故障时的缓存策略见维护说明。

动态页的置顶、原创、转帖与 X 文章支持按访客系统语言翻译，并可切回原文。使用当前浏览器开放的内置翻译能力，无需 API 密钥；首次点击时可能下载语言包。未开放翻译接口的浏览器会提示使用浏览器菜单翻译。

## 本地运行

使用 Node.js 24（与 CI 一致），安装依赖后启动：

```powershell
npm ci
npm run dev:proxy -- --host 127.0.0.1 --port 4173 --strictPort
```

打开 [本地预览](http://127.0.0.1:4173/)。无需系统网络代理时，可用 `npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`。

需要实时 X 数据时，参考 `.env.example` 配置本地 `.env.local`；未配置时页面保留快照与不可用提示。密钥仅供服务端使用，不得提交或添加 `VITE_` 前缀。接口、媒体签名和缓存规则见 [维护说明](docs/maintenance.md)。

```powershell
npm run check       # lint、类型、格式、逻辑、构建、产物与 Sites 兼容检查
npm run audit:ci    # 生产与开发依赖安全审计（含本地 picomatch 基线公告检查）
npm run test:browser # 构建后检查日期搜索、缓存提示、视频进度、导航与文章图片
npm run build       # 生成 dist/client、dist/server、dist/.openai
npm run preview     # 预览构建结果
```

CSS 或布局修改还需进行修改前后的固定场景对比，方法见 [样式维护](docs/styles.md)。

浏览器检查默认使用已安装的 Chrome，CI 会安装对应浏览器。接口数据和短 MP4 均在测试内生成或使用本地 fixture，不调用线上 X 接口；原始文章图片位置、链接点击和图片重试也在检查范围内。类型检查覆盖全部 `src/` 页面、组件、hooks 与所列服务端模块。`.nvmrc` 和 package.json 将运行环境约束为 Node 24。

首页与联系页分别生成搜索和分享元数据，站点地图为 `/sitemap.xml`。动态页保留年龄确认并设置 `noindex, follow`，不列入站点地图。

## 部署

- 源码：[loveyong07/my-little-nest](https://github.com/loveyong07/my-little-nest)，生产分支为 `master`。
- 运行 `npm run check` 后，推送 `master` 触发 [Vercel 项目](https://vercel.com/fyh2026s-projects/my-little-nest) 自动部署。正式部署先用服务端凭据验证 Drive 授权，再运行 `npm run build`，输出目录为 `dist/client`，配置见 `vercel.json`。
- 正式站：[loveyong07.top](https://loveyong07.top)。发布结果以对应提交的 Vercel Production 状态为准。
- 正式站从同一个私有 Blob 快照读取 X 动态和资料，由 Vercel Schedules 每小时调用私有同步函数。首次部署前可通过 `node --env-file=.env.local scripts/sync-x-snapshot.mjs` 导入，后续可用项目的 Schedules 页面手动运行 `sync-x-feed`。
- `sync-x-videos` 每小时从已发布快照归档视频和 GIF 的 MP4 到私有 Drive。三项 `GOOGLE_DRIVE_*` 变量使用同一 OAuth 客户端和 `drive.file` 权限，配置为 Production Secrets。播放沿用同源 `/api/x-video`。
- 线上 X、Blob 与 `TOUCHGAL_API_TOKEN` 凭据配置在 Vercel 服务端环境变量；保留 `.openai/`、`worker/` 与 Sites 构建脚本，并与 Vercel 共享 `shared/hosting-policy.mjs` 安全头、路由壳、`/business` 重定向与 `/api/starrygal` 路由以保持双宿主一致。

## 主要文件

| 位置 | 用途 |
| --- | --- |
| `src/App.jsx`、`src/pages/`、`src/components/` | 页面、导航与交互组件 |
| `src/constants/` | 三语文案、联系方式、断点与场景资源配置 |
| `src/styles.css`、`src/styles/` | 按顺序加载的基础、玻璃和响应式样式 |
| `api/`、`server/`、`shared/` | Vercel 函数、X 数据与媒体服务、共享契约 |
| `public/assets/` | 实际发布的图片与字体 |
| `tests/`、`scripts/qa/` | 自动检查与固定场景采集器 |
| `archive/` | 原始素材、退役资源与设计参考，不发布到站点 |
| `docs/` | [接口维护](docs/maintenance.md)、[样式说明](docs/styles.md)、[历史记录](docs/history/README.md) |
| `AGENTS.md` | 当前有效的内容、设计和维护约定 |

`qa/` 与 `.vercel/` 为忽略提交的本地产物目录。
