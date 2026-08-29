import os
import re
import subprocess
import sys
import unittest

import modular_nodes
import nodes


CJK_RE = re.compile(r"[\u3400-\u9fff]")


class EnglishOutputTests(unittest.TestCase):
    def test_full_node_appends_english_without_moving_existing_outputs(self):
        result = nodes.ZImageChinesePromptBuilder().build_prompt()
        self.assertEqual(len(result), 4)
        chinese_prompt, width, height, english_prompt = result
        self.assertIn("一位25岁左右的东亚成年女性", chinese_prompt)
        self.assertEqual((width, height), (832, 1248))
        self.assertTrue(english_prompt)
        self.assertIsNone(CJK_RE.search(english_prompt))

    def test_every_preset_and_density_outputs_pure_english(self):
        for preset in nodes.PRESET_OPTIONS:
            for density in nodes.PROMPT_DENSITIES:
                result = nodes.ZImageChinesePromptBuilder().build_prompt(
                    预设=preset,
                    提示词密度=density,
                    随机范围=nodes.RANDOM_SCOPES[0],
                    随机种子=20260829,
                )
                english_prompt = result[3]
                self.assertTrue(english_prompt, (preset, density))
                self.assertIsNone(
                    CJK_RE.search(english_prompt),
                    (preset, density, english_prompt),
                )

    def test_every_public_output_option_has_an_english_rendering(self):
        intentional_placeholders = {
            ("地域族裔分支", nodes.ETHNICITY_BRANCH_GENERIC),
        }
        for field_name in nodes.FIELD_ORDER:
            if field_name in nodes.CONTROL_ONLY_FIELDS:
                continue
            for value in nodes.FIELD_OPTIONS[field_name]:
                if (field_name, value) in intentional_placeholders:
                    continue
                rendered = nodes._english_atomic_value(field_name, value)
                self.assertTrue(rendered, (field_name, value))
                self.assertIsNone(CJK_RE.search(rendered), (field_name, value, rendered))

    def test_camera_distance_keeps_decimal_points(self):
        self.assertEqual(
            nodes._english_atomic_value("拍摄距离", "0.5米"),
            "camera distance 0.5 m",
        )
        self.assertEqual(
            nodes._english_atomic_value("拍摄距离", "1.5米"),
            "camera distance 1.5 m",
        )
        self.assertEqual(
            nodes._english_atomic_value("拍摄距离", "3.5米"),
            "camera distance 3.5 m",
        )

    def test_eight_module_nodes_form_independent_chinese_and_english_chains(self):
        canvas_result = modular_nodes.ZImageCanvasModule().build_module()
        chinese_prompt = canvas_result[0]
        english_prompt = canvas_result[3]
        node_classes = (
            modular_nodes.ZImagePersonModule,
            modular_nodes.ZImageHairModule,
            modular_nodes.ZImageClothingModule,
            modular_nodes.ZImagePoseModule,
            modular_nodes.ZImageSceneModule,
            modular_nodes.ZImageCameraModule,
            modular_nodes.ZImageVisualModule,
        )
        for node_class in node_classes:
            chinese_prompt, english_prompt = node_class().build_module(
                前置提示词=chinese_prompt,
                前置英文提示词=english_prompt,
            )
        self.assertGreaterEqual(chinese_prompt.count("。"), 8)
        self.assertGreaterEqual(english_prompt.count("."), 8)
        self.assertIsNone(CJK_RE.search(english_prompt))
        self.assertIn("zimage_resolved_fields", dir(english_prompt))

    def test_english_chain_context_works_without_chinese_chain_connection(self):
        canvas_english = modular_nodes.ZImageCanvasModule().build_module()[3]
        _, person_english = modular_nodes.ZImagePersonModule().build_module(
            前置英文提示词=canvas_english,
        )
        self.assertIn("画面比例", person_english.zimage_resolved_fields)
        self.assertIn("年龄阶段", person_english.zimage_resolved_fields)
        self.assertIsNone(CJK_RE.search(person_english))

    def test_arbitrary_chinese_user_text_is_not_silently_mistranslated(self):
        chinese, _, _, english = nodes.ZImageChinesePromptBuilder().build_prompt(
            自由提示词="用户自己写的中文自由提示词",
            用户场景片段="用户自己写的中文场景片段",
        )
        self.assertIn("用户自己写的中文自由提示词", chinese)
        self.assertIn("用户自己写的中文场景片段", chinese)
        self.assertNotIn("用户自己写的中文自由提示词", english)
        self.assertNotIn("用户自己写的中文场景片段", english)
        self.assertIsNone(CJK_RE.search(english))

    def test_english_output_is_seed_deterministic(self):
        kwargs = {
            "预设": nodes.PRESET_OPTIONS[0],
            "提示词密度": "标准",
            "随机范围": nodes.RANDOM_SCOPES[2],
            "随机种子": 987654321,
            **{field_name: nodes.RANDOM_CHOICE for field_name in nodes.FIELD_ORDER},
        }
        first = nodes.ZImageChinesePromptBuilder().build_prompt(**kwargs)[3]
        second = nodes.ZImageChinesePromptBuilder().build_prompt(**kwargs)[3]
        self.assertEqual(first, second)
        self.assertIsNone(CJK_RE.search(first))

    def test_natural_phrase_maps_cover_their_public_option_ids(self):
        for field_name, phrases in nodes._ENGLISH_NATURAL_ID_PHRASES.items():
            public_ids = set(nodes._ENGLISH_OPTION_ID_MAPS[field_name].values())
            self.assertEqual(
                set(),
                public_ids - set(phrases),
                (field_name, sorted(public_ids - set(phrases))),
            )

    def test_default_english_preset_uses_natural_photographic_language(self):
        fields = nodes.PRESETS["日系草地单车夏日柔光写真"]
        prompt = nodes.compose_english_prompt_text(fields, "标准")
        for fragment in (
            "shoulder neck body-line emphasis",
            "legs one leg extended",
            "head look back left",
            "gaze camera soft",
            "eye level camera angle",
            "glowing backlight light quality",
            "documentary real detail rendering",
        ):
            self.assertNotIn(fragment, prompt)
        for fragment in (
            "an East Asian woman around 25 years old",
            "with a clean shoulder-and-neck line",
            "wearing a clean short-sleeve T-shirt in cream white cotton",
            "with one leg extended",
            "head turned back over the left shoulder",
            "looking softly toward the camera",
            "shot at 85mm full-frame-equivalent",
            "with luminous backlighting",
            "with realistic documentary detail",
        ):
            self.assertIn(fragment, prompt)

    def test_concise_clothing_keeps_type_and_color_but_omits_material(self):
        fields = nodes.PRESETS["日系草地单车夏日柔光写真"]
        concise = nodes.render_english_module_fragment("服装", fields, "精简")
        self.assertIn("clean short-sleeve T-shirt in cream white", concise)
        self.assertIn("straight jeans in navy", concise)
        self.assertNotIn("cotton", concise)
        self.assertNotIn("denim", concise)
        self.assertNotIn("high-waisted", concise)
        self.assertNotIn("wristwatch", concise)

    def test_scene_english_output_is_stable_across_python_hash_seeds(self):
        code = (
            "import nodes; "
            "fields={name:nodes.EMPTY_CHOICE for name in nodes.FIELD_ORDER}; "
            "fields['环境细节']='漂浮气泡、水生植物、折射光纹'; "
            "print(nodes.render_english_module_fragment('场景', fields, '详细'))"
        )
        outputs = set()
        for hash_seed in (1, 3, 8):
            environment = dict(os.environ)
            environment["PYTHONHASHSEED"] = str(hash_seed)
            environment["PYTHONIOENCODING"] = "utf-8"
            completed = subprocess.run(
                [sys.executable, "-c", code],
                check=True,
                capture_output=True,
                env=environment,
            )
            outputs.add(completed.stdout.decode("utf-8").strip())
        self.assertEqual(
            outputs,
            {
                "environment details: floating bubbles, aquatic plants, "
                "and refracted light patterns."
            },
        )


if __name__ == "__main__":
    unittest.main()
