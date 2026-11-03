# Self-audit · v678 · 飞行执勤期窗只算执飞段（两端随不拉窗）

**Date:** 2026-11-01 (Asia/Shanghai)  
**User note:** 执勤期只算执飞段，两端(随)不拉窗（confirmed）。

## Changes
| Location | Change |
|---|---|
| `js/core.js` `fdpDaysRaw` | FDP `start`=`首个非dh起飞 − reportMin`；`end`/`planEnd`=`末个非dh落地`；段数查表用执飞段数；`relEnd`/`planRelEnd` 保留含置位末段供休息 |
| `js/core.js` `downstream` | 下游休息用 `relEnd`（含置位） |
| dh-only 窗 | `planFdp=0`、不计超限；置位仍不计飞行小时 / 连续值勤日（既有） |
| `js/app/08-settings.js` | 文案：执飞段拉窗、两端(随)不拉长 |
| `rules/crew_rules.yaml` + `js/rules-config.js` | 新增 `fdp_window.operating_legs_only` |
| `test/fdpsplit.test.js` | 府兰莎双边置位、尾置位、纯置位窗 |
| `lite/index.html` / `full.html` | `?v=677` → **`?v=678`** |

## Official load · 执勤期超限 recount
Source: `Official.build(C, C.generateLiteSample())` + `summarize`；`reportMin=105`，`fdpSplitLongGround=true`，`H=5`。

| Metric | v677（≥5h 拆分） | **v678（执飞拉窗）** |
|---|---:|---:|
| **执勤期超限** | **7** | **0** |
| hard total（约） | 158 | 150 |

### 7→0：原 D 置位拉长已全部清除
- OF005 OF329 OF361 OF429（府兰莎双边置位）→ 窗缩为兰↔莎 2 执飞段，planFdp ~9h4x / 14h
- OF287 OF312（福济犁 + 置位回府）→ 结束落在伊宁执飞落地，planFdp ~10hxx
- OF289（府威春 + 返程置位）→ 结束落在长春执飞落地，planFdp 7h49

## Cache bust
Open `lite/index.html?v=678`（或硬刷新）。
