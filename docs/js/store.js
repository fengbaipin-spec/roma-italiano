// Everything the app remembers lives in this phone's browser storage, under one prefix.
const PREFIX = "rmi.";

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) {}
  }
};

export const DEFAULTS = {
  rate: 0.8, voiceIt: null, voiceEn: null,
  exOpen: false, playEx: false,
  essayView: "sent", essayZh: true, essayEn: true, essayHide: false, echo: false,
  newPerDay: 10, newFrom: 1, autoSay: true,
  talkRole: "B", talkZh: true, talkEn: true, recognize: false,
  reviewSrc: "recent", reviewDays: 7, reviewVol: 1, reviewWhole: false, reviewDir: "it", reviewN: 20
};
export const settings = Object.assign({}, DEFAULTS, store.get("settings", {}));
export const saveSettings = () => store.set("settings", settings);

// starred words (by headword) and essays marked as learned (by "B2-11" style key)
export const stars = new Set(store.get("stars", []));
export const learned = new Set(store.get("learned", []));
export const saveStars = () => store.set("stars", [...stars]);
export const saveLearned = () => store.set("learned", [...learned]);
// dialogues whose role-play has been finished at least once
export const talked = new Set(store.get("talked", []));
export const saveTalked = () => store.set("talked", [...talked]);
