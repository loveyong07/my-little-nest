const BNB_WALLET_ADDRESS = "0xec3b3026faa3091baa812ae2793ee2c3a955959a";
const TIP_YUKI_IMAGE = "/assets/tip-yuki.webp";

const TIP_CHANNELS = [
  { id: "wechat", label: "WeChat Pay", qr: "/assets/tip-wechat-qr.webp", tone: "wechat" },
  { id: "alipay", label: "Alipay", qr: "/assets/tip-alipay-qr.webp", tone: "alipay" },
  { id: "usdt", label: "BNB USDT", qr: "/assets/tip-bnb-usdt-qr.webp", address: BNB_WALLET_ADDRESS, tone: "usdt" },
  { id: "usdc", label: "BNB USDC", qr: "/assets/tip-bnb-usdc-qr.webp", address: BNB_WALLET_ADDRESS, tone: "usdc" },
];

const TIP_COPY = {
  zh: {
    tipButtonLabel: "打开投喂窗口",
    tipModalTitle: "如果能投喂Yong，Yong会给Yuki买糖果",
    tipClose: "关闭投喂窗口",
    tipCopyAddress: "点击复制钱包地址",
    tipAddressCopied: "已复制",
    tipQrAlt: (label) => `${label} 收款二维码`,
    tipYukiAlt: "Yuki 插画",
    tipYukiPreview: "放大查看 Yuki 图片",
    tipYukiClose: "关闭图片预览",
  },
  ja: {
    tipButtonLabel: "差し入れウィンドウを開く",
    tipModalTitle: "Yongに差し入れしてくれたら、Yukiにキャンディを買ってあげるよ",
    tipClose: "差し入れウィンドウを閉じる",
    tipCopyAddress: "ウォレットアドレスをコピー",
    tipAddressCopied: "コピーしました",
    tipQrAlt: (label) => `${label} のQRコード`,
    tipYukiAlt: "Yuki のイラスト",
    tipYukiPreview: "Yuki の画像を拡大",
    tipYukiClose: "画像プレビューを閉じる",
  },
  en: {
    tipButtonLabel: "Open tip window",
    tipModalTitle: "Treat Yong, and Yong will buy Yuki some candy!",
    tipClose: "Close tip window",
    tipCopyAddress: "Copy wallet address",
    tipAddressCopied: "Copied",
    tipQrAlt: (label) => `${label} QR code`,
    tipYukiAlt: "Yuki illustration",
    tipYukiPreview: "Enlarge Yuki image",
    tipYukiClose: "Close image preview",
  },
};

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvg(viewBox, paths, extraAttrs = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  for (const [key, value] of Object.entries(extraAttrs)) svg.setAttribute(key, value);
  for (const spec of paths) {
    const el = document.createElementNS(SVG_NS, spec.tag || "path");
    for (const [key, value] of Object.entries(spec)) {
      if (key !== "tag") el.setAttribute(key, value);
    }
    svg.append(el);
  }
  return svg;
}

