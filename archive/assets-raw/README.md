# 未参与当前页面的原始素材

这里保存从 `public/` 移出的历史原图和已停用的小素材。Vite 会完整复制 `public/`，因此这些文件放在项目归档目录中，不进入 `dist/client/`。

2026-09-30 核对了 `src/`、`server/`、`api/`、`worker/`、`scripts/`、`tests/`、`index.html`、`vite.config.mjs` 和 `vercel.json` 的资源引用。当前三页使用 `public/assets/` 中的 WebP 场景图、JPG 后备图、头像、装饰图层和新版 favicon；下列文件没有运行时引用（2026-10-11 补充了 WebP 化后不再引用的 5 个装饰图层原件）。

| 原路径 | 说明 |
| --- | --- |
| `public/assets/hero-sky.png` | 早期首页底图 |
| `public/assets/hero-sky-alt.png` | 早期首页底图 |
| `public/assets/hero-sky-alt-motion.png` | 当前首页压缩图的原件 |
| `public/assets/hero-sky-mobile-motion.png` | 当前手机首页压缩图的原件 |
| `public/assets/posts-winter-hero.png` | 当前动态页压缩图的原件 |
| `public/assets/contact-letter-hero.png` | 早期联系页底图 |
| `public/assets/contact-letter-hero-motion.png` | 早期联系页动效底图 |
| `public/assets/contact-sky-letter-v2.png` | 联系页构图原件 |
| `public/assets/contact-sky-letter-v2-clean.png` | 当前联系页压缩图的原件 |
| `public/assets/contact-dove-motion.png` | 已被 `contact-sky-dove-v2.png` 替代的鸽子图层 |
| `public/assets/site-favicon.png` | 已被 `site-favicon-2026-09-29.png` 替代的 favicon |
| `public/assets/contact-sky-dove-v2.png` | 当前 `contact-sky-dove-v2.webp` 的 PNG 原件 |
| `public/assets/home-dove-motion.png` | 当前 `home-dove-motion.webp` 的 PNG 原件 |
| `public/assets/home-floating-petal.png` | 当前 `home-floating-petal.webp` 的 PNG 原件 |
| `public/assets/home-mobile-dove-motion.png` | 当前 `home-mobile-dove-motion.webp` 的 PNG 原件 |
| `public/assets/home-petal-motion.png` | 当前 `home-petal-motion.webp` 的 PNG 原件 |

如需重新导出场景图，可使用这里的原件。要让某个文件重新上线，应将所需版本放回 `public/assets/`，并检查页面引用与加载体积。
