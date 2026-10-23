'use strict';
// Gacha Forge 1.8.13 cosmetic reply choices (Genshin-style). In-memory only; does not change installed package files.
// Server: the beat prompt may attach one "choice" to a segment, and the beat parser keeps it.
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
const S_PROMPT_OLD = '"NEVER offer choices; the player only advances. Do not ask the player to pick anything.",';
const S_PROMPT_NEW = [
  'The story never branches: the player only advances, and nothing the player picks may change what happens.',
  'ONE COSMETIC REPLY CHOICE. When someone in this beat speaks directly to the protagonist (the player) and the protagonist would naturally answer, give that moment a reply choice, like the dialogue options of a gacha visual novel. Include it whenever such a moment exists; at most ONE per beat.',
  'Attach it to the segment the protagonist is answering (the question or remark itself) as a "choice" field: "choice":{"options":[{"label":"...","lines":[{"speaker":"...","text":"..."}, ...]}, ...]}',
  '- 2 or 3 options. label: what the protagonist answers, short enough for a button, in the same language as the story.',
  '- lines: 1-3 segments that play ONLY when that option is picked: usually the protagonist saying it, then a brief reaction. Same speaker/text/thought fields as segments.',
  '- The protagonist\'s answer lives ONLY in the options: the regular segment right after the choice continues from there and must read naturally after ANY option. Never refer to anything said only inside an option.',
  '- Options change tone and flavour only, never a fact, decision, event, relationship or outcome. Never put the choice on the last segment.',
].map((x) => JSON.stringify(x)).join(',') + ',';
const S_FN_OLD = 'function AS(e,t={}){';
const S_FN_NEW = 'function __gfcNorm(c){if(!c||typeof c!="object"||!Array.isArray(c.options))return null;let o=[];for(let x of c.options){if(!x||typeof x!="object")continue;let lb=String(x.label??"").trim().slice(0,120);if(!lb)continue;let ls=[];for(let y of Array.isArray(x.lines)?x.lines:[]){if(!y||typeof y!="object")continue;let t=String(y.text??"").trim();if(!t)continue;let z={speaker:String(y.speaker??"").trim().slice(0,80),text:t.slice(0,600)};(y.thought===!0||y.thought==="true")&&(z.thought=!0);ls.push(z);if(ls.length>=3)break}if(ls.length)o.push({label:lb,lines:ls});if(o.length>=3)break}return o.length>=2?{options:o}:null}' + S_FN_OLD;
const S_SEG_OLD = 'let ie={speaker:l(G.speaker),text:W};(G.thought===!0||G.thought==="true")&&(ie.thought=!0);';
const S_SEG_NEW = S_SEG_OLD + '{let __c=__gfcNorm(G.choice);__c&&(ie.choice=__c)}';
const S_END_OLD = 'if(!I.length)return null;let D={segments:I,';
const S_END_NEW = 'if(!I.length)return null;{let __n=0;for(let __i=0;__i<I.length;__i++){if(!I[__i].choice)continue;if(__i===I.length-1||__n>=1)delete I[__i].choice;else __n++}}let D={segments:I,';
const SERVER_EDITS = [[S_PROMPT_OLD, S_PROMPT_NEW], [S_FN_OLD, S_FN_NEW], [S_SEG_OLD, S_SEG_NEW], [S_END_OLD, S_END_NEW]];

// --- client.js (VN player mg()) ---
// Sizes are in em: the menu copies the VN text size, which the game scales with the screen.
const C_CSS = '.gfc-menu{display:flex;flex-direction:column;align-items:flex-end;gap:.4em;margin:0 0 .55em;pointer-events:auto}' +
  '.gfc-opt{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:.6em;min-width:min(20em,100%);max-width:100%;padding:.5em 1.1em;border-radius:999px;' +
  'background:rgba(14,20,32,.82);border:1px solid rgba(236,214,160,.55);color:#F3EBDD;font-family:inherit;font-size:1em;line-height:1.35;text-align:left;box-shadow:0 .25em .9em rgba(0,0,0,.35);' +
  'opacity:0;transform:translateX(12px);animation:gfc-in .22s ease-out forwards}' +
  '.gfc-opt:nth-child(3){animation-delay:.05s}.gfc-opt:nth-child(4){animation-delay:.1s}' +
  '.gfc-opt:hover,.gfc-opt:focus-visible{background:rgba(236,214,160,.92);color:#1A1F2B}' +
  '.gfc-opt::before{content:"";flex:none;width:.5em;height:.5em;transform:rotate(45deg);background:currentColor;opacity:.8}' +
  '@keyframes gfc-in{to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.gfc-opt{animation:none;opacity:1;transform:none}}';
