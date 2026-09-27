import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaArrowRight, FaEnvelope, FaLine, FaQq, FaTelegram, FaWeixin, FaXTwitter } from "react-icons/fa6";
import { FiChevronLeft, FiChevronRight, FiMaximize2, FiMenu, FiX } from "react-icons/fi";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiFlowerLight, PiPushPinFill } from "react-icons/pi";

const ASSETS = "/assets";
const HANDLE = "loveyong07";
const FALLBACK_AVATAR = `${ASSETS}/x-avatar.jpg`;
const SNAPSHOT = {
  id: "2103361629748682978",
  text: "但愿人长久，千里共婵娟\n\n🥮中秋节快乐🥮\n\n我最喜欢吃豆沙月饼了😋",
  created_at: "2026-09-25",
  author: "初咏",
  avatar: `${ASSETS}/x-avatar.jpg`,
  permalink: "https://x.com/loveyong07/status/2103361629748682978",
};

const copy = {
  zh: {
    homeLabel: "首页区域", homeLinkLabel: "Welcome to my little nest! · 返回首页",
    navLabel: "主导航", languageLabel: "语言", openMenu: "打开菜单", closeMenu: "关闭菜单",
    profileAlt: "初咏的 X 头像",
    nav: ["首页", "动态", "联系"], pageTitle: { posts: "动态", contact: "联系" }, pageKicker: { posts: "冬日手帐", contact: "海风来信" }, homePlaceLabel: "初咏的小窝",
    heroScript: "愿好的相遇\n让平凡的日子\n也闪闪发光",
    name: "初咏",
    bio: "来世请让我做东京的帅哥吧.",
    motto: "Same Sky, More Good Friends.",
    postsCta: "看看我的动态", contactCta: "联系我", note: "初次相遇，\n就很喜欢你了 ♡",
    pinnedHeading: "置顶帖子", postsHeading: "日常动态 · X 原创帖", contactsHeading: "找到我，一起聊聊天吧",
    feedStale: "暂时无法更新 · 显示上次同步", feedSnapshot: "公开帖快照 · 2026-09-25",
    pinnedStale: "暂时无法更新 · 显示上次置顶",
    pinnedLoading: "正在同步 X 置顶帖…", pinnedNone: "X 当前没有置顶帖子", pinnedUnavailable: "置顶帖暂时无法同步", noPosts: "X 当前还没有原创帖子",
    feedLoading: "正在同步最新动态；下方暂显示有日期的公开帖快照。", feedUnavailable: "暂时无法获取最新动态；下方是有日期的公开帖快照。", feedEmpty: "目前没有可展示的原创动态。",
    visitX: "前往 X 查看", retry: "重新尝试", latestPosts: "直接看最新日常", postsIndexLabel: "按日期浏览动态",
    openPost: "在 X 查看原帖", artLabel: "网站装饰插画 · 非帖子图片", postPhotoAlt: (number) => `帖子图片 ${number}`, postVideoAlt: "X 帖子视频",
    enlargePhoto: "放大图片", enlargeVideo: "放大视频", closePreview: "关闭预览",
    photoUnavailable: "图片暂时无法加载", videoUnavailable: "视频暂时无法加载",
    imageAlt: "蓝天、海面与白色建筑的二次元风格装饰插画",
    prevPost: "上一条动态", nextPost: "下一条动态", prevPhoto: "上一张图片", nextPhoto: "下一张图片",
    postNumber: (current, total) => `${current} / ${total}`,
    xSub: "随时分享", lineSub: "日常聊天", telegramSub: "欢迎私信", wechatSub: "好友交流", qqSub: "一起玩耍", emailSub: "商务/合作/来信",
    copied: "已复制", copy: "点击复制账号", copyFailed: "复制未成功。请选择下方账号手动复制。", manualCopyId: "可手动复制的账号", emailHeading: "期待你的来信",
    actionOpen: "打开 ↗", actionCopy: "复制账号", actionWrite: "选择邮箱 ↓",
    footerScript: "Thank you\nfor being here ♡", footerNote: "相遇是故事的开始，\n愿我们都被温柔以待。",
    footerSmall: "Different People　/　Same Beautiful Sky　/　Always Here for You",
  },
  ja: {
    homeLabel: "ホーム", homeLinkLabel: "Welcome to my little nest! · ホーム",
    navLabel: "メインナビゲーション", languageLabel: "言語", openMenu: "メニューを開く", closeMenu: "メニューを閉じる",
    profileAlt: "初咏の X プロフィール画像",
    nav: ["ホーム", "投稿", "連絡先"], pageTitle: { posts: "投稿", contact: "連絡先" }, pageKicker: { posts: "冬の日記", contact: "海辺からのお便り" }, homePlaceLabel: "初咏の小さなおうち",
    heroScript: "素敵な出会いが\n何気ない日々を\n輝かせますように",
    name: "初咏",
    bio: "来世では東京のイケメンになりたい。",
    motto: "Same Sky, More Good Friends.",
    postsCta: "投稿を見る", contactCta: "連絡する", note: "はじめまして、\nもうあなたが好きです ♡",
    pinnedHeading: "固定した投稿", postsHeading: "日々の投稿 · X のオリジナル投稿", contactsHeading: "見つけてね、話しましょう",
    feedStale: "一時的に更新できません · 前回の投稿を表示", feedSnapshot: "公開投稿の記録 · 2026-09-25",
    pinnedStale: "一時的に更新できません · 前回の固定投稿を表示",
    pinnedLoading: "X の固定した投稿を読み込み中…", pinnedNone: "現在、固定した投稿はありません", pinnedUnavailable: "固定した投稿を読み込めません", noPosts: "オリジナルの投稿はまだありません",
    feedLoading: "最新の投稿を読み込み中です。下には日付付きの公開投稿記録を表示しています。", feedUnavailable: "最新の投稿を取得できません。下には日付付きの公開投稿記録を表示しています。", feedEmpty: "表示できるオリジナル投稿はまだありません。",
    visitX: "X で見る", retry: "再試行", latestPosts: "最新の投稿へ", postsIndexLabel: "日付で投稿を探す",
    openPost: "X で原文を見る", artLabel: "サイト用イラスト · 投稿画像ではありません", postPhotoAlt: (number) => `投稿画像 ${number}`, postVideoAlt: "X の投稿動画",
    enlargePhoto: "画像を拡大", enlargeVideo: "動画を拡大", closePreview: "プレビューを閉じる",
    photoUnavailable: "画像を読み込めませんでした", videoUnavailable: "動画を読み込めませんでした",
    imageAlt: "青空と海、白い建物のアニメ風イラスト",
    prevPost: "前の投稿", nextPost: "次の投稿", prevPhoto: "前の画像", nextPhoto: "次の画像",
    postNumber: (current, total) => `${current} / ${total}`,
    xSub: "日々のこと", lineSub: "気軽にお話", telegramSub: "メッセージ歓迎", wechatSub: "友達になろう", qqSub: "一緒に遊ぼう", emailSub: "お仕事・お便り",
    copied: "コピーしました", copy: "ID をコピー", copyFailed: "コピーできませんでした。下の ID を選んで手動でコピーしてください。", manualCopyId: "手動でコピーできる ID", emailHeading: "お便りをお待ちしています",
    actionOpen: "開く ↗", actionCopy: "ID をコピー", actionWrite: "メールを選ぶ ↓",
    footerScript: "Thank you\nfor being here ♡", footerNote: "出会いは物語の始まり。\n優しい日々になりますように。",
    footerSmall: "Different People　/　Same Beautiful Sky　/　Always Here for You",
  },
  en: {
    homeLabel: "Home", homeLinkLabel: "Welcome to my little nest! · Home",
    navLabel: "Main navigation", languageLabel: "Language", openMenu: "Open menu", closeMenu: "Close menu",
    profileAlt: "初咏's X profile photo",
    nav: ["Home", "Posts", "Contact"], pageTitle: { posts: "Posts", contact: "Contact" }, pageKicker: { posts: "WINTER JOURNAL", contact: "LETTERS BY THE SEA" }, homePlaceLabel: "My little nest",
    heroScript: "May lovely meetings\nmake ordinary days\nshine a little brighter",
    name: "初咏",
    bio: "In my next life, let me be a handsome guy in Tokyo.",
    motto: "Same Sky, More Good Friends.",
    postsCta: "See my posts", contactCta: "Get in touch", note: "We just met,\nand I already like you ♡",
    pinnedHeading: "Pinned post", postsHeading: "Everyday posts · originals from X", contactsHeading: "Find me and say hello",
    feedStale: "Update unavailable · showing last sync", feedSnapshot: "Public post snapshot · 2026-09-25",
    pinnedStale: "Update unavailable · showing last pinned post",
    pinnedLoading: "Syncing pinned post from X…", pinnedNone: "No post is currently pinned on X", pinnedUnavailable: "Pinned post is temporarily unavailable", noPosts: "No original X posts yet",
    feedLoading: "Checking for recent posts. A dated public snapshot appears below for now.", feedUnavailable: "Recent posts are unavailable. A dated public snapshot appears below.", feedEmpty: "There are no original posts to show yet.",
    visitX: "See on X", retry: "Try again", latestPosts: "Jump to latest posts", postsIndexLabel: "Browse posts by date",
    openPost: "View original post on X", artLabel: "Site illustration · not an image from this post", postPhotoAlt: (number) => `Post photo ${number}`, postVideoAlt: "Video from this X post",
    enlargePhoto: "Enlarge photo", enlargeVideo: "Enlarge video", closePreview: "Close preview",
    photoUnavailable: "Image is temporarily unavailable", videoUnavailable: "Video is temporarily unavailable",
    imageAlt: "Anime style decorative illustration of a blue sky, sea, and white buildings",
    prevPost: "Previous post", nextPost: "Next post", prevPhoto: "Previous photo", nextPhoto: "Next photo",
    postNumber: (current, total) => `${current} / ${total}`,
    xSub: "Little updates", lineSub: "Everyday chat", telegramSub: "Say hello", wechatSub: "Let's be friends", qqSub: "Let's hang out", emailSub: "Work · hello",
    copied: "Copied", copy: "Copy ID", copyFailed: "Copying failed. Select the ID below to copy it manually.", manualCopyId: "ID to copy manually", emailHeading: "Looking forward to your letter",
    actionOpen: "Open ↗", actionCopy: "Copy ID", actionWrite: "Choose an email ↓",
    footerScript: "Thank you\nfor being here ♡", footerNote: "Every meeting begins a story.\nMay life be gentle to us all.",
    footerSmall: "Different People　/　Same Beautiful Sky　/　Always Here for You",
  },
};

