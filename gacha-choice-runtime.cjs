'use strict';
// Gacha Forge 1.8.13 cosmetic reply choices (Genshin-style). In-memory only; does not change installed package files.
// Server: the beat prompt may attach one "choice" to a segment, and the beat parser keeps it.
//         GET/POST /api/gacha-forge/choice-settings reads and sets how often (often | sometimes | off).
// Client: the VN shows the options, plays the picked option's 1-3 lines, then continues with the same next segment.
// Load via NODE_OPTIONS --require. Every replacement checks its anchor first; on mismatch nothing is changed.
const { registerHooks } = require('node:module');
const { fileURLToPath } = require('node:url');
const fs = require('node:fs');
const TAG = '[gacha-choice]';
const norm = (p) => p.replace(/\\/g, '/');
const SERVER = /\/capability-runtime-snapshots\/gacha-forge-1\.8\.13-[^/]+\/server\.mjs$/;
const ROUTE = /\/packages\/server\/dist\/routes\/capability-packages\.routes\.js$/i;
const ROUTE_MARKER = 'const entrypoint = await capabilityPackageManager.clientEntrypoint(id);';
const count = (s, n) => s.split(n).length - 1;

// --- server.mjs ---
// The original rule; "off" keeps it word for word.
const NO_CHOICE = 'NEVER offer choices; the player only advances. Do not ask the player to pick anything.';
const HOW_OFTEN = {
  often: 'Include it whenever such a moment exists; at most ONE per beat.',
  sometimes: 'Use it sparingly: only for a moment that really invites an answer, roughly one beat in three. Most beats have none; at most ONE per beat.',
};
const CHOICE_RULES = [
  'The story never branches: the player only advances, and nothing the player picks may change what happens.',
  'ONE COSMETIC REPLY CHOICE. When someone in this beat speaks directly to the protagonist (the player) and the protagonist would naturally answer, you may give that moment a reply choice, like the dialogue options of a gacha visual novel.',
  '@HOW_OFTEN',
  'Attach it to the segment the protagonist is answering (the question or remark itself) as a "choice" field: "choice":{"options":[{"label":"...","lines":[{"speaker":"...","text":"..."}, ...]}, ...]}',
  '- 2 or 3 options. label: what the protagonist answers, short enough for a button, in the same language as the story.',
  '- lines: 1-3 segments that play ONLY when that option is picked: usually the protagonist saying it, then a brief reaction. Same speaker/text/thought fields as segments.',
  '- The protagonist\'s answer lives ONLY in the options: the regular segment right after the choice continues from there and must read naturally after ANY option. Never refer to anything said only inside an option.',
  '- Options change tone and flavour only, never a fact, decision, event, relationship or outcome. Never put the choice on the last segment.',
];
const S_PROMPT_OLD = JSON.stringify(NO_CHOICE) + ',';
const S_PROMPT_NEW = '...__gchPrompt(),';
// Helpers go next to the beat parser, a top-level function, so the routes inside lT() can reach them too.
// The frequency is kept in <data>/gacha-choice-settings.json; the snapshot runs from <data>/capability-runtime-snapshots/<id>/.
const S_FN_OLD = 'function AS(e,t={}){';
const S_FN_NEW = 'function __gchNorm(c){if(!c||typeof c!="object"||!Array.isArray(c.options))return null;let o=[];for(let x of c.options){if(!x||typeof x!="object")continue;let lb=String(x.label??"").trim().slice(0,120);if(!lb)continue;let ls=[];for(let y of Array.isArray(x.lines)?x.lines:[]){if(!y||typeof y!="object")continue;let t=String(y.text??"").trim();if(!t)continue;let z={speaker:String(y.speaker??"").trim().slice(0,80),text:t.slice(0,600)};(y.thought===!0||y.thought==="true")&&(z.thought=!0);ls.push(z);if(ls.length>=3)break}if(ls.length)o.push({label:lb,lines:ls});if(o.length>=3)break}return o.length>=2?{options:o}:null}' +
  'function __gchFile(){try{return{fs:process.getBuiltinModule("node:fs"),url:new URL("../../gacha-choice-settings.json",import.meta.url)}}catch{return null}}' +
  'function __gchFreq(){let g=globalThis;if(g.__gchFreqV===void 0){g.__gchFreqV="often";let f=__gchFile();try{let j=f&&JSON.parse(f.fs.readFileSync(f.url,"utf8"));j&&["often","sometimes","off"].includes(j.frequency)&&(g.__gchFreqV=j.frequency)}catch{}}return g.__gchFreqV}' +
  'function __gchSave(v){globalThis.__gchFreqV=v;let f=__gchFile();try{f.fs.writeFileSync(f.url,JSON.stringify({frequency:v})+"\\n");return!0}catch{return!1}}' +
  'function __gchPrompt(){let f=__gchFreq(),h=' + JSON.stringify(HOW_OFTEN) + ';return f==="off"?[' + JSON.stringify(NO_CHOICE) + ']:' + JSON.stringify(CHOICE_RULES) + '.map(x=>x==="@HOW_OFTEN"?h[f]||h.often:x)}' +
  S_FN_OLD;
