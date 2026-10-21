// 真名零泄漏：仅在本机存在离线 name_map 时运行（map 不进仓库）。node test/names.test.js
const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const MAP = process.env.NAME_MAP || '/workspace/personnel-ingest/name_map.json';
if (!fs.existsSync(MAP)) { console.log('NAMES SKIP (no offline name_map)'); process.exit(0); }
const R = JSON.parse(fs.readFileSync(MAP, 'utf8')).map.map(x => x.real);
const C = require('../js/core.js'); let fail = 0;
const chk = (n, ok, info) => { console.log('NAMES ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };
const hitN = names => names.filter(n => R.some(r => n.includes(r))).length; // 含子串
for (const s of [undefined, 1, 2, 3, 7, 42, 99, 2027]) chk('main sample seed ' + s, hitN(C.generateSample(s).pilots.map(p => p.name)) === 0);
chk('lite aliases', hitN(C.generateLiteSample(1).pilots.map(p => p.name)) === 0);
const blk = new Set(C.generateSample(5).pilots.slice(0, 50).map(p => p.name));
chk('nameBlock hook rejects', C.generateSample(5, { nameBlock: blk }).pilots.every(p => !blk.has(p.name)));
const root = path.join(__dirname, '..'); const files = cp.execSync('git ls-files', { cwd: root }).toString().trim().split('\n');
let leak = 0; for (const f of files) { let t; try { t = fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { continue; } if (R.some(r => t.includes(r))) leak++; }
chk('tracked files contain 0 real names', leak === 0, leak + ' files');
console.log(fail ? 'NAMES FAIL ' + fail : 'NAMES ALL OK'); process.exitCode = fail ? 1 : 0;
