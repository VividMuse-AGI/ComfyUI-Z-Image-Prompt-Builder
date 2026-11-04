import copy
import hashlib
import json
import unittest
from unittest.mock import patch

import nodes as core
import modular_nodes as modules
from prompt_diagnostics import card_candidates, module_groups


class ResultCardTests(unittest.TestCase):
    def test_v014_outputs_unchanged_before_card_application(self):
        # Captured from unmodified 622155f BEFORE adding the new candidate types.
        classes = [core.ZImageChinesePromptBuilder] + [
            cls for cls in modules.NODE_CLASS_MAPPINGS.values()
            if issubclass(cls, modules.ZImageModuleNodeBase)]
        outputs = [getattr(cls(), cls.FUNCTION)(**{
            "预设": preset, "随机种子": seed,
            **dict.fromkeys(core.FIELD_ORDER, core.RANDOM_CHOICE)})
            for cls in classes for preset in core.PRESET_OPTIONS
            for seed in (0, 42, core.MAX_SEED)]
        self.assertEqual(len(outputs), 297)
        digest = hashlib.sha256(json.dumps(outputs, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
        self.assertEqual(digest, "2006e8d3530daa9430a6f29f568a82cb3bd40eee44b196063be18f5f66df2092")

    def execute(self, cls=core.ZImageChinesePromptBuilder, **inputs):
        method = cls.FUNCTION
        direct = getattr(cls(), method)(**inputs)
        with patch.object(core, "resolve_fields", wraps=core.resolve_fields) as resolver:
            actual = getattr(cls(), method)(unique_id="42", **inputs)
        self.assertEqual(resolver.call_count, 1)
        self.assertEqual(actual["result"], direct)
        return actual["ui"]["vividmuse_prompt_diagnostics"][0]

    def test_random_values_complete_canonical_and_independent(self):
        for preset in core.PRESET_OPTIONS:
            for seed in (42, core.MAX_SEED):
                data = self.execute(**{"预设": preset, "随机种子": seed,
                    **dict.fromkeys(core.FIELD_ORDER, core.RANDOM_CHOICE)})
                self.assertEqual(data["seed"], str(seed))
                self.assertEqual(data["card_candidates"]["version"], 1)
                for module, count in (("人物", 20), ("发型", 9), ("服装", 21), ("姿态动作", 10)):
                    candidate = data["card_candidates"]["modules"][module]
                    self.assertTrue(candidate["available"], (preset, seed, candidate))
                    self.assertIsNone(candidate["reason"])
                    self.assertEqual(len(candidate["values"]), count)
                    for name, value in candidate["values"].items():
                        self.assertEqual(value, data["resolved"][name])
                        self.assertIn(value, [core.EMPTY_CHOICE, *core.FIELD_OPTIONS[name]])
                    first = next(iter(candidate["values"]))
                    candidate["values"][first] = "changed"
                    self.assertNotEqual(data["resolved"][first], "changed")

    def test_replacement_and_empty_module_not_saveable(self):
        data = self.execute(**{"预设": core.PRESET_OPTIONS[1], "用户人物片段": "自定义人物"})
        self.assertEqual(data["card_candidates"]["modules"]["人物"],
                         {"available": False, "reason": "user_replaced"})
        data = self.execute(**dict.fromkeys(core.FIELD_ORDER, core.EMPTY_CHOICE))
        for candidate in data["card_candidates"]["modules"].values():
            self.assertEqual(candidate, {"available": False, "reason": "empty_module"})

    def test_hidden_branches_and_framing_omissions_preserved(self):
        inputs = {**dict.fromkeys(core.FIELD_ORDER, core.EMPTY_CHOICE),
            "穿搭结构": "上装＋下装", "上装类型": "垂坠衬衫", "下装类型": "高腰阔腿裤",
            "鞋履": "漆皮高跟鞋", "景别": "胸部以上", "构图适配": "按景别适配"}
        data = self.execute(**inputs)
        values = data["card_candidates"]["modules"]["服装"]["values"]
        self.assertEqual(values["鞋履"], "漆皮高跟鞋")
        self.assertEqual(values["下装类型"], "高腰阔腿裤")
        self.assertEqual(values["连衣裙类型"], core.EMPTY_CHOICE)
        self.assertIn("鞋履", [row["field"] for row in data["framing"]["omitted"]])
        self.assertNotIn("高跟鞋", data["zh"])
        data = self.execute(modules.ZImageClothingModule, **{
            **inputs, "前置提示词": modules.PromptChainText("prefix", {"景别": "胸部以上"})})
        self.assertEqual(data["card_candidates"]["modules"]["服装"]["values"], values)

    def test_only_owned_modules_have_candidates(self):
        for cls in modules.NODE_CLASS_MAPPINGS.values():
            if not issubclass(cls, modules.ZImageModuleNodeBase):
                continue
            data = self.execute(cls, **{"预设": core.PRESET_OPTIONS[1]})
            expected = {cls.MODULE_NAME} if cls.MODULE_NAME in ("人物", "发型", "服装", "姿态动作") else set()
            self.assertEqual(set(data["card_candidates"]["modules"]), expected)

    def test_invalid_or_missing_values_are_never_filled(self):
        data = self.execute(**{"预设": core.PRESET_OPTIONS[1]})
        groups = module_groups(core)
        fields = copy.deepcopy(data["resolved"])
        for invalid in (None, {}, core.RANDOM_CHOICE, core.FOLLOW_PRESET, "unknown"):
            broken = {**fields, "年龄阶段": invalid}
            before = copy.deepcopy(broken)
            candidate = card_candidates(core, groups, broken, {"人物": "body"}, {}, {})["modules"]["人物"]
            self.assertEqual(candidate, {"available": False, "reason": "unsupported_values"})
            self.assertEqual(broken, before)
        del fields["年龄阶段"]
        candidate = card_candidates(core, groups, fields, {"人物": "body"}, {}, {})["modules"]["人物"]
        self.assertEqual(candidate, {"available": False, "reason": "incomplete_fields"})

    def test_candidate_is_not_the_rendered_text_or_free_prompt(self):
        data = self.execute(**{"预设": core.PRESET_OPTIONS[1], "提示词密度": "精简",
                               "自由提示词": "private free prompt", "随机种子": 17})
        for module, candidate in data["card_candidates"]["modules"].items():
            self.assertEqual(set(candidate["values"]), set(module_groups(core)[module]))
            self.assertNotIn("private free prompt", str(candidate))
            self.assertNotIn("随机种子", candidate["values"])

    def test_hair_hidden_values_and_pose_replacements(self):
        inputs = {"预设": core.PRESET_OPTIONS[1], "发色模式": "基础发色",
                  "发色色调": core.FIELD_OPTIONS["发色色调"][0],
                  "染色方式": core.FIELD_OPTIONS["染色方式"][0]}
        data = self.execute(**inputs)
        for name in ("发色模式", "发色色调", "染色方式"):
            self.assertEqual(data["card_candidates"]["modules"]["发型"]["values"][name], data["resolved"][name])
        # Result cards reflect execution normalization, not inactive editor values.
        self.assertEqual(data["resolved"]["发色色调"], core.EMPTY_CHOICE)
        # Only the full builder has these replacement inputs; standalone nodes
        # must not gain undocumented ports as part of adding card support.
        for module in ("发型", "姿态动作"):
            data = self.execute(**{"预设": core.PRESET_OPTIONS[1], f"用户{module}片段": "用户替代"})
            self.assertEqual(data["card_candidates"]["modules"][module],
                             {"available": False, "reason": "user_replaced"})

    def test_new_candidates_reject_missing_and_unresolved_fields(self):
        data = self.execute(**{"预设": core.PRESET_OPTIONS[1]})
        groups = module_groups(core)
        for module in ("发型", "姿态动作"):
            field = groups[module][-1]
            for value in (None, {}, core.RANDOM_CHOICE, core.FOLLOW_PRESET, "unknown"):
                broken = {**data["resolved"], field: value}
                result = card_candidates(core, groups, broken, {module: "body"}, {}, {})
                self.assertEqual(result["modules"][module]["reason"], "unsupported_values")
            broken = dict(data["resolved"])
            del broken[field]
            result = card_candidates(core, groups, broken, {module: "body"}, {}, {})
            self.assertEqual(result["modules"][module]["reason"], "incomplete_fields")


if __name__ == "__main__":
    unittest.main()