const S_ROUTE_OLD = 's.get("/ping",async()=>({ok:!0,id:n.id,version:n.version})),';
const S_ROUTE_NEW = 's.get("/choice-settings",async()=>({ok:!0,frequency:__gchFreq()})),' +
  's.post("/choice-settings",async p=>{let v=String((p&&p.body||{}).frequency||"");if(!["often","sometimes","off"].includes(v))return{ok:!1,error:"bad-request"};return{ok:!0,frequency:v,saved:__gchSave(v)}}),' +
  S_ROUTE_OLD;
const S_SEG_OLD = 'let ie={speaker:l(G.speaker),text:W};(G.thought===!0||G.thought==="true")&&(ie.thought=!0);';
const S_SEG_NEW = S_SEG_OLD + '{let __c=__gchNorm(G.choice);__c&&(ie.choice=__c)}';
const S_END_OLD = 'if(!I.length)return null;let D={segments:I,';
const S_END_NEW = 'if(!I.length)return null;{let __n=0;for(let __i=0;__i<I.length;__i++){if(!I[__i].choice)continue;if(__i===I.length-1||__n>=1)delete I[__i].choice;else __n++}}let D={segments:I,';
const SERVER_EDITS = [[S_PROMPT_OLD, S_PROMPT_NEW], [S_FN_OLD, S_FN_NEW], [S_SEG_OLD, S_SEG_NEW], [S_END_OLD, S_END_NEW], [S_ROUTE_OLD, S_ROUTE_NEW]];

// --- client.js (VN player mg()) ---
// Sizes are in em: the menu copies the VN text size, which the game scales with the screen.
// Colours come from the game's UI style tokens on .gf-arena[data-style] (Settings → 화면 → UI 스타일);
// the base rule is Vanguard, the game's default, and each other style only changes what differs.
const A = (s) => '.gf-arena[data-style="' + s + '"] ';
const C_CSS = '.gch-menu{display:flex;flex-direction:column;align-items:flex-end;gap:.4em;margin:0 0 .55em;pointer-events:auto}' +
  '.gch-opt{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:.6em;min-width:min(20em,100%);max-width:100%;padding:.5em 1.1em;' +
  'background:color-mix(in srgb,var(--ink-2,#151D2C) 88%,transparent);color:var(--text,#EDF1F6);border:1px solid color-mix(in srgb,var(--coral,#F2603C) 60%,transparent);' +
  'border-radius:2px;clip-path:polygon(.6em 0,100% 0,100% calc(100% - .6em),calc(100% - .6em) 100%,0 100%,0 .6em);' +
  'font-family:inherit;font-size:1em;line-height:1.35;text-align:left;box-shadow:0 .25em .9em rgba(0,0,0,.35);' +
  'opacity:0;transform:translateX(12px);animation:gch-in .22s ease-out forwards;transition:background .12s,color .12s}' +
  '.gch-opt:nth-child(3){animation-delay:.05s}.gch-opt:nth-child(4){animation-delay:.1s}' +
  '.gch-opt::before{content:"";flex:none;width:.5em;height:.5em;transform:rotate(45deg);background:var(--coral,#F2603C)}' +
  // One highlighted option at a time ([data-on]); mouse, arrows and wheel all move it, F / Enter pick it.
  // The second selector outranks the per-style rules below, so every style shows the highlight.
  '.gch-opt[data-on],.gf-arena[data-style] .gch-opt[data-on]{background:var(--coral,#F2603C);color:var(--on-coral,#fff)}.gch-opt[data-on]::before{background:currentColor}.gch-opt:focus{outline:none}' +
  '@media(hover:hover) and (pointer:fine){.gch-opt[data-on]::after{content:"F";margin-left:auto;padding:0 .4em;border:1px solid currentColor;border-radius:.25em;font-size:.78em;line-height:1.5;opacity:.85}}' +
  A('aurora') + '.gch-opt{clip-path:none;border-radius:999px;background:color-mix(in srgb,var(--ink-2,#171334) 62%,rgba(255,255,255,.10));-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}' +
  A('bloom') + '.gch-opt{clip-path:none;border-radius:999px;background:var(--surface,#fff);color:var(--on-surface,#16233A);border-color:transparent;box-shadow:0 .2em .7em rgba(22,35,58,.25)}' +
  A('signal') + '.gch-opt{clip-path:none;border-radius:0;border-width:0 0 0 3px;border-color:var(--coral,#C8FF3D);background:color-mix(in srgb,var(--ink-2,#0C0D10) 90%,transparent);box-shadow:none}' +
  A('signal') + '.gch-opt::before{border-radius:0;transform:none;width:.35em}' +
  A('ember') + '.gch-opt{clip-path:none;border-radius:.5em;background:color-mix(in srgb,var(--surface,#53381F) 94%,transparent);color:var(--on-surface,#F0D9A8)}' +
  '@keyframes gch-in{to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.gch-opt{animation:none;opacity:1;transform:none}}';
