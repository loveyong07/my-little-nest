import { useEffect, useState } from "react";
import { FaArrowRight, FaEnvelope, FaLine, FaQq, FaTelegram, FaWeixin, FaXTwitter } from "react-icons/fa6";
import { FiChevronLeft, FiChevronRight, FiMenu, FiX } from "react-icons/fi";
import { HiOutlineSparkles } from "react-icons/hi2";
import { PiFlowerLight, PiPushPinFill } from "react-icons/pi";

const ASSETS = "/assets";
const HANDLE = "loveyong07";
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
    homeLabel: "首页区域", homeLinkLabel: "Welcome to my little nest！· 返回首页",
    navLabel: "主导航", languageLabel: "语言", openMenu: "打开菜单", closeMenu: "关闭菜单",
    profileAlt: "初咏的 X 头像",
    nav: ["首页", "动态", "联系"], pageTitle: { posts: "动态", contact: "联系" },
    heroScript: "愿好的相遇\n让平凡的日子\n也闪闪发光",
    name: "初咏",
    bio: "来世请让我做东京的帅哥吧.",
    motto: "Same Sky, More Good Friends.",
    postsCta: "看看我的动态", contactCta: "联系我", note: "初次相遇，\n就很喜欢你了 ♡",
    pinnedHeading: "置顶帖子", postsHeading: "日常动态 · X 原创帖", contactsHeading: "找到我，一起聊聊天吧",
    feedLive: "X 原创帖 · 自动同步", feedStale: "暂时无法更新 · 显示上次同步", feedSnapshot: "公开帖快照 · 2026-09-25",
    pinnedLive: "X 置顶帖 · 自动同步", pinnedStale: "暂时无法更新 · 显示上次置顶",
    pinnedLoading: "正在同步 X 置顶帖…", pinnedNone: "X 当前没有置顶帖子", pinnedUnavailable: "置顶帖暂时无法同步", noPosts: "X 当前还没有原创帖子",
    openPost: "在 X 查看原帖", artLabel: "网站装饰插画 · 非帖子图片", postPhotoAlt: (number) => `帖子图片 ${number}`,
    imageAlt: "蓝天、海面与白色建筑的二次元风格装饰插画",
    prevPost: "上一条动态", nextPost: "下一条动态", prevPhoto: "上一张图片", nextPhoto: "下一张图片",
    postNumber: (current, total) => `${current} / ${total}`,
    xSub: "随时分享", lineSub: "日常聊天", telegramSub: "欢迎私信", wechatSub: "好友交流", qqSub: "一起玩耍", emailSub: "商务/合作/来信",
    copied: "已复制", copy: "点击复制账号", emailHeading: "期待你的来信",
    footerScript: "Thank you\nfor being here ♡", footerNote: "相遇是故事的开始，\n愿我们都被温柔以待。",
    footerSmall: "Different People　/　Same Beautiful Sky　/　Always Here for You",
  },
  ja: {
    homeLabel: "ホーム", homeLinkLabel: "Welcome to my little nest！· ホーム",
    navLabel: "メインナビゲーション", languageLabel: "言語", openMenu: "メニューを開く", closeMenu: "メニューを閉じる",
    profileAlt: "初咏の X プロフィール画像",
    nav: ["ホーム", "投稿", "連絡先"], pageTitle: { posts: "投稿", contact: "連絡先" },
    heroScript: "素敵な出会いが\n何気ない日々を\n輝かせますように",
    name: "初咏",
    bio: "来世では東京のイケメンになりたい。",
    motto: "Same Sky, More Good Friends.",
    postsCta: "投稿を見る", contactCta: "連絡する", note: "はじめまして、\nもうあなたが好きです ♡",
    pinnedHeading: "固定した投稿", postsHeading: "日々の投稿 · X のオリジナル投稿", contactsHeading: "見つけてね、話しましょう",
    feedLive: "X オリジナル投稿 · 自動更新", feedStale: "一時的に更新できません · 前回の投稿を表示", feedSnapshot: "公開投稿の記録 · 2026-09-25",
    pinnedLive: "X の固定した投稿 · 自動更新", pinnedStale: "一時的に更新できません · 前回の固定投稿を表示",
    pinnedLoading: "X の固定した投稿を読み込み中…", pinnedNone: "現在、固定した投稿はありません", pinnedUnavailable: "固定した投稿を読み込めません", noPosts: "オリジナルの投稿はまだありません",
    openPost: "X で原文を見る", artLabel: "サイト用イラスト · 投稿画像ではありません", postPhotoAlt: (number) => `投稿画像 ${number}`,
    imageAlt: "青空と海、白い建物のアニメ風イラスト",
    prevPost: "前の投稿", nextPost: "次の投稿", prevPhoto: "前の画像", nextPhoto: "次の画像",
    postNumber: (current, total) => `${current} / ${total}`,
    xSub: "日々のこと", lineSub: "気軽にお話", telegramSub: "メッセージ歓迎", wechatSub: "友達になろう", qqSub: "一緒に遊ぼう", emailSub: "お仕事・お便り",
    copied: "コピーしました", copy: "ID をコピー", emailHeading: "お便りをお待ちしています",
    footerScript: "Thank you\nfor being here ♡", footerNote: "出会いは物語の始まり。\n優しい日々になりますように。",
    footerSmall: "Different People　/　Same Beautiful Sky　/　Always Here for You",
  },
  en: {
    homeLabel: "Home", homeLinkLabel: "Welcome to my little nest！ · Home",
    navLabel: "Main navigation", languageLabel: "Language", openMenu: "Open menu", closeMenu: "Close menu",
    profileAlt: "初咏's X profile photo",
    nav: ["Home", "Posts", "Contact"], pageTitle: { posts: "Posts", contact: "Contact" },
    heroScript: "May lovely meetings\nmake ordinary days\nshine a little brighter",
    name: "初咏",
    bio: "In my next life, let me be a handsome guy in Tokyo.",
    motto: "Same Sky, More Good Friends.",
    postsCta: "See my posts", contactCta: "Get in touch", note: "We just met,\nand I already like you ♡",
    pinnedHeading: "Pinned post", postsHeading: "Everyday posts · originals from X", contactsHeading: "Find me and say hello",
    feedLive: "Original X posts · auto updated", feedStale: "Update unavailable · showing last sync", feedSnapshot: "Public post snapshot · 2026-09-25",
    pinnedLive: "Pinned on X · auto updated", pinnedStale: "Update unavailable · showing last pinned post",
    pinnedLoading: "Syncing pinned post from X…", pinnedNone: "No post is currently pinned on X", pinnedUnavailable: "Pinned post is temporarily unavailable", noPosts: "No original X posts yet",
    openPost: "View original post on X", artLabel: "Site illustration · not an image from this post", postPhotoAlt: (number) => `Post photo ${number}`,
    imageAlt: "Anime style decorative illustration of a blue sky, sea, and white buildings",
    prevPost: "Previous post", nextPost: "Next post", prevPhoto: "Previous photo", nextPhoto: "Next photo",
    postNumber: (current, total) => `${current} / ${total}`,
    xSub: "Little updates", lineSub: "Everyday chat", telegramSub: "Say hello", wechatSub: "Let's be friends", qqSub: "Let's hang out", emailSub: "Work · hello",
    copied: "Copied", copy: "Copy ID", emailHeading: "Looking forward to your letter",
    footerScript: "Thank you\nfor being here ♡", footerNote: "Every meeting begins a story.\nMay life be gentle to us all.",
    footerSmall: "Different People　/　Same Beautiful Sky　/　Always Here for You",
  },
};

