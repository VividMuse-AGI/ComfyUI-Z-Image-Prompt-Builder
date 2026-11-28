import hashlib
import json
import unittest
from unittest.mock import patch

import modular_nodes as modules
import nodes as core


class PromptDiagnosticsTests(unittest.TestCase):
    def test_baseline_random_stream_and_prompt_bytes_unchanged(self):
        cases = [(p, d, s) for p in core.PRESET_OPTIONS
                 for d in core.PROMPT_DENSITIES for s in (0, 123456)]
        outputs = [core.ZImageChinesePromptBuilder().build_prompt(**{
            "预设": p, "提示词密度": d, "随机种子": s,
            **dict.fromkeys(core.FIELD_ORDER, core.RANDOM_CHOICE),
        }) for p, d, s in cases]
        digest = lambda value: hashlib.sha256(json.dumps(value, ensure_ascii=False).encode()).hexdigest()
        resolved = [
            core.resolve_fields(
                p, core.RANDOM_SCOPES[2], s, dict.fromkeys(core.FIELD_ORDER, core.RANDOM_CHOICE)
            )
            for p in core.PRESET_OPTIONS for s in (0, 123456)
        ]
        self.assertEqual(
            hashlib.sha256(json.dumps(resolved, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
            "8930f442aa44db1ad9b683b37cd5cfe3f53edee9df23ae922d868fa7a7156c99",
        )
        self.assertEqual(digest(outputs), "9b708879e82d5d1cbd9b1a340fc333be21b9d1f25f976f2072d8ff1a0862254f")
        outputs = [cls().build_module(**{
            "预设": core.PRESET_OPTIONS[1], "随机种子": 123456,
            **dict.fromkeys(modules.MODULE_FIELD_GROUPS[cls.MODULE_NAME], core.RANDOM_CHOICE),
        }) for cls in modules.NODE_CLASS_MAPPINGS.values()
            if issubclass(cls, modules.ZImageModuleNodeBase)]
        self.assertEqual(digest(outputs), "c86dda2cd5f4e4045bae67034d3a237ab5ad99c88340a6aea0098501010d35ab")

    def test_diagnostic_path_matches_all_presets_densities_and_scopes(self):
        for preset in core.PRESET_OPTIONS:
            for density in core.PROMPT_DENSITIES:
                for scope in core.RANDOM_SCOPES:
                    inputs = {"预设": preset, "提示词密度": density, "随机范围": scope,
                              "随机种子": 123456, "自由提示词": "保留自由输入",
                              **dict.fromkeys(core.FIELD_ORDER, core.RANDOM_CHOICE)}
                    data = self.execute(core.ZImageChinesePromptBuilder, inputs)
                    self.assertNotIn("candidate_count", data)
                    self.assertEqual(len(data["random_fields"]), len(core.FIELD_ORDER))

    def execute(self, cls, inputs):
        direct = cls().build_prompt(**inputs) if cls is core.ZImageChinesePromptBuilder else cls().build_module(**inputs)
        with patch.object(core, "resolve_fields", wraps=core.resolve_fields) as resolve:
            method = cls().build_prompt if cls is core.ZImageChinesePromptBuilder else cls().build_module
            actual = method(unique_id="42", **inputs)
        self.assertEqual(resolve.call_count, 1)
        self.assertEqual(actual["result"], direct)
        data = actual["ui"]["vividmuse_prompt_diagnostics"][0]
        self.assertEqual(data["seed"], str(inputs.get("随机种子", 0)))
        self.assertEqual(data["zh"], direct[0])
        self.assertEqual(data["en"], direct[-1])
        self.assertNotIn("unique_id", data["settings"])
        json.dumps(data, ensure_ascii=False)
        return data

    def test_fixed_preset_free_text_and_ports_preserved(self):
        inputs = {"预设": core.PRESET_OPTIONS[1], "自由提示词": "custom\ntext", "随机种子": 9}
        first = self.execute(core.ZImageChinesePromptBuilder, inputs)
        second = self.execute(core.ZImageChinesePromptBuilder, {**inputs, "随机种子": 10})
        self.assertEqual(first["zh"], second["zh"])
        self.assertEqual(first["random_fields"], [])
        self.assertIn("custom\ntext", first["zh"])

    def test_random_replacement_and_blank_modules(self):
        inputs = {**dict.fromkeys(core.FIELD_ORDER, core.EMPTY_CHOICE),
                  "预设": core.PRESET_OPTIONS[1], "发色": core.RANDOM_CHOICE,
                  "用户发型片段": "自定义头发", "输出排版": "按模块分段"}
        data = self.execute(core.ZImageChinesePromptBuilder, inputs)
        self.assertEqual(data["random_fields"][0]["status"], "user_replaced")
        self.assertEqual(data["zh"], "自定义头发。")
        self.assertEqual(next(m for m in data["modules"] if m["name"] == "发型")["source"], "user")
        self.assertTrue(all(value == core.EMPTY_CHOICE for field, value in data["resolved"].items() if field != "发色"))

    def test_all_eight_modules_metadata_and_chain_context(self):
        for cls in modules.NODE_CLASS_MAPPINGS.values():
            if not issubclass(cls, modules.ZImageModuleNodeBase):
                continue
            data = self.execute(cls, {"预设": core.PRESET_OPTIONS[1], "随机种子": core.MAX_SEED,
                                     **dict.fromkeys(modules.MODULE_FIELD_GROUPS[cls.MODULE_NAME], core.RANDOM_CHOICE)})
            self.assertEqual(data["scope"], cls.MODULE_NAME)
            self.assertEqual(set(data["resolved"]), set(modules.MODULE_FIELD_GROUPS[cls.MODULE_NAME]))
        prefix = modules.PromptChainText("上游", {"景别": "面部特写"})
        data = self.execute(modules.ZImageClothingModule, {"前置提示词": prefix, "鞋履": core.RANDOM_CHOICE})
        self.assertEqual(data["context"]["景别"], "面部特写")
        self.assertEqual(data["random_fields"][0]["status"], "not_in_text")

    def test_diagnostics_hook_hidden_not_saved_widget(self):
        classes = [core.ZImageChinesePromptBuilder, modules.ZImagePersonModule]
        for cls in classes:
            schema = cls.INPUT_TYPES()
            self.assertEqual(schema["hidden"], {"unique_id": "UNIQUE_ID"})
            self.assertNotIn("unique_id", schema["required"])
            self.assertTrue(cls.HAS_INTERMEDIATE_OUTPUT)

    def test_normalized_random_requests_and_legacy_aliases_are_reported(self):
        data = self.execute(core.ZImageChinesePromptBuilder, {"光线方案": core.RANDOM_CHOICE})
        self.assertEqual({row["field"] for row in data["random_fields"]}, set(core.LIGHTING_OUTPUT_FIELDS))
        self.assertTrue(all(not row["configured"] and row["normalized_random"] for row in data["random_fields"]))
        label = next(label for field, label in core.REFERENCE_POOL.by_option if field == "基础姿态")
        inputs = {**dict.fromkeys(core.POSE_OUTPUT_FIELDS, core.RANDOM_CHOICE), "基础姿态": label}
        data = self.execute(core.ZImageChinesePromptBuilder, inputs)
        self.assertTrue(data["random_fields"])
        self.assertTrue(all(row["status"] == "not_randomized" for row in data["random_fields"]))

    def test_module_composition_collector_does_not_change_text(self):
        for preset in core.PRESET_OPTIONS:
            for density in core.PROMPT_DENSITIES:
                fields = core.resolve_fields(preset, core.RANDOM_SCOPES[0], 9, {})
                for separate in (False, True):
                    collected = {}
                    before = core.compose_prompt_text(fields, density, separate_modules=separate)
                    after = core.compose_prompt_text(fields, density, separate_modules=separate, module_fragments=collected)
                    self.assertEqual(before, after)
                    self.assertTrue(all(name in collected for name in modules.MODULE_FIELD_GROUPS))

    def test_fast_diagnostics_parity_and_latency(self):
        import time
        from prompt_diagnostics import execution_result

        builder = core.ZImageChinesePromptBuilder()
        all_random = dict.fromkeys(core.FIELD_ORDER, core.RANDOM_CHOICE)
        for preset in core.PRESET_OPTIONS:
            for density in core.PROMPT_DENSITIES:
                inputs = {
                    "预设": preset, "提示词密度": density,
                    "随机范围": core.RANDOM_SCOPES[2], "随机种子": 123456,
                    "输出排版": "按模块分段", **all_random,
                }
                fast_out = builder.build_prompt(unique_id="1", **inputs)
                fast_statuses = {
                    row["field"]: row["status"]
                    for row in fast_out["ui"]["vividmuse_prompt_diagnostics"][0]["random_fields"]
                }
                fields = core.resolve_fields(preset, core.RANDOM_SCOPES[2], 123456, all_random)
                fragments = {}
                zh = core.compose_prompt_text(fields, density, separate_modules=True, module_fragments=fragments)
                en = core.compose_english_prompt_text(fields, density)
                en_fragments = {
                    name: core.render_english_module_fragment(name, fields, density)
                    for name in modules.MODULE_FIELD_GROUPS
                }
                brute = execution_result(
                    fast_out["result"], core=core, scope="全部模块", seed=123456,
                    settings=inputs, fields=fields, fragments=fragments,
                    english_fragments=en_fragments,
                    render_pair=lambda resolved: (
                        core.compose_prompt_text(resolved, density, separate_modules=True),
                        core.compose_english_prompt_text(resolved, density),
                    ),
                )
                brute_statuses = {
                    row["field"]: row["status"]
                    for row in brute["ui"]["vividmuse_prompt_diagnostics"][0]["random_fields"]
                }
                self.assertEqual(fast_statuses, brute_statuses, (preset, density))

        # Latency check: 92 random fields with unique_id should be well under 10 ms per call
        sample_inputs = {"预设": core.PRESET_OPTIONS[0], "提示词密度": "标准", "随机范围": core.RANDOM_SCOPES[2], "输出排版": "按模块分段", **all_random}
        t0 = time.perf_counter()
        for s in range(10):
            builder.build_prompt(unique_id="1", 随机种子=s, **sample_inputs)
        avg_ms = (time.perf_counter() - t0) / 10 * 1000
        self.assertLess(avg_ms, 10.0, f"Diagnostics took {avg_ms:.2f} ms/call")


if __name__ == "__main__":
    unittest.main()
