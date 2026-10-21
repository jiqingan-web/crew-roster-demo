// 规则配置回归（rules/crew_rules.yaml → js/rules-config.js）：node test/rules.test.js
const C = require('../js/core.js');
let fail = 0; const chk = (n, ok, info) => { console.log('RULE ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };
const P = (id, rank, auth, extra) => Object.assign({ id, name: id, rank, auth: auth || [], health: C.defaultHealth() }, extra || {});
const leg = (from, to) => ({ d: 1, flt: 'T1', from, to, dep: 600, arr: 720, ac: 'A320' });
const pr = (...legs) => ({ id: 'X', legs, start: 1, ndays: 1, crew: {} });
const st = { settings: C.defaultSettings(), pilots: [], restrictions: [] };
const ALL = ['ZULS', 'ZPLJ', 'ZPJH', 'ZUXC', 'ZLXN', 'ZYTL', 'ZPPP'];
chk('config loaded', C.RULES_CONFIG && C.RULES_CONFIG.meta.version === 'RE12+17章-1.0');
// 1 cruise_pairing_matrix
const M = { US: 'F4', J0: 'F4', J1: 'F4', J2: 'F3', J3: 'F3', TL: 'F1', TB: 'F1', TC: 'F1' };
for (const [L, mn] of Object.entries(M)) { const n = +mn[1];
  chk(`matrix ${L}+F${n} ok`, C.seatOK(L, 'F' + n)); if (n > 1) chk(`matrix ${L}+F${n - 1} no`, !C.seatOK(L, 'F' + (n - 1))); }
chk('SPIC not left seat', !C.seatOK('SPIC', 'TL'));
// 2 fo low_low
const norm = pr(leg('ZUUU', 'ZBAA'));
chk('low_low forbidden', /low_low/.test(C.crewIssue(norm, [P('c', 'TL'), P('a', 'F3'), P('b', 'F3')], st) || ''));
chk('low_mid allowed', !C.crewIssue(norm, [P('c', 'J3'), P('a', 'F3'), P('b', 'F4')], st));
chk('pref low_mid > high_high', C.foComboScore('F3', 'F5') > C.foComboScore('F7', 'F8'));
// 3 third member: captain may sit as third; observer any rank
chk('captain as third ok', !C.crewIssue(norm, [P('c', 'J3'), P('a', 'F4'), P('b', 'J2')], st));
// 4 LXA double captain
const lxa = pr(leg('ZUUU', 'ZULS'));
chk('LXA J3+J3+FO ok', !C.crewIssue(lxa, [P('c', 'J3', ALL), P('t', 'J3', ALL), P('f', 'F4', ALL)], st));
chk('LXA J3+F8+F7 (single capt) no', !!C.crewIssue(lxa, [P('c', 'J3', ALL), P('f', 'F8', ALL), P('t', 'F7', ALL)], st));
chk('LXA J3+J2 no', !!C.crewIssue(lxa, [P('c', 'J3', ALL), P('t', 'J2', ALL), P('f', 'F7', ALL)], st));
chk('LXA 3 captains (no FO) no', /min_fos/.test(C.crewIssue(lxa, [P('c', 'TL', ALL), P('t', 'J3', ALL), P('f', 'TB', ALL)], st) || ''));
chk('LXA second captain lacks qual no', !!C.crewIssue(lxa, [P('c', 'J3', ALL), P('t', 'J3', []), P('f', 'F6', ALL)], st));
chk('LXA special-qualified medical no', /special_qualified/.test(C.crewIssue(lxa, [P('c', 'J3', ALL), P('t', 'J3', ALL), P('f', 'F6', ALL, { health: Object.assign(C.defaultHealth(), { specialQualified: true }) })], st) || ''));
chk('LXA age sum>=110 no (age data)', /age_sum|max_age/.test(C.crewIssue(lxa, [P('c', 'J3', ALL, { age: 54 }), P('t', 'J3', ALL, { age: 56 }), P('f', 'F6', ALL)], st) || ''));
chk('LXA no age data -> age rules inactive', !C.crewIssue(lxa, [P('c', 'J3', ALL), P('t', 'J3', ALL), P('f', 'F6', ALL)], st));
// LJG / KMG
const ljg = pr(leg('ZUUU', 'ZPLJ')), kmg = pr(leg('ZUUU', 'ZPPP'));
chk('LJG J3+F6 ok', C.catOK('HIGH', 'J3', 'F6') && !C.catOK('HIGH', 'J3', 'F5'));
chk('LJG TL+F5 ok, F4 no', C.catOK('HIGH', 'TL', 'F5') && !C.catOK('HIGH', 'TL', 'F4'));
chk('LJG J1 captain no', !C.catOK('HIGH', 'J1', 'J3'));
chk('KMG J2+F5 ok, F4 no', C.catOK('PLATEAU', 'J2', 'F5') && !C.catOK('PLATEAU', 'J2', 'F4'));
chk('KMG TL+F4 ok, F3 no', C.catOK('PLATEAU', 'TL', 'F4') && !C.catOK('PLATEAU', 'TL', 'F3'));
chk('KMG airport category', C.apCat('ZPPP') === 'PLATEAU' && C.apClass('ZPPP').key === 'class_3');
chk('KMG qual both seated', !!C.crewIssue(kmg, [P('c', 'J3', ALL), P('f', 'F6', []), P('t', 'F4', [])], st) && !C.crewIssue(kmg, [P('c', 'J3', ALL), P('f', 'F6', ['ZPPP']), P('t', 'F4', [])], st));
chk('LJG crew via crewIssue', !C.crewIssue(ljg, [P('c', 'TL', ALL), P('f', 'F5', ALL), P('t', 'F3', [])], st));
// restriction table
const st2 = Object.assign({}, st, { restrictions: [{ a: 'a', b: 'c', type: '不可同机' }] });
chk('restriction pair blocked', /restriction_table/.test(C.crewIssue(norm, [P('c', 'J3'), P('a', 'F6'), P('b', 'F4')], st2) || ''));
chk('restriction other ok', !C.crewIssue(norm, [P('c', 'J3'), P('x', 'F6'), P('b', 'F4')], st2));
const rs = C.parseRestrictions('人员A,人员B,限制类型\nc,a,不可同机\n张三,c,\n', [P('c', 'J3'), P('a', 'F6', [], { name: '张三' })]);
chk('restriction CSV parse', rs.pairs.length === 2 && rs.pairs[1].type === '不可同机', JSON.stringify(rs));
// catalog
const cat = C.rulesCatalog({ pilots: [P('a', 'F3')] });
chk('catalog age pending', cat.rules.find(r => r.id === 'plateau_airport_rules.age_limits').status === '待年龄数据');
chk('catalog senior disabled', /停用/.test(cat.rules.find(r => r.id === 'senior_pilot_rule').status));
// end-to-end: sample autofill produces no rule violations
for (const seed of [20261101, 7]) { const s = C.generateLiteSample(seed); C.autoFill(s); const v = C.validate(s);
  chk('lite ' + seed + ' no rule hard', !v.some(x => x.level === 'hard' && /搭配|机组|FO|高高原|特殊/.test(x.type)));
  const kmgAuth = s.pilots.filter(p => (p.authDemo || []).includes('ZPPP')).length; chk('lite ' + seed + ' KMG demo quals labelled', kmgAuth > 0, kmgAuth); }
console.log(fail ? 'RULES FAIL ' + fail : 'RULES ALL OK'); process.exitCode = fail ? 1 : 0;
