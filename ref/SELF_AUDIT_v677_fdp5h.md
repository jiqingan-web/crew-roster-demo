# Self-audit · v677 · 长过站拆分阈值 8h→5h（含基地）

**Date:** 2026-11-01 (Asia/Shanghai)  
**User note:** 过站超过 5 小时默认下去休息 → split FDP；湘府湘基地长过站一并按休息拆。

## Changes
| Location | Change |
|---|---|
| `js/core.js` `defaultSettings` / `migrateSettings` / `fdpLongGroundSplitMin` | 默认阈值 **8→5**；旧设置 `H===8` 迁移为 5 |
| `js/core.js` `shouldSplitFdpBetween` | 去掉「基地仅酒店笔记才拆」；**同站过站 ≥阈值即拆（外站+基地）** |
| `js/app/08-settings.js` | UI 文案：默认 5h；外站与基地均拆 |
| `rules/crew_rules.yaml` + `js/rules-config.js` | `threshold_hours: 5`，`outstation_only: false` |
| `test/fdpsplit.test.js` | 5h 边界、基地湘府湘、migrate 8→5 |
| `lite/index.html` / `full.html` | `?v=676` → **`?v=677`** |

## Official load · 执勤期超限 recount
Source: `Official.build(C, C.generateLiteSample())` + `summarize`；`reportMin=105`，`fdpSplitLongGround=true`，`H=5`。

| Metric | v676（外站≥8h，基地不拆） | **v677（≥5h，外站+基地）** |
|---|---:|---:|
| **执勤期超限** | **19** | **7** |
| hard total（约） | 171 | 158 |

### 19→7：已清除 12 / 仍超 7

**已清除（12）**
- **A 湘府湘基地长过站（6）**: OF086 OF179 OF205 OF241 OF296 OF303 — 天府过站 ~11h47–12h45 → 拆
- **B 外站 5–8h（4）**: OF187（长沙7h59）OF190（塔城5h01）OF455（盐城7h26）OF482（盐城7h15）
- **D 呼和 7h04 + 晚置位（1）**: OF284
- **E 桃过站 5h09（1）**: OF022

**仍超（7，均 D 置位拉长、段间短过站）**
- OF005 OF329 OF361 OF429（府兰莎双边置位）
- OF287 OF312（福济犁 + 置位回府）
- OF289（府威春 + 返程置位）

## Cache bust
Open `lite/index.html?v=677`（或硬刷新）。
