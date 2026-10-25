import copy
import unittest
from unittest.mock import patch

import nodes as core
import modular_nodes as modules
from prompt_diagnostics import module_groups, shoot_plan_candidates


class ShootPlanCandidateTests(unittest.TestCase):
    def execute(self, cls=core.ZImageChinesePromptBuilder, **inputs):
        direct = getattr(cls(), cls.FUNCTION)(**inputs)
        with patch.object(core, "resolve_fields", wraps=core.resolve_fields) as resolver:
            actual = getattr(cls(), cls.FUNCTION)(unique_id="shoot-plan", **inputs)
        self.assertEqual(resolver.call_count, 1)
        self.assertEqual(actual["result"], direct)
        return actual["ui"]["vividmuse_prompt_diagnostics"][0]

    def test_all_presets_seeds_complete_canonical_snapshots_without_reroll(self):
        for preset in core.PRESET_OPTIONS:
            for seed in (42, core.MAX_SEED):
                data = self.execute(**{"预设": preset, "随机种子": seed,
                    **dict.fromkeys(core.FIELD_ORDER, core.RANDOM_CHOICE)})
                self.assertEqual(data["seed"], str(seed))
                self.assertEqual(set(data["card_candidates"]["modules"]), {"人物", "服装"})
                self.assertEqual(data["shoot_plan_candidates"]["version"], 1)
                for module, count in (("场景", 9), ("摄影", 7), ("视觉表现", 12)):
                    candidate = data["shoot_plan_candidates"]["modules"][module]
                    if module == "场景":
                        category, location = data["resolved"]["场景大类"], data["resolved"]["场景地点"]
                        if (category != core.EMPTY_CHOICE and location != core.EMPTY_CHOICE
                                and location not in core.SCENE_LOCATIONS_BY_CATEGORY.get(category, ())):
                            # Existing cross-style/legacy locations are not rewritten
                            # by a snapshot feature just to make them saveable.
                            self.assertEqual(candidate, {"available": False, "reason": "incompatible_scene"})
                            continue
                    self.assertTrue(candidate["available"], (preset, seed, candidate))
                    self.assertEqual(len(candidate["values"]), count)
                    for field, value in candidate["values"].items():
                        self.assertEqual(value, data["resolved"][field])
                        self.assertIn(value, [core.EMPTY_CHOICE, *core.FIELD_OPTIONS[field]])
                    field = next(iter(candidate["values"]))
                    candidate["values"][field] = "changed"
                    self.assertNotEqual(data["resolved"][field], "changed")

    def test_only_owned_modules_no_upstream_inference(self):
        for cls in modules.NODE_CLASS_MAPPINGS.values():
            if not issubclass(cls, modules.ZImageModuleNodeBase):
                continue
            data = self.execute(cls, 前置提示词=modules.PromptChainText("upstream", {"景别": "面部特写"}))
            expected = {cls.MODULE_NAME} if cls.MODULE_NAME in ("场景", "摄影", "视觉表现") else set()
            self.assertEqual(set(data["shoot_plan_candidates"]["modules"]), expected)

    def test_replacements_and_empty_modules(self):
        for module in ("场景", "摄影", "视觉表现"):
            data = self.execute(**{f"用户{module}片段": "TXT replacement"})
            self.assertEqual(data["shoot_plan_candidates"]["modules"][module],
                             {"available": False, "reason": "user_replaced"})
        data = self.execute(**dict.fromkeys(core.FIELD_ORDER, core.EMPTY_CHOICE))
        for item in data["shoot_plan_candidates"]["modules"].values():
            self.assertEqual(item, {"available": False, "reason": "empty_module"})

    def test_invalid_missing_and_incompatible_scene_are_explicit(self):
        data = self.execute()
        fields = data["resolved"]
        fragments = {item["name"]: item["zh"] for item in data["modules"]}
        english = {item["name"]: item["en"] for item in data["modules"]}
        def candidate(values, module="摄影"):
            return shoot_plan_candidates(core, module_groups(core), values, fragments, english, {})["modules"][module]
        for value in (None, {}, core.RANDOM_CHOICE, core.FOLLOW_PRESET, "unknown"):
            self.assertEqual(candidate({**fields, "景别": value}),
                             {"available": False, "reason": "unsupported_values"})
        missing = dict(fields)
        del missing["景别"]
        self.assertEqual(candidate(missing), {"available": False, "reason": "incomplete_fields"})
        category, allowed = next(iter(core.SCENE_LOCATIONS_BY_CATEGORY.items()))
        other = next(value for values in core.SCENE_LOCATIONS_BY_CATEGORY.values() for value in values if value not in allowed)
        self.assertEqual(candidate({**fields, "场景大类": category, "场景地点": other}, "场景"),
                         {"available": False, "reason": "incompatible_scene"})

    def test_candidates_preserve_preframing_fields_and_are_json_serializable(self):
        import json
        data = self.execute(景别="面部特写", 构图适配="按景别适配", 自由提示词="FREE_MARKER")
        parsed = json.loads(json.dumps(data, ensure_ascii=False))
        for module, item in parsed["shoot_plan_candidates"]["modules"].items():
            self.assertEqual(item["values"], {name: data["resolved"][name] for name in module_groups(core)[module]})
            self.assertNotIn("FREE_MARKER", item["values"].values())

    def test_candidate_helper_is_read_only(self):
        data = self.execute()
        groups = module_groups(core)
        fragments = {item["name"]: item["zh"] for item in data["modules"]}
        args = [groups, data["resolved"], fragments, dict(fragments), {}]
        before = copy.deepcopy(args)
        shoot_plan_candidates(core, *args)
        self.assertEqual(args, before)
