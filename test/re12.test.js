// RE12 起飞/着陆上座表、机长A/B=J2、一般高原归类、拉萨双机长、未识别机场转人工（审核意见 F-01/F-02/F-04，用户 2026-11-06 决定）
'use strict';
const assert = require('assert');
const C = require('../js/core.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// F-01：审核报告列出的「巡航允许、起落禁止」组合必须被拦
for (const [L, R] of [['J1', 'F4'], ['J1', 'F5'], ['J2', 'F3'], ['J2', 'F4'], ['J3', 'F3'], ['J1', 'F8']])
  ok(C.seatOK(L, R) !== undefined && !C.tlSeatOK(L, R), `${L}+${R} 起落阶段应禁止`);
for (const [L, R] of [['J1', 'F6'], ['J1', 'F7'], ['J2', 'F5'], ['J2', 'F8'], ['J3', 'F4'], ['TL', 'F2'], ['TC', 'F8'], ['J1', 'J3'], ['J2', 'TL']])
  ok(C.tlSeatOK(L, R), `${L}+${R} 起落阶段应允许`);
ok(!C.tlSeatOK('TL', 'F1'), 'F1 仅转升检查，常规不排');
ok(!C.tlSeatOK('SPIC', 'F8'), 'SPIC 不作左座');

// F-02：机长A/B 按 J2，且保留右座下限 A≥F5、B≥F6
ok(C.tlSeatOK('机长A', 'F5') && !C.tlSeatOK('机长A', 'F4'), '机长A 按 J2：F5 可、F4 不可');
ok(C.tlSeatOK('机长B', 'F6') && !C.tlSeatOK('机长B', 'F5'), '机长B：F6 可、F5 不可');
ok(C.catOK('HIGH', '机长A', 'F6'), '机长A 按 J2 可飞丽江组（F6）');
ok(C.catOK('PLATEAU', '机长A', 'F5'), '机长A 按 J2 可飞一般高原（F5）');

// F-04：一般高原按标高归类；拉萨仍是唯一双机长
for (const c of ['ZLLL', 'ZPPP']) ok(C.apCat(c) !== 'NONE', `${C.apName(c)} 应为高原类`);
ok(!C.catOK(C.apCat('ZLLL'), 'J2', 'F4'), '兰州：J2+F4 不可');
ok(C.catOK(C.apCat('ZLLL'), 'J2', 'F5'), '兰州：J2+F5 可');
ok(C.apCat('ZULS') === 'LHASA', '拉萨类别');
ok(!C.catOK('LHASA', 'J3', 'F8'), '拉萨须双机长：J3+F8 不可');
ok(C.catOK('LHASA', 'J3', 'J3'), '拉萨：J3+J3 可');
ok(C.catOK(C.apCat('ZPLJ'), 'J3', 'F6'), '丽江：机长+副驾驶即可（非双机长）');

// 未识别机场 → 需人工确认（硬），而不是按普通机场静默放行
ok(C.apUnknown('XXXX') && !C.apUnknown('ZUUU'), 'apUnknown');
const R = require('../js/demo-roster.js'); const s = R.build(C);
s.pairings.forEach((pr, i) => { const c = R.SOLVED.crews[i]; pr.crew = { C: c[0] || null, F: c[1] || null, T: c[2] || null }; });
const v = C.validate(s); const man = v.filter(x => x.type === '需人工确认');
ok(man.length > 0 && man.every(x => x.level === 'hard'), '演示数据中的源表简称机场被标为需人工确认');
// 内置结果：除「需人工确认」与如实保留的空洞外，无其他硬违规
const other = v.filter(x => x.level === 'hard' && !['需人工确认', '未满员'].includes(x.type));
ok(other.length === 0, '内置结果无其他硬违规：' + other.map(x => x.msg).slice(0, 3).join(' | '));
console.log('re12.test ok', n);
