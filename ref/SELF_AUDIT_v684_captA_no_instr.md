# Self-audit · v684 · 机长A 不强制教员（可带双副驾）

**Date:** 2026-11-03 (Asia/Shanghai)  
**User rule:** 「机长A可以带两个副驾驶」— 仅放开 **机长A**；机长B / SPIC / US / J0 仍须 TL+ 教员同组。

## 改动
| 项 | 行为 |
|---|---|
| `NEW_CAPT` / `isNew` | 去掉 `机长A`；现为 `SPIC/US/J0/机长B` |
| `CR-20` 目录文案 | 标明机长A 可带双副驾不强制教员；其余新机长仍须 TL+ |
| `crewIssue` / autofill `needInstr` | 随 `isNew` 自动对机长A 不再硬拦 |
| 巡航矩阵 | `RANK_ALIAS['机长A']→J0` **未改** |
| Cache bust | `?v=683` → **`?v=684`** |

## 未改
- 机长B / SPIC / US / J0 的 CR-20 硬约束
- F1/F2 须教员（CR-19）
- 特殊机场 / FO 矩阵 / 帮扶等其余硬规则

## Recount · 新机长无教员
| 场景 | 前（文档/口径） | 后（v684） |
|---|---:|---:|
| 正式表（模拟表格1）硬「新机长无教员」 | 72（REAL_VS_ENGINE 旧口径） | **53** |
| 其中机长A 无教员机组（现不再计） | （含于 72） | **26** 机组合规放行（19 仅机长A；7 仍因同组机长B 等计 53） |
| 单元：机长A+F4+F5 | — | `crewIssue` → `null` |
| 单元：机长B/J0/US/SPIC + 双副驾 | — | 仍 `[CR-20]` |

## 测试
- `test/chain.test.js`：OK（`slotRankOK` 改断言 机长B 须允许 TL 副驾位，机长A 不再）
- `test/rules.test.js`：ALL OK
- `test/lite.test.js`：mix 期望 NEW_CAPT=5 + 机长A×2；另有既有 training/sim 阈值 FAIL（与本次无关）

## Cache bust / URL
Open `http://127.0.0.1:8765/lite/index.html?v=684`（或硬刷新）。  
GitHub Pages（若已发布）: `https://jiqingan-web.github.io/crew-roster-demo/lite/?v=684`

## Desktop sync
`ref/crew-roster-demo-sync684.tgz` → 用户 Desktop。
