const C = require('../js/core.js');
const chk = (n, ok, info) => { console.log('fdpsplit ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
chk('defaults', C.defaultSettings().fdpSplitLongGround === true && C.defaultSettings().fdpSplitLongGroundH === 5 && C.defaultSettings().reportMin === 95 && C.defaultSettings().reportMinIntl === 115 && C.defaultSettings().minRestH === 10 && C.defaultSettings().releaseMin === 40 && C.defaultSettings().restBeforeReportMin === 25); // 公司运行手册 Re07-10 3.6.1
const st = { settings: Object.assign(C.defaultSettings(), { reportMin: 105 }), airports: {}, pairings: [], pilots: [] };
const hefei = { id: 'T-HFE', legs: [
  { flt: '2303', from: 'ZUUU', to: 'ZSOF', dep: 9 * 60 + 30, arr: 11 * 60 + 50, ac: 'A320', d: 1 },
  { flt: '2304', from: 'ZSOF', to: 'ZUUU', dep: 20 * 60 + 45, arr: 23 * 60 + 5, ac: 'A320', d: 1 }
], offRaw: ['蓉皖蓉'] };
const ds = C.fdpDays(hefei, st);
chk('hefei 2 windows', ds.length === 2, 'n=' + ds.length);
chk('hefei compliant', ds.every(d => d.planBuffer >= 0));
chk('restart report', ds[1].splitFrom && ds[1].start === (20 * 60 + 45) - 105);
const short = { id: 'T-S', legs: [
  { flt: '1', from: 'ZUTF', to: 'ZJHK', dep: 600, arr: 720, ac: 'A320', d: 1 },
  { flt: '2', from: 'ZJHK', to: 'ZUTF', dep: 767, arr: 887, ac: 'A320', d: 1 }
], offRaw: [] };
chk('short turnaround intact', C.fdpDays(short, st).length === 1);
// 外站 5h01 ≥5h 应拆；4h59 不拆
const out5 = { id: 'T-O5', legs: [
  { flt: 'A', from: 'ZUUU', to: 'ZWTC', dep: 500, arr: 600, ac: 'A320', d: 1 },
  { flt: 'B', from: 'ZWTC', to: 'ZUUU', dep: 600 + 301, arr: 600 + 301 + 120, ac: 'A320', d: 1 }
], offRaw: [] };
chk('outstation 5h01 splits', C.fdpDays(out5, st).length === 2);
const out499 = { id: 'T-O4', legs: [
  { flt: 'A', from: 'ZUUU', to: 'ZWTC', dep: 500, arr: 600, ac: 'A320', d: 1 },
  { flt: 'B', from: 'ZWTC', to: 'ZUUU', dep: 600 + 299, arr: 600 + 299 + 120, ac: 'A320', d: 1 }
], offRaw: [] };
chk('outstation 4h59 intact', C.fdpDays(out499, st).length === 1);
// 基地湘府湘式：天府过站 ~12h 应拆（v677）
const xiang = { id: 'T-XF', legs: [
  { flt: '2269', from: 'ZGHA', to: 'ZUTF', dep: 7 * 60 + 38, arr: 9 * 60 + 23, ac: 'A320', d: 1 },
  { flt: '2270', from: 'ZUTF', to: 'ZGHA', dep: 21 * 60 + 16, arr: 23 * 60 + 1, ac: 'A320', d: 1 }
], offRaw: ['湘府湘'] };
const xd = C.fdpDays(xiang, st);
chk('base 湘府湘 splits', xd.length === 2, 'n=' + xd.length);
chk('base 湘府湘 compliant', xd.every(d => d.planBuffer >= 0), xd.map(d => d.planBuffer).join(','));
st.settings.fdpSplitLongGround = false;
chk('toggle off merges', C.fdpDays(hefei, st).length === 1 && C.fdpDays(hefei, st)[0].planBuffer < 0);
const mig = C.migrateSettings({ fdpSplitLongGroundH: 8, reportMin: 105 });
chk('migrate 8->5', mig.fdpSplitLongGroundH === 5);
// v678：两端(随)不拉飞行执勤期窗；仅执飞段定报到/结束
st.settings.fdpSplitLongGround = true;
st.settings.fdpSplitLongGroundH = 5;
const lanSha = { id: 'T-LS', legs: [
  { flt: '2439', from: 'ZUTF', to: 'ZLLL', dep: 7 * 60 + 46, arr: 9 * 60 + 15, ac: 'A320', d: 1, dh: true },
  { flt: '2439', from: 'ZLLL', to: 'ZWSC', dep: 10 * 60 + 9, arr: 13 * 60 + 50, ac: 'A320', d: 1 },
  { flt: '2440', from: 'ZWSC', to: 'ZLLL', dep: 14 * 60 + 20, arr: 18 * 60 + 1, ac: 'A320', d: 1 },
  { flt: '2440', from: 'ZLLL', to: 'ZUTF', dep: 18 * 60 + 54, arr: 20 * 60 + 16, ac: 'A320', d: 1, dh: true }
], offRaw: ['府兰(随)+兰莎兰+兰府(随)'] };
const ld = C.fdpDays(lanSha, st);
chk('dh ends one window', ld.length === 1, 'n=' + ld.length);
chk('dh ends start=first op', ld[0].start === (10 * 60 + 9) - 105, 'start=' + ld[0].start);
chk('dh ends end=last op', ld[0].end === 18 * 60 + 1, 'end=' + ld[0].end);
chk('dh ends relEnd keeps dh', ld[0].relEnd === 20 * 60 + 16, 'relEnd=' + ld[0].relEnd);
chk('dh ends nOpLegs=2', ld[0].nOpLegs === 2);
chk('dh ends compliant', ld[0].planBuffer >= 0, 'buf=' + ld[0].planBuffer + ' fdp=' + ld[0].planFdp);
const trailDh = { id: 'T-TD', legs: [
  { flt: '1913', from: 'ZSFZ', to: 'ZSJN', dep: 9 * 60 + 7, arr: 11 * 60 + 22, ac: 'A320', d: 1 },
  { flt: '1913', from: 'ZSJN', to: 'ZWYN', dep: 13 * 60 + 16, arr: 18 * 60 + 16, ac: 'A320', d: 1 },
  { flt: '1900', from: 'ZWYN', to: 'ZUTF', dep: 19 * 60 + 9, arr: 22 * 60 + 51, ac: 'A320', d: 1, dh: true }
], offRaw: ['福济犁+犁府(随)'] };
const td = C.fdpDays(trailDh, st);
chk('trail dh end=last op', td[0].end === 18 * 60 + 16 && td[0].relEnd === 22 * 60 + 51);
chk('trail dh compliant', td[0].planBuffer >= 0, 'buf=' + td[0].planBuffer);
const dhOnly = { id: 'T-DH', legs: [
  { flt: '1804', from: 'ZGHA', to: 'ZUUU', dep: 8 * 60 + 24, arr: 10 * 60 + 26, ac: 'A320', d: 1, dh: true }
], offRaw: ['湘蓉(随)'] };
const dd = C.fdpDays(dhOnly, st);
chk('dh-only zero fdp', dd[0].dhOnly && dd[0].planFdp === 0 && dd[0].exceed === 0);
