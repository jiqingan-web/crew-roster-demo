#!/usr/bin/env python3
"""rules/crew_rules.yaml -> js/rules-config.js（规则修订只改 YAML，再运行本脚本）"""
import json, yaml, pathlib, hashlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'rules/crew_rules.yaml').read_text(encoding='utf-8')
cfg = yaml.safe_load(src)
cfg['_sha1'] = hashlib.sha1(src.encode()).hexdigest()[:10]
js = ('/* 自动生成：python3 scripts/gen_rules_config.py（源：rules/crew_rules.yaml）。请勿手改。 */\n'
      '(function (root) {\n  "use strict";\n  const RULES_CONFIG = ' + json.dumps(cfg, ensure_ascii=False, indent=1) + ';\n'
      '  if (typeof module === "object" && module.exports) module.exports = { RULES_CONFIG };\n'
      '  else root.RosterRulesConfig = { RULES_CONFIG };\n'
      '})(typeof self !== "undefined" ? self : this);\n')
(root / 'js/rules-config.js').write_text(js, encoding='utf-8')
print('ok', cfg['meta']['version'], cfg['_sha1'])
