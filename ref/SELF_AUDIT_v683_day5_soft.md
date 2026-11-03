# Self-audit · v683 · 第5日执飞取消硬禁（时间满足即可）

**Date:** 2026-11-02 (Asia/Shanghai)  
**User rule:** 置位仍不计飞行小时；第5日执飞只要休息/FDP/任务间隔等时间条件满足即可，**不再硬禁**。软提示可选保留。

## 改动
| 项 | 行为 |
|---|---|
| `ftlCheckPerson` | 删除「连续4值勤日后第5日不得执飞」硬推送 |
| `fillExternalSeats` / `fits` | 删除 `strictDutyDays` 五日连飞硬拦 |
| `pairingIntrinsic` consec≥5 | 改为 `soft: true` |
| `validate` | 新增软类型 `第5日执飞`；`第5日置位` 仍软；硬路径跳过「第5日」文案 |
| `dutyDayFlags` | 置位日仍计入连续链（**仅供软提示**）；置位仍不计飞行小时、不拉 FDP 窗 |
| Cache bust | `?v=682` → **`?v=683`** |

## 未改
- 置位 ≠ 飞行小时（`pairingHours`）
- FDP 窗仍仅执飞段（`fdp_window.operating_legs_only`）
- 144h/48h 休息、任务间隔 `minRestH`、7日/月 FDP、年飞小时硬规则不变

## Recount
| 场景 | hard 第5日 | soft 第5日执飞 | soft 第5日置位 |
|---|---|---|---|
| 正式表（模拟表格1） | **0** | 19 | 40 |
| lite `autoFill` seed=7 | **0** | 30 | 2 |
| 构造 D1–4 执飞 + D5 执飞 `personCheck` | ok=true（不拦） | validate 软提示 | — |

## Cache bust / URL
Open `lite/index.html?v=683`（或硬刷新）。  
GitHub Pages（若已发布）: `https://jiqingan-web.github.io/crew-roster-demo/lite/?v=683`

## Desktop sync
`ref/crew-roster-demo-sync683.tgz` → 用户 Desktop。