const C_JE_OLD = 'function je(){if(P(),I){$e(a[_]);return}_<a.length-1&&(_+=1,Ee(a[_],!0))}';
const C_JE_NEW = 'let __gchB=null,__gchM=null,__gchK=null;' +
  'function __gchX(){__gchM&&(__gchM.remove(),__gchM=null);__gchK&&(__gchK(),__gchK=null)}' +
  'function __gchAsk(){let s=a[_],c=s&&s.choice,os=c&&Array.isArray(c.options)?c.options.filter(x=>x&&x.label&&Array.isArray(x.lines)&&x.lines.length):[];' +
  'if(os.length<2||_>=a.length-1||!n||!n.parentNode)return!1;' +
  'let m=document.createElement("div");m.className="gch-menu";try{l&&(m.style.fontSize=getComputedStyle(l).fontSize)}catch{}m.setAttribute("role","group");m.setAttribute("aria-label","Reply");' +
  // One stylesheet per player, in .root beside (not inside) .vn, so readers of the VN text never see CSS.
  'let st=o&&o.querySelector("style[data-gch]");if(o&&!st){st=document.createElement("style");st.setAttribute("data-gch","");st.textContent=' + JSON.stringify(C_CSS) + ';o.prepend(st)}' +
  'for(let x of os){let b=document.createElement("button");b.type="button";b.className="gch-opt";b.textContent=String(x.label);' +
  'b.addEventListener("click",ev=>{ev.stopPropagation();__gchX();__gchB={l:x.lines.map(y=>{let z={...s,speaker:String(y.speaker||""),text:String(y.text||"")};delete z.choice;y.thought?z.thought=!0:delete z.thought;return z}),k:0};Ee(__gchB.l[0],!0)});m.append(b)}' +
  'm.addEventListener("click",ev=>ev.stopPropagation());' +
  'let dk=n.parentNode,bar=dk.querySelector(".vn-bar");dk.insertBefore(m,bar&&bar.parentNode===dk?bar:n);__gchM=m;h&&(h.hidden=!0);' +
  // Keys and wheel only while the menu is open, and never while typing or reading the backlog (b is the log box).
  // F is matched by key position (KeyF), so it also works with the Korean input mode on.
  'let bs=[...m.querySelectorAll(".gch-opt")],cur=0,mark=i=>{cur=(i+bs.length)%bs.length;bs.forEach((x,j)=>j===cur?x.setAttribute("data-on",""):x.removeAttribute("data-on"));try{bs[cur].focus({preventScroll:!0})}catch{}};' +
  'bs.forEach((x,j)=>x.addEventListener("pointerenter",()=>mark(j)));mark(0);' +
  'let off=ev=>{let t=ev.composedPath?ev.composedPath()[0]:ev.target;return!__gchM||b&&!b.hidden||t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))},' +
  'kd=ev=>{if(ev.ctrlKey||ev.metaKey||ev.altKey||off(ev))return;if(ev.key==="ArrowDown"||ev.key==="ArrowUp")mark(cur+(ev.key==="ArrowDown"?1:-1));else if(ev.code==="KeyF"||ev.key==="Enter")bs[cur].click();else return;ev.preventDefault();ev.stopImmediatePropagation()},' +
  'acc=0,wh=ev=>{if(off(ev))return;ev.preventDefault();acc+=ev.deltaY;if(Math.abs(acc)>=40){mark(cur+(acc>0?1:-1));acc=0}},wt=o||G;' +
  'document.addEventListener("keydown",kd,!0);wt&&wt.addEventListener("wheel",wh,{passive:!1});' +
  '__gchK=()=>{document.removeEventListener("keydown",kd,!0);wt&&wt.removeEventListener("wheel",wh,{passive:!1})};return!0}' +
  'function je(){if(P(),I){$e(__gchB?__gchB.l[__gchB.k]:a[_]);return}if(__gchM)return;' +
  'if(__gchB){__gchB.k+=1;if(__gchB.k<__gchB.l.length){Ee(__gchB.l[__gchB.k],!0);return}__gchB=null}else if(__gchAsk())return;' +
  '_<a.length-1&&(_+=1,Ee(a[_],!0))}';
