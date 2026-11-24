# X 接口、媒体与密钥维护

置顶、原创和转帖保留每个视频附件。X 的 `animated_gif` 使用 API 给出的 MP4 variant，归一化为 `type: "video", animated: true`，保留原始封面、尺寸与同源签名，不重新编码；`tweet_video_thumb` 仅加入既有精确主机和签名限制下的封面路径。每个播放器独立处理失败重试、放大预览和播放状态。GIF 默认静音循环，系统减少动画时不自动播放，并在偏好切换时暂停。浏览器 Feed 缓存为 v9，避免继续复用曾丢失 GIF 附件或纯 GIF 帖子的旧缓存。

整次动态刷新（包括分页、置顶、转帖详情和文章结构）共用 24 秒取消预算，并留 1 秒给取消后的部分结果或旧缓存返回；忽略取消的适配器也会触发 25 秒硬性响应保护。单次 X 请求仍为 8 秒，文章结构阶段仍至多 6 秒且受整次预算约束。浏览器 JSON 请求总期限为 27 秒，给签名和传输留余量，Vercel 的动态与资料函数显式配置 `maxDuration: 30`。这些时限集中在 `shared/request-budgets.mjs`，应保持服务端截止早于浏览器、浏览器早于函数上限。成功慢请求可正常交付，超时的可选转帖详情保留可用原创和恢复提示；核心时间线失败仍沿用旧缓存与既有退避，不把超时当作已确认空内容。

置顶、日常帖子、转帖和文章的现有及后续静态配图统一请求 X 的 `name=orig` 原始像素，卡片与放大预览通过同源签名 URL 的 `format=webp` 输出高质量 WebP（quality 90，不缩放）；该输出格式也绑定在签名中，不能随意追加或移除。转换失败或运行环境没有原生编码器时返回原尺寸原图。头像、视频封面、视频和动图不重新编码。文章里的图片位置引用随原图 URL 一同规范化，保留原文图文顺序。

Vercel 的图片函数可连接香港 `hkg1` 私有 Blob，持久保存成功编码的 WebP 和已确定无法转码的原图。编码抛异常时仍返回原图，浏览器、CDN、后台上传和预热脚本均跳过缓存，下一次请求可重新转码。每次先校验本站来源和媒体签名，再读取存储。新写入使用 `x-photos/original-q90-v2/` 下的原图 URL 摘要，继续复用 v1 的 WebP。v1 的原图缺少失败原因，按缓存未命中处理，之后有机会重新转码。读取共用 1.5 秒期限，未命中或存储故障时回源。新图通过 Vercel `waitUntil` 在后台保存。写入报错后若存储确认同键对象已存在，视为已缓存并继续处理下一张图。

首次导入现有图片可运行 `node --env-file=.env.local scripts/warm-photo-cache.mjs`，加 `--limit 3` 只导入三个样本；本地文件需要已经连接存储后的服务端 Blob 凭据。脚本从当前成功同步的公开动态中去重收集配图，保留完整像素与实际格式，不处理头像、封面或视频。它不是持续同步任务；后续新图首次请求仍可能需要回源，随后自动持久缓存。缓存写入前检查用量（每 5 分钟复用盘点结果，若库中已无 `v1` 旧图则跳过 `v1` 双查），触及 800 MB 软预算时优先按上传时间淘汰最旧配图腾出空间（每次至多 16 条），无法回收时再停止新增；实例间并发和盘点快照仍存在偏差，这个预算不能代替 Vercel 的账户用量限制。存储、流量或操作配额不足时保留现有回源回退。同实例对同一张未缓存 `format=webp` 原图的并发请求会合并为一次回源与一次编码，避免突发并发放大内存。

Vercel 正式站的 `/api/x-profile` 与 `/api/x-posts` 从私有 Blob 的 `x-feed/snapshot-v1/current.json` 读取同一份账号资料、置顶、原创、转帖和 X Articles，按响应时间生成媒体签名。响应头 `X-Nest-X-Source: snapshot` 和 `X-Nest-X-Synced-At` 可用于核对。Blob 读取失败时复用同实例最近的快照，或由浏览器使用已有缓存。访客访问、前端刷新和点击重试均只读取已有结果。

