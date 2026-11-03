# Self-audit · v675 · domestic reportMin 95→105

**Date:** 2026-11-01 (Asia/Shanghai)  
**User note:** 「航前准备时间是起飞时间前1小时45分报到」→ 105 min.

## Changes
| Location | Before | After |
|---|---|---|
| `js/core.js` `defaultSettings().reportMin` | 95 | **105** |
| `js/core.js` `COM.reportMinDomesticFlight` | 95 | **105** |
| `js/core.js` sample `estFdp` hardcode | `95 + …` | `(COM.reportMinDomesticFlight \|\| 105) + …` |
| `js/core.js` `migrateSettings` | — | legacy `reportMin===95` → 105 |
| `js/app/08-settings.js` label | 公司国内飞行组95 | 公司国内飞行组105=1h45 |
| `js/app/02-gantt.js` fallback | `\|\| 95` | `\|\| 105` |
| `test/test.js` COM assert | default 95 | default 105 |
| `lite/index.html` + `full.html` `?v=` | 674 | **675** |
| `releaseMin` | 30 | **unchanged** (no doc conflict) |

Settings remain editable in UI.

## Official load · 执勤期超限 recount
Source: `O.build(C, C.generateLiteSample())` then `validate`.

| Metric | reportMin=95 | reportMin=105 |
|---|---:|---:|
| **执勤期超限** | **31** | **31** |
| hard total | 184 | 185 |
| 月值勤超限 | 3 | 4 |

Note: count of 执勤期超限 items stayed 31 (no duties sat in the 0–10 min buffer band to tip newly). Existing overruns each deepen by ~10 min FDP. Longer report **will** increase FDP overruns when duties are near the limit; this official snapshot was already saturated on the tippable set. Month FDP hour roll-up picked up +1 (月值勤超限 3→4).

## Cache bust
Open `lite/index.html?v=675` (or hard-refresh). All script/css query tags bumped 674→675.
