/* 自动生成：python3 scripts/gen_rules_config.py（源：rules/crew_rules.yaml）。请勿手改。 */
(function (root) {
  "use strict";
  const RULES_CONFIG = {
 "meta": {
  "source": "公司机型搭配规定 + 运行手册高原/特殊机场章节（CCAR-121 R8）",
  "source_date": "RE12 2026-09-11 / 手册17章 2025-09-01",
  "version": "RE12+17章-1.0"
 },
 "crew_composition": {
  "captain": 1,
  "first_officer": 2
 },
 "captain_levels": {
  "order": [
   "US",
   "J0",
   "J1",
   "J2",
   "J3",
   "TL",
   "TB",
   "TC"
  ],
  "instructor_levels": [
   "TL",
   "TB",
   "TC"
  ],
  "excluded_from_roster": [
   "SPIC"
  ]
 },
 "fo_levels": {
  "order": [
   "F1",
   "F2",
   "F3",
   "F4",
   "F5",
   "F6",
   "F7",
   "F8"
  ],
  "groups": {
   "low": [
    "F1",
    "F2",
    "F3"
   ],
   "mid": [
    "F4",
    "F5"
   ],
   "high": [
    "F6",
    "F7",
    "F8"
   ]
  }
 },
 "three_person_crew": {
  "enabled": true,
  "third_member": {
   "exempt_from_seat_matrix": true,
   "min_level": "F1",
   "remark": "第三成员不上座；仍需满足资质、体检限制、搭配限制表与法规额度"
  }
 },
 "cruise_pairing_matrix": {
  "by_captain_level": {
   "US": {
    "min_fo": "F4"
   },
   "J0": {
    "min_fo": "F4"
   },
   "J1": {
    "min_fo": "F4"
   },
   "J2": {
    "min_fo": "F3"
   },
   "J3": {
    "min_fo": "F3"
   },
   "TL": {
    "min_fo": "F1"
   },
   "TB": {
    "min_fo": "F1"
   },
   "TC": {
    "min_fo": "F1"
   }
  }
 },
 "fo_combination_matrix": {
  "allow": {
   "low_low": false,
   "low_mid": true,
   "low_high": true,
   "mid_mid": true,
   "mid_high": true,
   "high_high": true
  },
  "preference_score": {
   "low_low": -999,
   "low_mid": 10,
   "low_high": 10,
   "mid_mid": 2,
   "mid_high": 3,
   "high_high": 2
  }
 },
 "senior_pilot_rule": {
  "enabled": true,
  "age_threshold": 58,
  "captain_min_fo_level": "F6",
  "instructor_min_fo_level": "F5"
 },
 "plateau_airport_rules": {
  "definitions": {
   "general_plateau": "海拔 1524m(5000ft)及以上、低于 2438m(8000ft)",
   "high_plateau": "海拔 2438m(8000ft)及以上",
   "special_airport": "净空/气象/飞行程序复杂，要求机长特殊资格的机场",
   "note": "公司内部进一步分类详见《飞行技术管理手册》与《运行规范》C0003"
  },
  "age_limits": {
   "high_plateau_max_age": 55,
   "captain_pair_age_sum_max": 110,
   "age_sum_strict_less": true
  },
  "experience_requirements": {
   "fo_general_plateau_hours": 300,
   "fo_high_plateau_total_hours": 500,
   "fo_high_plateau_type_hours": 300,
   "captain_general_plateau_hours": 500,
   "captain_high_plateau_hours": 1000,
   "captain_high_plateau_segments": 8,
   "captain_high_plateau_landings": 3
  },
  "crew_requirements": {
   "high_plateau": "双机长制：至少 2 名机长 + 1 名副驾驶；第三成员座配观察员或副驾驶",
   "high_plateau_min_captains": 2,
   "high_plateau_min_fos": 1,
   "general_plateau": "双机长制，或 1 名机长 + 1 名副驾驶",
   "high_plateau_captain_takeoff_landing": true,
   "responsibility_captain_no_major_error_1yr": true
  },
  "medical_standards": {
   "prohibited_conditions": [
    "心血管疾病",
    "冠状动脉硬化",
    "脑血管疾病",
    "严重心律失常",
    "贫血",
    "糖代谢异常",
    "胸肺疾病及其后遗症"
   ],
   "special_qualified_excluded": true,
   "preflight_heart_rate_min": 50,
   "preflight_heart_rate_max": 100,
   "preflight_spo2_non_plateau": 94,
   "preflight_spo2_plateau": 90,
   "alcohol_banned_hours": 24,
   "training_interval_months": 24,
   "extra_recuperation_hours": 300
  },
  "arj21_restriction": {
   "aircraft_regs": [
    "B-652F",
    "B-656C",
    "B-658A",
    "B-658C"
   ],
   "route_only": "喀什=塔什库尔干"
  }
 },
 "special_airport_rules": {
  "LXA": {
   "name": "拉萨(高高原/一类)",
   "category": "high_plateau",
   "airport_class": 1,
   "captain_levels": [
    "J3",
    "TL",
    "TB",
    "TC"
   ],
   "second_pilot_min": "J3",
   "fo_min": "F6",
   "crew_qualification_required": true,
   "extra": "夜间须具备夜航资质的教员操作起落；昼间正侧风≤15m/s、夜间≤10m/s、中雨以上禁止着陆"
  },
  "LJG": {
   "name": "丽江(特殊机场二类)",
   "category": "general_plateau",
   "airport_class": 2,
   "group_members": [
    "丽江",
    "西双版纳",
    "西昌",
    "西宁",
    "大连"
   ],
   "captain_levels": [
    "J2",
    "J3",
    "TL",
    "TB",
    "TC"
   ],
   "fo_min_by_captain": {
    "J2": "F6",
    "J3": "F6",
    "TL": "F5",
    "TB": "F5",
    "TC": "F5"
   },
   "crew_qualification_required": true
  },
  "KMG": {
   "name": "昆明(一般高原机场)",
   "category": "general_plateau",
   "captain_levels": [
    "J2",
    "J3",
    "TL",
    "TB",
    "TC"
   ],
   "fo_min_by_captain": {
    "J2": "F5",
    "J3": "F5",
    "TL": "F4",
    "TB": "F4",
    "TC": "F4"
   },
   "crew_qualification_required": true
  }
 },
 "airport_category_list": {
  "A320": {
   "class_1_high_plateau": [
    "拉萨"
   ],
   "class_2": [
    "丽江",
    "西双版纳",
    "西宁",
    "大连",
    "西昌"
   ],
   "class_3": [
    "昆明",
    "兰州",
    "张掖",
    "嘉峪关",
    "昭苏",
    "巴里坤"
   ],
   "class_4": [
    "赤峰",
    "张家界"
   ],
   "complex_airport": [
    "延吉",
    "茅台"
   ]
  },
  "ARJ21": {
   "class_1_high_plateau": [
    "塔什库尔干",
    "巴音布鲁克"
   ],
   "class_2": [
    "西昌"
   ],
   "class_4": [
    "伊春"
   ],
   "complex_airport": [
    "那拉提",
    "喀纳斯",
    "胡占德",
    "奥什",
    "黄山",
    "加格达奇",
    "茅台"
   ]
  },
  "qualification_note": "不可跳级：二类须先有三/四类；一类须先有二/三类；机长一类需 1000h、二类 1000h(A320)/500h(ARJ21)、三类 500h、四类 300-500h"
 },
 "operating_rules_reference": [
  "F2 不能操作起落，除非机长本机型教员经历时间超过 100 小时",
  "F1 仅实施转升检查时可作为 PM 上座",
  "副驾驶 A320 经历时间少于 50 小时，只能作为 PM 配合完成起飞/着陆",
  "A321 机型运行需技术等级 J2 及以上的飞行员操作起落",
  "F5(含)以下副驾驶禁止使用襟翼3着陆；所有副驾驶夜航禁止襟翼3着陆",
  "飞行员禁止执行盘旋进近，TB 及以上教员除外",
  "高原/特殊机场运行：飞行关键阶段 PF/PM 都应具备资质；教员作 PF 时应在左座",
  "高高原机场：必须由机长起降，严禁副驾驶起降、严禁双操作"
 ],
 "restriction_table_schema": {
  "columns": [
   "人员A",
   "人员B",
   "限制类型"
  ],
  "default_type": "不可同机"
 },
 "simulator_scheduling": {
  "monthly_personnel_rate": 0.05,
  "block_days_min": 2,
  "block_days_max": 4,
  "consecutive": true,
  "counts_as_duty_period": false,
  "counts_as_ftl_duty_day": false,
  "blocks_flying": true,
  "soft_gap_hours_vs_flight_or_training": 24,
  "remark": "邻接无时刻时按日历日隔离；有起飞/落地时刻时按 ≥24h 校验"
 },
 "engine_options": {
  "lxa_double_captain": true,
  "lxa_fallback_fo_min_single_captain": false,
  "observer_any_rank": true,
  "age_rules_require_age_data": true,
  "senior_pilot_rule_active": false,
  "restriction_table_hard": true
 },
 "_sha1": "d29b815af1"
};
  if (typeof module === "object" && module.exports) module.exports = { RULES_CONFIG };
  else root.RosterRulesConfig = { RULES_CONFIG };
})(typeof self !== "undefined" ? self : this);
