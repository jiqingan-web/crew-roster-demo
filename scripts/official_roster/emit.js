const fs=require('fs'); const O=JSON.parse(fs.readFileSync('official.json'));
const data={source:O.source,airports:O.airports,pairings:O.pairings,training:O.training,trainingKind:O.trainingKind,sim:O.sim,control:O.control,standby:O.standby,leave:O.leave,notes:O.notes};
const js=`/* 模拟表格1：由用户提供的演示中队正式班表（Excel）离线转换，人员已化名（员工号 → 化名，见 lite-roster.js）。
 * 源表区间 09-01..10-21；本演示为 30 日网格，取 09-01..09-30 依次映射为第 1–30 日（日历标签仍按演示月显示）。
 * 航段：航线/航班号/置位(随)/当日首段起飞–末段落地 时刻均取自源表；源表无逐段时刻，中间各段按航距比例在该时段内切分（推算）。
 * 机号：源表未提供，以 REG-<任务号> 占位。仅本中队人员出现在源表中，外中队搭档的座位留空（即“未满员”）。
 * 由 scripts/official_roster_build.js 生成；勿手改。 */
(function (root) {
  "use strict";
  const OFFICIAL_ROSTER = ${JSON.stringify(data)};
  function build(C, base) {
    const st = base || C.generateLiteSample();
    const D = OFFICIAL_ROSTER; const ids = new Set(st.pilots.map(p => p.id));
    st.pilots.forEach(p => { p.leave = ((D.leave || {})[p.id] || []).slice(); p.prefs = []; if (!p.reserve && C.defaultSettings) { const h = p.health || {}; if (/演示/.test(h.note || '') || h.medExamExpiry) p.health = Object.assign({}, h, { noPlateau: false, noNight: false, note: '', bpNote: '', medExamExpiry: null }); } });
    st.airports = Object.assign({}, C.AIRPORTS, D.airports || {});
    st.pairings = JSON.parse(JSON.stringify(D.pairings)).map(pr => { ['C', 'F', 'T'].forEach(s => { if (pr.crew[s] && !ids.has(pr.crew[s])) pr.crew[s] = null; }); return pr; });
    const per = o => { const r = {}; st.pilots.forEach(p => { r[p.id] = ((o || {})[p.id] || []).slice(); }); return r; };
    st.training = per(D.training); st.sim = per(D.sim); st.control = per(D.control); st.standby = per(D.standby); st.simHold = null;
    st.trainingKind = {}; st.pilots.forEach(p => { st.trainingKind[p.id] = Object.assign({}, (D.trainingKind || {})[p.id] || {}); });
    st.officialNotes = D.notes; st.official = 1; st.settings.demoHoles = 0; st.demoHolesApplied = true; st.demoHoles = []; st.fills = [];
    st.solN = 1; st.solIdx = 0;
    return st;
  }
  const api = { OFFICIAL_ROSTER, build, NAME: '模拟表格1' };
  if (typeof module === "object" && module.exports) module.exports = api; else root.RosterOfficial = api;
})(typeof self !== "undefined" ? self : this);
`;
fs.writeFileSync('/workspace/crew-roster-demo/js/official-roster.js',js); console.log(js.length);