const C_JE_OLD = 'function je(){if(P(),I){$e(a[_]);return}_<a.length-1&&(_+=1,Ee(a[_],!0))}';
const C_JE_NEW = 'let __gfcB=null,__gfcM=null;' +
  'function __gfcX(){__gfcM&&(__gfcM.remove(),__gfcM=null)}' +
  'function __gfcAsk(){let s=a[_],c=s&&s.choice,os=c&&Array.isArray(c.options)?c.options.filter(x=>x&&x.label&&Array.isArray(x.lines)&&x.lines.length):[];' +
  'if(os.length<2||_>=a.length-1||!n||!n.parentNode)return!1;' +
  'let m=document.createElement("div");m.className="gfc-menu";try{l&&(m.style.fontSize=getComputedStyle(l).fontSize)}catch{}m.setAttribute("role","group");m.setAttribute("aria-label","Reply");' +
  'let st=document.createElement("style");st.textContent=' + JSON.stringify(C_CSS) + ';m.append(st);' +
  'for(let x of os){let b=document.createElement("button");b.type="button";b.className="gfc-opt";b.textContent=String(x.label);' +
  'b.addEventListener("click",ev=>{ev.stopPropagation();__gfcX();__gfcB={l:x.lines.map(y=>{let z={...s,speaker:String(y.speaker||""),text:String(y.text||"")};delete z.choice;y.thought?z.thought=!0:delete z.thought;return z}),k:0};Ee(__gfcB.l[0],!0)});m.append(b)}' +
  'm.addEventListener("click",ev=>ev.stopPropagation());' +
  'let dk=n.parentNode,bar=dk.querySelector(".vn-bar");dk.insertBefore(m,bar&&bar.parentNode===dk?bar:n);__gfcM=m;h&&(h.hidden=!0);' +
  'let f1=m.querySelector(".gfc-opt");f1&&f1.focus&&f1.focus({preventScroll:!0});return!0}' +
  'function je(){if(P(),I){$e(__gfcB?__gfcB.l[__gfcB.k]:a[_]);return}if(__gfcM)return;' +
  'if(__gfcB){__gfcB.k+=1;if(__gfcB.k<__gfcB.l.length){Ee(__gfcB.l[__gfcB.k],!0);return}__gfcB=null}else if(__gfcAsk())return;' +
  '_<a.length-1&&(_+=1,Ee(a[_],!0))}';
const C_EE_OLD = 'function Ee(W,ce){if(B(),P(),';
const C_EE_NEW = 'function Ee(W,ce){if(B(),P(),__gfcX(),';
const C_SKIP_OLD = '_=a.length-1,Ee(a[_],!1)';
const C_SKIP_NEW = '_=a.length-1,__gfcB=null,Ee(a[_],!1)';
const CLIENT_EDITS = [[C_JE_OLD, C_JE_NEW], [C_EE_OLD, C_EE_NEW], [C_SKIP_OLD, C_SKIP_NEW]];
const CLIENT_DONE = 'let __gfcB=null,__gfcM=null;';

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
    'if (id === "gacha-forge" && entrypoint && Buffer.isBuffer(entrypoint.data) && globalThis.__gfcTransformClient) {',
    'const __before = entrypoint.data.toString("utf8");',
    'const __after = globalThis.__gfcTransformClient(__before);',
    'if (__after == null) process.stderr.write("[gacha-choice] client signature mismatch; skipped\\n");',
    'else if (__after !== __before) { entrypoint.data = Buffer.from(__after, "utf8"); entrypoint.sha256 = __gfcHash(entrypoint.data); }',
    '}',
  ].join('\n');
  return 'import { createHash as __gfcCreateHash } from "node:crypto";\n' +
    'const __gfcHash = b => __gfcCreateHash("sha256").update(b).digest("hex");\n' +
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
    globalThis.__gfcTransformClient = transformClient;
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
