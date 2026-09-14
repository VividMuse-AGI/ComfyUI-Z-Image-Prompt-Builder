import unittest
import nodes


class ParagraphOutputTests(unittest.TestCase):
    def build(self, **kwargs):
        return nodes.ZImageChinesePromptBuilder().build_prompt(**kwargs)

    def test_schema_appends_layout_and_defaults_new_nodes_to_paragraphs(self):
        optional = nodes.ZImageChinesePromptBuilder.INPUT_TYPES()["optional"]
        self.assertEqual([key for key in optional if key not in nodes.RESOLUTION_INPUTS][-1], "输出排版")
        self.assertEqual(optional["输出排版"][1]["default"], "按模块分段")
        self.assertEqual(self.build(), self.build(输出排版="连续拼接"))

    def test_all_presets_and_densities_skip_empty_modules(self):
        for preset in nodes.PRESET_OPTIONS:
            for density in nodes.PROMPT_DENSITIES:
                with self.subTest(preset=preset, density=density):
                    zh, w, h, en = self.build(预设=preset, 提示词密度=density, 输出排版="按模块分段")
                    if not zh:
                        continue
                    expected = {"影棚水光妆美容特写": 7, "自定义组合": 2}.get(preset, 8)
                    self.assertEqual(len(zh.split("\n\n")), expected)
                    self.assertEqual(len(en.split("\n\n")), expected)
                    continuous = self.build(预设=preset, 提示词密度=density)
                    self.assertEqual((w, h), continuous[1:3])

    def test_custom_modules_and_free_text_keep_order_and_internal_punctuation(self):
        fragments = {field: f"模块{i}，细节；原文。第二句"
                     for i, field in enumerate(nodes.USER_MODULE_INPUTS.values())}
        free = "  自由原文，细节；第二句。\n用户换行  "
        for position in nodes.PROMPT_JOIN_POSITIONS:
            result = self.build(**fragments, 自由提示词=free, 拼接位置=position, 输出排版="按模块分段")
            for text in (result[0], result[3]):
                paragraphs = text.split("\n\n")
                self.assertEqual(len(paragraphs), 10)
                free_index = 0 if position == "自由提示词在前" else -1
                self.assertEqual(paragraphs.pop(free_index), free)
                for paragraph, fragment in zip(paragraphs, fragments.values()):
                    self.assertIn(fragment, paragraph)

    def test_empty_and_isolated_modules(self):
        empty = {field: nodes.EMPTY_CHOICE for field in nodes.FIELD_ORDER}
        for free in ("", "  \n "):
            result = self.build(**empty, 自由提示词=free, 输出排版="按模块分段")
            self.assertEqual((result[0], result[3]), ("", ""))
        result = self.build(**empty, 用户人物片段="只描述人物", 用户姿态动作片段="抬起手臂",
                            输出排版="按模块分段")
        self.assertEqual(result[0], "只描述人物。\n\n抬起手臂。")
        self.assertEqual(result[3], "只描述人物\n\n抬起手臂")
        for field in nodes.FIELD_ORDER:
            if field in nodes.CONTROL_ONLY_FIELDS:
                continue
            requested = {**empty, field: nodes.FIELD_OPTIONS[field][0]}
            result = self.build(**requested, 输出排版="按模块分段")
            self.assertNotIn("\n\n", result[0], field)
            self.assertEqual(bool(result[0]), bool(self.build(**requested)[0]), field)
