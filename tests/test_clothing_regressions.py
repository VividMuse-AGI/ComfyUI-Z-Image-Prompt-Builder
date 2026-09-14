import unittest
import nodes as core
import modular_nodes as mod


class ClothingRegressions(unittest.TestCase):
    def test_every_partial_garment_option_in_all_modes_and_densities(self):
        empty = {field: core.EMPTY_CHOICE for field in core.FIELD_ORDER}
        modes = {"上装": "上装＋下装", "下装": "上装＋下装",
                 "连衣裙": "连衣裙", "连体服": "连体服"}
        for prefix, mode in modes.items():
            for suffix in ("类型", "颜色", "材质", "图案"):
                field = prefix + suffix
                for value in core.FIELD_OPTIONS[field]:
                    for selected_mode in (mode, core.EMPTY_CHOICE):
                        for density in core.PROMPT_DENSITIES:
                            with self.subTest(field=field, value=value, mode=selected_mode, density=density):
                                fields = {**empty, "穿搭结构": selected_mode, field: value}
                                before = dict(fields)
                                en = core.render_english_module_fragment("服装", fields, density)
                                self.assertTrue(en)
                                self.assertNotIn("wearing .", en)
                                self.assertNotIn("wearing ,", en)
                                self.assertEqual(fields, before)
                                if suffix != "类型":
                                    detail = core._english_atomic_value(field, value)
                                    self.assertIn(detail, en)

    def test_hidden_garment_branch_still_does_not_leak(self):
        fields = {field: core.EMPTY_CHOICE for field in core.FIELD_ORDER}
        fields.update({"穿搭结构": "连衣裙", "上装颜色": core.FIELD_OPTIONS["上装颜色"][0]})
        for density in core.PROMPT_DENSITIES:
            self.assertEqual(core.render_english_module_fragment("服装", fields, density), "")

    def test_accessory_only_english_never_disappears(self):
        empty = {field: core.EMPTY_CHOICE for field in core.FIELD_ORDER}
        for field in ("鞋履", "袜装", "服装配件", "版型细节"):
            for value in core.FIELD_OPTIONS[field]:
                fields = {**empty, field: value}
                for density in core.PROMPT_DENSITIES:
                    with self.subTest(field=field, value=value, density=density):
                        en = core.render_english_module_fragment("服装", fields, density)
                        self.assertTrue(en)
                        self.assertNotIn("wearing .", en)
                        self.assertNotIn("wearing ,", en)
        for density in core.PROMPT_DENSITIES:
            self.assertEqual(core.render_english_module_fragment("服装", empty, density), "")

    def test_clothing_uses_only_explicit_upstream_framing(self):
        kwargs = {field: core.EMPTY_CHOICE for field in mod.MODULE_FIELD_GROUPS["服装"]}
        kwargs.update({"鞋履": "尖头细跟高跟鞋", "预设": "影棚水光妆美容特写"})
        node = mod.ZImageClothingModule()
        for density in core.PROMPT_DENSITIES:
            for prefix in ("", "用户写的近景描述", mod.PromptChainText("", {"景别": "全身"})):
                with self.subTest(density=density, prefix=prefix):
                    zh, en = node.build_module(**kwargs, 提示词密度=density, 前置提示词=prefix)
                    self.assertIn("高跟鞋", zh)
                    self.assertIn("stiletto", en)
            for input_name in ("前置提示词", "前置英文提示词"):
                prefix = mod.PromptChainText("", {"景别": "面部特写"})
                zh, en = node.build_module(**kwargs, 提示词密度=density, **{input_name: prefix})
                self.assertEqual(bool(zh), density == "详细")
                self.assertEqual(bool(en), density == "详细")
                self.assertEqual(prefix.zimage_resolved_fields, {"景别": "面部特写"})
                self.assertEqual(zh.zimage_resolved_fields["景别"], "面部特写")

    def test_txt_camera_replacement_does_not_reuse_hidden_preset_shot(self):
        prefix = mod.PromptChainText("", {"景别": "面部特写"})
        replaced = mod.ZImageTxtModuleLibrary().build_prompt(
            前置提示词=prefix, 模块类型="摄影", 模块提示词="全身构图"
        )[0]
        empty = {field: core.EMPTY_CHOICE for field in mod.MODULE_FIELD_GROUPS["服装"]}
        zh, en = mod.ZImageClothingModule().build_module(
            **{**empty, "鞋履": "尖头细跟高跟鞋"}, 预设="影棚水光妆美容特写", 前置提示词=replaced
        )
        self.assertIn("高跟鞋", zh)
        self.assertIn("stiletto", en)
        self.assertIn("摄影", zh.zimage_opaque_modules)
        self.assertNotIn("景别", zh.zimage_resolved_fields)