每小时由 `sync-x-feed` 调用生产环境的私有 `api/x-sync.js`，使用稳定账号 ID 和快照里的 `since_id` 游标检查新增内容。账号资料和有效置顶最多复用六小时。首次同步及约每 24 小时完整核对，以反映删除和取消转发。成功时原子保存内容、游标和同步时间，重复的计划时间会跳过，Blob ETag 条件写入保护并发更新。同步失败保留上一份完整数据，三小时后标记过期。首次导入可在具备现有 X、Blob 服务端凭据的环境运行 `node --env-file=.env.local scripts/sync-x-snapshot.mjs`。正式环境的 Vercel Schedules 可按需手动运行。Hobby 的计划任务实际会在设定时间后的 15 分钟内分散触发，调度和浏览器缓存都会影响访客看到新帖的时间。

同步函数使用 `server/article-cache.mjs` 持久保存已校验的 Article 段落结构（`blocks`），路径为 `x-articles/document-v1/<id>.json`。文章来自时间线的 `article` / `article_title` 字段，与普通长帖分开。结构缓存保留段落链接的位置和未签名媒体地址。未变化的文章在 24 小时内优先使用已有结构。网页重验失败时保留最后验证的结构。恢复与抓取各限制四个并发任务并共用六秒预算。缺少正文时页面展示预览和 X 原文链接。

`server/telemetry.mjs` 在 Vercel 运行环境（或设置 `NEST_TELEMETRY=1` 时）输出单行 JSON 观测日志，记录 Feed/Profile 刷新计数、上游耗时、Article 文档缓存命中/重验结果以及图片 Blob 命中与跳过原因。注意 `X-Nest-Photo-Cache: hit | miss` 响应头仅代表函数执行当次的 `function_blob` 查询结果；响应被 Vercel CDN 缓存后该头会被边缘复用，因此不能直接等同于所有访客请求的实时 Blob 命中率，统计时需区分 CDN 与 Blob 两层。

动态页在日常帖子和文章之间显示「我的转帖」。同一次时间线请求保留转帖，展开 `referenced_tweets.id` 与原作者，只有 `retweeted` 引用进入 `reposts`。日常动态另收录经 X 账号 ID 验证的自引帖，内嵌原帖的作者、日期、正文、媒体和原帖链接。引用的媒体优先使用完整时间线数据，必要时与转帖合并查询详情，并沿用同源媒体签名。引用或回复他人帖子的内容从日常与置顶区域过滤。时间线展开数据可能缺少原帖附件，因此对转帖的原帖 ID 去重后，通过批量详情接口读取完整的 `attachments.media_keys` 与媒体数据；故障时保留既有已核实的配图。原作者、完整正文、图片、视频和原文链接沿用同源签名媒体链路；转发时间用于排序和独立日期索引。`repostsStatus` 区分成功、空、过期和不可用，缺失原帖或原作者时不猜测内容；部分失败按 60 秒退避重扫时间线，定期完整核对会移除取消的转发。前端选择、上一条／下一条和后台保留独立于原创帖、文章，目录与搜索同步支持转帖。浏览器 Feed 缓存使用 v9，旧缓存及缺少转帖状态的内容会重新同步；成功原创时间线不会延长过期转帖缓存。构建后可运行 `node scripts/qa/reposts.mjs` 检查三语、响应式布局、按钮链接、独立阅读、玻璃材质、图片预览和搜索。

帖子卡片的「分享」使用当前站点域名和 `/posts?post=<X 帖子 ID>` 或 `/posts?repost=<转发 ID>`。访问链接并完成年龄确认后，动态页自动定位到对应卡片。支持系统分享的浏览器打开分享面板，其余浏览器提供复制链接。

