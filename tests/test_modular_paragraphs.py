import unittest
import nodes as core
import modular_nodes as mod


class ModularParagraphTests(unittest.TestCase):
    def test_eight_module_chains_and_context(self):
        zh, en = "", ""
        for cls in mod.NODE_CLASS_MAPPINGS.values():
            if not issubclass(cls, mod.ZImageModuleNodeBase):
                continue
            node = cls()
            kwargs = {"前置提示词": zh, "前置英文提示词": en, "输出排版": "按模块分段"}
            result = node.build_module(**kwargs)
            current = node.build_module(输出排版="连续拼接")
            expected_zh = core.join_prompt_paragraphs(zh, current[0])
            expected_en = core.join_prompt_paragraphs(en, current[-1])
            self.assertEqual(result[0], expected_zh)
            self.assertEqual(result[-1], expected_en)
            self.assertIsInstance(result[0], mod.PromptChainText)
            self.assertTrue(result[0].zimage_resolved_fields)
            empty = {field: core.EMPTY_CHOICE for field in mod.MODULE_FIELD_GROUPS[node.MODULE_NAME]}
            passed = node.build_module(**kwargs, **empty)
            self.assertEqual(passed[0], zh)
            self.assertEqual(passed[-1], en)
            self.assertEqual(node.build_module(), current)
            zh, en = result[0], result[-1]
        self.assertEqual(len(zh.split("\n\n")), 8)
        self.assertEqual(len(en.split("\n\n")), 8)

    def test_txt_order_whitespace_internal_newlines_and_context(self):
        prefix = mod.PromptChainText("前文\n原有换行", {"景别": "面部特写"})
        current = "  用户正文\n\n原有段落  "
        for cls, key in ((mod.ZImageTxtPromptLibrary, "自由提示词"),
                         (mod.ZImageTxtModuleLibrary, "模块提示词")):
            for position in mod.CHAIN_JOIN_POSITIONS:
                kwargs = {"前置提示词": prefix, key: current,
                          "拼接位置": position, "输出排版": "按模块分段"}
                text = cls().build_prompt(**kwargs)[0]
                parts = (prefix, current) if position == mod.CHAIN_JOIN_POSITIONS[0] else (current, prefix)
                self.assertEqual(text, "\n\n".join(parts))
                self.assertEqual(text.zimage_resolved_fields["景别"], "面部特写")
                kwargs[key] = "  \n "
                self.assertEqual(cls().build_prompt(**kwargs)[0], prefix)
                kwargs.pop("输出排版")
                self.assertEqual(cls().build_prompt(**kwargs),
                                 cls().build_prompt(**kwargs, 输出排版="连续拼接"))

    def test_all_ten_schemas_append_layout(self):
        for cls in mod.NODE_CLASS_MAPPINGS.values():
            optional = cls.INPUT_TYPES()["optional"]
            self.assertEqual([key for key in optional if key not in mod.core.RESOLUTION_INPUTS][-1], "输出排版")
            self.assertEqual(optional["输出排版"][1]["default"], "按模块分段")