const navIds = ["home", "posts", "contact"];
const pagePaths = { home: "/", posts: "/posts", contact: "/contact" };
const LANGUAGE_STORAGE_KEY = "hello-nice-site-language";

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
    return url.protocol === "https:" && url.hostname === "x.com" && url.pathname === `/${HANDLE}/status/${post.id}`;
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

function ContactTile({ icon: Icon, className, title, sub, href, onClick, copyLabel, copied }) {
  const Tag = href ? "a" : "button";
  return <Tag className={`contact-tile ${className}`} href={href}
    target={href?.startsWith("https://") ? "_blank" : undefined}
    rel={href?.startsWith("https://") ? "noopener noreferrer" : undefined}
    onClick={onClick} type={href ? undefined : "button"} title={copyLabel}
    aria-label={copyLabel || title}>
    <span className="contact-icon" aria-hidden="true"><Icon /></span>
    <strong>{title}</strong>
    <small aria-live={onClick ? "polite" : undefined} aria-atomic={onClick ? "true" : undefined}>{copied ? copied : sub}</small>
  </Tag>;
}

function PostCard({ post, feedSource, language, t, label }) {
  const isSnapshot = feedSource === "snapshot";
  const photos = Array.isArray(post.media) ? post.media.filter((media) => typeof media?.url === "string").slice(0, 4) : [];
  const [photoIndex, setPhotoIndex] = useState(0);
  const currentPhotoIndex = Math.min(photoIndex, photos.length - 1);
  const currentPhoto = photos[currentPhotoIndex];
  return <article className="post-card">
    <div className="post-topline">
      <img className="post-avatar" src={post.avatar || `${ASSETS}/x-avatar.jpg`} alt="" />
      <div className="post-author"><strong>{post.author || t.name}</strong><span>@{HANDLE}</span></div>
      <span className="post-date">{formatPostDate(post.created_at, language)}</span>
      <FaXTwitter className="post-x-mark" aria-hidden="true" />
    </div>
    {post.text.trim() && <div className="post-text">{post.text.split(/(?:\r?\n){2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
    {photos.length > 0 && <div className={`post-media${photos.length === 1 ? " post-media-single" : ""}`}>
      <a href={post.permalink} target="_blank" rel="noopener noreferrer" aria-label={`${t.openPost} · ${t.postPhotoAlt(currentPhotoIndex + 1)}`}>
        <img src={currentPhoto.url} alt={currentPhoto.alt || t.postPhotoAlt(currentPhotoIndex + 1)} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      </a>
      <button className="post-media-nav post-media-prev" type="button" aria-label={t.prevPhoto}
        onClick={() => setPhotoIndex((index) => (Math.min(index, photos.length - 1) - 1 + photos.length) % photos.length)}><FiChevronLeft aria-hidden="true" /></button>
      <button className="post-media-nav post-media-next" type="button" aria-label={t.nextPhoto}
        onClick={() => setPhotoIndex((index) => (Math.min(index, photos.length - 1) + 1) % photos.length)}><FiChevronRight aria-hidden="true" /></button>
      <span className="post-media-count" aria-live="polite">{t.postNumber(currentPhotoIndex + 1, photos.length)}</span>
    </div>}
    {isSnapshot && <figure className="post-illustration">
      <img src={`${ASSETS}/post-seaside.png`} alt={t.imageAlt} />
      <figcaption>{t.artLabel}</figcaption>
    </figure>}
    <div className="post-bottomline">
      <span>{label || (isSnapshot ? t.feedSnapshot : feedSource === "stale" ? t.feedStale : t.feedLive)}</span>
      <a href={post.permalink} target="_blank" rel="noopener noreferrer">{t.openPost}<FaArrowRight aria-hidden="true" /></a>
    </div>
  </article>;
}

export function App() {
  const [language, setLanguage] = useState(readStoredLanguage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [posts, setPosts] = useState([SNAPSHOT]);
  const [feedSource, setFeedSource] = useState("snapshot");
  const [pinnedPost, setPinnedPost] = useState(null);
  const [pinState, setPinState] = useState("loading");
  const [postIndex, setPostIndex] = useState(0);
  const [copiedId, setCopiedId] = useState("");
  const [clickSparkle, setClickSparkle] = useState(null);
  const [visitDate, setVisitDate] = useState(() => new Date());
  const page = resolvePage();
  const t = copy[language];

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage); } catch { /* Storage is optional. */ }
  }

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : language === "ja" ? "ja" : "en";
  }, [language]);

  useEffect(() => {
    const timer = window.setInterval(() => setVisitDate(new Date()), 60_000);
    return () => window.clearInterval(timer);
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
          setPinnedPost(nextPinned);
          setPinState(nextPinned ? (feed.pinnedStatus === "stale" ? "stale" : "live") : (feed.pinnedStatus === "none" ? "none" : "unavailable"));
        } else if (feed.status === "ok" || feed.status === "stale") {
          setPinnedPost(nextPinned);
          setPinState(nextPinned ? (feed.status === "stale" ? "stale" : "live") : (feed.status === "stale" ? "unavailable" : "none"));
        } else {
          setPinState((current) => current === "live" ? "stale" : current === "loading" ? "unavailable" : current);
        }
        const originals = Array.isArray(feed.posts) ? feed.posts.filter((post) => isOriginalPost(post) && post.id !== nextPinned?.id) : [];
        if (feed.status === "ok" || feed.status === "stale") {
          setPosts(originals); setFeedSource(feed.status === "stale" ? "stale" : "live");
          setPostIndex((index) => Math.min(index, Math.max(0, originals.length - 1)));
        } else {
          setPosts([SNAPSHOT]); setFeedSource("snapshot"); setPostIndex(0);
        }
      } catch {
        if (mounted) {
          setFeedSource((current) => current === "live" ? "stale" : current);
          setPinState((current) => current === "live" ? "stale" : current === "loading" ? "unavailable" : current);
        }
      }
    }
    refreshFeed();
    const interval = window.setInterval(refreshFeed, 15 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) refreshFeed(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { mounted = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [page]);

  async function copyId(id) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(""), 2400);
    } catch { setCopiedId(""); }
  }

  function showClickSparkle(event) {
    const control = event.target.closest("button, a");
    if (!control || event.detail === 0) return;
    const id = Date.now() + "-" + Math.random();
    setClickSparkle({ id, x: event.clientX, y: event.clientY });
    window.setTimeout(() => setClickSparkle((current) => current?.id === id ? null : current), 700);
  }

  const socials = [
    { icon: FaXTwitter, className: "x", title: "X", sub: t.xSub, href: "https://x.com/loveyong07" },
    { icon: FaLine, className: "line", title: "LINE", sub: t.lineSub, href: "https://line.me/ti/p/LSaMZQcRLu" },
    { icon: FaTelegram, className: "telegram", title: "Telegram", sub: t.telegramSub, href: "https://t.me/loveyong07" },
    { icon: FaWeixin, className: "wechat", title: language === "zh" ? "微信" : "WeChat", sub: t.wechatSub, onClick: () => copyId(HANDLE), copyLabel: t.copy + ": " + HANDLE, copied: copiedId === HANDLE ? t.copied : undefined },
    { icon: FaQq, className: "qq", title: "QQ", sub: t.qqSub, onClick: () => copyId("3437702786"), copyLabel: t.copy + ": 3437702786", copied: copiedId === "3437702786" ? t.copied : undefined },
    { icon: FaEnvelope, className: "email", title: language === "zh" ? "邮箱" : language === "ja" ? "メール" : "Email", sub: t.emailSub, href: "mailto:fyh20071004@gmail.com" },
  ];

  const header = <header className="site-header">
    <a className="brand" href={pagePaths.home} aria-label={t.homeLinkLabel}>
      <span className="brand-script">Nest<PiFlowerLight aria-hidden="true" /></span>
      <span className="brand-caption">A LITTLE NEST</span>
    </a>
    <nav className={"site-nav " + (menuOpen ? "is-open" : "")} id="site-navigation" aria-label={t.navLabel}>
      {navIds.map((id, index) => <a key={id} className={page === id ? "active" : ""} href={pagePaths[id]} aria-current={page === id ? "page" : undefined}>{t.nav[index]}</a>)}
    </nav>
    <div className="language-picker" role="group" aria-label={t.languageLabel}>
      {[["zh", "中文"], ["ja", "日本語"], ["en", "EN"]].map(([code, label]) => <button key={code} className={language === code ? "active" : ""} onClick={() => changeLanguage(code)} aria-pressed={language === code}>{label}</button>)}
    </div>
    <button className="menu-toggle" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? t.closeMenu : t.openMenu} aria-expanded={menuOpen} aria-controls="site-navigation">{menuOpen ? <FiX /> : <FiMenu />}</button>
  </header>;

  const postsSection = <div className="posts-section" id="posts">
    <section className="posts-group" aria-label={t.pinnedHeading}>
      <div className="section-heading"><PiPushPinFill aria-hidden="true" /><h2>{t.pinnedHeading}</h2></div>
      {pinnedPost ? <PostCard key={pinnedPost.id} post={pinnedPost} feedSource={pinState} language={language} t={t} label={pinState === "stale" ? t.pinnedStale : t.pinnedLive} />
        : <div className="pinned-placeholder" role="status">{pinState === "loading" ? t.pinnedLoading : pinState === "none" ? t.pinnedNone : t.pinnedUnavailable}</div>}
    </section>
    <section className="posts-group" aria-label={t.postsHeading}>
      <div className="section-heading"><HiOutlineSparkles aria-hidden="true" /><h2>{t.postsHeading}</h2></div>
      {posts.length > 0 ? <PostCard key={posts[postIndex].id} post={posts[postIndex]} feedSource={feedSource} language={language} t={t} />
        : <div className="pinned-placeholder" role="status">{t.noPosts}</div>}
      {posts.length > 1 && <div className="post-controls">
        <button onClick={() => setPostIndex((postIndex - 1 + posts.length) % posts.length)} aria-label={t.prevPost}><FiChevronLeft /></button>
        <span>{t.postNumber(postIndex + 1, posts.length)}</span>
        <button onClick={() => setPostIndex((postIndex + 1) % posts.length)} aria-label={t.nextPost}><FiChevronRight /></button>
      </div>}
    </section>
  </div>;

  const contactsSection = <div className="contacts-section" id="contact">
    <div className="contacts-heading-row">
      <div className="section-heading"><HiOutlineSparkles aria-hidden="true" /><h2>{t.contactsHeading}</h2></div>
      <span className="micro-slogan">{t.footerSmall}</span>
    </div>
    <div className="contact-grid">{socials.map((social) => <ContactTile key={social.title} {...social} />)}</div>
    <div className="email-row">
      <span><FaEnvelope aria-hidden="true" />{t.emailHeading}</span>
      <div>{mailboxes.map(({ label, address }) => <a key={address} href={"mailto:" + address} title={address}>{label}<span>{address}</span></a>)}</div>
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
        <h1><span>Welcome</span><span>to my little nest<em>！</em></span></h1>
        <div className="ornament" aria-hidden="true"><span /><PiFlowerLight /><span /></div>
        <div className="profile">
          <img src={ASSETS + "/x-avatar.jpg"} alt={t.profileAlt} />
          <div><strong>{t.name}</strong><a href="https://x.com/loveyong07" target="_blank" rel="noopener noreferrer">@{HANDLE}</a></div>
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
        <div className="route-page-title"><h1>{t.pageTitle[page]}</h1></div>
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
