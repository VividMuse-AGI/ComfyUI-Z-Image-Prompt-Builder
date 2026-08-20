import json
import pathlib
import unittest

import nodes


NEW_PRESETS = (
    "古风汉服写真",
    "海边假日度假写真",
    "赛博都市夜景写真",
)

THEME_SCOPE_LOCKED_FIELDS = {
    "画面比例",
    "写真大类",
    "写真主题",
    "年龄阶段",
    "族裔大类",
    "地域族裔分支",
    "脸型",
    "轮廓细节",
    "眼型",
    "瞳色",
    "眼睑特征",
    "肤色",
    "肤质",
    "妆容模式",
    "整体妆容预设",
    "底妆质感",
    "眼影色系",
    "眼线造型",
    "唇妆颜色",
    "唇面质感",
    "基础身形",
    "身量观感",
    "线条重点",
}


def same_theme_request():
    return {
        field: (
            nodes.FOLLOW_PRESET
            if field in THEME_SCOPE_LOCKED_FIELDS
            else nodes.RANDOM_CHOICE
        )
        for field in nodes.FIELD_ORDER
    }


class PublicReleaseRegressionTests(unittest.TestCase):
    def test_new_compatibility_recipe_bundle_references_exist_in_source_libraries(self):
        library_root = pathlib.Path(__file__).resolve().parents[1] / "phrase_library"
        compatibility = json.loads(
            (library_root / "compatibility_v1.json").read_text(encoding="utf-8")
        )
        source_ids = set()

        def collect_ids(value):
            if isinstance(value, dict):
                item_id = value.get("id")
                if isinstance(item_id, str):
                    source_ids.add(item_id)
                for child in value.values():
                    collect_ids(child)
            elif isinstance(value, list):
                for child in value:
                    collect_ids(child)

        for filename in compatibility["source_libraries"]:
            collect_ids(json.loads((library_root / filename).read_text(encoding="utf-8")))

        recipes = {
            recipe["id"]: recipe
            for recipe in compatibility["portrait_recipes"]
        }
        for recipe_id in ("hanfu_garden_portrait", "cyber_neon_night"):
            for bundle_group, bundle_id in recipes[recipe_id]["bundles"].items():
                with self.subTest(
                    recipe_id=recipe_id,
                    bundle_group=bundle_group,
                    bundle_id=bundle_id,
                ):
                    self.assertIn(bundle_id, source_ids)

    def test_new_presets_have_dedicated_group_profiles(self):
        profile_maps = (
            nodes.PROFILE_POSE_BUNDLES,
            nodes.PROFILE_SCENE_BUNDLES,
            nodes.PROFILE_CAMERA_BUNDLES,
            nodes.PROFILE_HAIR_BUNDLES,
            nodes.CLOTHING_PROFILE_RECIPE_IDS,
        )

        for preset in NEW_PRESETS:
            with self.subTest(preset=preset):
                for profile_map in profile_maps:
                    self.assertIn(preset, profile_map)
                    self.assertTrue(profile_map[preset])

    def test_same_theme_randomization_stays_within_each_new_preset(self):
        requested = same_theme_request()
        expectations = {
            "古风汉服写真": {
                "scene_categories": {"东方传统", "自然户外", "文化艺术"},
                "pose_events": {"回眸一笑", "墙边安静等待", "持剑侧立"},
                "headwear": {"金色发簪", "玉质发簪", "小白花发饰", nodes.EMPTY_CHOICE},
                "focals": {"50mm", "85mm", "105mm"},
            },
            "海边假日度假写真": {
                "scene_categories": {"自然户外"},
                "pose_events": {"回眸一笑", "行走中回头", "阳台短暂停步"},
                "headwear": {"浅草色编织草帽", "丝质发带", "珍珠发夹", nodes.EMPTY_CHOICE},
                "focals": {"35mm", "50mm", "135mm"},
            },
            "赛博都市夜景写真": {
                "scene_categories": {"都市户外"},
                "pose_events": {"行走中回头"},
                "headwear": {"几何金属发夹", "黑色细发带", "珍珠发夹", nodes.EMPTY_CHOICE},
                "focals": {"35mm", "50mm", "70mm"},
            },
        }

        for preset, expected in expectations.items():
            for seed in range(100):
                resolved = nodes.resolve_fields(
                    preset,
                    nodes.RANDOM_SCOPES[1],
                    seed,
                    requested,
                )
                with self.subTest(preset=preset, seed=seed):
                    self.assertIn(resolved["场景大类"], expected["scene_categories"])
                    self.assertIn(resolved["画面瞬间"], expected["pose_events"])
                    self.assertIn(resolved["头部配饰"], expected["headwear"])
                    self.assertIn(resolved["等效焦段"], expected["focals"])
                    if preset == "古风汉服写真":
                        self.assertEqual(resolved["穿搭结构"], "连衣裙")
                        self.assertEqual(resolved["连衣裙类型"], "汉服")
                    elif preset == "海边假日度假写真":
                        self.assertIn(
                            resolved["穿搭结构"], {"连衣裙", "上装＋下装"}
                        )
                        self.assertNotEqual(resolved["连衣裙类型"], "修身晚礼服")
                    else:
                        self.assertIn(
                            resolved["穿搭结构"],
                            {"连衣裙", "上装＋下装", "叠穿造型"},
                        )
                        self.assertNotEqual(resolved["连衣裙类型"], "碎花吊带连衣裙")

    def test_new_default_poses_are_registered_and_semantically_consistent(self):
        expected_pose_atoms = {
            "古风汉服写真": {
                "画面瞬间": "回眸一笑",
                "基础姿态": "自然站立",
                "表情": "温柔浅笑",
            },
            "海边假日度假写真": {
                "画面瞬间": "回眸一笑",
                "基础姿态": "自然站立",
                "表情": "明朗笑容",
            },
            "赛博都市夜景写真": {
                "画面瞬间": "行走中回头",
                "基础姿态": "行走中停步",
                "腿部动作": "自然迈步",
                "表情": "明艳自信",
            },
        }
        registered = {
            tuple(bundle[field] for field in nodes.POSE_OUTPUT_FIELDS)
            for bundle in nodes.POSE_BUNDLES
        }

        for preset, expected in expected_pose_atoms.items():
            actual = nodes.PRESETS[preset]
            with self.subTest(preset=preset):
                for field, value in expected.items():
                    self.assertEqual(actual[field], value)
                self.assertIn(
                    tuple(actual[field] for field in nodes.POSE_OUTPUT_FIELDS),
                    registered,
                )

    def test_named_preset_visual_profiles_match_their_capture_medium(self):
        expected_medium = {
            "日系森系夏日柔光写真": "35毫米胶片摄影",
            "海边假日度假写真": "便携数码相机摄影",
        }

        for preset, values in nodes.PRESETS.items():
            if preset == nodes.CUSTOM_PRESET:
                continue
            medium = values["成像媒介"]
            medium_id = nodes.CAPTURE_MEDIUM_LABEL_TO_ID[medium]
            visual_profile_id = nodes._PRESET_VISUAL_BUNDLES[preset][1]
            with self.subTest(preset=preset):
                if preset in expected_medium:
                    self.assertEqual(medium, expected_medium[preset])
                self.assertIn(
                    visual_profile_id,
                    nodes.CAPTURE_MEDIUM_VISUAL_PROFILES_BY_ID[medium_id],
                )

    def test_scene_formatter_does_not_repeat_existing_suffixes(self):
        fields = {field: nodes.EMPTY_CHOICE for field in nodes.FIELD_ORDER}
        fields.update(
            {
                "前景框景": "树枝前景",
                "背景环境": "高级灰渐变背景",
            }
        )

        for density in ("精简", "标准"):
            prompt = nodes.compose_prompt_text(fields, density)
            with self.subTest(density=density):
                self.assertIn("树枝前景", prompt)
                self.assertIn("高级灰渐变背景", prompt)
                self.assertNotIn("前景前景", prompt)
                self.assertNotIn("背景背景", prompt)


if __name__ == "__main__":
    unittest.main()
