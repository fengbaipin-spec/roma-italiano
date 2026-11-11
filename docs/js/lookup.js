// Finds what a word in a sentence means: the dictionary entry for its basic form, a set phrase it belongs to,
// or a short note for grammar words. Sentences use inflected forms (vorrei, ragazze, prenotato) while the
// dictionary lists basic forms, so the index also holds the forms Italian grammar makes from each headword.
// No DOM here, so it can be tested on its own with Node.
import { GLOSS, STOP } from "./gloss.js";
import { numberValue } from "./numbers.js";

const LETTERS = "A-Za-zÀ-ÖØ-öø-ÿ";
const WORD = new RegExp(`[${LETTERS}]+(?:['’][${LETTERS}]+)*['’]?`, "g");
export const wordsOf = text => text.match(WORD) || [];
// a sentence cut into [isWord, text] pieces, for drawing each word as something to tap
export function splitWords(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    if (m.index > last) out.push([false, text.slice(last, m.index)]);
    out.push([true, m[0]]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push([false, text.slice(last)]);
  return out;
}

const low = s => s.toLowerCase().replace(/[’‘]/g, "'");
const ARTICLES = new Set(["il", "lo", "la", "i", "gli", "le", "un", "uno", "una"]);
// an elided article or article+preposition in front of a word: l'affitto, dell'ufficio, quest'anno
const core = t => t.replace(/^(?:l|un|dell|all|dall|nell|sull|quest|quell)'(?=[a-zà-ÿ])/, "");
const PRONOUNS = new Set(["io", "tu", "lui", "lei", "noi", "voi", "loro", "che", "mi", "ti", "si", "ci", "vi", "ce", "se", "già"]);
const AUX = new Set(("ho hai ha abbiamo avete hanno sono sei è siamo siete ero eri era eravamo eravate erano avevo avevi aveva " +
  "avevamo avevate avevano sarei saresti sarebbe saremmo sareste sarebbero avrei avresti avrebbe avremmo avreste avrebbero " +
  "sia siate siano abbia abbiate abbiano fossi fosse avessi avesse").split(" "));

/* ---------- word forms ---------- */
const TENSES = {
  are: [["现在时", "o i a iamo ate ano"], ["未完成过去时", "avo avi ava avamo avate avano"], ["将来时", "erò erai erà eremo erete eranno"],
    ["条件式", "erei eresti erebbe eremmo ereste erebbero"], ["虚拟式", "i iamo iate ino"], ["未完成虚拟式", "assi asse assimo aste assero"],
    ["远过去时", "ai asti ò ammo arono"], ["副动词", "ando"], ["过去分词", "ato ata ati ate"], ["现在分词", "ante anti"]],
  ere: [["现在时", "o i e iamo ete ono"], ["未完成过去时", "evo evi eva evamo evate evano"], ["将来时", "erò erai erà eremo erete eranno"],
    ["条件式", "erei eresti erebbe eremmo ereste erebbero"], ["虚拟式", "a iamo iate ano"], ["未完成虚拟式", "essi esse essimo este essero"],
    ["远过去时", "ei etti esti é è ette emmo erono ettero"], ["副动词", "endo"], ["过去分词", "uto uta uti ute"], ["现在分词", "ente enti"]],
  ire: [["现在时", "o i e iamo ite ono isco isci isce iscono"], ["未完成过去时", "ivo ivi iva ivamo ivate ivano"],
    ["将来时", "irò irai irà iremo irete iranno"], ["条件式", "irei iresti irebbe iremmo ireste irebbero"],
    ["虚拟式", "a iamo iate ano isca iscano"], ["未完成虚拟式", "issi isse issimo iste issero"], ["远过去时", "ii isti ì immo irono"],
    ["副动词", "endo"], ["过去分词", "ito ita iti ite"], ["现在分词", "ente enti"]]
};

// verbs whose forms do not follow the pattern; prefixed compounds (ottenere, avvenire, rifare…) share them when the flag is set
const IRREGULAR = [
  ["essere", "sono sei è siamo siete ero eri era eravamo eravate erano sarò sarai sarà saremo sarete saranno sarei saresti sarebbe saremmo sareste sarebbero sia siate siano fossi fosse fossimo foste fossero fui fosti fu fummo furono sii stato stata stati state essendo", false],
  ["avere", "ho hai ha abbiamo avete hanno avevo avevi aveva avevamo avevate avevano avrò avrai avrà avremo avrete avranno avrei avresti avrebbe avremmo avreste avrebbero abbia abbiate abbiano avessi avesse avessimo aveste avessero ebbi avesti ebbe avemmo ebbero abbi avuto avuta avuti avute avendo", false],
  ["andare", "vado vai va andiamo andate vanno andavo andavi andava andavamo andavate andavano andrò andrai andrà andremo andrete andranno andrei andresti andrebbe andremmo andreste andrebbero vada vadano andassi andasse andassimo andaste andassero andai andò andarono va' andato andata andati andate andando", false],
  ["fare", "faccio fai fa facciamo fate fanno facevo facevi faceva facevamo facevate facevano farò farai farà faremo farete faranno farei faresti farebbe faremmo fareste farebbero faccia facciate facciano facessi facesse facessimo faceste facessero feci facesti fece facemmo fecero fa' fatto fatta fatti fatte facendo", true],
  ["dare", "do dai dà diamo date danno davo davi dava davamo davate davano darò darai darà daremo darete daranno darei daresti darebbe daremmo dareste darebbero dia diate diano dessi desse dessimo deste dessero diedi detti desti diede dette demmo diedero dettero da' dato data dati date dando", false],
  ["stare", "sto stai sta stiamo state stanno stavo stavi stava stavamo stavate stavano starò starai starà staremo starete staranno starei staresti starebbe staremmo stareste starebbero stia stiate stiano stessi stesse stessimo steste stessero stetti stesti stette stemmo stettero sta' stato stata stati state stando", false],
  ["dire", "dico dici dice diciamo dite dicono dicevo dicevi diceva dicevamo dicevate dicevano dirò dirai dirà diremo direte diranno direi diresti direbbe diremmo direste direbbero dica diciate dicano dicessi dicesse dicessimo diceste dicessero dissi dicesti disse dicemmo dissero di' detto detta detti dette dicendo", true],
  ["venire", "vengo vieni viene veniamo venite vengono venivo venivi veniva venivamo venivate venivano verrò verrai verrà verremo verrete verranno verrei verresti verrebbe verremmo verreste verrebbero venga veniate vengano venissi venisse venissimo veniste venissero venni venisti venne venimmo vennero venuto venuta venuti venute venendo", true],
  ["volere", "voglio vuoi vuole vogliamo volete vogliono volevo volevi voleva volevamo volevate volevano vorrò vorrai vorrà vorremo vorrete vorranno vorrei vorresti vorrebbe vorremmo vorreste vorrebbero voglia vogliate vogliano volessi volesse volessimo voleste volessero volli volesti volle volemmo vollero voluto voluta voluti volute volendo", false],
  ["potere", "posso puoi può possiamo potete possono potevo potevi poteva potevamo potevate potevano potrò potrai potrà potremo potrete potranno potrei potresti potrebbe potremmo potreste potrebbero possa possiate possano potessi potesse potessimo poteste potessero potei potesti poté potemmo poterono potuto potendo", false],
  ["dovere", "devo debbo devi deve dobbiamo dovete devono debbono dovevo dovevi doveva dovevamo dovevate dovevano dovrò dovrai dovrà dovremo dovrete dovranno dovrei dovresti dovrebbe dovremmo dovreste dovrebbero debba deva dobbiate debbano devano dovessi dovesse dovessimo doveste dovessero dovetti dovette dovettero dovuto dovendo", false],
  ["sapere", "so sai sa sappiamo sapete sanno sapevo sapevi sapeva sapevamo sapevate sapevano saprò saprai saprà sapremo saprete sapranno saprei sapresti saprebbe sapremmo sapreste saprebbero sappia sappiate sappiano sapessi sapesse sapessimo sapeste sapessero seppi sapesti seppe sapemmo seppero sappi saputo saputa saputi sapute sapendo", false],
  ["uscire", "esco esci esce usciamo uscite escono esca escano", true],
  ["bere", "bevo bevi beve beviamo bevete bevono bevevo bevevi beveva bevevamo bevevate bevevano berrò berrai berrà berremo berrete berranno berrei berresti berrebbe berremmo berreste berrebbero beva bevano bevessi bevesse bevvi bevve bevvero bevuto bevuta bevuti bevute bevendo", false],
  ["tenere", "tengo tieni tiene teniamo tenete tengono terrò terrai terrà terremo terrete terranno terrei terresti terrebbe terremmo terreste terrebbero tenga tengano tenni tenne tennero", true],
  ["rimanere", "rimango rimani rimane rimaniamo rimanete rimangono rimarrò rimarrai rimarrà rimarremo rimarrete rimarranno rimarrei rimarresti rimarrebbe rimarremmo rimarreste rimarrebbero rimanga rimangano rimasi rimase rimasero rimasto rimasta rimasti rimaste", false],
  ["piacere", "piaccio piaci piace piacciamo piacete piacciono piaccia piacciano piacqui piacque piacquero piaciuto piaciuta piaciuti piaciute", true],
  ["scegliere", "scelgo scegli sceglie scegliamo scegliete scelgono scelga scelgano scelsi scelse scelsero", false],
  ["salire", "salgo salgono salga salgano", true],
  ["morire", "muoio muori muore muoiono muoia muoiano", false],
  ["sedere", "siedo siedi siede siedono sieda siedano", true],
  ["cogliere", "colgo colgono colga colgano colsi colse colsero", true],
  ["togliere", "tolgo tolgono tolga tolgano tolsi tolse tolsero", true],
  ["vivere", "vivrò vivrai vivrà vivremo vivrete vivranno vivrei vivresti vivrebbe vivremmo vivreste vivrebbero vissi visse vissero", true],
  ["vedere", "vedrò vedrai vedrà vedremo vedrete vedranno vedrei vedresti vedrebbe vedremmo vedreste vedrebbero vidi vide videro", true],
  ["cadere", "cadrò cadrà cadremo cadrei cadrebbe caddi cadde caddero", true],
  ["valere", "valgo valgono valga varrò varrà varrei varrebbe valsi valse", true],
  ["parere", "paio pare paiono paia parrà parrebbe parve", false],
  ["parire", "paio pare paiono paia parve parvero", true],
  ["porre", "pongo poni pone poniamo ponete pongono ponevo poneva ponevano porrò porrà porremo porrei porrebbe ponga pongano ponessi ponesse posi pose posero ponendo", true],
  ["durre", "duco duci duce duciamo ducete ducono ducevo duceva ducevano durrò durrà durremo durrei durrebbe duca ducano ducessi ducesse dussi dusse dussero ducendo", true],
  ["trarre", "traggo trai trae traiamo traete traggono traevo traeva trarrò trarrà trarrei trarrebbe tragga traggano traessi traesse trassi trasse trassero traendo", true],
  ["nascere", "nacqui nacque nacquero", true],
  ["conoscere", "conobbi conobbe conobbero", true],
  ["prendere", "presi prese presero", true],
  ["mettere", "misi mise misero", true],
  ["scrivere", "scrissi scrisse scrissero", true],
  ["leggere", "lessi lesse lessero", true],
  ["chiedere", "chiesi chiese chiesero", true],
  ["rispondere", "risposi rispose risposero", true],
  ["correre", "corsi corse corsero", true],
  ["chiudere", "chiusi chiuse chiusero", true],
  ["decidere", "decisi decise decisero", true],
  ["perdere", "persi perse persero", true],
  ["rendere", "resi rese resero", true],
  ["scendere", "scesi scese scesero", true],
  ["vincere", "vinsi vinse vinsero", true],
  ["piangere", "piansi pianse piansero", true],
  ["rompere", "ruppi ruppe ruppero", true],
  ["pingere", "pinsi pinse pinsero", true],
  ["giungere", "giunsi giunse giunsero", true],
  ["fingere", "finsi finse finsero", true],
  ["stringere", "strinsi strinse strinsero", true],
  ["volgere", "volsi volse volsero", true],
  ["spegnere", "spensi spense spensero", true],
  ["crescere", "crebbi crebbe crebbero", true],
  ["accorgere", "accorsi accorse accorsero", true]
];

// past participles that do not end in -ato, -uto, -ito; the key is the end of the infinitive
const PARTICIPLES = [
  ["prendere", "preso"], ["mettere", "messo"], ["scrivere", "scritto"], ["leggere", "letto"], ["reggere", "retto"], ["teggere", "tetto"],
  ["friggere", "fritto"], ["struggere", "strutto"], ["dirigere", "diretto"], ["redigere", "redatto"], ["rispondere", "risposto"],
  ["nascondere", "nascosto"], ["chiedere", "chiesto"], ["vedere", "visto"], ["perdere", "perso"], ["rendere", "reso"], ["scendere", "sceso"],
  ["pendere", "peso"], ["cendere", "ceso"], ["tendere", "teso"], ["fendere", "feso"], ["correre", "corso"], ["vivere", "vissuto"],
  ["scegliere", "scelto"], ["togliere", "tolto"], ["cogliere", "colto"], ["sciogliere", "sciolto"], ["volgere", "volto"], ["giungere", "giunto"],
  ["piangere", "pianto"], ["spingere", "spinto"], ["pingere", "pinto"], ["fingere", "finto"], ["stringere", "stretto"], ["tingere", "tinto"],
  ["vincere", "vinto"], ["rompere", "rotto"], ["cuocere", "cotto"], ["nascere", "nato"], ["chiudere", "chiuso"], ["cludere", "cluso"],
  ["ludere", "luso"], ["cidere", "ciso"], ["ridere", "riso"], ["videre", "viso"], ["succedere", "successo"], ["concedere", "concesso"],
  ["muovere", "mosso"], ["scuotere", "scosso"], ["cutere", "cusso"], ["primere", "presso"], ["fondere", "fuso"], ["solvere", "solto"],
  ["sumere", "sunto"], ["valere", "valso"], ["parere", "parso"], ["parire", "parso"], ["rimanere", "rimasto"], ["mergere", "merso"],
  ["spargere", "sparso"], ["orgere", "orto"], ["spegnere", "spento"], ["aprire", "aperto"], ["offrire", "offerto"], ["soffrire", "sofferto"],
  ["coprire", "coperto"], ["morire", "morto"], ["fare", "fatto"], ["dire", "detto"], ["durre", "dotto"], ["porre", "posto"], ["trarre", "tratto"],
  ["essere", "stato"], ["venire", "venuto"], ["persuadere", "persuaso"], ["vadere", "vaso"], ["espellere", "espulso"], ["ardere", "arso"],
  ["tacere", "taciuto"], ["piacere", "piaciuto"], ["scere", "sciuto"]
];

// spelling at the join of stem and ending: cerc+i → cerchi, studi+iamo → studiamo, mangi+erò → mangerò
function join(stem, end, hard) {
  if (/^[ie]/.test(end)) {
    if (hard && /[cg]$/.test(stem)) return stem + "h" + end;
    if (end[0] === "i" && stem.endsWith("i")) return stem + end.slice(1);
    if (end[0] === "e" && /[cg]i$/.test(stem)) return stem.slice(0, -1) + end;
  }
  return stem + end;
}
const fourWays = pp => [pp, pp.slice(0, -1) + "a", pp.slice(0, -1) + "i", pp.slice(0, -1) + "e"];

// every form of a verb, as [form, label]
function verbForms(inf) {
  const out = [[inf, "原形"]];
  const m = inf.match(/^(.+)(are|ere|ire)$/);
  if (m) {
    for (const [label, ends] of TENSES[m[2]]) for (const end of ends.split(" ")) out.push([join(m[1], end, m[2] === "are"), label]);
  }
  for (const [base, forms, compounds] of IRREGULAR) {
    if (inf === base || (compounds && inf.endsWith(base))) {
      const prefix = inf.slice(0, inf.length - base.length);
      for (const f of forms.split(" ")) out.push([prefix + f, "变位"]);
    }
  }
  for (const [end, pp] of PARTICIPLES) {
    if (inf.endsWith(end)) {
      const prefix = inf.slice(0, inf.length - end.length);
      for (const f of fourWays(prefix + pp)) out.push([f, "过去分词"]);
      break;
    }
  }
  return out;
}

// number of a noun; also gender and the -mente adverb of an adjective, as [form, label]
function nounForms(w, isNoun) {
  const out = [];
  if (w.length < 3 || /[àèéìòù]$/.test(w)) return out;
  const stem = w.slice(0, -1), last = w.slice(-1);
  if (last === "o") {
    if (/[cg]o$/.test(w)) out.push([stem + "hi", "复数"], [stem + "i", "复数"]);
    else if (w.endsWith("io")) out.push([stem, "复数"], [stem + "i", "复数"]);
    else out.push([stem + "i", "复数"]);
    if (!isNoun) out.push([stem + "a", "阴性"], [stem + (/[cg]o$/.test(w) ? "he" : "e"), "阴性复数"], [stem + "amente", "副词"]);
  } else if (last === "a") {
    if (/[cg]a$/.test(w)) out.push([stem + "he", "复数"], [stem + "hi", "复数"]);
    else if (/[cg]ia$/.test(w)) out.push([stem + "e", "复数"], [w.slice(0, -2) + "e", "复数"]);
    else out.push([stem + "e", "复数"], [stem + "i", "复数"]);
  } else if (last === "e") {
    out.push([stem + "i", "复数"]);
    if (!isNoun) out.push([/[lr]e$/.test(w) ? stem + "mente" : w + "mente", "副词"]);
  }
  return out;
}

function stemOf(w) {
  const s = w.replace(/(are|ere|ire|rre|o|a|e|i)$/, "");
  return s.length >= 4 ? s : null;
}

/* ---------- the index ---------- */
// headword text → word lists, one per variant: "il figlio / la figlia" → [["figlio"], ["figlia"]]
function variants(head) {
  const out = [];
  for (const part of low(head).replace(/\(.*?\)/g, " ").split("/")) {
    const toks = wordsOf(part.replace(/\.\.\.|…/g, " "));
    if (!toks.length || (toks.length === 1 && ARTICLES.has(toks[0]))) continue;
    // a dialect spelling like 'a would otherwise turn into the preposition a
    if (toks.length === 1 && toks[0].length < 2 && part.trim() !== toks[0]) continue;
    out.push(toks);
  }
  return out;
}
const verbLike = w => /(are|ere|ire|rre)$/.test(w) && w.length >= 4;
// alzarsi → alzare, andarsene → andare, porsi → porre
function infinitiveOf(w) {
  const m = w.match(/^(.+?)r(si|sene|ci|cela|sela|la|ne)$/);
  return m ? m[1] + (/(po|du|tra)$/.test(m[1]) ? "rre" : "re") : w;
}

export function createLookup(entries, conjLabel = () => "变位") {
  const forms = new Map();     // form → [{ e, rank, label, base }]; rank 0 headword, 1 listed form, 2 made form, 3 word of a phrase
  const phraseBy = new Map();  // word → phrases that contain it
  const stems = [];

  const add = (form, e, rank, label, base) => {
    let list = forms.get(form);
    if (!list) forms.set(form, (list = []));
    const old = list.find(h => h.e === e);
    if (!old) list.push({ e, rank, label, base });
    else if (rank < old.rank) Object.assign(old, { rank, label, base });
  };

  for (const e of entries) {
    for (const toks0 of variants(e.it)) {
      const hadArticle = toks0.length > 1 && ARTICLES.has(toks0[0]);
      const toks = (hadArticle ? toks0.slice(1) : toks0).map(core);
      if (toks.length > 1) {
        // a phrase that starts with a verb also matches when the verb is conjugated: fare la spesa → faccio la spesa
        const inf0 = infinitiveOf(toks[0]);
        const first = !hadArticle && verbLike(inf0) ? new Set(verbForms(inf0).map(([f]) => f)) : null;
        const p = { toks, e, first };
        for (const t of new Set([...toks, ...(first || [])])) {
          if (!phraseBy.has(t)) phraseBy.set(t, []);
          phraseBy.get(t).push(p);
        }
        for (const t of toks) {
          if (STOP.has(t) || t.length < 3) continue;
          add(t, e, 3, "", null);
          for (const [f] of nounForms(t, false)) add(f, e, 3, "", null);
        }
        continue;
      }
      const w = toks[0];
      add(w, e, 0, "", w);
      const st = stemOf(w);
      if (st) stems.push([st, e]);
      const inf = hadArticle ? w : infinitiveOf(w);
      if (!hadArticle && verbLike(inf)) {
        for (const [f, label] of verbForms(inf)) add(f, e, 2, label === "原形" && inf !== w ? "不带反身代词的形式" : label, w);
      }
      for (const [f, label] of nounForms(w, hadArticle)) add(f, e, 2, label, w);
    }
    // Italian words in brackets: "piacere (mi piace)", "l'uovo (pl. le uova)"
    for (const m of e.it.matchAll(/\(([^)]*)\)/g)) {
      for (const t of wordsOf(low(m[1]))) if (!STOP.has(t) && t !== "pl") add(core(t), e, 1, "", null);
    }
    // the conjugation line: "io vado · tu vai · lui/lei va …", "io ho fatto …", "(女性用 andata, andate)"
    if (e.conj) {
      const base = variants(e.it)[0]?.at(-1) || null;
      for (const part of e.conj.split("·")) {
        const ws = wordsOf(low(part)).filter(t => !PRONOUNS.has(t));
        // "io ce la faccio" → faccio; but essere and avere are made of auxiliaries only
        const content = ws.filter(t => !AUX.has(t) && !STOP.has(t));
        for (const t of content.length ? content : ws.filter(x => !STOP.has(x) || AUX.has(x))) add(t, e, 1, conjLabel(e), base);
      }
    }
  }
  for (const list of forms.values()) list.sort((a, b) => a.rank - b.rank || a.e.i - b.e.i);

  const find = t => forms.get(t) || [];

  // a pronoun joined to the end: dirmi, parlarne, chiamarti, dimmi, fallo
  function withoutClitic(t) {
    const out = [];
    const short = t.match(/^(di|da|fa|sta|va)([mtclgv])\2/);
    if (short) out.push({ di: "dire", da: "dare", fa: "fare", sta: "stare", va: "andare" }[short[1]]);
    const m = t.match(/(glielo|gliela|glieli|gliele|gliene|melo|mela|meli|mele|mene|telo|tela|teli|tele|tene|selo|sela|seli|sele|sene|celo|cela|celi|cele|cene|velo|vela|veli|vele|vene|gli|mi|ti|si|ci|vi|lo|la|li|le|ne)$/);
    if (m && t.length - m[1].length >= 3) {
      const base = t.slice(0, -m[1].length);
      out.push(base);
      if (base.endsWith("r")) out.push(base + "e", base + "re");
    }
    return out;
  }

  function guess(t) {
    if (t.length < 5) return [];
    const seen = new Set(), out = [];
    for (const [stem, e] of stems.filter(([s]) => t.startsWith(s) && t.length - s.length <= 5).sort((a, b) => b[0].length - a[0].length)) {
      if (!seen.has(e)) { seen.add(e); out.push(e); }
      if (out.length >= 2) break;
    }
    return out;
  }

  // → { word, phrases: [entry], hits: [{ e, rank, label, base }], gloss, glossFor, part: { form, gloss }, guess: [entry], name }
  function lookup(sentence, k) {
    const raws = wordsOf(sentence);
    const raw = raws[k];
    if (!raw) return null;
    const toks = raws.map(w => core(low(w)));
    const t = low(raw);
    const res = { word: raw, phrases: [], hits: [], gloss: GLOSS[t] || null, glossFor: t, part: null, guess: [], name: false };

    // a set phrase around this word: per favore, il permesso di soggiorno, non vedo l'ora, (fare) la spesa
    const at = (p, n, tok) => (n === 0 && p.first ? p.first.has(tok) : p.toks[n] === tok);
    for (const p of phraseBy.get(toks[k]) || []) {
      for (let j = 0; j < p.toks.length; j++) {
        const s = k - j;
        if (!at(p, j, toks[k]) || s < 0 || s + p.toks.length > toks.length) continue;
        if (p.toks.every((_, n) => at(p, n, toks[s + n])) && !res.phrases.includes(p.e)) res.phrases.push(p.e);
      }
    }

    // the word as written, then without what is elided in front of it (l'affitto → affitto)
    let main = t, hits = find(t);
    const el = t.match(/^([a-zà-ÿ]+')(.+)$/);
    if (el) {
      res.part = { form: el[1], gloss: GLOSS[el[1]] || null };
      if (!hits.length) {
        main = el[2];
        hits = find(main);
        if (!res.gloss && GLOSS[main]) { res.gloss = GLOSS[main]; res.glossFor = main; }
      }
    }
    if (!hits.length) {
      for (const b of withoutClitic(main)) {
        hits = find(b).filter(h => h.rank <= 2).map(h => ({ ...h, label: "后面连着代词" }));
        if (hits.length) break;
      }
    }
    // -issimo: bellissimo → bello, utilissima → utile, lunghissimo → lungo
    const sup = !hits.length && main.match(/^(.+?)issim[oaie]$/);
    if (sup) {
      for (const b of [sup[1] + "o", sup[1] + "e", sup[1].replace(/h$/, "") + "o", sup[1]]) {
        hits = find(b).filter(h => h.rank <= 2).map(h => ({ ...h, label: "最高级（-issimo：非常……）", base: h.base || b }));
        if (hits.length) break;
      }
      hits.push(...find("issimo").filter(h => h.rank === 0));
    }
    // for a grammar word the note comes first, and only an entry with exactly this headword is added to it
    if (res.gloss) hits = hits.filter(h => h.rank === 0);
    const shown = new Set(res.phrases);
    for (const h of hits) {
      if (shown.has(h.e) || (h.rank === 3 && res.hits.length)) continue;
      shown.add(h.e);
      res.hits.push(h);
      if (res.hits.length >= 2) break;
    }
    // a number written as a word: trentotto, cinquecentoventi
    const n = !res.hits.length && !res.phrases.length && !res.gloss ? numberValue(main) : null;
    if (n !== null) { res.gloss = ["数字", String(n)]; res.glossFor = main; }
    if (!res.hits.length && !res.phrases.length && !res.gloss) res.guess = guess(main);
    // a capital letter inside a sentence, with nothing better than a phrase that mentions it, is probably a name
    res.name = k > 0 && /^[A-ZÀ-Ö]/.test(raw) && !res.phrases.length && !res.gloss && res.hits.every(h => h.rank === 3);
    return res;
  }

  return { lookup, size: forms.size };
}
