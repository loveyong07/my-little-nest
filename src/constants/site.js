import { X_USERNAME } from "../../shared/x-account.mjs";

export const ASSETS = "/assets";
export const STARRY_GAL_REPOSITORY = "https://github.com/loveyong07/loveyong-starrygal";

export { X_USERNAME };
// The WeChat ID happens to match the X username; it is a separate account setting.
export const WECHAT_ID = "loveyong07";
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

export const mailboxes = [{ label: "Gmail", address: "fyh20071004@gmail.com" }];

// Account destinations belong here; components only decide how to present them.
export const contactChannels = [
  { id: "x", title: "X", descriptionKey: "xSub" },
  { id: "line", title: "LINE", descriptionKey: "lineSub", href: "https://line.me/ti/p/LSaMZQcRLu" },
  { id: "telegram", title: "Telegram", descriptionKey: "telegramSub", href: "https://t.me/loveyong07" },
  { id: "discord", title: "Discord", descriptionKey: "discordSub", account: "loveyong_07" },
  { id: "whatsapp", title: "WhatsApp", descriptionKey: "whatsappSub", account: WHATSAPP_USERNAME },
  { id: "wechat", titleKey: "wechatTitle", descriptionKey: "wechatSub", account: WECHAT_ID },
  { id: "qq", title: "QQ", descriptionKey: "qqSub", account: QQ_NUMBER },
];

export function xProfileUrl(username = X_USERNAME) {
  return `https://x.com/${username}`;
}
