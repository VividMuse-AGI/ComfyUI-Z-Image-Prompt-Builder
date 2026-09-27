"""Reference additions: reachability, omission, locks and bilingual output."""
import collections
import json
from pathlib import Path
import unittest

import nodes as n
import modular_nodes as m


def blank():
    return {f: n.EMPTY_CHOICE for f in n.FIELD_ORDER}


def fixture(entry, field):
    values = blank()
    module = entry["module"]
    if module == "服装":
        values.update({"穿搭结构": "上装＋下装", "上装类型": "垂坠衬衫",
                       "下装类型": "直筒西裤", "上装颜色": "奶油白", "下装颜色": "奶油白"})
        if field.startswith("连衣裙"):
            values.update({"穿搭结构": "连衣裙", "上装类型": n.EMPTY_CHOICE,
                           "下装类型": n.EMPTY_CHOICE, "连衣裙类型": "收腰A字连衣裙", "连衣裙颜色": "奶油白"})
        if field.startswith("连体服"):
            values.update({"穿搭结构": "连体服", "上装类型": n.EMPTY_CHOICE,
                           "下装类型": n.EMPTY_CHOICE, "连体服类型": "衬衫式连体裤", "连体服颜色": "奶油白"})
    for name, allowed in entry.get("require", {}).items():
        values[name] = allowed[0]
    values.update(entry.get("set", {}))
    if module == "发型":
        values["发型造型"] = entry["styles"][0]
    automatic = ({field} if module in ("服装", "发型") else
                 set(n.POSE_OUTPUT_FIELDS if module == "姿态动作" else n.SCENE_GROUP_FIELDS))
    return values, automatic


