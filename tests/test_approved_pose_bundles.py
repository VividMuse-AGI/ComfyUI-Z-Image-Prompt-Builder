import hashlib
import json
import unittest

import nodes as n
import modular_nodes as m


class ApprovedPoseBundleTests(unittest.TestCase):
    def test_six_chains_reuse_complete_existing_preset_fields(self):
        self.assertEqual(len(n.POSE_BUNDLES), 56)
        self.assertEqual(len({b["id"] for b in n.POSE_BUNDLES}), 56)
        self.assertEqual(len(n.APPROVED_PRESET_POSE_IDS), 6)
        for preset, bundle_id in n.APPROVED_PRESET_POSE_IDS.items():
            bundle = n.POSE_BUNDLE_BY_ID[bundle_id]
            self.assertIsNot(bundle, n.PRESETS[preset])
            for field in n.POSE_OUTPUT_FIELDS:
                self.assertEqual(bundle[field], n.PRESETS[preset][field])
                self.assertIn(bundle[field], n.FIELD_OPTIONS[field])
            self.assertIn(bundle, n.PROFILE_POSE_BUNDLES[preset])

    def test_existing_ten_fixed_presets_remain_byte_identical(self):
        rows = [(p, d, n.ZImageChinesePromptBuilder().build_prompt(预设=p, 提示词密度=d))
                for p in n.PRESET_OPTIONS[:-1] for d in n.PROMPT_DENSITIES]
        digest = hashlib.sha256(json.dumps(rows, ensure_ascii=False).encode()).hexdigest()
        self.assertEqual(digest, "cc6ef48749f8e588c13e90105cba38604465724b433b9d02bff8a91a9554890e")

    def test_every_new_chain_is_reachable_in_all_random_scopes(self):
        for preset, bundle_id in n.APPROVED_PRESET_POSE_IDS.items():
            expected = n.POSE_BUNDLE_BY_ID[bundle_id]
            expected_signature = tuple(expected[f] for f in n.POSE_OUTPUT_FIELDS)
            for scope in n.RANDOM_SCOPES:
                requested = {f: n.FOLLOW_PRESET for f in n.FIELD_ORDER}
                requested.update({f: n.RANDOM_CHOICE for f in n.POSE_OUTPUT_FIELDS})
                pool = (n._theme_directed_pose_bundles(n.PRESETS[preset]["写真主题"])
                        if scope == n.RANDOM_SCOPES[2] else n.PROFILE_POSE_BUNDLES[preset])
                allowed = {tuple(b[f] for f in n.POSE_OUTPUT_FIELDS) for b in pool}
                seen = set()
                for seed in range(100):
                    result = n.resolve_fields(preset, scope, seed, requested)
                    signature = tuple(result[f] for f in n.POSE_OUTPUT_FIELDS)
                    self.assertIn(signature, allowed, (preset, scope, seed))
                    seen.add(signature)
                self.assertIn(expected_signature, seen, (preset, scope))
                self.assertEqual(n.resolve_fields(preset, scope, 17, requested),
                                 n.resolve_fields(preset, scope, 17, requested))

    def test_locked_base_pose_preserves_its_complete_chain_in_both_nodes(self):
        for preset, bundle_id in n.APPROVED_PRESET_POSE_IDS.items():
            expected = n.POSE_BUNDLE_BY_ID[bundle_id]
            requested = {f: n.RANDOM_CHOICE for f in n.POSE_OUTPUT_FIELDS}
            requested["基础姿态"] = expected["基础姿态"]
            for density in n.PROMPT_DENSITIES:
                resolved = n.resolve_fields(preset, n.RANDOM_SCOPES[1], 12, requested)
                self.assertEqual({f: resolved[f] for f in n.POSE_OUTPUT_FIELDS},
                                 {f: expected[f] for f in n.POSE_OUTPUT_FIELDS})
                zh, en = m.ZImagePoseModule().build_module(
                    **requested, 预设=preset, 提示词密度=density, 输出排版="按模块分段")
                self.assertEqual(zh, m.render_module_fragment("姿态动作", expected, density))
                self.assertEqual(en, n.render_english_module_fragment("姿态动作", expected, density))
                full = n.ZImageChinesePromptBuilder().build_prompt(
                    **requested, 预设=preset, 提示词密度=density, 输出排版="按模块分段")
                self.assertIn(en, full[-1])

    def test_empty_module_and_custom_text_still_take_priority(self):
        empty = {f: n.EMPTY_CHOICE for f in n.POSE_OUTPUT_FIELDS}
        for preset in n.APPROVED_PRESET_POSE_IDS:
            zh, en = m.ZImagePoseModule().build_module(**empty, 预设=preset)
            self.assertEqual((zh, en), ("", ""))
            result = n.ZImageChinesePromptBuilder().build_prompt(
                预设=preset, 用户姿态动作片段="保留用户自定义动作", 输出排版="按模块分段")
            self.assertIn("保留用户自定义动作", result[0])
            self.assertIn("保留用户自定义动作", result[-1])

    def test_specific_theme_mapping_does_not_expand_unrelated_themes(self):
        approved = set(n.APPROVED_PRESET_POSE_IDS.values())
        for theme in ("拳击训练力量写真", "日系咖啡馆生活写真", "汉服襦裙写真"):
            self.assertTrue(approved.isdisjoint(
                b["id"] for b in n._theme_directed_pose_bundles(theme)))
