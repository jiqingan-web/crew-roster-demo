// 高强度模式 + 延误鲁棒性 快测
const C = require('../js/core.js'); const assert = require('assert');
const st = C.generateLiteSample(20261101);
assert.strictEqual(st.settings.highIntensity, false); assert.strictEqual(st.settings.hiTargetH, 85);
const hardOf = s => C.validate(s).filter(v => v.level === 'hard' && !['未满员', '日飞行时间超限', '执勤期超限', '强制指派'].includes(v.type)).length;
const s1 = JSON.parse(JSON.stringify(st)); s1.settings.highIntensity = true; C.autoFill(s1);
assert.strictEqual(hardOf(s1), 0, '高强度模式不得产生硬违规');
const ix = C.buildIndex(s1); const mx = Math.max(...s1.pilots.map(p => ix.hours[p.id]));
assert(mx <= 100 + 1e-9, '月100h硬顶');
// >80h 软提示
const v = C.validate(s1); const n80 = s1.pilots.filter(p => ix.hours[p.id] > 80).length;
assert.strictEqual(v.filter(x => x.type === '高强度').length, n80); assert(v.filter(x => x.type === '高强度').every(x => x.level === 'soft'));
// 延误鲁棒性：0 分钟无新增；+60 ≥ +30
const d = C.delayRobustness(s1, [0, 30, 60, 300]); assert(d[300].newHard > 0, '大延误应触发超限');
assert.strictEqual(d[0].newHard, 0); assert(d[60].newHard >= d[30].newHard);
assert('pilots' in d[30] && 'pairings' in d[30] && typeof d[30].byType === 'object');
// 原数据不被修改
assert.strictEqual(JSON.stringify(C.validate(s1)), JSON.stringify(v));
console.log('HIINT ALL OK', { n80, max: mx.toFixed(1), d30: d[30].newHard, d60: d[60].newHard });
