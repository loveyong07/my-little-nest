# A 方案精修 QA — 2026-09-27

**状态：A 方案代码和图片已部署；直连体验的站内导航/静态缓存修复也已部署。** 用户选择暂不新增个人兴趣／近况文字。下方旧 QA 章节保留历史时点记录；上线状态以 `D:\chatGPT\design\网站设计进度交接.md` 顶部为准。

- 2026-09-27 直连修复：本地窄屏浏览器验证首页→动态、菜单→联系、浏览器返回/前进和直接打开 `/posts`；构建及代码差异检查通过。Vercel 提交 `5532286` 状态为 success，正式站三页、JS/CSS 和四张新背景图 HTTP 200；JS 的静态缓存头为 `public, max-age=86400, stale-while-revalidate=604800`。
- 未代理直连问题不能在用户手机网络完全复现。此桌面环境直连请求成功；Vercel 在中国大陆没有 CDN 节点，需用手机真实网络复核跨境路由。头像及 X 图片由同源 `/api/x-media` 代理，A 方案未修改这条路径。

- [本轮截图索引](qa/upgrade-2026-09-27/README.md)包含首页、联系、动态在 1440／1024／390／320 CSS 视口的画面。1024 首页无旧版底部浅色接缝；390 首页脸部完整；320 英文主 CTA 在首屏；320 日文联系卡两列。正常同步的桌面动态和本地降级的手机动态分别留图，不能互相冒充。
- 本地 `/api/x-posts` 一次返回 `status: ok`、`pinnedStatus: ok`、23 条原创帖。浏览器检查了日期索引切帖、双图灯箱从 `1 / 2` 到 `2 / 2` 的方向键切换、Esc 关闭及焦点返回；微信复制成功和模拟剪贴板拒绝后的手动账号输入也可见。手机菜单用键盘 Enter／Esc 和指针打开关闭复核。
- `npm run build`、`npm test`（42/42）和 `git diff --check` 通过；四张当前背景 JPEG 均保持 1774×887，原 PNG 保留。本轮未测真机、逐区域对比度、200% 缩放或性能指标。截图为本地桌面 Edge 的 CSS 视口，不代表真实手机浏览器。

---

# Pinned X post QA — 2026-09-26

## What QA screenshots are for

- Screenshots preserve a rendered page at a named route, viewport, and UI state. They help a person review layout, responsive behavior, and visual regressions, and give the user a concrete image to mark up.
- A screenshot is visual evidence only. It does not test API results, HTTP security headers, authorization, or whether the live site deployed successfully; those need separate checks.
- Vercel publishes `dist/client`, not the project `qa/` folder. A screenshot reaches GitHub only if it is explicitly added and committed; it is not part of the running site by default.
- The five 2026-09-26 untracked captures (`pinned-post` desktop/mobile, daily-scroll, photo-carousel, and production-daily) are only for human review of the Posts page. No app code, test, or build consumes them. The pinned captures may show personal post media, so they remain local and were not committed or deployed; keep them only while they are useful for visual feedback.

result for the **local** site with the existing X token: passed

- `/api/x-posts` returned `status: ok`, `pinnedStatus: ok`, one pinned post, and six daily posts. The pinned post ID did not appear in the daily list. No token or full post body was recorded in this QA note.
- In the browser, the pinned card stayed on the same X post while the daily carousel changed from `1 / 6` to `2 / 6`. Both visible post photos loaded, and the daily and pinned cards had separate original-post links.
- Captured and visually inspected the real synced page after both photos loaded at desktop 1487 × 1850 and phone 390 × 1450 sizes. The screenshots remain local because the pinned photo contains personal documents. The 390 px and 320 px layout checks found no horizontal overflow; the two cards stayed within the viewport.
- `npm test` passed 22/22 and `npm run build` passed. This QA was performed locally before the production release; verify the deployed page separately.
- For smoother scrolling, the Posts background now moves with a transform instead of animating `background-position`, and the full Posts panel no longer applies backdrop blur. The desktop and 390 px local previews kept the post cards and background in place; no device FPS measurement was made.

---

# Hosting and custom-domain handoff — 2026-09-26

