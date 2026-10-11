# Current Project Instructions

## Scope and current content

- The site is a personal social calling card with three routes in this order: Home, Posts, Contact. Keep desktop and mobile navigation consistent in Chinese, Japanese and English. Do not hijack the browser's right-click menu.
- The Business page, its navigation entry, cards and disclaimer have been removed. Do not restore them from historical instructions or design assets.
- The Contact page has one email address: `fyh20071004@gmail.com`. Preserve the other social contact methods unless the user requests a change.
- Keep this file limited to current effective conventions. Record durable decisions by updating the relevant rule, rather than appending a dated change log or conflicting superseding instructions.

## Local development and hosting

- Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.
- Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites.
- Before a Sites handoff, run `npm run check` (lint with zero warnings, formatting, logic tests, build, build-artifact checks, Sites worker tests); the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`. Keep the logic tests independent of `dist/` and let the build-artifact checks fail, never skip, when the build is missing.
- CSS, layout or component-structure changes also require a visual comparison. Build a traceable commit/workspace baseline and the final source separately; use the same `qa:styles` collector, fixtures and browser conditions. Preserve and explain differences instead of overwriting the baseline. `npm run check` does not include visual QA; mock video failures do not verify real playback.
- The user owns `loveyong07.top` through Tencent Cloud and selected GitHub plus Vercel for hosting. The production branch is `master`. Do not use Cloudflare or change DNS records; inspect Vercel's exact requirements and tell the user when DNS changes are needed. The user handles domain purchases and payments personally.
- Preserve original assets and the Sites compatibility files. Do not remove unrelated untracked files or archived originals during focused changes.

## Design and wording

- Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal.
- `design-reference.png` is the visual reference for the open blue sky, right-side character artwork, large blue serif greeting, and white rounded social panel. Current explicit wording and contact rules in this file take precedence over text in the reference image.
- Keep the established illustrations, welcome mood and scrapbook layout. Use clean blue-and-white scene and reading surfaces, with distinct soft pink, blue, mint, lavender and yellow fills for buttons, navigation, language selectors and small controls.
- The browser tab title is exactly `初咏的小窝`; keep the visible homepage heading as `Welcome to my little nest！`.
- Provide Chinese, Japanese and English UI. Preserve supplied wording and translations. Leave personal-interest or recent-status copy blank unless the user supplies it; do not invent personal interests or life events.
- Render scene images at full opacity without broad white haze overlays. Keep readable translucent cards, with subtle blue shading and white text for exposed route titles and branding.
- Keep the Home illustration fixed to the viewport. On fine-pointer viewports wider than 900px, fit the entire homepage, including journal cards, into one viewport. Retain scrolling on mobile and other routes.
- Keep `src/constants/media-queries.js` and CSS aligned at 700px, 900px / 901px and the fine-pointer condition; update both sides when changing a breakpoint.
- Keep all three mobile navigation items visible and clickable above page panels when open. On short viewports the menu may scroll; preserve at least 44px tap targets and verify the Contact item's click.
- Use `public/assets/site-favicon-2026-09-29.png` as the browser favicon. Keep Open Graph / Twitter card tags in `index.html` (preview image `public/assets/og-cover.jpg`, 1200x630) and the `theme-color` blue-and-white.
- `/business` permanently redirects to `/` in `vercel.json`; keep it for old links.
- Contact artwork should match the blue-and-white Home and Posts backgrounds. Keep hands anatomically natural and hair fixed in all three illustrations; preserve independent background, dove and petal motion without deforming hair.
- Keep the floating Live2D companion and its show/hide control removed. Retired model assets remain in archive only.
- Label the music player `AIR` in all languages and use Uno's piano arrangement of 鳥の詩 as a same-origin audio asset with source attribution.
- When implementing a newly selected generated mock, use that image as the source of truth for layout, anatomy, density, spacing, color, typography, content and hierarchy, subject to the user's current explicit decisions.
- For iterative visual changes, return a screenshot of the updated page so the user can mark areas for the next revision.

## Home, Posts and Contact behavior

- The homepage X avatar, display name and username follow the current X profile using the account's stable X user ID. Retain local fallback content during API outages and prefer the higher-resolution avatar on Home and Posts when available.
- Show the user's own original X posts in cards, and label decorative art separately from actual post media.
- On Posts, keep a stationary card for the account's current X pinned post above the daily carousel. Update it when the pin changes and keep it out of the daily carousel. Never present a dated fallback snapshot as a pinned post.
- Show all original posts available from the X user timeline rather than limiting the daily carousel to six.
- Each Posts entry defaults to the latest daily post, including after loading a fresh timeline over a snapshot or cache. Preserve the reading post during background refresh only after the visitor manually selects one.
- Omit the sticky previous/next bar above the daily card. Keep the lower daily-post navigation and date index.
- Show previous/next photo buttons on pinned and daily cards whenever a post has a photo, including a single-photo post where either button leaves it in place. Keep photo and daily-post navigation distinct.
- When a post displays its photo, hide the short URL X adds for that photo from the card text. Preserve unrelated links.
- Render X video attachments inline through same-origin `/api/x-video` with byte-range support. Clicking a photo or video opens an enlarged on-site preview with a close X below the media; the bottom-right original-post link opens X. Use the same behavior for pinned and daily posts in all three languages.
- On live Posts cards, omit the automatically synced source label. Keep the source notice for stale data or the dated public snapshot, and keep the original-post link on the right.
- Keep the Posts panel and both post cards translucent like the Contact panel.
- On Contact, show each service name and its short localized description without a separate account/ID row. Use `期待你的来信` as the Chinese email heading with matching Japanese and English wording.

## Performance and media

- Most mainland-China visitors use the site without a network proxy. Serve new scene images and display assets from this site's `/assets/` or constrained `/api/` paths, prioritize the active scene and check cold-load size.
- Improve direct access without adding a proxy. Preserve original post-photo URLs and quality in cards and enlarged previews; do not introduce reduced-size card images.
- Prioritize scene loading, cached feed rendering and bounded adjacent-photo prefetch.
- Keep scrolling smooth on photo posts. Avoid paint-heavy background animation and large live backdrop blur, especially across the full Posts panel. Reuse prerendered particle sprites and bound decorative canvas resolution on high-DPI displays.
- Keep the signed same-origin X media restrictions, video Range behavior, cache lifetime limits and server-only secret handling described in `README.md`.
