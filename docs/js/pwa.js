// Offline support (the service worker), the "new version" banner and the install-to-home-screen prompt.
import { $, toast } from "./util.js";

export const pwa = {
  supported: "serviceWorker" in navigator,
  standalone: window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
  offlineReady: false,
  failed: false,
  prompt: null,
  reg: null
};
const listeners = [];
export const onPwa = fn => listeners.push(fn);
const emit = () => listeners.forEach(fn => fn());

export function initPwa() {
  addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    pwa.prompt = e;
    emit();
  });
  addEventListener("appinstalled", () => {
    pwa.prompt = null;
    toast("已安装到桌面");
    emit();
  });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (!pwa.supported) return;

  const hadController = !!navigator.serviceWorker.controller;
  pwa.offlineReady = hadController;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) {
      // the user accepted an update: reload once so every file comes from the new version
      if (!reloading) { reloading = true; location.reload(); }
      return;
    }
    pwa.offlineReady = true;
    toast("已可离线使用");
    emit();
  });
  navigator.serviceWorker.register("sw.js").then(reg => {
    pwa.reg = reg;
    if (reg.waiting && hadController) offerUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    // an installed app can stay open for days; look for a new version when it comes back to the front
    let lastCheck = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck > 3600e3) {
        lastCheck = Date.now();
        reg.update().catch(() => {});
      }
    });
  }).catch(() => {
    pwa.failed = true;
    emit();
  });
}

function offerUpdate(worker) {
  $("bannerText").textContent = "有新版本";
  $("bannerBtn").textContent = "更新";
  $("bannerBtn").disabled = false;
  $("bannerBtn").onclick = () => {
    $("bannerBtn").disabled = true;
    worker.postMessage("skipWaiting");
  };
  $("banner").hidden = false;
}

export async function promptInstall() {
  const p = pwa.prompt;
  if (!p) return;
  pwa.prompt = null;
  p.prompt();
  await p.userChoice.catch(() => null);
  emit();
}

export async function checkForUpdate() {
  if (!pwa.reg) return "这个浏览器不支持离线和自动更新";
  try {
    await pwa.reg.update();
  } catch (e) {
    return "现在连不上网，稍后再试";
  }
  if (pwa.reg.installing || pwa.reg.waiting) return "发现新版本，下载好后顶部会提示更新";
  return "已经是最新版本";
}
