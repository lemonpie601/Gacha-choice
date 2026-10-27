'use strict';
// Checks the patch against an installed Marinara Engine without changing any file.
// Usage: node gacha-choice-selftest.cjs [Marinara-Engine folder]   (default: %LOCALAPPDATA%\Marinara-Engine or /app)
process.env.GF_CHOICE_TEST = '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const P = require('./gacha-choice-runtime.cjs');

const root = process.argv[2] || [path.join(process.env.LOCALAPPDATA || '', 'Marinara-Engine'), '/app'].find((d) => fs.existsSync(path.join(d, 'packages', 'server')));
assert.ok(root, 'Marinara-Engine folder not found; pass it as the first argument');
const data = process.env.DATA_DIR || path.join(root, 'packages', 'server', 'data');
const pkg = path.join(data, 'capability-packages', 'versions', 'gacha-forge', '1.8.13');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gch-'));
const syntax = (name, text) => { const f = path.join(tmp, name); fs.writeFileSync(f, text); execFileSync(process.execPath, ['--check', f]); };

// 1) Every anchor matches the installed Gacha Forge 1.8.13 exactly once, and the result still parses.
const server = P.transformServer(fs.readFileSync(path.join(pkg, 'server.mjs'), 'utf8'));
assert.ok(server, 'server.mjs anchors not found (Gacha Forge is not 1.8.13?)');
syntax('server.mjs', server);
const clientSrc = fs.readFileSync(path.join(pkg, 'client.js'), 'utf8');
const client = P.transformClient(clientSrc);
assert.ok(client && client !== clientSrc, 'client.js anchors not found');
syntax('client.mjs', client);
assert.equal(P.transformClient(client), client, 'client patch must apply once only');
assert.ok(client.includes('ev.code===kc') && client.includes('"gch-key-code"') && !client.includes('addEventListener("wheel",wh'), 'pick key (default F) is in the client patch; wheel picking is gone');
assert.ok(client.includes('/api/gacha-forge/choice-pick') && client.includes('c.key&&__gchSend(c.key,c.picked)') && client.includes('Lg=__gchLog()'), 'picks are saved and shown in the backlog');
assert.ok(client.includes('"x-marinara-csrf":"1"') && client.includes('function __gchNote()'), 'picks send the CSRF header; unsaved picks get a notice');
const route = P.transformRoute(fs.readFileSync(path.join(root, 'packages', 'server', 'dist', 'routes', 'capability-packages.routes.js'), 'utf8'));
assert.ok(route, 'route anchor not found');
syntax('route.mjs', route);
console.log('PASS: server, client and route patches apply to Gacha Forge 1.8.13 and parse');

// 2) The beat parser keeps a well-formed choice (with a key for saving the pick) and drops broken ones.
const fnSrc = P.SERVER_EDITS[1][1];
const part = (from, to) => fnSrc.slice(fnSrc.indexOf('function ' + from + '('), to ? fnSrc.indexOf('function ' + to + '(') : undefined);
const norm = new Function(part('__gchNorm', '__gchFile') + 'return __gchNorm;')();
const ok = norm({ options: [{ label: ' 고마워 ', lines: [{ speaker: 'Me', text: '고마워.' }, { speaker: 'Rin', text: '별말을.', thought: 'true' }] }, { label: '됐어', lines: [{ text: '됐어.' }] }] });
assert.match(ok.key, /^[a-z0-9]{6,40}$/);
assert.deepEqual(ok.options, [{ label: '고마워', lines: [{ speaker: 'Me', text: '고마워.' }, { speaker: 'Rin', text: '별말을.', thought: true }] }, { label: '됐어', lines: [{ speaker: '', text: '됐어.' }] }]);
assert.equal(norm({ options: [{ label: 'only one', lines: [{ text: 'x' }] }] }), null, 'one option is not a choice');
assert.equal(norm({ options: [{ label: 'a', lines: [] }, { label: 'b', lines: [{ text: 'x' }] }] }), null, 'options without lines are dropped');
assert.equal(norm('nope'), null);
const five = norm({ options: [1, 2, 3, 4, 5].map((i) => ({ label: 'o' + i, lines: [1, 2, 3, 4].map((k) => ({ text: 't' + k })) })) });
assert.equal(five.options.length, 4); assert.equal(five.options[0].lines.length, 3);
// At most perBeat choices per beat, never on the last segment.
const endSrc = P.SERVER_EDITS[4][1].replace('if(!I.length)return null;', '').replace('let D={segments:I,', '');
const trim = (per, I) => new Function('I', 'let __gchSet=()=>({perBeat:' + per + '});' + endSrc + 'return I;')(I).map((x) => !!x.choice);
const c = { options: [] };
assert.deepEqual(trim(1, [{ choice: c }, { choice: c }, { choice: c }]), [true, false, false]);
assert.deepEqual(trim(2, [{ choice: c }, { choice: c }, { choice: c }, {}]), [true, true, false, false]);
assert.deepEqual(trim(3, [{}, { choice: c }]), [false, false]);
console.log('PASS: beat parser keeps valid choices (up to the per-beat limit) and drops broken ones');

