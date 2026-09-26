# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Selected design and wording

- The user selected the first blue anime sky mock. `design-reference.png` is the visual source of truth. Recreate its open blue sky, right-side character artwork, large blue serif greeting, and white rounded social panel.
- The browser tab title is exactly `初咏的小窝`; keep the visible homepage heading as `Welcome to my little nest！`.
- This is a social calling card, not a job-search portfolio. Provide Chinese, Japanese, and English UI. Keep the user's own original X posts in cards, and label any decorative art separately from actual post media.
- Render X video attachments inline in Posts cards and load MP4 files through the same-origin `/api/x-video` route with byte-range support, so playback does not depend on direct access to X's video host.
- When a synced X post displays its photo, hide the short URL that X adds for that photo from the card text. Preserve unrelated links in the post.
- On the Posts page, place a stationary card for the account's current X pinned post above the daily-post carousel. Use the same post-card presentation; update the pinned card when the X pin changes, and keep it out of the daily carousel. Never present the dated fallback snapshot as a pinned post.
- Show previous/next photo buttons on both pinned and daily cards whenever a post has a photo, including a single-photo post where pressing either button leaves that photo in place. Keep photo navigation distinct from daily-post navigation. Show all original posts available from the X user timeline rather than limiting the daily carousel to six.
- Keep scrolling the Posts page smooth while viewing photo posts. Avoid paint-heavy background animation and backdrop blur across the full post panel.
- Use the supplied silver-haired anime character as the browser favicon without the chat timestamp overlay. Keep the Posts page panel and both post cards translucent like the Contact page panel.
- On the Contact page, show each service name and its short localized description without a separate account/ID row. Use “期待你的来信” for the Chinese email heading, with matching localized wording in Japanese and English.
- For iterative visual changes, return a screenshot of the updated page so the user can mark areas for the next revision.
- Contact-page illustration should match the first two blue-and-white anime backgrounds. Keep hands anatomically natural, with no extra fingers, and favor separable scene elements that can move independently. The user prefers hair to stay fixed within all three illustrations; preserve the background, dove, and petal motion without deforming hair.
- The user owns `loveyong07.top` through Tencent Cloud and selected GitHub plus Vercel for hosting, with the domain connected to Vercel. Do not use Cloudflare or change DNS records; inspect Vercel's exact requirements and tell the user when DNS changes are needed. The user handles domain purchases and payments personally.
- The homepage X avatar, display name, and username should follow the current X account profile automatically. Identify the account by its stable X user ID so a username change still syncs; retain local fallback content during API outages. Wait for the user's confirmation before deploying this change.
