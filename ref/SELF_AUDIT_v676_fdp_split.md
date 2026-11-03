# Self-audit · v676 · 外站长过站拆分飞行值勤期（FDP）

**Date:** 2026-11-01 (Asia/Shanghai)  
**User note:** 合肥过夜：早上飞过去，酒店休息，晚上再飞回；中间另一套机组。过夜机组不得算作一个连续 FDP。

## Changes
| Location | Change |
|---|---|
| `js/core.js` | `shouldSplitFdpBetween` / `fdpDaysRaw` / `dutyIvs`：同站过站 ≥`fdpSplitLongGroundH`(默认8h) 且外站（或笔记含酒店/过夜）→ 拆成独立 FDP 窗；次段 `reportMin` 重新报到；短过站不拆；基地长过站默认不拆 |
| `js/core.js` `defaultSettings` / `migrateSettings` | `fdpSplitLongGround: true`, `fdpSplitLongGroundH: 8` |
| `js/app/08-settings.js` | 开关 + 阈值小时 |
| `rules/crew_rules.yaml` + `js/rules-config.js` | `fdp_long_ground_split` 文档 |
| `lite/index.html` / `full.html` | `?v=675` → **`?v=676`** |

## Official load · 执勤期超限 recount
Source: `Official.build(C, C.generateLiteSample())` + `validate`；`reportMin=105`。

| Metric | v675（拆分前） | v676（拆分后） | 拆分关闭 |
|---|---:|---:|---:|
| **执勤期超限** | **31** | **19** | **31** |
| hard total | 185 | 171 | — |
| 月值勤超限 | 4 | 2 | — |

### 重点任务（蓉皖蓉 / 府皖府）
| 任务 | 拆分前 planFdp / 限 | 拆分后 |
|---|---|---|
| OF146 蓉皖蓉 | 15h20 / 14h **超** | 2×约 4h05 **合规** |
| OF228 蓉皖蓉 | 15h29 / 14h **超** | 2×约 4h05 **合规** |
| OF406 蓉皖蓉 | 15h19 / 14h **超** | 2×约 4h05 **合规** |
| OF290 府皖府 | 14h49 / 14h **超** | 2×约 4h00 **合规** |
| OF333 府皖府 | 15h07 / 14h **超** | 2×约 4h00 **合规** |

同型外站长过站（如 琼武琼、府兰府）一并拆分；**湘府湘** 等长过站在天府(基地)默认**不拆**，仍计连续 FDP（真超保留）。短折返（如 OF147 过站 47min）不拆。

## Cache bust
Open `lite/index.html?v=676`（或硬刷新）。
