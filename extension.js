/* Gacha Choice v1.0.0 — personal extension for Gacha Forge 1.8.13 on Marinara Engine.
 * Adds a "대답 선택지" plate to the game's Settings → 서술 · 고급 page, right under 장면 지침, drawn with the game's
 * own classes (st-plate / st-chips / st-chip) so it follows the chosen UI style. It only reads and sets how often
 * new story beats get a reply choice; the choices themselves are made and shown by gacha-choice-runtime.cjs. */
(() => {
  "use strict";
  const KEY = "__GF_CHOICE_EXTENSION";
  if (typeof window[KEY] === "function") {
    try { window[KEY](); } catch {}
  }

  const HOST_TAG = "marinara-capability-gacha-forge";
  const API = "/api/gacha-forge/choice-settings";
  const FREQS = [
    ["often", "자주", "누군가 주인공에게 말을 걸면 대답 선택지를 넣습니다."],
    ["sometimes", "가끔", "꼭 대답할 만한 순간에만 가끔 넣습니다. 대략 장면 세 개 중 하나입니다."],
    ["off", "끄기", "새 장면에는 선택지를 만들지 않습니다. 이미 만든 장면의 선택지는 그대로 나옵니다."],
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

  /* ═════════════ The plate ═════════════ */
  function makePlate() {
    const plate = document.createElement("div");
    plate.className = "st-plate";
    plate.setAttribute("data-gfc-settings", "");
    const hd = document.createElement("div");
    hd.className = "hd";
    const h3 = document.createElement("h3");
    h3.textContent = "대답 선택지";
    hd.append(h3);
    const chips = document.createElement("div");
    chips.className = "st-chips";
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "대답 선택지 빈도");
    for (const [id, label] of FREQS) {
      const b = document.createElement("button");
      b.className = "st-chip";
      b.type = "button";
      b.textContent = label;
      b.setAttribute("data-gfc-freq", id);
      on(b, "click", (e) => { e.stopPropagation(); choose(id); });
      chips.append(b);
    }
    const p = document.createElement("p");
    p.className = "hint"; // the game's own help-text style, as under 장면 지침
    p.setAttribute("data-gfc-note", "");
    p.style.cssText = "display:block;margin:.7em 0 0";
    plate.append(hd, chips, p);
    return plate;
  }
  function paintPlate(plate) {
    for (const b of plate.querySelectorAll("[data-gfc-freq]")) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-gfc-freq") === state.frequency));
      b.disabled = state.status !== "ok";
    }
    const desc = (FREQS.find(([id]) => id === state.frequency) || [])[2];
    const text = state.status === "loading" ? "설정을 불러오는 중입니다."
      : state.status === "missing" ? "서버 패치(gacha-choice-runtime.cjs)가 적용되어 있지 않습니다. README의 설치 방법을 확인해 주세요."
      : state.status === "error" ? "설정을 불러오지 못했습니다. 화면을 다시 열어 주세요."
      : desc + " 고른 답에 따라 1~3줄만 달라지고 이야기는 같게 이어집니다. 다음에 생성하는 장면부터 적용됩니다.";
    const p = plate.querySelector("[data-gfc-note]");
    if (p) p.textContent = state.note ? state.note + " " + text : text;
  }
  function plates() {
    const host = document.querySelector(HOST_TAG);
    return host && host.shadowRoot ? host.shadowRoot.querySelectorAll("[data-gfc-settings]") : [];
  }
  function paint() { for (const plate of plates()) paintPlate(plate); }

  /* ═════════════ Mounting into Settings → 서술 · 고급 ═════════════ */
  // The game redraws the page on its own changes, so the plate is put back whenever it goes missing.
  function mount() {
    if (disposed) return;
    const root = document.querySelector(HOST_TAG)?.shadowRoot;
    const pane = root && root.querySelector('[data-screen="settings"] .st-pane');
    const anchor = pane && pane.querySelector('[data-field="guidelines.beat"]')?.closest(".st-plate");
    if (!anchor || pane.querySelector("[data-gfc-settings]")) return;
    const plate = makePlate();
    anchor.after(plate);
    paintPlate(plate);
    if (state.status !== "ok") load();
  }
  let observed = null, observer = null, scheduled = false;
  function scheduleMount() {
    if (disposed || scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; mount(); }, 80);
  }
  function watch() {
    if (disposed) return;
    const root = document.querySelector(HOST_TAG)?.shadowRoot || null;
    if (root === observed) return;
    observer?.disconnect();
    observed = root;
    if (!root) return;
    observer = new MutationObserver(scheduleMount);
    observer.observe(root, { childList: true, subtree: true });
    scheduleMount();
  }
  // The game element is created late and can be replaced; check for it now and then.
  const interval = setInterval(watch, 2000);
  watch();
  load();

  window[KEY] = () => {
    if (disposed) return;
    disposed = true;
    life.abort();
    clearInterval(interval);
    observer?.disconnect();
    for (const plate of plates()) plate.remove();
    if (window[KEY]) delete window[KEY];
  };
})();
