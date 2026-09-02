import json
import pathlib
import unittest

import nodes


BUILTIN_PRESETS = tuple(nodes.PRESET_OPTIONS[:-1])

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
    def test_unspecified_pose_does_not_filter_camera_bundles(self):
        sample = nodes.CAMERA_BUNDLES[:5]
        for pose in ("", nodes.EMPTY_CHOICE, nodes.FOLLOW_PRESET):
            self.assertEqual(
                nodes._pose_compatible_camera_bundles(pose, sample),
                sample,
            )
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

    def test_all_ten_presets_have_dedicated_group_profiles(self):
        profile_maps = (
            nodes.PROFILE_POOLS,
            nodes.PROFILE_POSE_BUNDLES,
            nodes.PROFILE_SCENE_BUNDLES,
            nodes.PROFILE_CAMERA_BUNDLES,
            nodes.PROFILE_HAIR_BUNDLES,
            nodes.CLOTHING_PROFILE_RECIPE_IDS,
            nodes.PROFILE_LIGHTING_PLANS,
            nodes.PROFILE_VISUAL_PROFILES,
        )

        self.assertEqual(len(BUILTIN_PRESETS), 10)
        for preset in BUILTIN_PRESETS:
            with self.subTest(preset=preset):
                for profile_map in profile_maps:
                    self.assertIn(preset, profile_map)
                    self.assertTrue(profile_map[preset])

    def test_all_preset_values_are_registered_dropdown_values(self):
        for preset in BUILTIN_PRESETS:
            for field, value in nodes.PRESETS[preset].items():
                with self.subTest(preset=preset, field=field, value=value):
                    self.assertTrue(
                        value == nodes.EMPTY_CHOICE
                        or value in nodes.FIELD_OPTIONS[field]
                    )

    def test_confirmed_preset_signatures(self):
        expected = {
            "日系草地单车夏日柔光写真": {
                "画面比例": "2:3竖构图",
                "基础姿态": "单车侧坐",
                "手部动作": "举白玫瑰并扶大腿",
            },
            "日系咖啡馆暖调近景人像": {
                "成像媒介": "手机计算摄影",
                "手部动作": "双手托住咖啡杯",
                "机位": "高位俯拍",
            },
            "夜间室内轻奢硬闪时尚写真": {
                "成像媒介": "早期CCD数码摄影",
                "基础姿态": "复古扶手椅坐姿",
                "手部动作": "双手放在脑后",
            },
            "都市职场轻奢坐姿写真": {
                "基础姿态": "椅子前缘坐姿",
                "腿部动作": "膝部交叠坐姿",
                "场景地点": "行政办公室",
            },
            "古风汉服园林柔光写真": {
                "发型造型": "双环发髻",
                "手部动作": "双手持刺绣团扇",
                "场景地点": "江南园林",
            },
            "海边夏日泳装写真": {
                "画面比例": "3:2横构图",
                "基础姿态": "沙滩侧卧",
                "上装类型": "挂脖比基尼上装",
            },
            "赛博都市夜景写真": {
                "画面比例": "3:2横构图",
                "发色": "银白色",
                "基础姿态": "地面侧坐",
            },
            "影棚水光妆美容特写": {
                "画面比例": "4:5竖构图",
                "成像媒介": "中画幅数码摄影",
                "景别": "面部特写",
            },
            "落地窗瑜伽塑形写真": {
                "画面比例": "16:9横构图",
                "基础姿态": "低位鸽子式",
                "腿部动作": "鸽子式腿部伸展",
            },
            "旅馆窗边电影静帧": {
                "画面比例": "21:9横构图",
                "成像媒介": "35毫米胶片摄影",
                "视线": "看向窗外",
            },
        }
        self.assertEqual(set(expected), set(BUILTIN_PRESETS))
        for preset, fields in expected.items():
            for field, value in fields.items():
                with self.subTest(preset=preset, field=field):
                    self.assertEqual(nodes.PRESETS[preset][field], value)

    def test_same_theme_randomization_remains_valid_for_all_presets(self):
        requested = same_theme_request()
        for preset in BUILTIN_PRESETS:
            defaults = nodes.PRESETS[preset]
            for seed in range(20):
                resolved = nodes.resolve_fields(
                    preset,
                    nodes.RANDOM_SCOPES[1],
                    seed,
                    requested,
                )
                with self.subTest(preset=preset, seed=seed):
                    self.assertEqual(resolved["写真大类"], defaults["写真大类"])
                    self.assertEqual(resolved["写真主题"], defaults["写真主题"])
                    self.assertEqual(resolved["族裔大类"], defaults["族裔大类"])
                    for field, value in resolved.items():
                        self.assertTrue(
                            value == nodes.EMPTY_CHOICE
                            or value in nodes.FIELD_OPTIONS[field]
                        )

    def test_named_preset_visual_profiles_match_their_capture_medium(self):
        for preset in BUILTIN_PRESETS:
            values = nodes.PRESETS[preset]
            medium = values["成像媒介"]
            medium_id = nodes.CAPTURE_MEDIUM_LABEL_TO_ID[medium]
            visual_profile_id = nodes._PRESET_VISUAL_BUNDLES[preset][1]
            with self.subTest(preset=preset):
                self.assertIn(
                    visual_profile_id,
                    nodes.CAPTURE_MEDIUM_VISUAL_PROFILES_BY_ID[medium_id],
                )

    def test_legacy_preset_names_resolve_to_replacement_presets(self):
        requested = {
            field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER
        }
        for old_name, new_name in nodes.LEGACY_PRESET_NAMES.items():
            with self.subTest(old_name=old_name):
                self.assertEqual(
                    nodes._preset_values(old_name),
                    nodes.PRESETS[new_name],
                )
                self.assertEqual(
                    nodes.resolve_fields(
                        old_name,
                        nodes.RANDOM_SCOPES[0],
                        0,
                        requested,
                    ),
                    nodes.resolve_fields(
                        new_name,
                        nodes.RANDOM_SCOPES[0],
                        0,
                        requested,
                    ),
                )

    def test_legacy_age_stages_resolve_to_sixty_plus(self):
        for legacy_age in ("60–69岁", "70岁以上"):
            requested = {
                field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER
            }
            requested["年龄阶段"] = legacy_age
            resolved = nodes.resolve_fields(
                nodes.PRESET_OPTIONS[0],
                nodes.RANDOM_SCOPES[0],
                0,
                requested,
            )
            with self.subTest(legacy_age=legacy_age):
                self.assertEqual(resolved["年龄阶段"], "60岁以上")
                self.assertIn(
                    "一位60岁左右的东亚成年女性",
                    nodes.compose_prompt_text(resolved, "标准"),
                )

    def test_age_stages_use_decade_anchors(self):
        expected = {
            "20–29岁": "20岁左右",
            "30–39岁": "30岁左右",
            "40–49岁": "40岁左右",
            "50–59岁": "50岁左右",
            "60岁以上": "60岁左右",
        }
        self.assertEqual(nodes.AGE_STAGE_TEXT, expected)

        for age_stage, age_text in expected.items():
            requested = {
                field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER
            }
            requested["年龄阶段"] = age_stage
            resolved = nodes.resolve_fields(
                nodes.PRESET_OPTIONS[0],
                nodes.RANDOM_SCOPES[0],
                0,
                requested,
            )
            with self.subTest(age_stage=age_stage):
                self.assertIn(
                    f"一位{age_text}的东亚成年女性",
                    nodes.compose_prompt_text(resolved, "标准"),
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