const navIds = ["home", "posts", "contact"];
const pagePaths = { home: "/", posts: "/posts", contact: "/contact" };
const LANGUAGE_STORAGE_KEY = "hello-nice-site-language";

function xMediaSrc(value, highResAvatar = false) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowedPath = url.pathname.startsWith("/media/") || url.pathname.startsWith("/profile_images/")
      || url.pathname.startsWith("/ext_tw_video_thumb/");
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com" || !allowedPath) return null;
    if (highResAvatar && url.pathname.startsWith("/profile_images/")) {
      url.pathname = url.pathname.replace(/_normal(?=\.[^/.]+$)/, "_400x400");
    }
    return `/api/x-media?url=${encodeURIComponent(url.href)}`;
  } catch {
    return null;
  }
}

function xVideoSrc(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowedPath = ["/ext_tw_video/", "/amplify_video/", "/tweet_video/"].some((prefix) => url.pathname.startsWith(prefix));
    if (url.protocol !== "https:" || url.hostname !== "video.twimg.com" || url.username || url.password || url.port || !allowedPath) return null;
    return `/api/x-video?url=${encodeURIComponent(url.href)}`;
  } catch {
    return null;
  }
}

function handleAvatarError(event) {
  const image = event.currentTarget;
  const lowResSrc = image.dataset.avatarLowRes;
  if (lowResSrc && image.getAttribute("src") !== lowResSrc) {
    image.src = lowResSrc;
  } else if (image.getAttribute("src") !== FALLBACK_AVATAR) {
    image.src = FALLBACK_AVATAR;
  }
}

