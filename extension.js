/* Gacha Choice v2.0.0 — personal extension for Gacha Forge 1.8.13 on Marinara Engine.
 * Adds "대답 선택지" to the game's Settings rail, with its own page drawn from the game's classes
 * (st-sect / st-plate / st-chips / st-chip) so it follows the chosen UI style. The page reads and sets how often
 * new story beats get reply choices, how many per beat and how many answers each, plus the pick key; the choices
 * themselves are made, shown and saved by gacha-choice-runtime.cjs.
 * Works next to Gacha Forge · Customizer, which adds its own tab the same way: each closes its page when
 * any other tab is clicked. */
(() => {
  "use strict";
  const KEY = "__GF_CHOICE_EXTENSION";
  if (typeof window[KEY] === "function") {
    try { window[KEY](); } catch {}
  }

  const HOST_TAG = "marinara-capability-gacha-forge";
  const API = "/api/gacha-forge/choice-settings";
  const TITLE = "대답 선택지";
  // [value, chip label, description] for each setting the server patch keeps (see gacha-choice-runtime.cjs).
  const FREQS = [
    ["off", "끄기", "새 장면에는 선택지를 만들지 않습니다. 이미 만든 장면의 선택지는 그대로 나옵니다."],
    ["rare", "드물게", "꼭 대답해야 할 순간에만 넣습니다. 대략 장면 다섯 개 중 하나입니다."],
    ["sometimes", "가끔", "대답할 만한 순간에 가끔 넣습니다. 대략 장면 세 개 중 하나입니다."],
    ["often", "자주", "누군가 주인공에게 말을 걸면 대답 선택지를 넣습니다."],
    ["always", "매 장면", "모든 장면에 넣습니다. 말을 거는 장면이 없으면 자연스럽게 만들어 넣습니다."],
  ];
  const PER_BEAT = [[1, "1개"], [2, "2개"], [3, "3개"]];
  const ANSWERS = [["auto", "자동 (2~3)"], [2, "2개"], [3, "3개"], [4, "4개"]];
  const ABOUT = [
    "누군가 주인공에게 말을 걸면 대답 선택지가 뜹니다. 고른 답에 따라 바로 뒤 1~3줄이 달라지고, 그 장면은 같은 흐름으로 이어집니다.",
    "고른 답은 장면에 저장됩니다. 다시 읽으면 고른 답이 그대로 나오고, 기록(백로그)에도 남으며, 다음 장면을 쓸 때 AI가 주인공이 한 말을 이어받습니다.",
    "선택지는 마우스나 ↑ / ↓ 화살표로 고르고 선택 키(기본 F) 또는 Enter로 정합니다.",
    "선택지 버튼은 외형 · 화면의 UI 스타일을 따라 모양과 색이 바뀝니다.",
    "자동 모드는 선택지에서 멈추고, 건너뛰기를 누르면 선택지도 함께 건너뜁니다. 건너뛴 선택지는 저장되지 않습니다.",
  ];
  const life = new AbortController();
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal: life.signal });
  let disposed = false;
  // status: loading | ok | missing (no server patch) | error
  let state = { status: "loading", frequency: "", perBeat: 0, answers: "", note: "" };
  const pick = (d) => ({ frequency: d.frequency, perBeat: d.perBeat, answers: d.answers });

  async function call(method, body) {
    const res = await fetch(API, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) throw Object.assign(Error("missing"), { code: "missing" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok !== true) throw Error((data && data.error) || "HTTP " + res.status);
    return data;
  }
  async function load() {
    try {
      const data = await call("GET");
      state = { status: "ok", ...pick(data), note: "" };
    } catch (e) {
      state = { status: e.code === "missing" ? "missing" : "error", frequency: "", perBeat: 0, answers: "", note: "" };
    }
    paint();
  }
  // Changes one setting: shown at once, then confirmed (or rolled back) by the server.
  async function choose(field, value) {
    if (state.status !== "ok" || value === state[field]) return;
    const before = pick(state);
    state = { ...state, [field]: value, note: "" };
    paint();
    try {
      const data = await call("POST", { [field]: value });
      state = { status: "ok", ...pick(data), note: data.saved ? "" : "저장 파일에 쓰지 못했습니다. 엔진을 다시 시작하면 기본값으로 돌아갑니다." };
    } catch {
      state = { ...state, ...before, note: "바꾸지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }
    paint();
  }

  /* ═════════════ The pick key ═════════════
   * Kept per browser in localStorage, where the game's choice menu (gacha-choice-runtime.cjs) reads it each time
   * it opens. Stored by key position (KeyboardEvent.code), so a key keeps working in the Korean input mode. */
  const KEY_CODE = "gch-key-code", KEY_LABEL = "gch-key-label", DEFAULT_KEY = { code: "KeyF", label: "F" };
  // Arrows move the highlight and Enter always picks; Escape cancels changing the key; the rest are not keys to press alone.
  const NOT_PICK_KEYS = new Set(["ArrowUp", "ArrowDown", "Enter", "NumpadEnter", "Escape", "Tab", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock", "Lang1", "Lang2", "Backspace"]);
  let keyState = { capturing: false, note: "" };
  function readKey() {
    try { return { code: localStorage.getItem(KEY_CODE) || DEFAULT_KEY.code, label: localStorage.getItem(KEY_LABEL) || DEFAULT_KEY.label }; }
    catch { return { ...DEFAULT_KEY }; }
  }
  function writeKey(k) {
    try {
      if (!k || k.code === DEFAULT_KEY.code) { localStorage.removeItem(KEY_CODE); localStorage.removeItem(KEY_LABEL); }
      else { localStorage.setItem(KEY_CODE, k.code); localStorage.setItem(KEY_LABEL, k.label); }
      return true;
    } catch { return false; }
  }
  function keyLabel(e) {
    const c = e.code;
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit\d$/.test(c)) return c.slice(5);
    if (/^Numpad\d$/.test(c)) return "Num " + c.slice(6);
    if (c === "Space") return "Space";
    // Other printable keys show the character they type; anything else shows its code name.
    return e.key && e.key.length === 1 && /[!-~]/.test(e.key) ? e.key.toUpperCase() : c;
  }
  on(document, "keydown", (e) => {
    if (!keyState.capturing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === "Escape") keyState = { capturing: false, note: "" };
    else if (!e.code || NOT_PICK_KEYS.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) keyState = { capturing: true, note: "그 키는 쓸 수 없습니다. 다른 키를 눌러 주세요." };
    else keyState = { capturing: false, note: writeKey({ code: e.code, label: keyLabel(e) }) ? "" : "이 브라우저에 저장하지 못했습니다." };
    paint();
  }, { capture: true });

  /* ═════════════ The page ═════════════ */
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  function plate(title) {
    const p = el("div", "st-plate");
    const hd = el("div", "hd");
    hd.append(el("h3", "", title));
    p.append(hd);
    return p;
  }
  function hint(text) {
    const p = el("p", "hint", text); // the game's own help-text style, as under 장면 지침
    p.style.cssText = "display:block;margin:.7em 0 0";
    return p;
  }
  // A row of the game's chips for one setting; paintPage marks the current value.
  function chipRow(field, choices, label) {
    const row = el("div", "st-chips");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", label);
    for (const [value, text] of choices) {
      const b = el("button", "st-chip", text);
      b.type = "button";
      b.setAttribute("data-gch-field", field);
      b.setAttribute("data-gch-value", String(value));
      on(b, "click", (e) => { e.stopPropagation(); choose(field, value); });
      row.append(b);
    }
    return row;
  }
  // The page is a few plates placed straight into the game's .st-pane, so the pane's own spacing applies.
  function makePage() {
    const freq = plate("선택지 빈도");
    const note = hint("");
    note.setAttribute("data-gch-note", "");
    freq.append(chipRow("frequency", FREQS, "대답 선택지 빈도"), note);
    const amount = plate("선택지 수");
    amount.append(hint("한 장면에 나올 수 있는 선택지 수 (최대)"), chipRow("perBeat", PER_BEAT, "한 장면 최대 선택지 수"),
      hint("선택지 하나에 나오는 답 개수"), chipRow("answers", ANSWERS, "답 개수"));
    const key = plate("선택 키");
    const keyRow = el("div", "st-chips");
    keyRow.setAttribute("role", "group");
    keyRow.setAttribute("aria-label", "선택 키");
    const cur = el("button", "st-chip");
    cur.type = "button";
    cur.disabled = true;
    cur.setAttribute("aria-pressed", "true");
    cur.setAttribute("data-gch-key-cur", "");
    const change = el("button", "st-chip", "바꾸기");
    change.type = "button";
    change.setAttribute("data-gch-key-change", "");
    on(change, "click", (e) => { e.stopPropagation(); keyState = { capturing: !keyState.capturing, note: "" }; paint(); });
    const reset = el("button", "st-chip", "기본값 (F)");
    reset.type = "button";
    reset.setAttribute("data-gch-key-reset", "");
    on(reset, "click", (e) => { e.stopPropagation(); keyState = { capturing: false, note: writeKey(null) ? "" : "이 브라우저에 저장하지 못했습니다." }; paint(); });
    keyRow.append(cur, change, reset);
    const keyNote = hint("");
    keyNote.setAttribute("data-gch-key-note", "");
    key.append(keyRow, keyNote);
    const about = plate("안내");
    for (const line of ABOUT) about.append(hint(line));
    const page = [freq, amount, key, about];
    for (const p of page) p.setAttribute("data-gch-page", "");
    return page;
  }
  function paintPage(root) {
    for (const b of root.querySelectorAll("[data-gch-field]")) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-gch-value") === String(state[b.getAttribute("data-gch-field")])));
      b.disabled = state.status !== "ok" || (b.getAttribute("data-gch-field") !== "frequency" && state.frequency === "off");
    }
    const desc = (FREQS.find(([id]) => id === state.frequency) || [])[2];
    const text = state.status === "loading" ? "설정을 불러오는 중입니다."
      : state.status === "missing" ? "서버 패치(gacha-choice-runtime.cjs)가 적용되어 있지 않습니다. README의 설치 방법을 확인해 주세요."
      : state.status === "error" ? "설정을 불러오지 못했습니다. 화면을 다시 열어 주세요."
      : desc + " 다음에 생성하는 장면부터 적용됩니다.";
    for (const p of root.querySelectorAll("[data-gch-note]")) p.textContent = state.note ? state.note + " " + text : text;
    const k = readKey();
    for (const b of root.querySelectorAll("[data-gch-key-cur]")) b.textContent = keyState.capturing ? "…" : k.label;
    for (const b of root.querySelectorAll("[data-gch-key-change]")) {
      b.textContent = keyState.capturing ? "취소" : "바꾸기";
      b.setAttribute("aria-pressed", String(keyState.capturing));
    }
    for (const b of root.querySelectorAll("[data-gch-key-reset]")) b.disabled = k.code === DEFAULT_KEY.code;
    const keyText = keyState.capturing ? "새로 쓸 키를 누르세요. Esc를 누르면 취소합니다."
      : "선택지가 떠 있을 때 이 키를 누르면 강조된 선택지가 골라집니다. 마우스나 ↑ / ↓로 옮기고, Enter도 항상 동작합니다. 이 기기(브라우저)에만 저장됩니다.";
    for (const p of root.querySelectorAll("[data-gch-key-note]")) p.textContent = keyState.note ? keyState.note + " " + keyText : keyText;
  }
  function gameRoot() { return document.querySelector(HOST_TAG)?.shadowRoot || null; }
  function paint() { const r = gameRoot(); if (r) paintPage(r); }

  /* ═════════════ The tab in Settings ═════════════ */
  let open = false, page = null, hidden = [], deselected = [], titleSwap = null;
  // Writes only real changes: the observer below also sees attribute writes, even ones to the same value.
  const select = (n, v) => { if (n.getAttribute("aria-selected") !== String(v)) n.setAttribute("aria-selected", String(v)); };
  const boundRails = new WeakSet();
  function makeTab() {
    const t = el("button", "st-sect");
    t.type = "button";
    t.setAttribute("role", "tab");
    t.setAttribute("aria-selected", "false");
    t.setAttribute("data-gch-tab", "");
    t.append(el("span", "k", "스토리"), el("span", "n", TITLE));
    on(t, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (disposed || open) return;
      open = true;
      load(); // every time: another device may have changed it
      mount();
    });
    return t;
  }
  // Hands the pane back to the game exactly as it was.
  function closePage() {
    for (const [n, value, priority] of hidden) if (n.isConnected) n.style.setProperty("display", value, priority);
    hidden = [];
    for (const n of deselected) if (n.isConnected) select(n, true);
    deselected = [];
    if (titleSwap && titleSwap.el.isConnected) titleSwap.el.textContent = titleSwap.text;
    titleSwap = null;
    for (const p of page || []) p.remove();
    page = null;
    keyState = { capturing: false, note: "" };
    for (const t of gameRoot()?.querySelectorAll("[data-gch-tab]") || []) select(t, false);
  }
  function showPage(screen, rail, pane, tab) {
    if (!page || !page.every((p) => p.parentNode === pane)) {
      closePage();
      for (const n of Array.from(pane.children)) {
        hidden.push([n, n.style.getPropertyValue("display"), n.style.getPropertyPriority("display")]);
        n.style.setProperty("display", "none", "important");
      }
      page = makePage();
      pane.append(...page);
      paintPage(pane);
      pane.scrollTop = 0;
    }
    // The game re-marks its own tab when it redraws; keep ours as the selected one.
    for (const n of rail.children) {
      if (n === tab || n.getAttribute("aria-selected") !== "true") continue;
      select(n, false);
      if (!deselected.includes(n)) deselected.push(n);
    }
    select(tab, true);
    const h2 = screen.querySelector(".head-id h2") || screen.getRootNode().querySelector?.(".head-id h2");
    if (h2 && h2.textContent !== TITLE) {
      if (!titleSwap || titleSwap.el !== h2) titleSwap = { el: h2, text: h2.textContent };
      h2.textContent = TITLE;
    }
  }
  function mount() {
    if (disposed) return;
    const root = gameRoot();
    const screen = root && Array.from(root.querySelectorAll('[data-screen="settings"]')).find((s) => s.getClientRects().length);
    const rail = screen && screen.querySelector(".st-rail"), pane = screen && screen.querySelector(".st-pane");
    if (!rail || !pane) { if (open) { open = false; closePage(); } return; }
    let tab = rail.querySelector("[data-gch-tab]");
    if (!tab) {
      tab = makeTab();
      const after = rail.querySelector('[data-view="advanced"]');
      if (after) after.after(tab); else rail.append(tab);
    }
    if (!boundRails.has(rail)) {
      boundRails.add(rail);
      // Any other tab, the game's or another extension's, closes this page first.
      on(rail, "click", (e) => {
        if (disposed || e.target.closest?.("[data-gch-tab]")) return;
        if (open) { open = false; closePage(); }
      }, { capture: true });
    }
    if (open) showPage(screen, rail, pane, tab);
  }

  /* ═════════════ Following the game ═════════════ */
  let observed = null, observer = null, scheduled = false;
  function scheduleMount() {
    if (disposed || scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; mount(); }, 80);
  }
  function watch() {
    if (disposed) return;
    const root = gameRoot();
    if (root === observed) return;
    observer?.disconnect();
    observed = root;
    if (!root) return;
    observer = new MutationObserver((records) => {
      for (const r of records) if (!(page && page.some((p) => p.contains(r.target)))) return scheduleMount();
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected", "data-screen"] });
    scheduleMount();
  }
  // The game element is created late and can be replaced; check for it now and then.
  const interval = setInterval(watch, 2000);
  watch();
  load();

  window[KEY] = () => {
    if (disposed) return;
    disposed = true;
    open = false;
    closePage();
    life.abort();
    clearInterval(interval);
    observer?.disconnect();
    for (const t of gameRoot()?.querySelectorAll("[data-gch-tab]") || []) t.remove();
    if (window[KEY]) delete window[KEY];
  };
})();
