import json
import random
import unittest
from pathlib import Path

import modular_nodes as m
import nodes as n
from txt_selection import select_txt, MAX_PAYLOAD_BYTES


def payload(entries, kind="prompt", **extra):
    return json.dumps({"version": 1, "kind": kind, "entries": entries, **extra}, ensure_ascii=False)


def entry(text="测试正文", module=None, title="标题"):
    result = {"title": title, "prompt": text, "tags": ["标签"]}
    if module is not None:
        result["module"] = module
    return result


def select(raw="", seed=0, kind="prompt", **kwargs):
    return select_txt({"选择模式": "随机抽取", "词库数据": raw, "随机种子": seed, **kwargs},
                      kind=kind, modules=m.TXT_MODULE_TYPES, max_seed=n.MAX_SEED)


class TxtSelectionTests(unittest.TestCase):
    def test_manual_legacy_ignores_bad_payload_and_seed(self):
        for cls, field in ((m.ZImageTxtPromptLibrary, "自由提示词"), (m.ZImageTxtModuleLibrary, "模块提示词")):
            expected = cls().build_prompt(**{field: "手动内容"})
            self.assertEqual(expected, cls().build_prompt(**{field: "手动内容", "词库数据": "broken", "随机种子": -1}))
            self.assertIsInstance(expected, tuple)

    def test_optional_inputs_append_and_output_unchanged(self):
        for cls in (m.ZImageTxtPromptLibrary, m.ZImageTxtModuleLibrary):
            self.assertEqual(list(cls.INPUT_TYPES()["optional"])[-3:], ["选择模式", "随机种子", "词库数据"])
            self.assertEqual(cls.RETURN_TYPES, ("STRING",))
            self.assertTrue(cls.HAS_INTERMEDIATE_OUTPUT)
            self.assertFalse(hasattr(cls, "IS_CHANGED"))

    def test_deterministic_reachable_and_no_global_rng_mutation(self):
        raw = payload([entry(str(i)) for i in range(5)])
        before = random.getstate()
        for seed in (0, 42, 2**53 - 1, 2**53 + 1, n.MAX_SEED):
            self.assertEqual(select(raw, seed), select(raw, seed))
            self.assertEqual(select(raw, seed)[1]["seed"], str(seed))
        self.assertEqual(random.getstate(), before)
        self.assertEqual({select(raw, s)[0] for s in range(100)}, set(map(str, range(5))))

    def test_empty_and_single_candidate(self):
        self.assertEqual(select()[1]["status"], "empty")
        for seed in (0, 1, n.MAX_SEED):
            self.assertEqual(select(payload([entry()]), seed)[0], "测试正文")

    def test_all_modules_isolated_including_custom(self):
        raw = payload([entry(module, module) for module in m.TXT_MODULE_TYPES], "module")
        for module in m.TXT_MODULE_TYPES:
            body, ui = select(raw, kind="module", 模块类型=module)
            self.assertEqual(body, module)
            self.assertEqual(ui["count"], 1)
        none = select(payload([entry(module="人物")], "module"), kind="module", 模块类型="摄影")
        self.assertEqual(none[0], "")

    def test_duplicate_titles_and_bodies_remain_separate_positions(self):
        raw = payload([entry("相同正文"), entry("相同正文"), entry("不同正文")])
        selected = {select(raw, s)[1]["index"] for s in range(80)}
        self.assertEqual(selected, {0, 1, 2})
        self.assertEqual(select(raw)[1]["count"], 3)

    def test_random_joins_and_does_not_mutate_manual_input(self):
        for cls, field, kind in ((m.ZImageTxtPromptLibrary, "自由提示词", "prompt"),
                                  (m.ZImageTxtModuleLibrary, "模块提示词", "module")):
            for layout in ("连续拼接", "按模块分段"):
                for position in m.CHAIN_JOIN_POSITIONS:
                    kwargs = {field: "保留草稿", "前置提示词": "前置内容", "输出排版": layout,
                              "拼接位置": position, "选择模式": "随机抽取", "模块类型": "人物",
                              "词库数据": payload([entry("第一行\n第二行", "人物")], kind)}
                    before = dict(kwargs)
                    result = cls().build_prompt(**kwargs)
                    text = result["result"][0]
                    self.assertEqual(kwargs, before)
                    self.assertIn("第一行\n第二行", text)
                    self.assertNotIn("保留草稿", text)
                    self.assertNotIn("标签", text)
                    self.assertEqual(result["ui"]["vividmuse_txt_selection"][0]["title"], "标题")
                    self.assertEqual(text.startswith("前置内容"), position == m.CHAIN_JOIN_POSITIONS[0])
                    if layout == "按模块分段":
                        self.assertIn("\n\n", text)

    def test_context_for_empty_standard_and_custom(self):
        prefix = m.PromptChainText("前置", {"年龄阶段": "30–39岁", "基础姿态": "自然站立"}, {"服装"})
        for module in ("人物", "自定义"):
            for entries in ([], [entry(module=module)]):
                output = m.ZImageTxtModuleLibrary().build_prompt(前置提示词=prefix, 模块类型=module,
                    选择模式="随机抽取", 词库数据=payload(entries, "module"))["result"][0]
                replaced = bool(entries) and module == "人物"
                self.assertEqual("年龄阶段" not in output.zimage_resolved_fields, replaced)
                self.assertEqual("人物" in output.zimage_opaque_modules, replaced)
                self.assertIn("服装", output.zimage_opaque_modules)

    def test_api_json_snapshot_roundtrip_and_changed_candidates(self):
        data = {"选择模式": "随机抽取", "随机种子": n.MAX_SEED, "词库数据": payload([entry("旧正文")])}
        frozen = json.loads(json.dumps(data))
        data["词库数据"] = payload([entry("新正文")])
        cls = m.ZImageTxtPromptLibrary()
        self.assertIn("旧正文", cls.build_prompt(**frozen)["result"][0])
        self.assertIn("新正文", cls.build_prompt(**data)["result"][0])
        self.assertEqual(cls.build_prompt(**frozen), cls.build_prompt(**frozen))
        graph = json.loads((Path(__file__).resolve().parents[1] / "examples/txt-random-api.json").read_text(encoding="utf-8"))
        first = cls.build_prompt(**graph["1"]["inputs"])["result"][0]
        kwargs = {**graph["2"]["inputs"], "前置提示词": first}
        second = m.ZImageTxtModuleLibrary().build_prompt(**kwargs)["result"][0]
        self.assertIn("An adult woman", second)
        self.assertNotIn("Standing with", second)
        self.assertNotIn("Manual", second)
        self.assertIn("\n\n", second)

    def test_invalid_payloads_fail_without_echoing_private_body(self):
        values = ["{secret", "null", "[]", payload([], version=True), payload([], version=2),
                  payload([], kind="module"), payload([entry("")]), payload([entry("x" * 20001)]),
                  payload([entry()] * 501), payload([{"title": 1, "prompt": "secret"}]),
                  payload([{**entry(), "tags": [7]}]), "[" * 2000]
        for raw in values:
            with self.subTest(raw=raw[:50]), self.assertRaises(ValueError) as ctx:
                select(raw)
            self.assertNotIn("secret", str(ctx.exception))
        for seed in (-1, n.MAX_SEED + 1, 1.5, True, "42"):
            with self.assertRaises(ValueError):
                select(seed=seed)
        with self.assertRaises(ValueError):
            select(payload([entry(module="unknown")], "module"), kind="module")
        with self.assertRaises(ValueError):
            select(选择模式="unknown")

    def test_payload_and_text_limits_and_js_length(self):
        with self.assertRaises(ValueError):
            select(" " * (MAX_PAYLOAD_BYTES + 1))
        with self.assertRaises(ValueError):
            select(payload([entry("😀" * 10001)]))
        self.assertTrue(select(payload([entry("😀" * 10000)]))[0])
        with self.assertRaises(ValueError):
            select(payload([entry("x" * 20000)] * 56))
        # Legal near-1MB ASCII input with worst-case JSON escaping is not capped at 1MB JSON.
        legal = json.dumps({"version": 1, "kind": "prompt", "entries": [entry("\x01" * 19990)] * 50})
        self.assertGreater(len(legal), 1024 * 1024)
        self.assertTrue(select(legal)[0])


if __name__ == "__main__":
    unittest.main()
