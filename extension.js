/* Gacha Choice v1.2.0 — personal extension for Gacha Forge 1.8.13 on Marinara Engine.
 * Adds "대답 선택지" to the game's Settings rail, with its own page drawn from the game's classes
 * (st-sect / st-plate / st-chips / st-chip) so it follows the chosen UI style. The page reads and sets how often
 * new story beats get a reply choice; the choices themselves are made and shown by gacha-choice-runtime.cjs.
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
  const FREQS = [
    ["often", "자주", "누군가 주인공에게 말을 걸면 대답 선택지를 넣습니다."],
    ["sometimes", "가끔", "꼭 대답할 만한 순간에만 가끔 넣습니다. 대략 장면 세 개 중 하나입니다."],
    ["off", "끄기", "새 장면에는 선택지를 만들지 않습니다. 이미 만든 장면의 선택지는 그대로 나옵니다."],
  ];
  const ABOUT = [
    "누군가 주인공에게 말을 걸면 대답 선택지가 2~3개 뜹니다. 고른 답에 따라 바로 뒤 1~3줄만 달라지고, 이후에는 같은 이야기로 이어집니다.",
    "스토리 진행, 보상, 호감도 같은 결과는 바뀌지 않습니다. 고른 답은 다음 장면을 쓸 때 AI에게 전달되지 않습니다.",
    "선택지는 마우스, 휠, ↑ / ↓ 화살표로 고르고 F(또는 Enter)로 정합니다.",
    "선택지 버튼은 외형 · 화면의 UI 스타일을 따라 모양과 색이 바뀝니다.",
    "자동 모드는 선택지에서 멈추고, 건너뛰기를 누르면 선택지도 함께 건너뜁니다. 다시 읽으면 선택지가 다시 뜹니다.",
  ];
  const life = new AbortController();
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal: life.signal });
  let disposed = false;
  // status: loading | ok | missing (no server patch) | error
  let state = { status: "loading", frequency: "", note: "" };

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
      state = { status: "ok", frequency: data.frequency, note: "" };
    } catch (e) {
      state = { status: e.code === "missing" ? "missing" : "error", frequency: "", note: "" };
    }
    paint();
  }
  async function choose(frequency) {
    if (state.status !== "ok" || frequency === state.frequency) return;
    const before = state.frequency;
    state = { ...state, frequency, note: "" };
    paint();
    try {
      const data = await call("POST", { frequency });
      state = { status: "ok", frequency: data.frequency, note: data.saved ? "" : "저장 파일에 쓰지 못했습니다. 엔진을 다시 시작하면 '자주'로 돌아갑니다." };
    } catch {
      state = { ...state, frequency: before, note: "바꾸지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }
    paint();
  }

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
  // The page is a few plates placed straight into the game's .st-pane, so the pane's own spacing applies.
  function makePage() {
    const freq = plate("선택지 빈도");
    const chips = el("div", "st-chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "대답 선택지 빈도");
    for (const [id, label] of FREQS) {
      const b = el("button", "st-chip", label);
      b.type = "button";
      b.setAttribute("data-gch-freq", id);
      on(b, "click", (e) => { e.stopPropagation(); choose(id); });
      chips.append(b);
    }
    const note = hint("");
    note.setAttribute("data-gch-note", "");
    freq.append(chips, note);
    const about = plate("안내");
    for (const line of ABOUT) about.append(hint(line));
    const page = [freq, about];
    for (const p of page) p.setAttribute("data-gch-page", "");
    return page;
  }
  function paintPage(root) {
    for (const b of root.querySelectorAll("[data-gch-freq]")) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-gch-freq") === state.frequency));
      b.disabled = state.status !== "ok";
    }
    const desc = (FREQS.find(([id]) => id === state.frequency) || [])[2];
    const text = state.status === "loading" ? "설정을 불러오는 중입니다."
      : state.status === "missing" ? "서버 패치(gacha-choice-runtime.cjs)가 적용되어 있지 않습니다. README의 설치 방법을 확인해 주세요."
      : state.status === "error" ? "설정을 불러오지 못했습니다. 화면을 다시 열어 주세요."
      : desc + " 다음에 생성하는 장면부터 적용됩니다.";
    for (const p of root.querySelectorAll("[data-gch-note]")) p.textContent = state.note ? state.note + " " + text : text;
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