const C_EE_OLD = 'function Ee(W,ce){if(B(),P(),';
const C_EE_NEW = 'function Ee(W,ce){if(B(),P(),__gchX(),';
const C_SKIP_OLD = '_=a.length-1,Ee(a[_],!1)';
const C_SKIP_NEW = '_=a.length-1,__gchB=null,Ee(a[_],!1)';
const CLIENT_EDITS = [[C_JE_OLD, C_JE_NEW], [C_EE_OLD, C_EE_NEW], [C_SKIP_OLD, C_SKIP_NEW]];
const CLIENT_DONE = 'let __gchB=null,__gchM=null,__gchK=null;';

// Returns the edited text, or null when any anchor is missing or repeated.
function applyEdits(source, edits) {
  if (edits.some(([o]) => count(source, o) !== 1)) return null;
  let out = source;
  for (const [o, n] of edits) out = out.replace(o, () => n);
  return out;
}
function transformServer(source) { return applyEdits(source, SERVER_EDITS); }
function transformClient(source) { return source.includes(CLIENT_DONE) ? source : applyEdits(source, CLIENT_EDITS); }
// Runs inside the route on every client.js request; the helper is passed in as a global.
function transformRoute(source) {
  if (count(source, ROUTE_MARKER) !== 1) return null;
  const injected = [
    'if (id === "gacha-forge" && entrypoint && Buffer.isBuffer(entrypoint.data) && globalThis.__gchTransformClient) {',
    'const __before = entrypoint.data.toString("utf8");',
    'const __after = globalThis.__gchTransformClient(__before);',
    'if (__after == null) process.stderr.write("[gacha-choice] client signature mismatch; skipped\\n");',
    'else if (__after !== __before) { entrypoint.data = Buffer.from(__after, "utf8"); entrypoint.sha256 = __gchHash(entrypoint.data); }',
    '}',
  ].join('\n');
  return 'import { createHash as __gchCreateHash } from "node:crypto";\n' +
    'const __gchHash = b => __gchCreateHash("sha256").update(b).digest("hex");\n' +
    source.replace(ROUTE_MARKER, () => ROUTE_MARKER + '\n' + injected);
}

function readSource(file, response) {
  return response.source == null ? fs.readFileSync(file, 'utf8') :
    Buffer.isBuffer(response.source) ? response.source.toString('utf8') : String(response.source);
}
if (process.env.GF_CHOICE_TEST !== '1') {
  if (Number(process.versions.node.split('.')[0]) < 22) {
    process.stderr.write(TAG + ' Node 22+ required; inactive\n');
  } else {
    globalThis.__gchTransformClient = transformClient;
    registerHooks({ load(url, context, nextLoad) {
      if (!url.startsWith('file:')) return nextLoad(url, context);
      let file;
      try { file = norm(fileURLToPath(url)); } catch { return nextLoad(url, context); }
      const isServer = SERVER.test(file), isRoute = ROUTE.test(file);
      if (!isServer && !isRoute) return nextLoad(url, context);
      const response = nextLoad(url, context);
      const updated = (isServer ? transformServer : transformRoute)(readSource(file, response));
      if (!updated) {
        process.stderr.write(TAG + ' ' + (isServer ? 'server' : 'route') + ' signature mismatch; NO changes applied\n');
        return response;
      }
      process.stderr.write(TAG + ' ' + (isServer ? 'reply choices enabled in beat prompt' : 'route hooked for VN choices') + ' (in memory)\n');
      return { ...response, source: updated, shortCircuit: true };
    } });
    process.stderr.write(TAG + ' hook registered\n');
  }
}
module.exports = { transformServer, transformClient, transformRoute, SERVER_EDITS, CLIENT_EDITS };
