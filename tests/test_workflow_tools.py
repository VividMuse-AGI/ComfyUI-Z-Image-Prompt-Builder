import unittest
import nodes


class WorkflowToolsTests(unittest.TestCase):
    def test_user_module_replacements_reach_both_outputs_without_stale_text(self):
        requested = {field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER}
        fields = nodes.resolve_fields(nodes.PRESET_OPTIONS[0], nodes.RANDOM_SCOPES[0], 0, requested)
        for module, input_name in nodes.USER_MODULE_INPUTS.items():
            for density in nodes.PROMPT_DENSITIES:
                marker = f"USER_{input_name}_marker"
                with self.subTest(module=module, density=density):
                    zh, _, _, en = nodes.ZImageChinesePromptBuilder().build_prompt(
                        **{input_name: marker, "提示词密度": density}
                    )
                    self.assertEqual(zh.count(marker), 1)
                    self.assertEqual(en.count(marker), 1)
                    if module != "自定义":
                        stale = nodes.render_english_module_fragment(module, fields, density)
                        if stale:
                            self.assertNotIn(stale, en)

    def test_all_user_modules_keep_order_and_free_prompt_position(self):
        fragments = {field: f"MARKER_{i}" for i, field in enumerate(nodes.USER_MODULE_INPUTS.values())}
        result = nodes.ZImageChinesePromptBuilder().build_prompt(
            **fragments, 自由提示词="FREE_MARKER", 拼接位置="结构化模块在前"
        )[3]
        offsets = [result.index(marker) for marker in fragments.values()]
        self.assertEqual(offsets, sorted(offsets))
        self.assertTrue(result.endswith("FREE_MARKER"))

    def test_close_shot_reduces_builtin_footwear_but_keeps_detailed_and_custom(self):
        fields = nodes.resolve_fields(nodes.PRESET_OPTIONS[0], nodes.RANDOM_SCOPES[0], 0, {})
        fields.update({"景别": "面部特写", "鞋履": nodes.FIELD_OPTIONS["鞋履"][0],
                       "袜装": nodes.FIELD_OPTIONS["袜装"][0]})
        before = dict(fields)
        for renderer in (nodes._clothing_prompt_text, nodes._english_clothing_prompt_text):
            hidden = {**fields, "鞋履": nodes.EMPTY_CHOICE, "袜装": nodes.EMPTY_CHOICE}
            for density in ("精简", "标准"):
                self.assertEqual(renderer(fields, density), renderer(hidden, density))
            self.assertNotEqual(renderer(fields, "详细"), renderer(hidden, "详细"))
        self.assertEqual(fields, before)
        zh, _, _, en = nodes.ZImageChinesePromptBuilder().build_prompt(
            景别="面部特写", 用户服装片段="keep my shoes exactly"
        )
        self.assertIn("keep my shoes exactly", zh)
        self.assertIn("keep my shoes exactly", en)
