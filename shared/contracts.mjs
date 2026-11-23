// Shared JSDoc type contracts for the X feed, Article blocks, profile and media signing boundaries.

/**
 * @typedef {"ok" | "stale" | "unavailable"} FeedStatus
 * @typedef {"ok" | "none" | "stale" | "unavailable"} SectionStatus
 * @typedef {"image" | "video"} MediaKind
 * @typedef {{ normal: string, highRes: string }} AvatarProxy
 * @typedef {{ text: string, url: string, offset?: number, length?: number }} ArticleLink
 * @typedef {{
 *   type?: "photo" | "video",
 *   animated?: boolean,
 *   url: string,
 *   proxyUrl?: string,
 *   poster?: string,
 *   posterProxyUrl?: string,
 *   alt?: string,
 *   width?: number,
 *   height?: number,
 * }} MediaItem
 * @typedef {{ type: "divider" } | { type: "photo", url: string } | { type: "text", text: string, links?: ArticleLink[] }} ArticleBlock
 * @typedef {{
 *   id: string,
 *   text: string,
 *   links?: ArticleLink[],
 *   created_at?: string | null,
 *   author?: string,
 *   username?: string,
 *   repostId?: string,
 *   repostedAt?: string,
 *   avatar?: string | null,
 *   avatarProxy?: AvatarProxy,
 *   permalink?: string,
 *   quotedPost?: Omit<PostItem, "quotedPost">,
 *   media?: MediaItem[],
 * }} PostItem
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   text: string,
 *   contentKind?: "full" | "preview",
 *   coverUrl?: string | null,
 *   links?: ArticleLink[],
 *   created_at?: string | null,
 *   author?: string,
 *   avatar?: string | null,
 *   avatarProxy?: AvatarProxy,
 *   permalink?: string,
 *   media?: MediaItem[],
 *   blocks?: ArticleBlock[],
 * }} ArticleItem
 * @typedef {{
 *   status: FeedStatus | "method_not_allowed" | "invalid_request",
 *   posts: PostItem[],
 *   syncedAt?: number,
 *   previewIssue?:
 *     | "x_credential_missing"
 *     | "x_upstream_unavailable"
 *     | "snapshot_store_unconfigured"
 *     | "snapshot_unavailable",
 *   pinnedPost?: PostItem | null,
 *   pinnedStatus?: SectionStatus,
 *   articles?: ArticleItem[],
 *   articlesStatus?: SectionStatus,
 *   reposts?: PostItem[],
 *   repostsStatus?: SectionStatus,
 * }} FeedResponse
 * @typedef {{
 *   name: string,
 *   username: string,
 *   avatar: string | null,
 *   avatarProxy?: AvatarProxy,
 * }} ProfileItem
 * @typedef {{
 *   status: FeedStatus | "method_not_allowed" | "invalid_request",
 *   profile?: ProfileItem,
 * }} ProfileResponse
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   username: string,
 *   profile_image_url?: string,
 *   pinned_tweet_id?: string,
 *   pinned_post_id?: string,
 * }} XFeedAuthor
 * @typedef {{
 *   feed: FeedResponse,
 *   newestSeenId: string | null,
 *   pinnedId: string | null,
 *   author: XFeedAuthor,
 *   authorAt: number,
 *   fullRefreshAt: number | null,
 *   userFieldMode: "tweet" | "post",
 *   postFieldMode: "tweet" | "post",
 * }} XFeedCheckpoint
 * @typedef {{ syncedAt: number, feed: FeedResponse, profile: ProfileResponse }} PublishedXSnapshot
 * @typedef {{
 *   secret?: string,
 *   previousSecret?: string,
 *   now?: number,
 *   format?: "webp" | null,
 * }} MediaSigningOptions
 * @typedef {{
 *   read: (source: string, options?: { signal?: AbortSignal }) => Promise<{ image: Uint8Array, contentType: string } | null>,
 *   write?: (source: string, image: Uint8Array, contentType: string) => Promise<"written" | "exists" | false | void>,
 * }} PhotoCacheAdapter
 * @typedef {{
 *   read: (article: ArticleItem, options?: { signal?: AbortSignal }) => Promise<{
 *     id?: string,
 *     version?: number,
 *     validatedAt: number,
 *     text?: string,
 *     coverUrl?: string | null,
 *     media?: MediaItem[],
 *     blocks: ArticleBlock[],
 *   } | null>,
 *   write?: (article: ArticleItem, blocks: ArticleBlock[], options?: { validatedAt?: number }) => Promise<boolean | void>,
 * }} ArticleCacheAdapter
 */

export {};