function closeIcon() {
  return createSvg(
    "0 0 24 24",
    [{ d: "M18 6 6 18" }, { d: "m6 6 12 12" }],
    { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
  );
}

function copyIcon() {
  return createSvg(
    "0 0 24 24",
    [
      { tag: "rect", x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" },
      { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" },
    ],
    { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
  );
}

function checkIcon() {
  return createSvg(
    "0 0 24 24",
    [{ tag: "polyline", points: "20 6 9 17 4 12" }],
    { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
  );
}

export function initTipModal({ trigger, getLanguage }) {
  if (!trigger) return null;
  trigger.hidden = false;

  let backdrop = null;
  let dialog = null;
  let closeBtn = null;
  let yukiBtn = null;
  let yukiImg = null;
  let titleText = null;
  let yukiLightbox = null;
  let yukiDialog = null;
  let yukiLightboxImg = null;
  let yukiCloseBtn = null;
  let previousOverflow = "";
  let backgroundStates = [];
  let copyTimer = 0;
  let copyAttempt = 0;
  let activeCopyChannel = "";
  let copiedChannel = "";
  let failedChannel = "";
  const channelNodes = new Map();

  const currentCopy = () => TIP_COPY[getLanguage?.()] ?? TIP_COPY.zh;

  function renderCopyStates() {
    const copy = currentCopy();
    for (const [id, node] of channelNodes) {
      const isCopied = copiedChannel === id;
      const isFailed = failedChannel === id;
      node.button.classList.toggle("is-copied", isCopied);
      node.button.setAttribute("aria-label", `${node.label} ${copy.tipCopyAddress}`);
      node.status.replaceChildren(
        isCopied ? checkIcon() : copyIcon(),
        document.createTextNode(isCopied ? copy.tipAddressCopied : copy.tipCopyAddress),
      );
      if (isFailed) {
        if (!node.fallback) {
          const input = document.createElement("input");
          input.type = "text";
          input.readOnly = true;
          input.className = "tip-wallet-fallback";
          input.value = node.address;
          input.setAttribute("aria-label", `${node.label} ${copy.tipCopyAddress}`);
          node.card.append(input);
          node.fallback = input;
        }
        node.fallback.focus();
        node.fallback.select();
      } else if (node.fallback) {
        node.fallback.remove();
        node.fallback = null;
      }
    }
  }

  function syncLanguage() {
    const copy = currentCopy();
    trigger.setAttribute("aria-label", copy.tipButtonLabel);
    trigger.setAttribute("title", copy.tipButtonLabel);
    if (!backdrop) return;
    if (titleText) titleText.textContent = copy.tipModalTitle;
    if (closeBtn) {
      closeBtn.setAttribute("aria-label", copy.tipClose);
      closeBtn.setAttribute("title", copy.tipClose);
    }
    if (yukiBtn) {
      yukiBtn.setAttribute("aria-label", copy.tipYukiPreview);
      yukiBtn.setAttribute("title", copy.tipYukiPreview);
    }
    if (yukiImg) yukiImg.alt = copy.tipYukiAlt;
    if (yukiDialog) yukiDialog.setAttribute("aria-label", copy.tipYukiPreview);
    if (yukiLightboxImg) yukiLightboxImg.alt = copy.tipYukiAlt;
    if (yukiCloseBtn) {
      yukiCloseBtn.setAttribute("aria-label", copy.tipYukiClose);
      yukiCloseBtn.setAttribute("title", copy.tipYukiClose);
    }
    for (const [, node] of channelNodes) {
      node.img.alt = copy.tipQrAlt(node.label);
    }
    renderCopyStates();
  }

  function closeYukiLightbox({ restoreFocus = true } = {}) {
    if (!yukiLightbox) return;
    yukiLightbox.remove();
    yukiLightbox = null;
    yukiDialog = null;
    yukiLightboxImg = null;
    yukiCloseBtn = null;
    if (backdrop) {
      backdrop.inert = false;
      backdrop.removeAttribute("aria-hidden");
    }
    if (restoreFocus) yukiBtn?.focus();
  }

  function openYukiLightbox() {
    if (!backdrop || yukiLightbox) return;
    const copy = currentCopy();

    backdrop.inert = true;
    backdrop.setAttribute("aria-hidden", "true");

    yukiLightbox = document.createElement("div");
    yukiLightbox.className = "tip-yuki-lightbox";
    yukiLightbox.setAttribute("role", "presentation");
    yukiLightbox.addEventListener("click", (event) => {
      if (event.target === yukiLightbox) closeYukiLightbox();
    });

    yukiDialog = document.createElement("div");
    yukiDialog.className = "tip-yuki-lightbox-content";
    yukiDialog.setAttribute("role", "dialog");
    yukiDialog.setAttribute("aria-modal", "true");
    yukiDialog.setAttribute("aria-label", copy.tipYukiPreview);

    yukiLightboxImg = document.createElement("img");
    yukiLightboxImg.className = "tip-yuki-lightbox-image";
    yukiLightboxImg.src = TIP_YUKI_IMAGE;
    yukiLightboxImg.alt = copy.tipYukiAlt;

    yukiCloseBtn = document.createElement("button");
    yukiCloseBtn.type = "button";
    yukiCloseBtn.className = "tip-yuki-lightbox-close";
    yukiCloseBtn.setAttribute("aria-label", copy.tipYukiClose);
    yukiCloseBtn.setAttribute("title", copy.tipYukiClose);
    yukiCloseBtn.append(closeIcon());
    yukiCloseBtn.addEventListener("click", () => closeYukiLightbox());

    yukiDialog.append(yukiLightboxImg, yukiCloseBtn);
    yukiLightbox.append(yukiDialog);
    document.body.append(yukiLightbox);
    yukiCloseBtn.focus();
  }

  function closeModal() {
    if (!backdrop) return;
    closeYukiLightbox({ restoreFocus: false });
    window.clearTimeout(copyTimer);
    window.removeEventListener("keydown", onKeyDown);
    backdrop.remove();
    backdrop = null;
    dialog = null;
    closeBtn = null;
    yukiBtn = null;
    yukiImg = null;
    titleText = null;
    channelNodes.clear();
    copiedChannel = "";
    failedChannel = "";
    activeCopyChannel = "";
    document.body.style.overflow = previousOverflow;
    for (const state of backgroundStates) {
      state.element.inert = state.inert;
      if (state.ariaHidden === null) state.element.removeAttribute("aria-hidden");
      else state.element.setAttribute("aria-hidden", state.ariaHidden);
    }
    backgroundStates = [];
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  }

  function onKeyDown(event) {
    if (yukiLightbox) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeYukiLightbox();
      } else if (event.key === "Tab") {
        event.preventDefault();
        yukiCloseBtn?.focus();
      }
      return;
    }
    if (!dialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    } else if (event.key === "Tab") {
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        closeBtn?.focus();
        return;
      }
      const focusable = [
        ...dialog.querySelectorAll("button:not(:disabled), input, a[href], [tabindex]:not([tabindex='-1'])"),
      ].filter((element) => {
        if (element.closest('[aria-hidden="true"]')) return false;
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  async function copyAddress(channel) {
    const attempt = ++copyAttempt;
    window.clearTimeout(copyTimer);
    activeCopyChannel = channel.id;
    copiedChannel = "";
    failedChannel = "";
    renderCopyStates();
    try {
      await navigator.clipboard.writeText(channel.address);
      if (attempt !== copyAttempt || activeCopyChannel !== channel.id || !backdrop) return;
      copiedChannel = channel.id;
      failedChannel = "";
      renderCopyStates();
      copyTimer = window.setTimeout(() => {
        copiedChannel = "";
        renderCopyStates();
      }, 2400);
    } catch {
      if (attempt !== copyAttempt || activeCopyChannel !== channel.id || !backdrop) return;
      copiedChannel = "";
      failedChannel = channel.id;
      renderCopyStates();
    }
  }

  function openModal() {
    if (backdrop) return;
    const copy = currentCopy();

    backdrop = document.createElement("div");
    backdrop.className = "tip-modal-backdrop";
    backdrop.setAttribute("role", "presentation");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal();
    });

    dialog = document.createElement("div");
    dialog.className = "tip-modal-panel";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "tip-modal-title");

    closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tip-modal-close";
    closeBtn.setAttribute("aria-label", copy.tipClose);
    closeBtn.setAttribute("title", copy.tipClose);
    closeBtn.append(closeIcon());
    closeBtn.addEventListener("click", closeModal);

    const header = document.createElement("div");
    header.className = "tip-modal-header";

    yukiBtn = document.createElement("button");
    yukiBtn.type = "button";
    yukiBtn.className = "tip-yuki-button";
    yukiBtn.setAttribute("aria-label", copy.tipYukiPreview);
    yukiBtn.setAttribute("title", copy.tipYukiPreview);
    yukiImg = document.createElement("img");
    yukiImg.src = TIP_YUKI_IMAGE;
    yukiImg.alt = copy.tipYukiAlt;
    yukiImg.decoding = "async";
    yukiBtn.append(yukiImg);
    yukiBtn.addEventListener("click", openYukiLightbox);

    titleText = document.createElement("h2");
    titleText.className = "tip-modal-title";
    titleText.id = "tip-modal-title";
    titleText.textContent = copy.tipModalTitle;

    header.append(yukiBtn, titleText);

    const grid = document.createElement("div");
    grid.className = "tip-qr-grid";

    for (const channel of TIP_CHANNELS) {
      const card = document.createElement("div");
      card.className = "tip-qr-card";

      const label = document.createElement("span");
      label.className = `tip-qr-label tip-qr-label-${channel.tone}`;
      label.textContent = channel.label;

      const frame = document.createElement("div");
      frame.className = "tip-qr-frame";
      const img = document.createElement("img");
      img.src = channel.qr;
      img.alt = copy.tipQrAlt(channel.label);
      img.decoding = "async";
      frame.append(img);

      card.append(label, frame);

      if (channel.address) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tip-wallet-copy";
        button.setAttribute("aria-label", `${channel.label} ${copy.tipCopyAddress}`);
        const addrSpan = document.createElement("span");
        addrSpan.textContent = channel.address;
        const statusSpan = document.createElement("span");
        statusSpan.className = "tip-wallet-copy-status";
        statusSpan.append(copyIcon(), document.createTextNode(copy.tipCopyAddress));
        button.append(addrSpan, statusSpan);
        button.addEventListener("click", () => copyAddress(channel));
        card.append(button);
        channelNodes.set(channel.id, {
          card,
          img,
          button,
          status: statusSpan,
          label: channel.label,
          address: channel.address,
          fallback: null,
        });
      } else {
        channelNodes.set(channel.id, {
          card,
          img,
          button: { classList: { toggle() {} }, setAttribute() {} },
          status: { replaceChildren() {} },
          label: channel.label,
          address: "",
          fallback: null,
        });
      }

      grid.append(card);
    }

    dialog.append(closeBtn, header, grid);
    backdrop.append(dialog);

    previousOverflow = document.body.style.overflow;
    backgroundStates = [...document.querySelectorAll("header, .legal-hero, .legal-document")].map((element) => {
      const state = {
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      };
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
      return state;
    });
    document.body.style.overflow = "hidden";
    document.body.append(backdrop);
    trigger.setAttribute("aria-expanded", "true");
    window.addEventListener("keydown", onKeyDown);
    closeBtn.focus();
  }

  trigger.addEventListener("click", openModal);
  syncLanguage();
  return { syncLanguage, closeModal };
}
