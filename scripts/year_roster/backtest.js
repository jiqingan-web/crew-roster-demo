// 用现有规则回测全年真实班表：node scripts/year_roster/backtest.js <state.json> [输出 violations.json] [外站车程.csv]
// 第 3 参数：机场时间表 JSON（scripts/airport_times/parse_airport_table.py 输出）或外站车程 CSV：每行「ICAO,车程分钟」（可由《外站车程填写表.xlsx》A、E 两列另存为 CSV）→ settings.carMin
'use strict';
const path = require('path'); const fs = require('fs');
const C = require(path.join(__dirname, '..', '..', 'js', 'core.js'));
const st = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
C.setPeriod(st.grid); st.settings = C.migrateSettings(Object.assign(C.defaultSettings(), st.settings));
if (process.argv[4] && /\.json$/i.test(process.argv[4])) { st.settings.airportTimes = JSON.parse(fs.readFileSync(process.argv[4], 'utf8')); console.log('机场时间表', Object.keys(st.settings.airportTimes).length, '个机场'); }
else if (process.argv[4]) { const m = {}; fs.readFileSync(process.argv[4], 'utf8').split(/\r?\n/).forEach(line => { const [ap, v] = line.split(',').map(x => (x || '').trim()); if (/^[A-Z0-9]{4}$/.test(ap) && v !== '' && !isNaN(+v)) m[ap] = +v; });
  st.settings.carMin = Object.assign({}, st.settings.carMin || {}, m); console.log('外站车程', Object.keys(m).length, '个机场'); }
const t0 = Date.now(); const v = C.validate(st);
const pm = Object.fromEntries(st.pairings.map(p => [p.id, p]));
const mb = C.monthBuckets(); const monOf = d => { const b = mb.find(x => x.days.includes(d)); return b ? b.label : '?'; };
const ext = pr => pr && ['C', 'F', 'T'].some(s => pr.srcCrew && pr.srcCrew[s] == null);
const unk = pr => pr && pr.legs.some(l => l.unknownAp);
v.forEach(x => { const pr = pm[x.pairing]; const d = pr ? pr.start : +((x.msg.match(/(\d+)日/) || [])[1] || 0);
  x.month = monOf(d); x.extSeat = !!ext(pr); x.unknownAp = !!unk(pr); });
const hard = v.filter(x => x.level === 'hard');
const T = {}; hard.forEach(x => { const r = T[x.type] = T[x.type] || { n: 0, extSeat: 0, unknownAp: 0, byMonth: {} }; r.n++; r.extSeat += x.extSeat; r.unknownAp += x.unknownAp; r.byMonth[x.month] = (r.byMonth[x.month] || 0) + 1; });
console.log('grid', JSON.stringify(st.grid), 'pairings', st.pairings.length, 'validate', Date.now() - t0, 'ms', 'hard', hard.length, 'soft', v.filter(x => x.level === 'soft').length, 'info', v.filter(x => x.level === 'info').length);
Object.entries(T).sort((a, b) => b[1].n - a[1].n).forEach(([k, r]) => console.log(k.padEnd(14), String(r.n).padStart(4), '含外中队空座', r.extSeat, '含未确认机场', r.unknownAp, JSON.stringify(r.byMonth)));
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(v));