class ReferencePoolTests(unittest.TestCase):
    def test_schema_and_all_dependency_values_are_valid(self):
        entries = n.REFERENCE_POOL.entries
        self.assertEqual(len(entries), 69)
        self.assertEqual(len({e["id"] for e in entries}), 69)
        self.assertEqual(collections.Counter(e["module"] for e in entries),
                         {"姿态动作": 40, "服装": 14, "发型": 6, "场景": 9})
        for e in entries:
            for field in e["fields"]:
                self.assertIn(e["label"], n.FIELD_OPTIONS[field])
                self.assertNotIn(e["label"], n.RANDOM_FIELD_OPTIONS[field])
            for field, values in e.get("require", {}).items():
                for value in values:
                    self.assertIn(value, [n.EMPTY_CHOICE, *n.FIELD_OPTIONS[field]], e["id"])
            for field, value in e.get("set", {}).items():
                self.assertIn(value, [n.EMPTY_CHOICE, *n.FIELD_OPTIONS[field]], e["id"])

    def test_every_candidate_is_reachable_through_public_resolver(self):
        for entry in n.REFERENCE_POOL.entries:
            field = entry["fields"][0]
            values, automatic = fixture(entry, field)
            request = {**values, **{f: n.RANDOM_CHOICE for f in automatic}}
            found = None
            for seed in range(2048):
                result = n.resolve_fields(n.CUSTOM_PRESET, n.RANDOM_SCOPES[2], seed, request)
                if result[field] == entry["label"]:
                    found = result
                    break
            self.assertIsNotNone(found, entry["id"])
            self.assertEqual(found, n.resolve_fields(n.CUSTOM_PRESET, n.RANDOM_SCOPES[2], seed, request))
            for name in n.FIELD_ORDER:
                if name not in automatic:
                    # Hidden clothing branches are an existing resolver behavior.
                    if name in n.CLOTHING_BRANCH_FIELDS and name not in n.CLOTHING_MODE_FIELDS.get(
                        found["穿搭结构"], n.CLOTHING_BRANCH_FIELDS
                    ):
                        continue
                    self.assertEqual(found[name], values[name], (entry["id"], name))

    def test_new_options_survive_both_node_paths_and_all_densities(self):
        classes = {"姿态动作": m.ZImagePoseModule, "服装": m.ZImageClothingModule,
                   "发型": m.ZImageHairModule, "场景": m.ZImageSceneModule}
        for entry in n.REFERENCE_POOL.entries:
            for field in entry["fields"]:
                request = {**blank(), field: entry["label"], "预设": n.CUSTOM_PRESET}
                for density in n.PROMPT_DENSITIES:
                    full = n.ZImageChinesePromptBuilder().build_prompt(**request, 提示词密度=density)
                    module = classes[entry["module"]]().build_module(**request, 提示词密度=density)
                    with self.subTest(entry=entry["id"], field=field, density=density):
                        self.assertTrue(full[0])
                        self.assertTrue(full[-1])
                        self.assertTrue(module[0])
                        self.assertTrue(module[-1])
                        self.assertNotRegex(full[-1], r"[\u3400-\u9fff]")

    def test_new_complete_pose_replaces_inherited_and_random_action_atoms(self):
        for value in (n.FOLLOW_PRESET, n.RANDOM_CHOICE):
            request = {f: value for f in n.POSE_OUTPUT_FIELDS}
            request["基础姿态"] = "站姿双手轻撑桌面"
            result = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[2], 3, request)
            self.assertEqual(result["基础姿态"], request["基础姿态"])
            for field in n.POSE_OUTPUT_FIELDS:
                if field != "基础姿态":
                    self.assertEqual(result[field], n.EMPTY_CHOICE)

    def test_pose_locks_omissions_and_incompatible_context_exclude_additions(self):
        entry = n.REFERENCE_POOL.by_id["C03"]
        values, automatic = fixture(entry, "基础姿态")
        self.assertTrue(n.REFERENCE_POOL._eligible(entry, "基础姿态", values, automatic))
        for field in n.POSE_OUTPUT_FIELDS:
            self.assertFalse(n.REFERENCE_POOL._eligible(entry, "基础姿态", values, automatic - {field}))
        values["场景地点"] = "水下幻境"
        self.assertFalse(n.REFERENCE_POOL._eligible(entry, "基础姿态", values, automatic))
        values["场景地点"] = n.EMPTY_CHOICE
        values["景别"] = "面部特写"
        self.assertFalse(n.REFERENCE_POOL._eligible(entry, "基础姿态", values, automatic))

    def test_complete_scene_drops_inherited_setting_but_keeps_explicit_locks(self):
        request = {"背景环境": "汽车后排座舱", "时间切片": "夜间"}
        result = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[0], 12, request)
        self.assertEqual(result["时间切片"], "夜间")
        self.assertEqual(result["场景地点"], n.EMPTY_CHOICE)
        self.assertEqual(result["背景环境"], "汽车后排座舱")
        self.assertEqual(result["场景大类"], "交通空间")

    def test_cabin_scene_limits_random_camera_even_with_pose_disabled(self):
        request = {**blank(), "背景环境": "汽车后排座舱",
                   **{f: n.RANDOM_CHOICE for f in n.CAMERA_OUTPUT_FIELDS}}
        for seed in range(32):
            result = n.resolve_fields(n.CUSTOM_PRESET, n.RANDOM_SCOPES[2], seed, request)
            self.assertIn(result["景别"], ("腰部以上", "胸部以上", "坐姿半身"))
    def test_dependency_rejections_and_no_unconstrained_fallback(self):
        for key, bad_field, bad_value in (
            ("C17", "穿搭结构", "连衣裙"),
            ("C36", "上装类型", "运动背心"),
            ("B004Q11", "场景地点", "海边"),
            ("B007Q9", "鞋履", "尖头穆勒鞋"),
            ("B014Q1", "鞋履", "白色运动鞋"),
            ("B006Q1", "身体方向", "正面朝向镜头"),
            ("C21", "上装颜色", "酒红色"),
        ):
            entry = n.REFERENCE_POOL.by_id[key]
            field = entry["fields"][0]
            values, automatic = fixture(entry, field)
            values[bad_field] = bad_value
            self.assertFalse(n.REFERENCE_POOL._eligible(entry, field, values, automatic), key)

    def test_modern_prop_and_indoor_scene_do_not_leak_into_other_themes(self):
        entry = n.REFERENCE_POOL.by_id["B018Q1"]
        values, automatic = fixture(entry, "基础姿态")
        values["写真主题"] = "古风汉服写真"
        self.assertFalse(n.REFERENCE_POOL._eligible(entry, "基础姿态", values, automatic))
        entry = n.REFERENCE_POOL.by_id["B007Q8"]
        values, automatic = fixture(entry, "背景环境")
        values.update({"写真主题": "春日花海写真", "场景大类": "自然户外"})
        self.assertFalse(n.REFERENCE_POOL._eligible(entry, "背景环境", values, automatic))

    def test_extension_camera_requirements_and_all_random_lock_safety(self):
        for seed in range(256):
            request = {f: n.RANDOM_CHOICE for f in n.FIELD_ORDER}
            request.update({"写真主题": n.EMPTY_CHOICE, "写真大类": n.EMPTY_CHOICE})
            result = n.resolve_fields(n.CUSTOM_PRESET, n.RANDOM_SCOPES[2], seed, request)
            for field, value in result.items():
                self.assertIn(value, [n.EMPTY_CHOICE, *n.FIELD_OPTIONS[field]])
            pose = n.REFERENCE_POOL.by_option.get(("基础姿态", result["基础姿态"]))
            if pose:
                from reference_pool import ACTION_SHOTS
                self.assertIn(result["景别"], pose.get("shots", ACTION_SHOTS))
        original = blank()
        n.REFERENCE_POOL.apply(19, original, set())
        self.assertEqual(original, blank())

    def test_generated_english_catalog_contains_all_new_choices(self):
        source = (Path(n.__file__).parent / "web/js/i18n_catalog.js").read_text(encoding="utf-8")
        catalog = json.loads(source.split("export const EN_CATALOG = ", 1)[1].rstrip(";\n"))
        for entry in n.REFERENCE_POOL.entries:
            for field in entry["fields"]:
                value = catalog["optionLabels"][field][entry["label"]]
                self.assertTrue(value)
                self.assertNotRegex(value, r"[\u3400-\u9fff]")


if __name__ == '__main__':
    unittest.main()
