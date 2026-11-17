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
 *   created_at?: string | null,
 *   author?: string,
 *   username?: string,
 *   repostId?: string,
 *   repostedAt?: string,
 *   avatar?: string | null,
 *   avatarProxy?: AvatarProxy,
 *   permalink?: string,
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
 *   secret?: string,
 *   now?: number,
 *   format?: "webp" | null,
 * }} MediaSigningOptions
 * @typedef {{
 *   read: (source: string, options?: { signal?: AbortSignal }) => Promise<{ image: Uint8Array, contentType: string } | null>,
 *   write?: (source: string, image: Uint8Array, contentType: string) => Promise<boolean | void>,
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
