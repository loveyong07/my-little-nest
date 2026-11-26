import { X_USERNAME } from "../../shared/x-account.mjs";

export const ASSETS = "/assets";
export const SITE_SOURCE_REPOSITORY = "https://github.com/loveyong07/my-little-nest";
export const STARRY_GAL_REPOSITORY = "https://github.com/loveyong07/loveyong-starrygal";
export const BNB_WALLET_ADDRESS = "0xec3b3026faa3091baa812ae2793ee2c3a955959a";
export const TIP_YUKI_IMAGE = `${ASSETS}/tip-yuki.webp`;

export const tipChannels = [
  { id: "wechat", label: "WeChat Pay", qr: `${ASSETS}/tip-wechat-qr.webp`, tone: "wechat" },
  { id: "alipay", label: "Alipay", qr: `${ASSETS}/tip-alipay-qr.webp`, tone: "alipay" },
  { id: "usdt", label: "BNB USDT", qr: `${ASSETS}/tip-bnb-usdt-qr.webp`, address: BNB_WALLET_ADDRESS, tone: "usdt" },
  { id: "usdc", label: "BNB USDC", qr: `${ASSETS}/tip-bnb-usdc-qr.webp`, address: BNB_WALLET_ADDRESS, tone: "usdc" },
];

export { X_USERNAME };
export const QQ_NUMBER = "3437702786";
export const WHATSAPP_USERNAME = "@loveyong07";
export const FALLBACK_AVATAR = `${ASSETS}/x-avatar.jpg`;
export const SNAPSHOT = {
  id: "2103361629748682978",
  text: "但愿人长久，千里共婵娟\n\n🥮中秋节快乐🥮\n\n我最喜欢吃豆沙月饼了😋",
  created_at: "2026-09-25",
  author: "初咏",
  avatar: FALLBACK_AVATAR,
  permalink: `https://x.com/${X_USERNAME}/status/2103361629748682978`,
};

export const navIds = ["home", "posts", "contact"];

export const mailboxes = [{ label: "Gmail", address: "loveyong2007@gmail.com" }];

// Account destinations belong here; components only decide how to present them.
export const contactChannels = [
  { id: "x", title: "X", descriptionKey: "xSub" },
  { id: "line", title: "LINE", descriptionKey: "lineSub", href: "https://line.me/ti/p/LSaMZQcRLu" },
  { id: "telegram", title: "Telegram", descriptionKey: "telegramSub", href: "https://t.me/loveyong07" },
  { id: "discord", title: "Discord", descriptionKey: "discordSub", account: "loveyong_07" },
  { id: "whatsapp", title: "WhatsApp", descriptionKey: "whatsappSub", account: WHATSAPP_USERNAME },
  { id: "qq", title: "QQ", descriptionKey: "qqSub", account: QQ_NUMBER },
];

export function xProfileUrl(username = X_USERNAME) {
  return `https://x.com/${username}`;
}
