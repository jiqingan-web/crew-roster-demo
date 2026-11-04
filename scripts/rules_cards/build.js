// 规则卡片数据：人话说明 + 从 js/core.js 截取的真实代码（按锚点定位，行号随代码变化自动更新）
// 用法：node scripts/rules_cards/build.js  → js/rules-cards.js
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..'); const SRC = fs.readFileSync(path.join(R, 'js', 'core.js'), 'utf8').split('\n');
const grab = (anchor, before, after) => { const i = SRC.findIndex(l => l.includes(anchor)); if (i < 0) throw new Error('锚点未找到：' + anchor);
  const a = Math.max(0, i - (before || 0)), b = Math.min(SRC.length - 1, i + (after || 0));
  const lines = SRC.slice(a, b + 1); const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return { from: a + 1, to: b + 1, code: lines.map(l => l.slice(ind)).join('\n') }; };
const G = [
  ['休息与执勤', [
    { t: '两次值勤之间至少休息 10 小时', k: '硬', how: '休息期从关车后（离场 + 回程车程）开始，到下次报到前（去程车程）结束，至少 10 小时；各机场的报到、车程按公司机场基础表取值。', ok: '双流 21:00 落地，次日 09:55 起飞（休息期 10h05）', bad: '双流 22:30 落地，次日 09:00 起飞（休息期 7h40）', src: 'CCAR-121.495 · 飞行部手册 Re10-08 2.2.4', a: ['restPr = S.minRestH * 60', 0, 6] },
    { t: '报到时间按机场取值', k: '参数', how: '报到 = 地面准备 20 分钟 + 准备室到机场车程 + 机上 60 分钟。双流、天府为 105 分钟；国际航班另加 20 分钟。', ok: '天府始发：起飞前 105 分钟报到', bad: '—', src: '排班员确认 · 公司机场基础表', a: ['const repAt = (ap, p, st) =>', 0, 3] },
    { t: '144 小时内须有连续 48 小时休息', k: '硬', how: '每个飞行任务报到前 144 小时内，须有一段连续 48 小时的休息；纯置位任务不受此条约束。', ok: '前 6 天内有 2 天完整休息', bad: '连续 6 天每天都有值勤', src: 'CCAR-121.495(b) · 公司运行手册 3.6.10', a: ['纯置位任务不受 144h/48h 约束', 0, 4] },
    { t: '48 小时休息须含两个完整夜间', k: '硬', how: '上面那段 48 小时休息，要包含两个完整的 0–6 点。', ok: '周一 20:00 → 周三 20:00（含两个 0–6 点）', bad: '周一 08:00 → 周三 08:00（只含一个完整夜间）', src: '飞行部手册 Re10-08 2.2.4', a: ['function rest48Status', 0, 6] },
    { t: '飞行执勤期上限与延长', k: '硬 / 软', how: '计划执勤期不得超过表 B 限制；按实际时刻执行时，因意外超出 2 小时以内记为“延长”软提示，超过 2 小时为超限。', ok: '计划 12h40 / 限制 14h', bad: '实际 16h20 / 限制 14h（超 2h20）', src: 'CCAR-121.483 / 121.485(c)', a: ['实际执行时刻（含延误）：CCAR-121.485(c)', 0, 3] },
    { t: '日飞行时间上限（表 A）', k: '硬', how: '一个值勤日内的飞行时间不得超过表 A 限制（按报到时刻和航段数查表）。', ok: '4 段共 8h10', bad: '单日飞行 10h30 超出表 A', src: 'CCAR-121.483(a)', a: ["if (dy.fltOver > 0) add('日飞行时间超限'", 0, 0] },
    { t: '置位前后的休息怎么算', k: '硬', how: '航后置位不算值勤也不算休息；先置位再执飞时，置位计入飞行执勤期，报到按置位前 95 分钟。', ok: '落地后随机返回成都，不要求中间休息', bad: '—', src: '公司运行手册 3.6.1、3.7.6 · 飞行部手册 2.2.3', a: ['function dhAdjacentRest(E, L, st)', 0, 12] },
    { t: '大过站可下酒店休息', k: '软', how: '同一机场两段之间地面 5 小时以上、可在适宜住宿场所休息时，中间时间不计入值勤期，由排班员确认。', ok: '石河子过站 6 小时下酒店', bad: '—', src: '公司运行手册 3.6.1 3)(1)b', a: ["if (r.startsWith('大过站'))", 0, 0] },
    { t: '连续 4 个值勤日后第 5 天', k: '软', how: '连续 4 天值勤后第 5 天仍执飞或置位，合规但尽量避免。', ok: '飞 3 天休 2 天', bad: '连续第 5 天执飞（提示）', src: '公司排班习惯', a: ["add('第5日执飞', 'soft'", 0, 0] },
  ]],
  ['飞行时间', [
    { t: '月飞行时间不超过 100 小时', k: '硬', how: '每人每个日历月飞行时间不超过 100 小时（公司与法规一致）。', ok: '8 月 68 小时', bad: '8 月 103 小时', src: 'CCAR-121.487 · 公司运行手册', a: ['const hardCap = st =>', 0, 0] },
  ]],
  ['座位与搭配', [
    { t: '机长 A / 机长 B 右座级别', k: '硬', how: '机长 A 左座时右座副驾驶须 F5 及以上，机长 B 须 F6 及以上；教员可在右座搭配任何机长。', ok: '机长A + F5', bad: '机长B + F5', src: '公司机型操作与搭配规定', a: ["const CAPT_AB_MIN_FO = {", 0, 3] },
    { t: '新机长须搭配有经验的人', k: '软', how: '新机长执飞时，机组里要有 J3 及以上；机长 B 也可搭配 F6 及以上副驾驶。', ok: '机长A + J3 观察', bad: '机长A + F4 + F3', src: '公司机型操作与搭配规定 · CR-20', a: ['const newCaptCompanionOK =', 0, 0] },
    { t: '部门管控人员不得互相搭配', k: '硬', how: '机长 B 等部门管控人员，同一机组里最多一人。', ok: '机长B + F6', bad: '机长B + 另一名管控人员', src: '排班员确认 · CR-23', a: ['[CR-23] 部门管控人员不得互相搭配', 0, 0] },
    { t: '两名副驾驶不得同为低级别', k: '硬', how: '两名副驾驶同机时不能都是 F1–F3；纯置位任务没人上座，不检查。', ok: 'F5 + F3', bad: 'F3 + F3', src: '公司机型操作与搭配规定 · CR-03', a: ['纯置位任务无人上座，不查 FO 矩阵', 0, 2] },
    { t: 'F1/F2 尽量与教员同组', k: '软', how: '机组里有 F1/F2 时，建议有教员同组（非必须）。', ok: 'TL + F2', bad: 'J3 + F2（提示）', src: '排班员确认 · CR-19', a: ["add('F1/F2无教员', 'soft'", 0, 0] },
  ]],
  ['特殊机场与高原', [
    { t: '特殊机场资质', k: '软', how: '上座的两人都要有该机场资质，左座须是机长类；被带飞、重获资格须有教员。资质表更新前先作软提示。', ok: '丽江：两人均持丽江资质', bad: '丽江：右座无资质（提示）', src: '公司特殊机场资质表 · 运行手册高原与特殊机场章节', a: ['公司特殊机场资质表（st.authAirports + p.qualRole）', 0, 4] },
    { t: '高高原机场双机长', k: '硬', how: '拉萨等高高原机场须双机长制，上座两人均持该机场资质。', ok: 'J3 + J3 + F7', bad: '单机长 + 两名副驾驶', src: 'CCAR-121 R8 高原运行 · 公司手册 17.1.3', a: ["ru.category !== 'high_plateau'", 0, 4] },
    { t: '始发站需配血压测试仪', k: '提示', how: '自乌鲁木齐、西安等站出港时，提醒始发站配备血压测试仪。', ok: '—', bad: '—', src: '公司运行通告', a: ["add('需血压测试仪', 'info'", -1, 0] },
  ]],
  ['人员状态', [
    { t: '请假日不得安排起飞', k: '硬', how: '只要起飞时间不在请假那一天就可以；前一天飞、后一天请假可以接受。', ok: '9/14 落地，9/15 请假', bad: '9/15 请假却安排 9/15 起飞', src: '排班员确认', a: ["rs.push('请假(' +", 0, 0] },
    { t: '备份、培训、模拟机日不得冲突', k: '硬', how: '已排备份、培训、控班、模拟机的日子不能再排飞行任务。', ok: '—', bad: '模拟机当天又排航班', src: '公司排班规定', a: ["备份日冲突(", 0, 3] },
    { t: '意向休息日尽量满足', k: '软', how: '每人可报 2 个意向休息日，一键排班后会把排在意向日上的任务换给合规的人；找不到人则保留。', ok: '意向 9/20，当天无任务', bad: '—', src: '员工福利', a: ["意向休息日(", 0, 0] },
  ]],
];
const out = G.map(([g, cards]) => ({ g, cards: cards.map(c => { const x = grab(c.a[0], c.a[1] < 0 ? -c.a[1] : c.a[1], c.a[2]); const o = Object.assign({}, c, { file: 'js/core.js', from: x.from, to: x.to, code: x.code }); delete o.a; return o; }) }));
const js = `/* 规则卡片（由 scripts/rules_cards/build.js 生成；代码段截自 js/core.js，勿手改） */\n(function (root) { const RULE_CARDS = ${JSON.stringify(out)};\n  if (typeof module === 'object' && module.exports) module.exports = RULE_CARDS; else root.RuleCards = RULE_CARDS; })(typeof self !== 'undefined' ? self : this);\n`;
fs.writeFileSync(path.join(R, 'js', 'rules-cards.js'), js); console.log('cards', out.reduce((s, g) => s + g.cards.length, 0), 'bytes', js.length);