The project is pushed to the private [GitHub repository](https://github.com/fyh2026/my-little-nest), and its Vercel Production deployment is Ready at [the deployment URL](https://my-little-nest-82txmckrm-fyh2026s-projects.vercel.app). The live `/api/x-posts` endpoint previously returned `status: ok` with 6 posts. `.env.local` is excluded from GitHub; `X_BEARER_TOKEN` is configured as a Vercel server-side Production variable.

- GitHub automatic deployments are not connected yet. Authorize the Vercel GitHub App for this private repository in [Project Settings → Git](https://vercel.com/fyh2026s-projects/my-little-nest/settings/git).
- The user reports that DNS changes for `loveyong07.top` are complete. In the 2026-09-26 recheck, Vercel still returned `invalid_configuration`; it detected Cloudflare nameservers (`conrad.ns.cloudflare.com`, `rosalie.ns.cloudflare.com`) and no A/CNAME values. Public resolvers 1.1.1.1 and 8.8.8.8 returned no apex A record, `www.loveyong07.top` did not resolve, and the HTTPS request failed.
- Vercel `domains inspect` recommended `A @ → 76.76.21.21`; project-level `domains verify` recommended `CNAME @ → c9e7548748e901a2.vercel-dns-017.com.` with proxy disabled. Recheck the Vercel Domains panel and confirm which record the user changed and in which DNS console. Records must be changed at the authoritative DNS provider. This assistant did not change DNS.
- The previous Codex Sites deployment is separate from this Vercel deployment.

---

# Post photo layout QA — 2026-09-26

result for the **local built page with mock feed data**: passed

- Captured `/posts` at exact 1487 × 1058 and 390 × 844 CSS viewports using Chrome DevTools Protocol: [desktop](qa/posts-photo-mock-desktop-2026-09-26.png) · [phone](qa/posts-photo-mock-mobile-2026-09-26.png). Both PNG files use the same pixel dimensions as their CSS viewports.
- Served the existing `dist/client` build with a temporary local endpoint returning six **simulated** original posts and an existing project image as each photo. The preview did not load `.env.local` or make an X API request. The screenshots verify card layout and image handling, not the appearance or availability of the actual X photos.
- In both viewports the first card showed its author, text, photo, sync label, original-post link, and carousel controls without clipping. Chrome reported the photo fully loaded (`naturalWidth = 600`) and `documentElement.scrollWidth = clientWidth` (1487 on desktop, 390 on phone). The first card's right edge was inside each viewport (1168.5 and 364 CSS px respectively). Both captures were visually inspected.
- Existing mocked tests cover association of real X media keys with posts and removal of a displayed photo's own `t.co` link. This layout capture does not repeat the earlier live X check or verify a public deployment.

---

# X feed and media QA — 2026-09-26

result for observed **local** sync path: passed

- Earlier on 2026-09-26, the local `/api/x-posts` endpoint returned `status: ok` with 6 original posts from `@loveyong07`; each had one photo. The Codex in-app browser displayed the first real photo in the `/posts` card.
- After removing photo short links, the live local response still returned 6 posts with photos and had no `t.co` links in their displayed text. Four posts had contained a trailing photo link before that change. The browser screenshot showed the photo and clean text together. Ordinary links are preserved by the matching rule and its unit test.
- During the handoff update, `npm test` passed 14/14 and `npm run build` passed. No additional paid X API request was made during that documentation pass.
- This earlier local sync pass was not a public deployment or a full visual regression pass. The motion screenshots below predate the media changes; the later mock-data desktop and phone photo-layout captures are recorded above, while tablet and real online photo captures are still missing. Sites has since published version 1 and stored the server-side X secret. The last live access check hit Cloudflare 403 before the Worker, so the online feed, online image loading, and real traffic costs remain unverified.

---

# Design QA — 2026-09-26 motion capture (earlier stage)

result for local preview at desktop and phone widths: passed

## Captures

- Captured the current `/`, `/posts`, and `/contact` pages in the Codex in-app browser at 1487 × 1058 and 390 × 844 CSS pixels. Saved two JPEG frames per page and viewport, about 2.5 seconds apart. The saved raster sizes match those viewports.
- The browser reported `prefers-reduced-motion: no-preference` during capture. Each captured frame was visually inspected, and all 12 saved JPEGs were reopened for integrity and size checks; every pair differs. Screenshots are still frames, so the runtime animation checks below provide the motion evidence.

| Page | Desktop frames | Phone frames | Observed motion |
| --- | --- | --- | --- |
| Home `/` | [01](qa/motion-2026-09-26/home-desktop-01.jpg) · [02](qa/motion-2026-09-26/home-desktop-02.jpg) | [01](qa/motion-2026-09-26/home-mobile-01.jpg) · [02](qa/motion-2026-09-26/home-mobile-02.jpg) | Background drift; the separate dove and petals change position on both widths. |
| Posts `/posts` | [01](qa/motion-2026-09-26/posts-desktop-01.jpg) · [02](qa/motion-2026-09-26/posts-desktop-02.jpg) | [01](qa/motion-2026-09-26/posts-mobile-01.jpg) · [02](qa/motion-2026-09-26/posts-mobile-02.jpg) | The winter background drifts subtly; this page has no separate flying dove. |
| Contact `/contact` | [01](qa/motion-2026-09-26/contact-desktop-01.jpg) · [02](qa/motion-2026-09-26/contact-desktop-02.jpg) | [01](qa/motion-2026-09-26/contact-mobile-01.jpg) · [02](qa/motion-2026-09-26/contact-mobile-02.jpg) | Background drift and a separate flying dove on both widths. |

## Motion and layout checks

- Home: the desktop dove and petal transforms changed during a 2.5-second sample; at phone width the dove moved horizontally and the petal moved downward. Their animation names were active, as was the background animation.
- Posts: `posts-background-breeze` was active. Its computed `background-position` changed at desktop and phone widths; the visual change is intentionally small.
- Contact: the desktop and phone dove transforms changed during a 2.5-second sample, and `contact-background-breeze` changed the background position. The dove PNG loaded with a nonzero natural width.
- All six page and viewport combinations had `scrollWidth - clientWidth = 0`. The three desktop pages had no canvas elements. The browser reported no console errors during this pass.
- Emulating `prefers-reduced-motion: reduce` on all three pages set the relevant background and dove animation names to `none`; the normal motion preference was restored after the check. Hair remains fixed within each illustration rather than moving as a separate layer.

## Boundary

These captures verify the local preview only. This motion pass did not recapture tablet or 320 px widths, change site code, deploy publicly, or verify the live X API; the later local X verification is recorded above. The earlier checks and historical screenshots remain below.

---

# Design QA — 2026-09-26 hair motion removal

result for requested scope: passed

## What changed

- Removed the independent hair deformation from Home, Posts, and Contact after the user found it unnatural. Removed the unused `HairMotionCanvas.jsx` component and its CSS. Hair now stays fixed within each illustration; it still travels with the existing whole-scene pan.
- Home's dove and falling petals continue to move on desktop and narrow screens. Posts retains its whole-scene pan and blue shading.
- Contact uses a newly generated 1774 × 887 blue-and-white illustration (`public/assets/contact-sky-letter-v2.png`). The clean plate and transparent dove are separate assets; the dove flies on desktop, tablet, and phone. The original Contact image remains in the project. Visible hand anatomy was reviewed at full image size: no obvious extra fingers, detached hands, or implausible wrists. Some fingers are naturally occluded, so a strict digit-by-digit count is not visually possible.

## Verification

- `npm run build` passed after removing the hair animation; output includes `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
- Inspected Home, Posts, and Contact in the Codex in-app browser at 1487 × 1058 and 390 × 844. All three had zero canvas elements and `scrollWidth - clientWidth = 0`; their existing whole-background CSS animations remained active under emulated `prefers-reduced-motion: no-preference`. Earlier tablet and 320 px checks were made before this removal.
- The existing reduced-motion CSS continues to disable background, dove, and petal motion. Contact's static dove retains the intended small size in reduced-motion mode.
- During this earlier hair-removal pass, the in-app browser screenshots were inspected but not saved. The new motion captures above now document the current local preview; the older `qa/` images below remain the 2026-09-25 historical baseline.

## Scope boundary

The latest user feedback supersedes the earlier hair-animation request: none of the three pages independently animates hair. X real-time API access and old QA temporary-file cleanup were not part of this task.

---

# Design QA — 2026-09-25

final result: passed

> Historical baseline: this capture predates the latest title, navigation, and page-split changes. The current implementation is in the local preview and the latest handoff notes.

## Capture setup

- Source visual: `design-reference.png` (1487 × 1058 px).
- Implementation: local home page at `http://127.0.0.1:4173/`; capture: `qa/implementation-desktop-1487x1058.jpg` (1487 × 1058 px).
- CSS viewport: 1487 × 1058 px. Browser reported `devicePixelRatio ≈ 1`; no resampling was applied to the implementation capture.
- Full-view comparison: `qa/comparison-desktop-1487x1058.jpg` (1495 × 540 px). The source and implementation were rendered together in one browser capture, each at 743.5 × 529 CSS px, using the same 0.5 scale and no crop or aspect-ratio distortion.
- Focused comparison: `qa/comparison-contact-panel-1423x662.jpg` (1423 × 662 px). It stacks the source and implementation contact-panel region. Both use the same 1:1 crop: x=32, y=740, width=1423, height=318 px.
- Responsive captures: `qa/implementation-tablet-768x1024.jpg` (753 × 1004 px raster), `qa/implementation-mobile-390x844.jpg` (375 × 812 px), and `qa/implementation-mobile-320x844.jpg` (305 × 804 px). Their CSS viewport overrides were 768 × 1024, 390 × 844, and 320 × 844 px respectively; the browser reports DPR ≈ 1. The screenshot output dimensions are recorded separately from the requested CSS viewport dimensions.
- State at this 2026-09-25 capture: Chinese home page, default menu closed, light blue design, static public X post snapshot dated 2026-09-25. No X bearer token was configured then, so this historical capture does not represent the later live API response.

## Comparison history

### Initial comparison

- [P2] The seaside illustration in the post card was 74 px tall while the source uses a substantially taller image region.
- [P2] The public post's blank-line formatting and wrapped email-tile copy made the lower panel exceed the 1058 px reference canvas and clip its footer.
- [P2] At a 320 px browser viewport, `body { min-width: 320px; }` caused horizontal scrolling when the browser reserved a vertical scrollbar gutter.

### Fixes and final comparison

- Raised the desktop post illustration to 110 px and rendered separated post paragraphs with compact paragraph spacing while preserving their text.
- Shortened each localized email-tile summary; all three full email addresses remain available in the email row.
- Removed the fixed body minimum width. At 320 px, the heading fits its card and `scrollWidth` equals `clientWidth`.
- The final 1487 × 1058 page now fits the reference viewport, including the panel footer. The post image crop, blue palette, headline, profile block, action buttons, note, rounded social panel, and overall hierarchy remain aligned with the selected source.
- Final evidence: the full-view and focused comparisons above. No actionable P0, P1, or P2 differences remain.

## Fidelity surfaces

| Surface | Result |
| --- | --- |
| Typography | Cormorant Garamond display type and Noto Sans SC body type retain the reference hierarchy. The title remains `Hello Nice to meet you！` with no hyphen after Hello. |
| Spacing and layout | At 1487 × 1058, the hero ends at y=740 and the panel ends within the viewport. The card and footer no longer push the page below the reference canvas. |
| Colors | The blue sky, white social panel, blue controls, and pink title accent match the selected palette. |
| Images and icons | The selected sky character artwork and seaside decoration are present. The profile avatar is the account's verified current X avatar, so it intentionally differs from the mock avatar. The QQ glyph remains monochrome and simpler than the colored penguin in the mock; this is a P3 icon refinement. |
| Copy and content | Chinese, Japanese, and English controls and accessible names switch together. The Japanese bio is naturalized; the English display name stays `初咏` rather than using an unconfirmed romanization. The card shows the verified public post snapshot, so its text differs from the mock's sample post. |
| Responsiveness | At 768, 390, and 320 px CSS widths, `documentElement.scrollWidth` equals `clientWidth`; no horizontal content overflow was found. The mobile menu opens and closes, and its post navigation closes the menu after selection. |
| Accessibility and interaction | The first keyboard Tab reaches the home button with a visible focus outline. Copy feedback uses a polite live region; copying the WeChat ID updated the clipboard and showed the localized success message. The clipboard was restored to its prior empty state after the check. Language switching updated document language to `zh-CN`, `ja`, and `en`. The click sparkle appears in no-preference motion mode and is suppressed when `prefers-reduced-motion: reduce` is active. |

## Verification and limits

- `npm run build` — passed; generated `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
- `node --test tests/x-feed-plugin.test.mjs` — 3/3 passed.
- `npm run test:sites` — 4/4 passed.
- Browser console — no errors in the checked page state.
- The external X, LINE, Telegram, and email destinations are present in the rendered links. This QA checked their configured targets without leaving the local preview.
- At this 2026-09-25 baseline, X real-time sync was unverified because `.env.local` and `X_BEARER_TOKEN` were absent. The visible post was labeled as a dated snapshot. The later local X verification is recorded at the top of this file.
- This verifies the visual target, the named interactions, responsive overflow, and selected accessibility behavior. It is not a full screen-reader audit.

## Follow-up polish

- P3: replace the monochrome QQ glyph with a suitable colored source asset if one is available.