动态页的置顶帖、原创帖、转帖和文章正文统一识别 HTTP(S)、www 和 Markdown 链接，使用可通过键盘访问的真实链接并加下划线。动态接口展开 X 短链时保留精确起止范围，正文按解码后的位置渲染。旧缓存和没有实体信息的裸链接按文本边界识别。文章仍保留作者提供的命名链接与各段落的具体目标。

这些内容的文字还支持卡片内翻译。`src/utils/translation.js` 直接调用访客当前浏览器提供的 `LanguageDetector` / `Translator`，不上传到本站或外部翻译服务，也不需要密钥。目标按 `navigator.languages` 的首选语言确定，保留简繁中文区别，与站点界面语言独立；浏览器报告语言变化时更新。浏览器未开放接口、语言组合不可用、识别失败或下载失败时保留原文并显示提示。浏览器菜单翻译是接口缺失时的手动后备。

仅点击翻译后准备本地模型和语言包，显示下载进度并允许取消；如果首次模型下载耗尽用户激活，保留已识别语言，提示再点“继续翻译”。两分钟无结果会中止并允许重试。切换内容、系统语言或离开组件会取消旧任务，迟到结果不覆盖新内容。成功译文按原文和目标语言缓存于当前标签页，最多 24 项且总量不超过 20 万字符；不写入 localStorage。文章标题、正文分段翻译，`#话题标签` 和全角 `＃话题标签` 保留原文，不传入识别或翻译模型；原有图片、分隔线、链接名称和目标保持原位，模型输出只作为 React 文本渲染。

动态页在转帖下方显示「随心分享 · X 文章」。文章的日期时间线、月份选择和上一篇／下一篇独立于帖子，后台刷新保留用户手动选择的文章。只有成功确认无文章才显示「X当前没有文章」；同步失败显示不可用状态，已有文章保留并标注过期。旧版缓存缺少文章字段时重新同步，不据此推断文章为空。

资料和动态响应对浏览器使用 `Cache-Control: no-store`，但浏览器应用层仍有内存和 localStorage 缓存。保留当前偏向复用、减少重复查询的策略：Vercel CDN 对完整成功响应使用 `s-maxage=300, stale-while-revalidate=600`；整体过期/不可用，或置顶过期/不可用/状态缺失及异常时使用 `s-maxage=60`。动态只有整体 `ok`、置顶、转帖和文章均为 `ok` / `none` 才算完整成功，`none` 表示已确认该部分为空；资料只判断自身状态。异常响应也用短缓存。

前端完整成功数据的刷新窗口为 15 分钟，页面可见时每分钟检查，失败沿用 30 秒退避。本地 Vite 开发服务使用请求触发的 15 分钟进程缓存，置顶、文章和转帖失败按原服务退避。Vercel 则由下一个后台运行恢复。缺少服务器快照时动态接口返回 `{status: "unavailable", posts: []}`，前端使用现有缓存或保留不可用提示。

共享 handler（`server/api-handler.mjs`）统一处理 API 路由。Vercel 侧由 `api/` 下的函数分别托管，并由 `vercel.json` 显式配置各函数 `maxDuration`、流式响应、安全响应头（与 `shared/hosting-policy.mjs` 保持同步）、`/route-shells/*.html` 路由壳（保证 `/posts` 的 `noindex, follow`）以及 `/business` 308 跳转。动态与资料接口统一输出 `X-Robots-Tag: noindex, nofollow`，`public/robots.txt` 禁止抓取 `/api/`。X API 明确返回的永久对象级错误（原帖已删或作者设私）会跳过该条转帖而不污染 `repostsStatus`；收到 `429` 时遵循 `retry-after` / `x-rate-limit-reset` 退避（60 秒至 15 分钟）。

`/api/x-media`、`/api/x-video` 为同源媒体接口。服务端校验规范形式的签名源地址、类型、有效期和签名（支持通过 `X_MEDIA_SIGNING_SECRET_PREVIOUS` 实现双密钥平滑轮换），精确旧媒体名单提供缓存兼容。`api/x-video.js` 流式转发单段 Range（包括浏览器用于大视频的 `bytes=0-`），拒绝 `bytes=-0`，并设有 55 秒的单次请求总时限。`416` 仅在已知视频完整长度时包含 `Content-Range`。

