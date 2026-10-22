import unittest
from unittest.mock import patch

import nodes as core
import modular_nodes as modules
from framing import FRAMING_MODES, framing_view


class FramingTests(unittest.TestCase):
    def fixture(self, shot="胸部以上", density="详细"):
        return {**dict.fromkeys(core.FIELD_ORDER, core.EMPTY_CHOICE),
                "预设": core.CUSTOM_PRESET, "提示词密度": density,
                "随机种子": 41, "景别": shot, "穿搭结构": "上装＋下装",
                "上装类型": "垂坠衬衫", "下装类型": "高腰阔腿裤",
                "下装颜色": core.FIELD_OPTIONS["下装颜色"][0],
                "下装材质": core.FIELD_OPTIONS["下装材质"][0],
                "下装图案": core.FIELD_OPTIONS["下装图案"][0],
                "袜装": core.FIELD_OPTIONS["袜装"][0], "鞋履": "漆皮高跟鞋",
                "腿部动作": "自然迈步", "手部动作": "一手托腮",
                "输出排版": "按模块分段"}

    def execute(self, inputs):
        return core.ZImageChinesePromptBuilder().build_prompt(**inputs)

    def test_default_off_and_unknown_mode_preserve_outputs(self):
        for shot in core.FIELD_OPTIONS["景别"]:
            for density in core.PROMPT_DENSITIES:
                inputs = self.fixture(shot, density)
                expected = self.execute(inputs)
                for mode in (FRAMING_MODES[0], "invalid"):
                    self.assertEqual(expected, self.execute({**inputs, "构图适配": mode}))

    def test_explicit_shots_all_densities_and_both_outputs(self):
        for shot in ("面部特写", "胸部以上", "腰部以上", "坐姿半身", "全身构图"):
            for density in core.PROMPT_DENSITIES:
                with self.subTest(shot=shot, density=density):
                    inputs = self.fixture(shot, density)
                    removed = [] if shot == "全身构图" else ["袜装", "鞋履"]
                    if shot not in ("坐姿半身", "全身构图"):
                        removed += ["下装类型", "下装颜色", "下装材质", "下装图案", "腿部动作"]
                    expected = self.execute({**inputs, **dict.fromkeys(removed, core.EMPTY_CHOICE)})
                    actual = self.execute({**inputs, "构图适配": FRAMING_MODES[1]})
                    self.assertEqual(actual, expected)  # includes both languages and dimensions
                    self.assertIn("托腮", actual[0])

    def test_no_mutation_and_ambiguous_shots_keep_fields(self):
        fields = {k: v for k, v in self.fixture().items() if k in core.FIELD_ORDER}
        before = dict(fields)
        view, report = framing_view(fields, FRAMING_MODES[1], shot="胸部以上")
        self.assertEqual(fields, before)
        self.assertEqual(view["鞋履"], core.EMPTY_CHOICE)
        self.assertEqual(len(report["omitted"]), 7)
        for shot in (None, "局部特写", "环境人像", "三分之二身"):
            view, report = framing_view(fields, FRAMING_MODES[1], shot=shot)
            self.assertEqual(view, before)
            self.assertEqual(report["omitted"], [])
        view, _ = framing_view(fields, FRAMING_MODES[0], shot="胸部以上")
        self.assertEqual(view, before)

    def test_diagnostics_preserve_resolved_values_and_random_stream(self):
        inputs = {**self.fixture(), "构图适配": FRAMING_MODES[1],
                  "下装颜色": core.RANDOM_CHOICE, "随机种子": core.MAX_SEED,
                  "随机范围": core.RANDOM_SCOPES[2]}
        with patch.object(core, "resolve_fields", wraps=core.resolve_fields) as resolver:
            out = self.execute({**inputs, "unique_id": "1"})
        self.assertEqual(resolver.call_count, 1)
        data = out["ui"]["vividmuse_prompt_diagnostics"][0]
        self.assertEqual(out["result"], self.execute(inputs))
        original = self.execute({**inputs, "构图适配": FRAMING_MODES[0], "unique_id": "1"})
        old_data = original["ui"]["vividmuse_prompt_diagnostics"][0]
        self.assertEqual(data["resolved"], old_data["resolved"])
        self.assertEqual(data["seed"], str(core.MAX_SEED))
        color = next(row for row in data["random_fields"] if row["field"] == "下装颜色")
        self.assertEqual(color["status"], "framing_omitted")
        self.assertNotEqual(color["value"], core.EMPTY_CHOICE)
        self.assertEqual(data["framing"]["status"], "applied")

    def test_user_text_replacements_and_opaque_camera(self):
        for density in core.PROMPT_DENSITIES:
            inputs = {**self.fixture(density=density), "构图适配": FRAMING_MODES[1],
                      "用户服装片段": "CUSTOM trousers and shoes",
                      "用户姿态动作片段": "CUSTOM leg action", "自由提示词": "FREE\nTEXT"}
            result = self.execute({**inputs, "unique_id": "1"})
            for text in (result["result"][0], result["result"][-1]):
                for marker in ("CUSTOM trousers and shoes", "CUSTOM leg action", "FREE\nTEXT"):
                    self.assertIn(marker, text)
            self.assertEqual(result["ui"]["vividmuse_prompt_diagnostics"][0]["framing"]["omitted"], [])
            opaque = {**self.fixture(density=density), "用户摄影片段": "自由写的镜头"}
            # With opt-in adaptation, opaque camera text must not inherit the preset framing.
            result = self.execute({**opaque, "构图适配": FRAMING_MODES[1], "unique_id": "2"})
            expected = self.execute({**opaque, "景别": core.EMPTY_CHOICE})
            self.assertEqual(result["result"], expected)
            self.assertEqual(result["ui"]["vividmuse_prompt_diagnostics"][0]["framing"]["status"], "opaque_camera")

    def test_modules_require_explicit_upstream_context_and_do_not_rewrite_prefix(self):
        for cls in (modules.ZImageClothingModule, modules.ZImagePoseModule):
            inputs = {**self.fixture(), "构图适配": FRAMING_MODES[1]}
            inputs = {k: v for k, v in inputs.items() if k not in core.FIELD_ORDER or k in modules.MODULE_FIELD_GROUPS[cls.MODULE_NAME]}
            original = cls().build_module(**{**inputs, "构图适配": FRAMING_MODES[0]})
            self.assertEqual(original, cls().build_module(**inputs))
            prefix = modules.PromptChainText("upstream stays unchanged", {"景别": "胸部以上"})
            for prefix_key in ("前置提示词", "前置英文提示词"):
                result = cls().build_module(**{**inputs, prefix_key: prefix, "unique_id": "3"})
                data = result["ui"]["vividmuse_prompt_diagnostics"][0]
                self.assertTrue(data["framing"]["omitted"])
                self.assertEqual(data["context"]["景别"], "胸部以上")
                output = result["result"][0 if prefix_key == "前置提示词" else -1]
                self.assertTrue(output.startswith(str(prefix)))
                for row in data["framing"]["omitted"]:
                    self.assertEqual(output.zimage_resolved_fields[row["field"]], row["value"])
            opaque = modules.PromptChainText("TXT camera", {"景别": "胸部以上"}, {"摄影"})
            result = cls().build_module(**{**inputs, "前置提示词": opaque, "unique_id": "4"})
            self.assertEqual(result["ui"]["vividmuse_prompt_diagnostics"][0]["framing"]["status"], "opaque_camera")
            self.assertTrue(str(result["result"][0]).endswith(str(original[0])))

    def test_empty_module_and_full_shot_chain_are_unchanged(self):
        for cls in (modules.ZImageClothingModule, modules.ZImagePoseModule):
            inputs = {**dict.fromkeys(modules.MODULE_FIELD_GROUPS[cls.MODULE_NAME], core.EMPTY_CHOICE),
                      "构图适配": FRAMING_MODES[1],
                      "前置提示词": modules.PromptChainText("prior", {"景别": "胸部以上"})}
            self.assertEqual(str(cls().build_module(**inputs)[0]), "prior")
        clothing = modules.ZImageClothingModule().build_module(**{
            "构图适配": FRAMING_MODES[1], "鞋履": "漆皮高跟鞋", "提示词密度": "详细"})
        camera = modules.ZImageCameraModule().build_module(前置提示词=clothing[0], 景别="面部特写")
        self.assertTrue(str(camera[0]).startswith(str(clothing[0])), "A later camera cannot rewrite earlier text")

    def test_schema_is_optional_appended_and_limited_to_relevant_nodes(self):
        for cls in (core.ZImageChinesePromptBuilder, modules.ZImageClothingModule, modules.ZImagePoseModule):
            optional = cls.INPUT_TYPES()["optional"]
            self.assertEqual(list(optional)[-1], "构图适配")
            self.assertEqual(optional["构图适配"][1]["default"], FRAMING_MODES[0])
        self.assertNotIn("构图适配", modules.ZImageCanvasModule.INPUT_TYPES()["optional"])


if __name__ == "__main__":
    unittest.main()
