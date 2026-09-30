# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Selected design and wording

- 2026-09-30 background clarity: The user wants Home, Posts and Contact artwork as clear and vivid as Business. Render scene images at full opacity and remove broad white haze overlays; retain readable glass cards and use subtle blue shading with white text for exposed route titles and branding. The user explicitly authorized modifying and deploying this focused change through the existing GitHub master to Vercel production path.

- 2026-09-30 Muse removal: The user explicitly requested removing the Muse registration card in all three languages and deploying directly through the existing GitHub master to Vercel production path. This supersedes the earlier inclusion of Muse; retain the other seven business cards.

- 2026-09-30 additional business services: Append two separate glass cards: ChatGPT桌面端 / 过号码验证 / 11CNY and 远程优化电脑（UU远程） / 能力范围内按需优化电脑（激活，换Windows版本，环境等） / 价格按需求. Localize both in Japanese and English and use the existing Contact action. The user subsequently authorized deploying these two cards through the existing GitHub master to Vercel production path.

- 2026-09-30 business release: The user explicitly authorized deploying the reviewed Business page, including the latest 66CNY price and separate non-iOS/iOS Clash guidance, through the existing GitHub master to Vercel production path.

- 2026-09-30 business content: Supersedes the earlier title-and-background-only preference. Show six separate transparent glass cards for internet/registration help (66CNY), Sailingnet with promo code touchgal, FlClash, Meta Muse registration (22CNY), X/Telegram membership gifting and AI memberships; preserve the exact supplied referral URLs. The recommended Clash card distinguishes platforms: 非ios：https://github.com/chen08209/FlClash; ios：自行查看风帆sailing帮助文档. Show the supplied disclaimer on each entry to Business, highlighting user responsibility, site liability exclusion, no refunds and after-sales support in red. Keep the existing illustration, responsive navigation and three languages. Keep this change local until release is authorized.

- 2026-09-30 business page: Add a fourth navigation item 商务 with Japanese and English labels. The user explicitly chose only the page title and a new background matching the existing blue-white anime illustrations; leave body content and business contact details absent. Preserve the original three backgrounds and keep this change local until release is authorized.

- 2026-09-30 business expression: Match the warm, bright, gently open-mouth smile in the Home and Posts illustrations. The user dislikes the Business girl's narrow slanted grin; preserve the existing character, scene and composition when adjusting her expression.

- 2026-09-30 mobile navigation: Keep all four navigation items visible and clickable above page panels when the menu is open. On short viewports the menu may scroll; preserve at least 44px tap targets and verify the fourth item's actual click, including on Contact and Posts.

- 2026-09-30 blue refinement: Use clean blue-and-white UI colors to match the existing sky illustrations. This supersedes the pink-and-cream palette below; retain the scrapbook layout and sakura/cursor animation effects, with the companion still removed. Keep changes local until release is authorized.

- 2026-09-30: Remove the floating Live2D companion and its show/hide control from all pages. Keep the other kawaii features. This local change is not authorized for deployment.

- 2026-09-30 Kawaii redesign: user explicitly approved sakura pink and cream scrapbook styling while retaining existing illustrations, all content, three languages and constrained X media routes. This supersedes earlier blue-only styling instructions. Implement the supplied Desktop brief in the current React/Vite app and deliver a local preview before release. Keep the recently removed sticky Posts navigation removed. New welcome/quote copy must not invent personal interests or life events.

- On the Posts page, omit the sticky previous/next bar above the daily post card (the bar with text labels and a centered post count); keep the lower post navigation and date index.