正式站的私有调度 `sync-x-videos` 在每小时第 57 分钟从已保存的动态快照提取视频和 GIF 的 MP4，只检查唯一的媒体地址。已有私有 Blob 副本时优先用它作为导入来源，其余从 X 的媒体 CDN 流式下载。单文件上限 100 MB；多条待归档时单文件限 24 秒避免大文件阻塞其余小视频，仅剩单条待归档时可使用完整 52 秒总预算（函数上限 60 秒），失败仅记录脱敏原因码。上传使用 Drive `drive.file` 权限和预分配 ID，Blob 保存按媒体摘要生成的私有预留及索引。重试复用预留 ID，并在 Drive 确认完整文件后发布索引。任务可从 Vercel Schedules 手动运行。正文、资料、图片和旧视频副本仍保存在原有存储中。

签名校验后，正式站优先从私有 Drive 分段读取。Drive 暂时不可用或媒体待导入时，读取已有 Blob 或回源到 X 的媒体 CDN，访客请求只读取媒体，不触发上传或调用 X 动态 API。普通、开放尾端及后缀 Range 保留 `206` 和 `Content-Range`。诊断 Drive 命中时，用有效签名和 Range 检查 `X-Nest-Video-Store: drive`。部署时 `scripts/verify-drive-connection.mjs` 用 Production 的三项 `GOOGLE_DRIVE_*` 变量刷新访问令牌并验证可分配文件 ID。授权失效时，重新授权同一客户端、更新刷新令牌，再部署。

图片代理的连接超时为 10 秒，每次等待上游数据的空闲超时为 10 秒，总请求时限为 60 秒。持续传输可超过 10 秒，客户端背压不计为空闲读取超时。图片大小上限为 12 MiB，编码结果、回退原图和 Blob 命中均以字节流发送。响应结束、失败或取消后释放计时器和断开监听，客户端取消时中止上游请求。

媒体来源策略集中在 `server/media-request-policy.mjs`：现代浏览器只接受 `Sec-Fetch-Site: same-origin` 或直接导航的 `none`，不把兄弟子域的 `same-site` 视作同源。成功响应带 `Vary: Sec-Fetch-Site`，避免同源缓存被跨站请求复用，并保留 `Cross-Origin-Resource-Policy: same-origin`。无 Fetch Metadata 时检查存在的 Origin / Referer 是否与请求 URL 严格同源；没有来源头仍可直接访问，但该类成功响应对浏览器和 Vercel CDN 均为 `no-store`，避免回退规则被缓存跳过，也避免按完整 Referer 分裂缓存。普通浏览器的原缓存期限不变。非浏览器客户端可伪造这些头，因此这不是身份认证、限流或费用上限。

资料和动态接口不接受查询参数；带参数返回不缓存的 400，且不初始化上游服务。JSON 响应带 `nosniff` 与同源资源策略。新生成的媒体项显式使用 `type: "photo"` / `"video"`；旧快照和旧浏览器缓存继续兼容。

生产构建显式关闭 sourcemap，`test:build` 检查公共产物中的环境文件、服务端目录、source map、密钥标记和已提供的服务端环境变量值。CI 在检查步骤使用非真实的凭据哨兵，防止未来误把服务端变量打包给浏览器；这只是回归门禁，不能代替全面的凭据扫描。`node scripts/qa/security-smoke.mjs` 使用本机 Edge 和本地模拟上游验证浏览器缓存、来源拒绝及 Range 传输，不调用真实 X API；可用 `QA_BROWSER=chrome` 切换已安装的浏览器。

本地密钥放在 `.env.local`，可参考 `.env.example`；线上密钥配置在 Vercel 服务端环境变量。禁止提交密钥或添加 `VITE_` 前缀。媒体签名优先使用 `X_MEDIA_SIGNING_SECRET`，否则从服务端 X 凭据派生。

## 依赖审计

