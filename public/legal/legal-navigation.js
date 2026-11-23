import { bindSwipeSwitch } from "/assets/swipe-switch.js";

const navigation = document.querySelector(".legal-nav");
let swipe;

function connectLocale() {
  swipe?.destroy();
  const language = { "#ja": "ja", "#en": "en" }[location.hash] || "zh-CN";
  const itemSelector = `a[lang="${language}"]`;
  const links = [...navigation.querySelectorAll(itemSelector)];
  swipe = bindSwipeSwitch({
    control: navigation,
    itemSelector,
    activeIndex: links.findIndex((link) => link.hasAttribute("aria-current")),
    onChange: (index) => location.assign(links[index].href),
    onPosition: (position) => navigation.style.setProperty("--switch-position", String(position)),
  });
}

navigation.addEventListener("click", (event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest("a");
  if (!link || link.hasAttribute("aria-current")) return;
  event.preventDefault();
  swipe.select(link.dataset.legalPage === "privacy" ? 0 : 1);
});

window.addEventListener("hashchange", connectLocale);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) connectLocale();
});
connectLocale();