function resolvePage() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === pagePaths.posts) return "posts";
  if (path === pagePaths.contact) return "contact";
  return "home";
}

function readStoredLanguage() {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return Object.hasOwn(copy, saved) ? saved : "zh";
  } catch { return "zh"; }
}

function formatLocalDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function formatVisitDate(value, language) {
  const locale = language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP-u-ca-gregory" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    calendar: "gregory", year: "numeric", month: "long", day: "numeric",
  }).format(value);
}
const mailboxes = [
  { label: "Gmail", address: "fyh20071004@gmail.com" },
  { label: "Outlook", address: "fyh20071004@outlook.com" },
  { label: "QQ Mail", address: "3437702786@qq.com" },
];

function isOwnPost(post) {
  if (!post || !/^\d+$/.test(String(post.id ?? "")) || typeof post.text !== "string") return false;
  if (!post.text.trim() && !post.media?.length) return false;
  try {
    const url = new URL(post.permalink);
    return url.protocol === "https:" && url.hostname === "x.com" && /^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/.test(url.pathname) && url.pathname.endsWith(`/status/${post.id}`);
  } catch { return false; }
}

function isOriginalPost(post) {
  return isOwnPost(post) && !post.referenced_tweets?.length && !post.in_reply_to_user_id;
}

function formatPostDate(value, language) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
  const dateText = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  if (!String(value).includes("T")) return dateText;
  const timeText = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${dateText} ${timeText}`;
}

function postExcerpt(post, t) {
  const text = typeof post.text === "string" ? post.text.trim().replace(/\s+/g, " ") : "";
  if (text) {
    const characters = Array.from(text);
    return characters.length > 38 ? `${characters.slice(0, 38).join("")}…` : text;
  }
  return Array.isArray(post.media) && post.media.some((media) => media?.type === "video") ? t.postVideoAlt : t.postPhotoAlt(1);
}

function ContactTile({ icon: Icon, className, title, sub, href, onClick, copyLabel, copied, action, failedId, failureMessage, manualCopyLabel, inputRef }) {
  const Tag = href ? "a" : "button";
  return <><Tag className={`contact-tile ${className}${copied ? " is-copied" : ""}`} href={href}
    target={href?.startsWith("https://") ? "_blank" : undefined}
    rel={href?.startsWith("https://") ? "noopener noreferrer" : undefined}
    onClick={onClick} type={href ? undefined : "button"} title={copyLabel}
    aria-label={copyLabel || undefined}>
    <span className="contact-icon" aria-hidden="true"><Icon /></span>
    <strong>{title}</strong>
    <small aria-live={onClick ? "polite" : undefined} aria-atomic={onClick ? "true" : undefined}>{copied ? copied : sub}</small>
    <span className="contact-action">{copied || action}</span>
  </Tag>
    {failedId && <div className="contact-copy-fallback" role="status">
      <p>{failureMessage}</p>
      <input ref={inputRef} type="text" readOnly value={failedId} aria-label={manualCopyLabel}
        onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} />
    </div>}
  </>;
}

function MediaLightbox({ kind, photo, photoAlt, photoCount, onPhotoChange, video, videoSrc, t, onClose, returnFocusRef }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose(null);
      } else if (kind === "photo" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        onPhotoChange((index) => (index + (event.key === "ArrowLeft" ? -1 : 1) + photoCount) % photoCount);
      } else if (event.key === "Tab") {
        const focusable = [...dialogRef.current.querySelectorAll("video[controls], button")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [kind, onClose, onPhotoChange, photoCount, returnFocusRef]);

  return createPortal(<div className="media-lightbox" role="presentation"
    onClick={(event) => { if (event.target === event.currentTarget) onClose(null); }}>
    <div className="media-lightbox-content" role="dialog" aria-modal="true"
      aria-label={kind === "photo" ? t.enlargePhoto : t.enlargeVideo} ref={dialogRef}>
      {kind === "photo"
        ? <><img src={photo.src} alt={photo.alt || photoAlt} />
          <div className="media-lightbox-navigation">
            <button className="media-lightbox-prev" type="button" aria-label={t.prevPhoto}
              onClick={() => onPhotoChange((index) => (index - 1 + photoCount) % photoCount)}><FiChevronLeft aria-hidden="true" /></button>
            <span className="media-lightbox-count" aria-live="polite">{t.postNumber(photo.number, photoCount)}</span>
            <button className="media-lightbox-next" type="button" aria-label={t.nextPhoto}
              onClick={() => onPhotoChange((index) => (index + 1) % photoCount)}><FiChevronRight aria-hidden="true" /></button>
          </div></>
        : <video controls playsInline preload="metadata" poster={xMediaSrc(video.poster) || undefined}
          aria-label={video.alt || t.postVideoAlt} tabIndex="0">
          <source src={videoSrc} type="video/mp4" />
        </video>}
      <button ref={closeRef} className="media-lightbox-close" type="button"
        aria-label={t.closePreview} onClick={() => onClose(null)}><FiX aria-hidden="true" /></button>
    </div>
  </div>, document.body);
}

function PostCard({ post, feedSource, language, t, label, profile }) {
  const isSnapshot = feedSource === "snapshot";
  const sourceLabel = label ?? (isSnapshot ? t.feedSnapshot : feedSource === "stale" ? t.feedStale : null);
  const photos = Array.isArray(post.media)
    ? post.media.filter((media) => (media?.type ?? "photo") === "photo" && xMediaSrc(media?.url)).map((media) => ({ ...media, src: xMediaSrc(media.url) })).slice(0, 4)
    : [];
  const video = Array.isArray(post.media)
    ? post.media.find((media) => media?.type === "video" && xVideoSrc(media?.url))
    : null;
  const videoSrc = video ? xVideoSrc(video.url) : null;
  const [photoIndex, setPhotoIndex] = useState(0);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [expandedMedia, setExpandedMedia] = useState(null);
  const returnFocusRef = useRef(null);
  const currentPhotoIndex = Math.min(photoIndex, photos.length - 1);
  const currentPhoto = photos[currentPhotoIndex];
  useEffect(() => {
    setImageUnavailable(false);
    setVideoUnavailable(false);
  }, [currentPhoto?.url, videoSrc]);
  function openMedia(kind, event) {
    if (kind === "video") event.currentTarget.parentElement.querySelector("video")?.pause();
    returnFocusRef.current = event.currentTarget;
    setExpandedMedia(kind);
  }
  return <><article className="post-card">
    <div className="post-topline">
      <img className="post-avatar" src={xMediaSrc(post.avatar, true) || FALLBACK_AVATAR}
        data-avatar-low-res={xMediaSrc(post.avatar) || undefined} alt="" onError={handleAvatarError} />
      <div className="post-author"><strong>{post.author || profile.name}</strong><span>@{profile.username}</span></div>
      <span className="post-date">{formatPostDate(post.created_at, language)}</span>
      <FaXTwitter className="post-x-mark" aria-hidden="true" />
    </div>
    {post.text.trim() && <div className="post-text">{post.text.split(/(?:\r?\n){2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
    {photos.length > 0 && <div className={`post-media${photos.length === 1 ? " post-media-single" : ""}`}>
      {imageUnavailable
        ? <div className="post-media-unavailable" role="status">{t.photoUnavailable}</div>
        : <button className="post-media-open" type="button" onClick={(event) => openMedia("photo", event)}
          aria-label={`${t.enlargePhoto} · ${t.postPhotoAlt(currentPhotoIndex + 1)}`}>
          <img key={currentPhoto.src} src={currentPhoto.src} alt={currentPhoto.alt || t.postPhotoAlt(currentPhotoIndex + 1)} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageUnavailable(true)} />
        </button>}
      <button className="post-media-nav post-media-prev" type="button" aria-label={t.prevPhoto}
        onClick={() => setPhotoIndex((index) => (Math.min(index, photos.length - 1) - 1 + photos.length) % photos.length)}><FiChevronLeft aria-hidden="true" /></button>
      <button className="post-media-nav post-media-next" type="button" aria-label={t.nextPhoto}
        onClick={() => setPhotoIndex((index) => (Math.min(index, photos.length - 1) + 1) % photos.length)}><FiChevronRight aria-hidden="true" /></button>
      <span className="post-media-count" aria-live="polite">{t.postNumber(currentPhotoIndex + 1, photos.length)}</span>
    </div>}
    {video && <div className="post-video">
      {videoUnavailable
        ? <div className="post-media-unavailable" role="status">{t.videoUnavailable}</div>
        : <>
          <video controls playsInline preload="metadata" poster={xMediaSrc(video.poster) || undefined}
            aria-label={video.alt || t.postVideoAlt} onError={() => setVideoUnavailable(true)}>
            <source src={videoSrc} type="video/mp4" />
          </video>
          <button className="post-video-open" type="button" aria-label={t.enlargeVideo}
            onClick={(event) => openMedia("video", event)}>
            <span className="post-video-expand"><FiMaximize2 aria-hidden="true" />{t.enlargeVideo}</span>
          </button>
        </>}
    </div>}
    {isSnapshot && <figure className="post-illustration">
      <img src={`${ASSETS}/post-seaside.png`} alt={t.imageAlt} />
      <figcaption>{t.artLabel}</figcaption>
    </figure>}
    <div className="post-bottomline">
      {sourceLabel && <span>{sourceLabel}</span>}
      <a href={post.permalink} target="_blank" rel="noopener noreferrer">{t.openPost}<FaArrowRight aria-hidden="true" /></a>
    </div>
  </article>
    {expandedMedia && (expandedMedia === "photo" ? currentPhoto : video) && <MediaLightbox kind={expandedMedia} photo={currentPhoto ? { ...currentPhoto, number: currentPhotoIndex + 1 } : null} photoCount={photos.length} onPhotoChange={setPhotoIndex}
      photoAlt={t.postPhotoAlt(currentPhotoIndex + 1)} video={video}
      videoSrc={videoSrc} t={t} onClose={setExpandedMedia} returnFocusRef={returnFocusRef} />}
  </>;
}

export function App() {
  const [language, setLanguage] = useState(readStoredLanguage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [posts, setPosts] = useState([SNAPSHOT]);
  const [feedSource, setFeedSource] = useState("snapshot");
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedRefreshToken, setFeedRefreshToken] = useState(0);
  const [retryDisabled, setRetryDisabled] = useState(false);
  const [pinnedPost, setPinnedPost] = useState(null);
  const [pinState, setPinState] = useState("loading");
  const pinnedPostRef = useRef(null);
  const [postIndex, setPostIndex] = useState(0);
  const [copiedId, setCopiedId] = useState("");
  const [copyFailedId, setCopyFailedId] = useState("");
  const [clickSparkle, setClickSparkle] = useState(null);
  const [visitDate, setVisitDate] = useState(() => new Date());
  const [profile, setProfile] = useState({ name: "初咏", username: HANDLE, avatar: `${ASSETS}/x-avatar.jpg` });
  const headerRef = useRef(null);
  const menuToggleRef = useRef(null);
  const menuOpenedByKeyboardRef = useRef(false);
  const manualCopyRef = useRef(null);
  const copyTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const [page, setPage] = useState(resolvePage);
  const t = copy[language];

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage); } catch { /* Storage is optional. */ }
  }

  useEffect(() => {
    let mounted = true;
    async function refreshProfile() {
      try {
        const response = await fetch("/api/x-profile", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json();
        if (mounted && result.status === "ok" && result.profile?.username) {
          setProfile({ name: result.profile.name, username: result.profile.username, avatar: result.profile.avatar || `${ASSETS}/x-avatar.jpg` });
        }
      } catch { /* Keep the last known profile. */ }
    }
    refreshProfile();
    const interval = window.setInterval(refreshProfile, 15 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) refreshProfile(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { mounted = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : language === "ja" ? "ja" : "en";
  }, [language]);

  useEffect(() => {
    function handleHistoryNavigation() {
      setPage(resolvePage());
      setMenuOpen(false);
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", handleHistoryNavigation);
    return () => window.removeEventListener("popstate", handleHistoryNavigation);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setVisitDate(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    if (menuOpenedByKeyboardRef.current) headerRef.current?.querySelector(".site-nav a")?.focus();
    function closeMenuOnEscape(event) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuToggleRef.current?.focus();
    }
    function closeMenuOutside(event) {
      if (!headerRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener("keydown", closeMenuOnEscape);
    document.addEventListener("pointerdown", closeMenuOutside);
    return () => {
      document.removeEventListener("keydown", closeMenuOnEscape);
      document.removeEventListener("pointerdown", closeMenuOutside);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (copyFailedId) {
      manualCopyRef.current?.focus();
      manualCopyRef.current?.select();
    }
  }, [copyFailedId]);

  useEffect(() => () => {
    window.clearTimeout(copyTimerRef.current);
    window.clearTimeout(retryTimerRef.current);
  }, []);

  useEffect(() => {
    if (page !== "posts") return undefined;
    let mounted = true;
    async function refreshFeed() {
      try {
        const response = await fetch("/api/x-posts", { cache: "no-store" });
        if (!response.ok) throw new Error("Feed unavailable");
        const feed = await response.json();
        if (!mounted) return;
        const hasPinStatus = ["ok", "stale", "none", "unavailable"].includes(feed.pinnedStatus);
        const nextPinned = isOwnPost(feed.pinnedPost) && (!hasPinStatus || ["ok", "stale"].includes(feed.pinnedStatus)) ? feed.pinnedPost : null;
        if (hasPinStatus) {
          if (feed.pinnedStatus === "none") {
            pinnedPostRef.current = null;
            setPinnedPost(null); setPinState("none");
          } else if (feed.pinnedStatus === "unavailable") {
            setPinState(pinnedPostRef.current ? "stale" : "unavailable");
          } else {
            pinnedPostRef.current = nextPinned;
            setPinnedPost(nextPinned);
            setPinState(nextPinned ? (feed.pinnedStatus === "stale" ? "stale" : "live") : "unavailable");
          }
        } else if (feed.status === "ok" || feed.status === "stale") {
          pinnedPostRef.current = nextPinned;
          setPinnedPost(nextPinned);
          setPinState(nextPinned ? (feed.status === "stale" ? "stale" : "live") : (feed.status === "stale" ? "unavailable" : "none"));
        } else {
          setPinState(pinnedPostRef.current ? "stale" : "unavailable");
        }
        const originals = Array.isArray(feed.posts) ? feed.posts.filter((post) => isOriginalPost(post) && post.id !== pinnedPostRef.current?.id) : [];
        if (feed.status === "ok" || feed.status === "stale") {
          setPosts(originals); setFeedSource(feed.status === "stale" ? "stale" : "live");
          setPostIndex((index) => Math.min(index, Math.max(0, originals.length - 1)));
        } else {
          setFeedSource((current) => current === "live" ? "stale" : current);
        }
        setFeedLoading(false);
      } catch {
        if (mounted) {
          setFeedSource((current) => current === "live" ? "stale" : current);
          setPinState(pinnedPostRef.current ? "stale" : "unavailable");
          setFeedLoading(false);
        }
      }
    }
    refreshFeed();
    const interval = window.setInterval(refreshFeed, 15 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) refreshFeed(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { mounted = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [page, feedRefreshToken]);

  function retryFeed() {
    if (retryDisabled) return;
    setRetryDisabled(true);
    setFeedLoading(true);
    setFeedRefreshToken((value) => value + 1);
    retryTimerRef.current = window.setTimeout(() => setRetryDisabled(false), 30_000);
  }

  async function copyId(id) {
    try {
      await navigator.clipboard.writeText(id);
      window.clearTimeout(copyTimerRef.current);
      setCopyFailedId("");
      setCopiedId(id);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(""), 2400);
    } catch {
      window.clearTimeout(copyTimerRef.current);
      setCopiedId("");
      setCopyFailedId(id);
    }
  }

  function showClickSparkle(event) {
    const control = event.target.closest("button, a");
    if (control && event.detail !== 0) {
      const id = Date.now() + "-" + Math.random();
      setClickSparkle({ id, x: event.clientX, y: event.clientY });
      window.setTimeout(() => setClickSparkle((current) => current?.id === id ? null : current), 700);
    }

    const link = event.target.closest("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.hash || destination.search) return;
    const normalizedPath = destination.pathname.replace(/\/+$/, "") || "/";
    const nextPage = Object.entries(pagePaths).find(([, path]) => path === normalizedPath)?.[0];
    if (!nextPage) return;

    event.preventDefault();
    if (window.location.pathname !== normalizedPath) window.history.pushState({ page: nextPage }, "", normalizedPath);
    setPage(nextPage);
    setMenuOpen(false);
    if (nextPage !== page) window.scrollTo(0, 0);
  }

  const socials = [
    { icon: FaXTwitter, className: "x", title: "X", sub: t.xSub, href: `https://x.com/${profile.username}`, action: t.actionOpen },
    { icon: FaLine, className: "line", title: "LINE", sub: t.lineSub, href: "https://line.me/ti/p/LSaMZQcRLu", action: t.actionOpen },
    { icon: FaTelegram, className: "telegram", title: "Telegram", sub: t.telegramSub, href: "https://t.me/loveyong07", action: t.actionOpen },
    { icon: FaWeixin, className: "wechat", title: language === "zh" ? "微信" : "WeChat", sub: t.wechatSub, onClick: () => copyId(HANDLE), copyLabel: t.copy + ": " + HANDLE, copied: copiedId === HANDLE ? t.copied : undefined, action: t.actionCopy, failedId: copyFailedId === HANDLE ? HANDLE : undefined },
    { icon: FaQq, className: "qq", title: "QQ", sub: t.qqSub, onClick: () => copyId("3437702786"), copyLabel: t.copy + ": 3437702786", copied: copiedId === "3437702786" ? t.copied : undefined, action: t.actionCopy, failedId: copyFailedId === "3437702786" ? "3437702786" : undefined },
    { icon: FaEnvelope, className: "email", title: language === "zh" ? "邮箱" : language === "ja" ? "メール" : "Email", sub: t.emailSub, href: "#email-options", action: t.actionWrite },
  ];

  const header = <header className="site-header" ref={headerRef}>
    <a className="brand" href={pagePaths.home} aria-label={t.homeLinkLabel}>
      <span className="brand-script">Nest<PiFlowerLight aria-hidden="true" /></span>
      <span className="brand-caption">A LITTLE NEST</span>
    </a>
    <nav className={"site-nav " + (menuOpen ? "is-open" : "")} id="site-navigation" aria-label={t.navLabel}>
      {navIds.map((id, index) => <a key={id} className={page === id ? "active" : ""} href={pagePaths[id]} aria-current={page === id ? "page" : undefined}><PiFlowerLight className="nav-active-flower" aria-hidden="true" />{t.nav[index]}</a>)}
    </nav>
    <div className="language-picker" role="group" aria-label={t.languageLabel}>
      {[["zh", "中文"], ["ja", "日本語"], ["en", "EN"]].map(([code, label]) => <button key={code} className={language === code ? "active" : ""} onClick={() => changeLanguage(code)} aria-pressed={language === code}>{label}</button>)}
    </div>
    <button className="menu-toggle" ref={menuToggleRef} type="button" onClick={(event) => {
      menuOpenedByKeyboardRef.current = event.detail === 0;
      setMenuOpen((current) => !current);
    }} aria-label={menuOpen ? t.closeMenu : t.openMenu} aria-expanded={menuOpen} aria-controls="site-navigation">{menuOpen ? <FiX /> : <FiMenu />}</button>
  </header>;

  const postsSection = <div className="posts-section" id="posts">
    {feedSource === "snapshot" && <div className="feed-status" role="status">
      <span>{feedLoading ? t.feedLoading : t.feedUnavailable}</span>
      {!feedLoading && <div className="feed-status-actions">
        <a href={`https://x.com/${profile.username}`} target="_blank" rel="noopener noreferrer">{t.visitX}<FaArrowRight aria-hidden="true" /></a>
        <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>{t.retry}</button>
      </div>}
    </div>}
    <section className="posts-group" aria-label={t.pinnedHeading}>
      <div className="section-heading"><PiPushPinFill aria-hidden="true" /><h2>{t.pinnedHeading}</h2>
        <a className="posts-jump-link" href="#latest-posts">{t.latestPosts}<FaArrowRight aria-hidden="true" /></a>
      </div>
      {pinnedPost ? <PostCard key={pinnedPost.id} post={pinnedPost} feedSource={pinState} language={language} t={t} profile={profile} label={pinState === "stale" ? t.pinnedStale : undefined} />
        : <div className="pinned-placeholder" role="status">{pinState === "loading" ? t.pinnedLoading : pinState === "none" ? t.pinnedNone : t.pinnedUnavailable}
          {pinState === "unavailable" && feedSource !== "snapshot" && <span className="feed-status-actions">
            <a href={`https://x.com/${profile.username}`} target="_blank" rel="noopener noreferrer">{t.visitX}<FaArrowRight aria-hidden="true" /></a>
            <button type="button" onClick={retryFeed} disabled={retryDisabled || feedLoading}>{t.retry}</button>
          </span>}
        </div>}
    </section>
    <section className="posts-group" id="latest-posts" tabIndex="-1" aria-label={t.postsHeading}>
      <div className="section-heading"><HiOutlineSparkles aria-hidden="true" /><h2>{t.postsHeading}</h2></div>
      {posts.length > 1 && <div className="post-index" role="group" aria-label={t.postsIndexLabel}>
        {posts.map((post, index) => <button key={post.id} className={`post-index-button${index === postIndex ? " is-active" : ""}`}
          type="button" aria-current={index === postIndex ? "true" : undefined} onClick={() => setPostIndex(index)}>
          <span>{t.postNumber(index + 1, posts.length)}</span>
          <time dateTime={post.created_at}>{formatPostDate(post.created_at, language)}</time>
          <span className="post-index-excerpt">{postExcerpt(post, t)}</span>
        </button>)}
      </div>}
      {posts.length > 0 ? <PostCard key={posts[postIndex].id} post={posts[postIndex]} feedSource={feedSource} language={language} t={t} profile={profile} />
        : <div className="pinned-placeholder" role="status">{t.feedEmpty} <a href={`https://x.com/${profile.username}`} target="_blank" rel="noopener noreferrer">{t.visitX}</a></div>}
      {posts.length > 1 && <div className="post-controls">
        <button type="button" onClick={() => setPostIndex((postIndex - 1 + posts.length) % posts.length)} aria-label={t.prevPost}><FiChevronLeft /></button>
        <span aria-live="polite">{t.postNumber(postIndex + 1, posts.length)}</span>
        <button type="button" onClick={() => setPostIndex((postIndex + 1) % posts.length)} aria-label={t.nextPost}><FiChevronRight /></button>
      </div>}
    </section>
  </div>;

  const contactsSection = <div className="contacts-section" id="contact">
    <div className="contacts-heading-row">
      <div className="section-heading"><HiOutlineSparkles aria-hidden="true" /><h2>{t.contactsHeading}</h2></div>
      <span className="micro-slogan">{t.footerSmall}</span>
    </div>
    <div className="contact-grid">{socials.map((social) => <ContactTile key={social.title} {...social}
      failureMessage={t.copyFailed} manualCopyLabel={t.manualCopyId} inputRef={manualCopyRef} />)}</div>
    <div className="email-row" id="email-options">
      <span><FaEnvelope aria-hidden="true" />{t.emailHeading}</span>
      <div>{mailboxes.map(({ label, address }) => <a key={address} href={"mailto:" + address} title={address}>{label}<span>{address}</span></a>)}</div>
      <span className="email-stamp" aria-hidden="true"><PiFlowerLight /></span>
    </div>
    <div className="panel-footer">
      <p className="footer-script">{t.footerScript}</p>
      <p className="footer-note">{t.footerNote}</p>
      <PiFlowerLight className="footer-flower" aria-hidden="true" />
    </div>
  </div>;

  return <main className={"site language-" + language + (page === "home" ? "" : " site-route site-route-" + page)} onClick={showClickSparkle}>
    {page === "posts" && <div className="route-floating-elements" aria-hidden="true" />}
    {page === "contact" && <div className="route-floating-elements" aria-hidden="true">
      <img className="route-floating-dove" src={ASSETS + "/contact-sky-dove-v2.png"} alt="" draggable="false" />
    </div>}
    {page === "home" ? <section className="hero" aria-label={t.homeLabel}>
      <div className="home-floating-elements" aria-hidden="true">
        <img className="home-floating-element home-floating-dove home-floating-dove-desktop" src={ASSETS + "/home-dove-motion.png"} alt="" draggable="false" />
        <img className="home-floating-element home-floating-petal home-floating-petal-desktop" src={ASSETS + "/home-petal-motion.png"} alt="" draggable="false" />
        <img className="home-floating-element home-floating-dove-mobile" src={ASSETS + "/home-mobile-dove-motion.png"} alt="" draggable="false" />
        <img className="home-mobile-petal home-mobile-petal-one" src={ASSETS + "/home-floating-petal.png"} alt="" draggable="false" />
        <img className="home-mobile-petal home-mobile-petal-two" src={ASSETS + "/home-floating-petal.png"} alt="" draggable="false" />
      </div>
      {header}
      <div className="hero-copy">
        <p className="home-place-badge">
          <span className="home-place-seal" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M9 20V9l3-4 3 4v11M8 9h8M10 13h1m2 0h1M7.5 20h9M12 2v1.5M3.9 6.8l1.4.7m14.8-.7-1.4.7" />
            </svg>
          </span>
          {t.homePlaceLabel}
        </p>
        <h1><span>Welcome</span><span>to my little nest<em>!</em></span></h1>
        <div className="ornament" aria-hidden="true"><span /><PiFlowerLight /><span /></div>
        <div className="profile">
          <img src={xMediaSrc(profile.avatar, true) || FALLBACK_AVATAR}
            data-avatar-low-res={xMediaSrc(profile.avatar) || undefined} alt={t.profileAlt} onError={handleAvatarError} />
          <div><strong>{profile.name}</strong><a href={`https://x.com/${profile.username}`} target="_blank" rel="noopener noreferrer">@{profile.username}</a></div>
        </div>
        <p className="bio">{t.bio}</p>
        <p className="motto">{t.motto}</p>
        <div className="hero-actions">
          <a className="primary-cta" href={pagePaths.posts}><FaXTwitter aria-hidden="true" />{t.postsCta}<FaArrowRight aria-hidden="true" /></a>
          <a className="secondary-cta" href={pagePaths.contact}><FaEnvelope aria-hidden="true" />{t.contactCta}</a>
        </div>
      </div>
      <p className="sky-quote">{t.heroScript}<HiOutlineSparkles aria-hidden="true" /></p>
      <div className="handwritten-note"><p>{t.note}</p><span>Nice people<br />Brighter tomorrow<br /><time dateTime={formatLocalDate(visitDate)}>— {formatVisitDate(visitDate, language)} ✧</time></span></div>
    </section> : <>
      <section className={"route-hero route-hero-" + page} aria-label={t.pageTitle[page]}>
        {header}
        <div className="route-page-title">
          <span className="route-page-kicker"><PiFlowerLight aria-hidden="true" />{t.pageKicker[page]}</span>
          <h1>{t.pageTitle[page]}</h1>
        </div>
      </section>
      <section className={"content-panel route-panel route-panel-" + page} aria-label={page === "posts" ? t.postsHeading : t.contactsHeading}>
        {page === "posts" ? postsSection : contactsSection}
      </section>
    </>}
    {clickSparkle && <span key={clickSparkle.id} className="click-sparkle" style={{ left: clickSparkle.x, top: clickSparkle.y }} aria-hidden="true">
      <HiOutlineSparkles className="click-sparkle__main" />
      <HiOutlineSparkles className="click-sparkle__small click-sparkle__small--one" />
      <HiOutlineSparkles className="click-sparkle__small click-sparkle__small--two" />
    </span>}
  </main>;
}
