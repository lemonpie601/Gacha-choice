'use strict';
// Checks the patch against an installed Marinara Engine without changing any file.
// Usage: node selftest.cjs [Marinara-Engine folder]   (default: %LOCALAPPDATA%\Marinara-Engine or /app)
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
assert.ok(client.includes('ev.code===kc') && client.includes('"gch-key-code"') && client.includes('addEventListener("wheel"'), 'pick key (default F) and wheel picking are in the client patch');
const route = P.transformRoute(fs.readFileSync(path.join(root, 'packages', 'server', 'dist', 'routes', 'capability-packages.routes.js'), 'utf8'));
assert.ok(route, 'route anchor not found');
syntax('route.mjs', route);
console.log('PASS: server, client and route patches apply to Gacha Forge 1.8.13 and parse');

// 2) The beat parser keeps a well-formed choice and drops broken ones.
const fnSrc = P.SERVER_EDITS[1][1];
const norm = new Function(fnSrc.slice(0, fnSrc.indexOf('function __gchFile(')) + 'return __gchNorm;')();
const ok = norm({ options: [{ label: ' 고마워 ', lines: [{ speaker: 'Me', text: '고마워.' }, { speaker: 'Rin', text: '별말을.', thought: 'true' }] }, { label: '됐어', lines: [{ text: '됐어.' }] }] });
assert.deepEqual(ok, { options: [{ label: '고마워', lines: [{ speaker: 'Me', text: '고마워.' }, { speaker: 'Rin', text: '별말을.', thought: true }] }, { label: '됐어', lines: [{ speaker: '', text: '됐어.' }] }] });
assert.equal(norm({ options: [{ label: 'only one', lines: [{ text: 'x' }] }] }), null, 'one option is not a choice');
assert.equal(norm({ options: [{ label: 'a', lines: [] }, { label: 'b', lines: [{ text: 'x' }] }] }), null, 'options without lines are dropped');
assert.equal(norm('nope'), null);
const four = norm({ options: [1, 2, 3, 4].map((i) => ({ label: 'o' + i, lines: [1, 2, 3, 4].map((k) => ({ text: 't' + k })) })) });
assert.equal(four.options.length, 3); assert.equal(four.options[0].lines.length, 3);
// One choice per beat, never on the last segment.
const trim = new Function('I', P.SERVER_EDITS[3][1].replace('if(!I.length)return null;', '').replace('let D={segments:I,', '') + 'return I;');
const c = { options: [] };
assert.deepEqual(trim([{ choice: c }, { choice: c }, { choice: c }]).map((s) => !!s.choice), [true, false, false]);
assert.deepEqual(trim([{}, { choice: c }]).map((s) => !!s.choice), [false, false]);
console.log('PASS: beat parser keeps one valid choice per beat and drops broken ones');

// 3) The frequency setting changes the beat prompt; "off" restores the original rule word for word.
const promptSrc = fnSrc.slice(fnSrc.indexOf('function __gchPrompt('), fnSrc.indexOf('function AS('));
const promptFor = (f) => new Function('let __gchFreq=()=>' + JSON.stringify(f) + ';' + promptSrc + 'return __gchPrompt();')();
assert.deepEqual(promptFor('off'), ['NEVER offer choices; the player only advances. Do not ask the player to pick anything.']);
assert.ok(promptFor('often').some((x) => x.includes('whenever such a moment exists')));
assert.ok(promptFor('sometimes').some((x) => x.includes('roughly one beat in three')));
assert.ok(!promptFor('often').includes('@HOW_OFTEN') && promptFor('often').length === promptFor('sometimes').length);
assert.ok(server.includes('s.get("/choice-settings"') && server.includes('s.post("/choice-settings"'));
console.log('PASS: choice frequency (often / sometimes / off) reaches the beat prompt and has a settings route');
fs.rmSync(tmp, { recursive: true, force: true });