- The user selected the first blue anime sky mock. `design-reference.png` is the visual source of truth. Recreate its open blue sky, right-side character artwork, large blue serif greeting, and white rounded social panel.
- For the 2026-09-27 design audit upgrade, the user selected route A (refine the existing design). Keep the established artwork and welcome mood while improving responsive composition, Posts readability, and Contact hierarchy. The user chose to leave new personal-interest or recent-status copy blank; do not invent it.
- The browser tab title is exactly `初咏的小窝`; keep the visible homepage heading as `Welcome to my little nest！`.
- This is a social calling card, not a job-search portfolio. Provide Chinese, Japanese, and English UI. Keep the user's own original X posts in cards, and label any decorative art separately from actual post media.
- Render X video attachments inline in Posts cards and load MP4 files through the same-origin `/api/x-video` route with byte-range support, so playback does not depend on direct access to X's video host.
- When a synced X post displays its photo, hide the short URL that X adds for that photo from the card text. Preserve unrelated links in the post.
- On the Posts page, place a stationary card for the account's current X pinned post above the daily-post carousel. Use the same post-card presentation; update the pinned card when the X pin changes, and keep it out of the daily carousel. Never present the dated fallback snapshot as a pinned post.
- Show previous/next photo buttons on both pinned and daily cards whenever a post has a photo, including a single-photo post where pressing either button leaves that photo in place. Keep photo navigation distinct from daily-post navigation. Show all original posts available from the X user timeline rather than limiting the daily carousel to six.
- Keep scrolling the Posts page smooth while viewing photo posts. Avoid paint-heavy background animation and backdrop blur across the full post panel.
- Use the supplied pink-haired anime portrait in `public/assets/site-favicon-2026-09-29.png` as the browser favicon. Keep the Posts page panel and both post cards translucent like the Contact page panel.
- On the Contact page, show each service name and its short localized description without a separate account/ID row. Use “期待你的来信” for the Chinese email heading, with matching localized wording in Japanese and English.
- For iterative visual changes, return a screenshot of the updated page so the user can mark areas for the next revision.
- Contact-page illustration should match the first two blue-and-white anime backgrounds. Keep hands anatomically natural, with no extra fingers, and favor separable scene elements that can move independently. The user prefers hair to stay fixed within all three illustrations; preserve the background, dove, and petal motion without deforming hair.
- The user owns `loveyong07.top` through Tencent Cloud and selected GitHub plus Vercel for hosting, with the domain connected to Vercel. Do not use Cloudflare or change DNS records; inspect Vercel's exact requirements and tell the user when DNS changes are needed. The user handles domain purchases and payments personally.
- Most visitors in mainland China use the site without a network proxy. New scene images and other display assets must load from this site's `/assets/` or constrained `/api/` paths, with the active scene prioritized and cold-load size checked. Keep the 2026-09-28 upgrade local for the user's review before pushing to the production branch.
- The homepage X avatar, display name, and username should follow the current X account profile automatically. Identify the account by its stable X user ID so a username change still syncs; retain local fallback content during API outages. Wait for the user's confirmation before deploying this change.
- Use the higher-resolution X avatar on Home and Posts when it exists. On Posts, clicking a post photo or video opens an enlarged on-site preview with a close X below the media; the bottom-right “View original post on X” link is the way to open X. Keep the same behavior for pinned and daily posts in all three languages.
- On live Posts cards, omit the “automatically synced” source label from both the pinned card and daily card. Keep the source notice when data is stale or when the dated public snapshot is shown, and keep the original-post link on the right.

- 2026-09-29 performance scope: improve direct access without adding a proxy. Preserve the original post-photo URLs and quality in both cards and enlarged previews; do not introduce reduced-size card images. Prioritize scene loading, cached feed rendering, and bounded adjacent-photo prefetch.

- 2026-09-30 control accents: Keep the blue scene and blue-white reading surfaces, but use distinct soft pink, blue, mint, lavender and yellow fills for buttons, navigation, language selectors and small controls. The user explicitly prefers colorful clickable regions over uniformly blue controls.

- 2026-09-30 home scrolling: Keep the homepage illustration fixed to the viewport on desktop and mobile; scroll the content over it and retain the scene while reading lower sections.

- 2026-09-30 music: Label the player AIR in all languages and use Uno's piano arrangement of 鳥の詩 as a same-origin audio asset with source attribution. Remove unused companion components, styles, dependencies and model preparation; retired model assets stay in archive only.

- 2026-09-30 desktop scrolling: Keep the fixed artwork and translucent cards, but avoid large live backdrop blur. Reuse prerendered particle sprites and bound decorative canvas resolution on high-DPI displays; keep original photo resolution.

- 2026-09-30 desktop home: Supersedes desktop home scrolling above. On fine-pointer viewports wider than 900px, fit the entire homepage into one fixed viewport, including journal cards. Keep mobile scrolling and other routes unchanged.
