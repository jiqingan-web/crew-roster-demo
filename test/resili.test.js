// 韧性度新口径：同一任务集、不同班表 → 韧性度应随排班变化；切换班表时清缓存：node test/resili.test.js
const C = require('../js/core.js'); const fs = require('fs');
let fail = 0; const chk = (n, ok, info) => { console.log('RESILI ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };
const ms = [1, 99, 123].map(seed => { const st = C.generateLiteSample(20261101); C.autoFill(st, { seed }); return C.opsMetrics(st); });
chk('sat 不随班表变（任务量口径）', ms.every(m => m.satPct === ms[0].satPct), ms.map(m => m.satPct).join(','));
chk('新韧性度随班表变化', new Set(ms.map(m => m.resiliPct)).size > 1, ms.map(m => m.resiliPct).join(','));
chk('每日可调用人数分布随班表变化', new Set(ms.map(m => m.benchByDay.join(','))).size === ms.length);
chk('新韧性度 ≠ 100 − 饱和度', ms.every(m => Math.abs(m.resiliPct + m.satPct - 100) > 1), ms.map(m => (m.resiliPct + m.satPct).toFixed(1)).join(','));
chk('最薄弱日数据自洽', ms.every(m => m.benchByDay.length === C.DAYS && Math.min(...m.benchByDay) === m.benchWorstN && m.resiliPct === +(100 * m.benchWorstN / m.benchPool).toFixed(1)));
chk('旧口径仍可取到', ms.every(m => Math.abs(m.resiliHoursPct + m.satPct - 100) < 0.2));
const em = C.opsMetrics(C.generateLiteSample(20261101));
chk('空班表韧性度高于排满后', em.resiliPct > Math.max(...ms.map(m => m.resiliPct)), em.resiliPct);
const src = fs.readFileSync(__dirname + '/../js/app/00-base.js', 'utf8');
const body = src.slice(src.indexOf('function useSolution'), src.indexOf('function solBadge'));
chk('useSolution 清请假/执勤缓存', /leaveOpts = null/.test(body) && /dutyOpts = null/.test(body) && body.indexOf('leaveOpts = null') < body.indexOf('refresh()'));
console.log(fail ? 'RESILI FAIL ' + fail : 'RESILI ALL OK'); process.exit(fail ? 1 : 0);
