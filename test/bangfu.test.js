// 帮扶对象：同任务机组至多 1 名（CR-22）
const C = require('../js/core.js');
let fail = 0; const chk = (n, ok, info) => { console.log('BANGFU ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };
const P = (id, rank, extra) => Object.assign({ id, name: id, rank, auth: [], health: C.defaultHealth(), bangfu: false }, extra || {});
const leg = (from, to) => ({ d: 1, flt: 'BF1', from, to, dep: 600, arr: 720, ac: 'A320' });
const mkPr = (crew) => ({ id: 'BF-PR', legs: [leg('ZUUU', 'ZBAA')], start: 1, ndays: 1, crew: crew || { C: null, F: null, T: null } });

const a = P('a', 'J3', { bangfu: true });
const b = P('b', 'F6', { bangfu: true });
const c = P('c', 'F4', { bangfu: false });
const st = { settings: C.defaultSettings(), pilots: [a, b, c], pairings: [], restrictions: [] };

// crewIssue
chk('two bangfu blocked', /同航班不可有两名帮扶对象/.test(C.crewIssue(mkPr(), [a, b, c], st) || ''));
chk('one bangfu ok', !C.crewIssue(mkPr(), [a, c, P('d', 'F5')], st));
chk('zero bangfu ok', !C.crewIssue(mkPr(), [P('x', 'J3'), P('y', 'F6'), P('z', 'F4')], st));
chk('incomplete two bangfu blocked', /同航班不可有两名帮扶对象/.test(C.crewIssue(mkPr(), [a, b, null], st) || ''));

// personCheck + candidates
const pr = mkPr({ C: a.id, F: null, T: null });
st.pairings = [pr];
const idx = C.buildIndex(st);
const [okB] = C.personCheck(b, pr, st, idx, { ignorePrefs: true, skipFtl: true, slot: 'F' });
chk('personCheck blocks 2nd bangfu', !okB);
const [okC] = C.personCheck(c, pr, st, idx, { ignorePrefs: true, skipFtl: true, slot: 'F' });
chk('personCheck allows non-bangfu', okC);

const candF = C.candidates(st, pr, 'F');
chk('candidates F blocks bangfu peer', !candF.find(x => x.p.id === 'b').ok && /帮扶/.test((candF.find(x => x.p.id === 'b').reasons || []).join('|')));
chk('candidates F allows other', candF.find(x => x.p.id === 'c').ok);

pr.crew.F = b.id; // force illegal for validate
const v = C.validate(st);
chk('validate hard bangfu', v.some(x => x.level === 'hard' && /同航班不可有两名帮扶对象/.test(x.msg)), v.filter(x => /帮扶/.test(x.msg || '')).map(x => x.type + ':' + x.msg).join(' | '));

// catalog
const cat = C.rulesCatalog(st);
const r22 = cat.rules.find(r => r.id === 'CR-22');
chk('catalog CR-22', r22 && r22.kind === '硬' && /帮扶/.test(r22.title), r22 && r22.title);

// autofill must not create two-bangfu crews
{
  const s = C.generateLiteSample(20261101);
  const caps = s.pilots.filter(p => C.isCaptClass(p.rank) && !p.reserve).slice(0, 3);
  const fos = s.pilots.filter(p => C.isFO(p.rank) && !p.reserve).slice(0, 3);
  [...caps, ...fos].forEach(p => { p.bangfu = true; });
  C.autoFill(s);
  let bad = 0;
  for (const pr of s.pairings) {
    const crew = ['C', 'F', 'T'].map(k => pr.crew[k] && s.pilots.find(p => p.id === pr.crew[k])).filter(Boolean);
    if (crew.filter(p => p.bangfu).length >= 2) bad++;
  }
  const vv = C.validate(s).filter(x => x.level === 'hard' && /帮扶/.test(x.msg));
  chk('autofill no dual-bangfu crews', bad === 0 && vv.length === 0, 'badCrews=' + bad + ' viol=' + vv.length);
}

console.log(fail ? 'BANGFU FAIL ' + fail : 'BANGFU ALL OK');
process.exitCode = fail ? 1 : 0;