CI 使用 `npm run audit:ci` 运行完整的 `npm audit --audit-level=moderate`，覆盖生产和开发依赖。Vite 8 与 React 插件 6 使用 Rolldown 构建，移除了内嵌旧 picomatch 的 Rollup。Vite、tinyglobby 和 fdir 共用基于 picomatch `4.0.7` 的[本地安全补丁](../vendor/picomatch/README.md)，修复 [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)。CI 单独查询这个上游基线的公告。已回补的公告会标记为已处理，其余 moderate 及以上公告会使检查失败。

`package.json` 将间接依赖 Zod 统一覆盖为同一主版本的 `4.6.6`，用于修复 Vercel CLI 配置包仍固定引用旧版 Zod 的情况；升级上游后需重新检查是否可以移除此覆盖。修复依据见 [Zod 安全公告](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)。测试依赖使用的 Undici 8.x 同样通过锁文件升级到修复版，相关公告见 [Undici 安全公告](https://github.com/advisories/GHSA-xjj6-f33q-929c)。

## StarryGal metadata relay

`/api/starrygal` provides public TouchGal metadata to the StarryGal desktop launcher. Set `TOUCHGAL_API_TOKEN` as a server-only Vercel environment variable in Production and Preview. Do not prefix it with `VITE_`, commit a real token, or include it in frontend builds. Redeploy after changing it.

The function (`server/starrygal.mjs`, wrapped by `api/starrygal.js`) only calls fixed routes on `https://developer.touchgal.com/api/v1/`, validates query parameters strictly per `action` to prevent CDN cache busting, prefers trusted Vercel/proxy IP headers for per-instance rate limiting, and uses instance-scoped LRU caching. It exposes search, detail, resource and patch metadata, with a sanitized `status` check. It returns no token prefix or account ID. Credentials never appear in response bodies or URLs. Adult-rated metadata requires an explicit `allowNsfw=true`. There are no game download URLs or PVs in the upstream contract. `TOUCHGAL_API_TOKEN` is included in CI canaries and `tests/build/artifacts.test.mjs` leak scans.

Success responses use CDN and bounded warm-instance caching, with in-flight deduplication, a 12-second upstream timeout, a 2 MiB response limit, and a best-effort limit of 30 requests per minute per client on each warm instance. When the 2,000-address table fills, new clients share 128 additional counters with the same one-minute quota per counter. TouchGal enforces the shared token quotas globally. Upstream errors and rate limits are not cached.

Run `node --test tests/touchgal-relay.test.mjs` to verify the relay contract and secret redaction.

## 联系页匿名留言

分享入口为 `https://loveyong07.top/contact#anonymous-message`。访客可向同源 `POST /api/anonymous-message` 提交纯文本正文。邮件主题、发件人和收件人由服务端决定。浏览器重试同一条正文时复用请求编号，Resend 据此避免重复发信。

正式站通过 `vercel.json` 将 `/api/anonymous-message` 转发到同团队的 `my-little-nest-messages` 项目。该项目连接同一仓库的 `master` 分支，根目录设为 `services/anonymous-message`，构建时包含根目录外的共享代码。修改共享邮件代码时，确保留言项目随提交重建。本地开发由 Vite 的同源接口处理。

在留言项目的 Firewall 为 `POST /api/anonymous-message` 配置按访客 IP 计数的固定窗口限流。每 60 秒允许 3 次，超限返回 429。媒体限流由主站项目管理。

Resend 发信子域名为 `mail.loveyong07.top`。在留言项目的 Production 环境将仅有该域名发信权限的 `RESEND_API_KEY` 存为 Secret，将 `ANONYMOUS_MESSAGE_FROM` 设为 `初咏的小窝 <notes@mail.loveyong07.top>`。保存后重新部署留言项目，打开分享入口发送一条测试留言，并核对 Gmail 实收。未配置凭据时，接口返回 503，页面会保留正文并提示服务暂不可用。

[Vercel 防火墙限流](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) · [Resend 域名验证](https://resend.com/docs/dashboard/domains/introduction)
