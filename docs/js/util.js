// Small helpers shared by every view: DOM shortcuts, icons, the toast, the play button and the bottom sheet.
export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const wordsIn = text => text.split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length;
export const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// where the router has been, so a view can tell whether "back" returns to the list it came from
export const nav = { prev: "", current: "" };

const svg = (body, cls) => `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const line = d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
export const ICON = {
  spk: svg('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path class="w1" d="M16 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path class="w2" d="M18.5 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>', "spk"),
  star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
  play: svg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'),
  pause: svg('<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>'),
  next: svg('<path d="M5.5 5.5l9 6.5-9 6.5z" fill="currentColor"/><rect x="16" y="5.5" width="2.6" height="13" rx="1" fill="currentColor"/>'),
  close: svg(line("M6 6l12 12M18 6L6 18")),
  search: svg('<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>' + line("M16 16l4.5 4.5")),
  back: svg(line("M15 5l-7 7 7 7")),
  fwd: svg(line("M9 5l7 7-7 7")),
  down: svg(line("M6 9l6 6 6-6")),
  check: svg('<path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')
};

let toastTimer = 0;
export function toast(text, ms = 2600) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

// the round play button above the tab bar; views that can read a list aloud set it, others hide it
export function setFab(label, onClick) {
  const fab = $("fab");
  fab.onclick = onClick || null;
  fab.hidden = !onClick;
  if (onClick) fab.innerHTML = ICON.play + `<span>${esc(label)}</span>`;
}

// a bottom sheet; the phone's back gesture closes it instead of leaving the page
let sheetOpen = false;
export function openSheet(title, html, onClick) {
  $("sheetTitle").textContent = title;
  $("sheetBody").innerHTML = html;
  $("sheetBody").onclick = onClick;
  $("sheet").hidden = $("sheetBack").hidden = false;
  sheetOpen = true;
  history.pushState({ sheet: true }, "");
  $("sheet").querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" });
}
// then runs once the sheet's history entry is gone, so it can safely move to another page
export function closeSheet(fromHistory, then) {
  if (!sheetOpen) { if (then) then(); return; }
  sheetOpen = false;
  $("sheet").hidden = $("sheetBack").hidden = true;
  document.querySelectorAll(".wd.on").forEach(el => el.classList.remove("on"));
  if (fromHistory) { if (then) then(); return; }
  if (then) addEventListener("popstate", () => setTimeout(then, 0), { once: true });
  history.back();
}
addEventListener("popstate", () => closeSheet(true));
addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
$("sheetBack").onclick = () => closeSheet();
$("sheetClose").onclick = () => closeSheet();
$("sheetClose").innerHTML = ICON.close;