// 3) The settings change the beat prompt; "off" restores the original rule word for word.
const promptFor = (set) => new Function('let __gchSet=()=>(' + JSON.stringify(set) + ');' + part('__gchPrompt', '__gchExpand') + 'return __gchPrompt();')();
assert.deepEqual(promptFor({ frequency: 'off', perBeat: 1, answers: 'auto' }), ['NEVER offer choices; the player only advances. Do not ask the player to pick anything.']);
const often = promptFor({ frequency: 'often', perBeat: 1, answers: 'auto' }).join(' ');
assert.ok(often.includes('whenever such a moment exists') && often.includes('at most ONE choice') && often.includes('2 or 3 options') && !/@(HOW|MAX|ANS)/.test(often));
for (const f of P.FREQS.slice(1)) assert.ok(!/@HOW|undefined/.test(promptFor({ frequency: f, perBeat: 1, answers: 'auto' }).join(' ')), f);
const many = promptFor({ frequency: 'always', perBeat: 3, answers: 4 }).join(' ');
assert.ok(many.includes('EVERY beat must have one') && many.includes('at most 3 choices') && many.includes('4 options'));
const clean = new Function(part('__gchClean', '__gchSet') + 'return __gchClean;')();
assert.deepEqual(clean({ frequency: 'often' }), { frequency: 'often', perBeat: 1, answers: 'auto' }, 'v1 settings files still load');
assert.deepEqual(clean({ frequency: 'nope', perBeat: 9, answers: 1 }), { frequency: 'often', perBeat: 1, answers: 'auto' });
assert.ok(server.includes('s.get("/choice-settings"') && server.includes('s.post("/choice-settings"') && server.includes('s.post("/choice-pick"'));
console.log('PASS: frequency, choices per beat and answers per choice reach the beat prompt; settings and pick routes exist');

// 4) A picked answer joins the story text later beats are told; unpicked choices add nothing.
const expand = new Function(part('__gchExpand', null).replace('function AS(e,t={}){', '') + 'return __gchExpand;')();
const seg = (picked) => [{ speaker: 'Rin', text: 'Q?', place: 'Hall', choice: { key: 'k1', picked, options: [{ label: 'a', lines: [{ speaker: 'Me', text: 'A1' }] }, { label: 'b', lines: [{ speaker: 'Me', text: 'B1' }, { speaker: 'Rin', text: 'B2' }] }] } }, { speaker: '', text: 'next' }];
assert.deepEqual(expand(seg(1)).map((x) => x.text), ['Q?', 'B1', 'B2', 'next']);
assert.equal(expand(seg(1))[1].place, 'Hall');
assert.deepEqual(expand(seg(undefined)).map((x) => x.text), ['Q?', 'next']);
assert.ok(server.includes('function jo(e){return __gchJo0(__gchExpand(e))}'));
console.log('PASS: the picked answer is part of the story text sent to later beats');

// 5) Saving a pick retries, keeps failed picks for the notice, and stops on errors a retry cannot fix.
(async () => {
  const run = async (replies) => {
    const sent = [], notes = [];
    globalThis.__gchPend = undefined;
    const fetch = async (url, init) => {
      sent.push(init.headers['x-marinara-csrf']);
      const r = replies[Math.min(sent.length, replies.length) - 1];
      if (r === 'offline') throw TypeError('Failed to fetch');
      return { ok: r.status === 200, status: r.status, json: async () => r.body };
    };
    const send = new Function('fetch', 'setTimeout', 'notes', 'let __gchNote=()=>notes.push([...globalThis.__gchPend.values()].filter(e=>e.fail).length);' + P.C_SAVE + 'return [__gchSend,__gchTry];')(fetch, (f) => f(), notes);
    send[0]('key123', 1);
    for (let i = 0; i < 20; i += 1) await new Promise((z) => setImmediate(z));
    return { sent, notes, pend: globalThis.__gchPend, retry: send[1] };
  };
  const ok = { status: 200, body: { ok: true } };
  let r = await run([ok]);
  assert.deepEqual(r.sent, ['1'], 'saved on the first try, with the CSRF header');
  assert.equal(r.pend.size, 0); assert.equal(r.notes.at(-1), 0);
  r = await run(['offline', { status: 200, body: { ok: false, error: 'write-conflict' } }, ok]);
  assert.equal(r.sent.length, 3, 'network errors and write conflicts are retried'); assert.equal(r.pend.size, 0);
  r = await run(['offline']);
  assert.equal(r.sent.length, 3); assert.equal(r.notes.at(-1), 1, 'after 3 failed tries the notice shows 1 unsaved pick');
  const e = r.pend.get('key123');
  await r.retry('key123', e);
  assert.equal(r.notes.at(-1), 1, 'retry while still offline keeps the notice');
  r = await run([{ status: 404, body: { error: 'Not Found' } }]);
  assert.equal(r.sent.length, 1, 'a missing route is not retried'); assert.equal(r.notes.at(-1), 1);
  r = await run([{ status: 200, body: { ok: false, error: 'bad-request' } }]);
  assert.equal(r.sent.length, 1, 'a bad request is not retried');
  globalThis.__gchPend = undefined;
  console.log('PASS: picks are retried, and unsaved ones are kept for the notice');
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((err) => { fs.rmSync(tmp, { recursive: true, force: true }); console.error(err); process.exitCode = 1; });
