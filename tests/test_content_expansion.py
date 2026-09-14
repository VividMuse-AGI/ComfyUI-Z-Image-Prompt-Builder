"""Content coverage and compatibility: these tests do not certify image quality."""

import random
import unittest

import nodes as n
import modular_nodes as m
from scripts.generate_scene_catalog import TARGET, render_catalog


class ContentExpansionTests(unittest.TestCase):
    def test_complete_unique_library_chains_reference_known_options(self):
        self.assertEqual(len(n.POSE_BUNDLES), 56)
        self.assertEqual(len(n.POSE_BUNDLE_BY_ID), 56)
        self.assertEqual(len(n.SPECIALIST_THEME_POSE_IDS), 18)
        for bundle in n.POSE_BUNDLES:
            for field in n.POSE_OUTPUT_FIELDS:
                self.assertIn(bundle[field], n.FIELD_OPTIONS[field], (bundle["id"], field))
        for field in n._POSE_LIBRARY["fields"].values():
            ids = [option["id"] for option in field["options"]]
            labels = [option["label"] for option in field["options"]]
            self.assertEqual(len(ids), len(set(ids)))
            self.assertEqual(len(labels), len(set(labels)))
        self.assertEqual(n._POSE_LIBRARY["validation"]["model_image_tests"], "pending")

    def test_specialist_themes_use_complete_chains_in_all_scopes(self):
        for theme, ids in n.SPECIALIST_THEME_POSE_IDS.items():
            category = next(c for c, themes in n.THEME_OPTIONS_BY_CATEGORY.items() if theme in themes)
            expected = n.POSE_BUNDLE_BY_ID[ids[0]]
            requested = {f: n.EMPTY_CHOICE for f in n.FIELD_ORDER}
            requested.update({f: n.RANDOM_CHOICE for f in n.POSE_OUTPUT_FIELDS})
            requested.update({"写真大类": category, "写真主题": theme})
            for scope in n.RANDOM_SCOPES:
                for seed in (0, 7, 123456789):
                    resolved = n.resolve_fields(n.PRESET_OPTIONS[0], scope, seed, requested)
                    self.assertEqual({f: resolved[f] for f in n.POSE_OUTPUT_FIELDS},
                                     {f: expected[f] for f in n.POSE_OUTPUT_FIELDS})
                    self.assertEqual(resolved["服装配件"], n.EMPTY_CHOICE)
                    self.assertEqual(resolved, n.resolve_fields(n.PRESET_OPTIONS[0], scope, seed, requested))

    def test_upstream_theme_reaches_independent_pose_node_in_both_languages(self):
        random_pose = {f: n.RANDOM_CHOICE for f in n.POSE_OUTPUT_FIELDS}
        for theme, ids in n.SPECIALIST_THEME_POSE_IDS.items():
            expected = n.POSE_BUNDLE_BY_ID[ids[0]]
            prefix = m.PromptChainText("", {"写真主题": theme})
            for density in n.PROMPT_DENSITIES:
                zh, en = m.ZImagePoseModule().build_module(
                    **random_pose, 前置提示词=prefix, 提示词密度=density, 输出排版="按模块分段")
                self.assertEqual(zh, m.render_module_fragment("姿态动作", expected, density))
                self.assertEqual(en, n.render_english_module_fragment("姿态动作", expected, density))
                self.assertNotRegex(en, r"[\u3400-\u9fff]")
                hand = expected["手部动作"]
                self.assertIn(n.POSE_VALUE_TEXT["手部动作"][hand] if density != "精简" else hand, zh)
                self.assertEqual(prefix.zimage_resolved_fields, {"写真主题": theme})

    def test_locks_empty_choices_and_custom_pose_override_survive(self):
        requested = {f: n.RANDOM_CHOICE for f in n.POSE_OUTPUT_FIELDS}
        requested.update({"写真主题": "网球场阳光运动写真", "手部动作": n.EMPTY_CHOICE,
                          "表情": "开怀大笑"})
        resolved = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[1], 42, requested)
        self.assertEqual(resolved["手部动作"], n.EMPTY_CHOICE)
        self.assertEqual(resolved["表情"], "开怀大笑")
        result = n.ZImageChinesePromptBuilder().build_prompt(
            **requested, 用户姿态动作片段="用户自定义动作", 输出排版="按模块分段")
        self.assertIn("用户自定义动作", result[0])
        self.assertNotIn("一手握网球拍一手扶拍颈", result[0])

    def test_all_accessory_sets_render_components_instead_of_set_names(self):
        empty = {f: n.EMPTY_CHOICE for f in n.FIELD_ORDER}
        self.assertEqual(len(n.ACCESSORY_SET_TEXT), 18)
        self.assertEqual(set(n.ACCESSORY_SET_LABELS), set(n._ACCESSORY_SET_ENGLISH))
        for bundle_id, label in n.ACCESSORY_SET_LABELS.items():
            fields = {**empty, "服装配件": label}
            for density in n.PROMPT_DENSITIES:
                zh, en = m.ZImageClothingModule().build_module(**fields, 提示词密度=density)
                expected = n.ACCESSORY_SET_TEXT[label] if density == "详细" else n.ACCESSORY_SET_COMPACT_TEXT[label]
                self.assertIn(expected, zh)
                self.assertNotIn("配饰组合", zh)
                self.assertNotIn("套组", zh)
                self.assertIn(n._ACCESSORY_SET_ENGLISH[bundle_id], en)
                self.assertNotRegex(en, r"[\u3400-\u9fff]")
                full = n.ZImageChinesePromptBuilder().build_prompt(**fields, 提示词密度=density)
                self.assertEqual(full[0], zh)
                self.assertEqual(full[-1], en)
        self.assertEqual(m.ZImageClothingModule().build_module(**empty), ("", ""))

    def test_accessory_random_pool_uses_recipe_specific_sets(self):
        self.assertEqual(set(n.ACCESSORY_SET_RECIPE_IDS), set(n.CLOTHING_RECIPE_BY_ID))
        reachable = set()
        for recipe in n.CLOTHING_RECIPES:
            expected_sets = {n.ACCESSORY_SET_LABELS[i] for i in n.ACCESSORY_SET_RECIPE_IDS[recipe["id"]]}
            seen = {n._random_clothing_value(random.Random(seed), "服装配件", recipe) for seed in range(400)}
            picked_sets = seen.intersection(n.ACCESSORY_SET_TEXT)
            self.assertEqual(picked_sets, expected_sets)
            reachable.update(picked_sets)
        self.assertEqual(reachable, set(n.ACCESSORY_SET_TEXT))

    def test_scene_catalog_matches_backend_and_retains_legacy_values(self):
        self.assertEqual(len(n.SCENE_LOCATIONS_BY_CATEGORY), 12)
        locations = [v for values in n.SCENE_LOCATIONS_BY_CATEGORY.values() for v in values]
        self.assertEqual(len(locations), 105)
        self.assertEqual(len(locations), len(set(locations)))
        self.assertTrue(set(locations).issubset(n.FIELD_OPTIONS["场景地点"]))
        source = TARGET.read_text(encoding="utf-8")
        start = source.index("const SCENE_LOCATIONS_BY_CATEGORY = ")
        end = source.index("const PRESETS = ", start)
        self.assertEqual(source[start:end], render_catalog())
        self.assertIn("临街咖啡馆窗景", n.FIELD_OPTIONS["场景地点"])
