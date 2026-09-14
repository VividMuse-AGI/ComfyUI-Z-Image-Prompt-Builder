import math
import unittest
import nodes as n
import modular_nodes as m
import resolution as r


class ResolutionSelectorTests(unittest.TestCase):
    def test_official_calculation_for_every_ratio_mp_and_alignment(self):
        for aspect in r.ASPECT_RESOLUTIONS:
            import re
            w, h = map(int, re.match(r"(\d+):(\d+)", aspect).groups())
            for mp in (0.1, 0.5, 1.0, 2.0, 4.0, 16.0):
                for align in range(8, 129, 4):
                    scale = math.sqrt(mp * 1024 * 1024 / (w * h))
                    expected = (round(w * scale / align) * align, round(h * scale / align) * align)
                    actual = r.calculate_resolution(aspect, "按总像素计算", mp, align)
                    self.assertEqual(actual, expected)
                    self.assertTrue(all(v > 0 and v % align == 0 for v in actual))

    def test_new_nodes_default_to_decimal_pixel_budget(self):
        for cls in (n.ZImageChinesePromptBuilder, m.ZImageCanvasModule):
            optional = cls.INPUT_TYPES()["optional"]
            self.assertEqual(optional["分辨率模式"][1]["default"], r.PIXEL_BUDGET_MODE)
            self.assertEqual(optional["目标总像素（万）"][1]["default"], 100.0)
        self.assertEqual(r.calculate_pixel_resolution("1:1方形构图"), (1000, 1000))
        for budget, expected in ((100, (896, 1120)), (200, (1280, 1600)), (300, (1536, 1920))):
            self.assertEqual(r.calculate_pixel_resolution("4:5竖构图", budget), expected)
            self.assertEqual(r.calculate_pixel_resolution("5:4横构图", budget), expected[::-1])

    def test_pixel_budget_preserves_exact_ratio_and_nearest_aligned_area(self):
        import re
        for aspect in r.ASPECT_RESOLUTIONS:
            rw, rh = map(int, re.match(r"(\d+):(\d+)", aspect).groups())
            for budget in (10, 33.33, 100, 200, 300, 1600):
                for align in range(8, 129, 4):
                    w, h = r.calculate_pixel_resolution(aspect, budget, align)
                    self.assertEqual(w * rh, h * rw)
                    self.assertTrue(w > 0 and h > 0 and w % align == h % align == 0)
                    divisor = math.gcd(rw, rh)
                    uw, uh = rw // divisor * align, rh // divisor * align
                    # Check both adjacent feasible sizes, not independently rounded sides.
                    target, error = budget * 10000, abs(w * h - budget * 10000)
                    for offset in (-1, 1):
                        nw, nh = w + offset * uw, h + offset * uh
                        if nw > 0 and nh > 0:
                            self.assertLessEqual(error, abs(nw * nh - target))
        # Equivalent ratios must use the reduced grid, not steps of 21 and 9.
        w, h = r.calculate_pixel_resolution("21:9横构图", 100)
        self.assertEqual((w, h), (1512, 648))

    def test_invalid_pixel_budgets_and_alignment(self):
        for budget in (True, None, "200", float("nan"), float("inf"), -1, 0, 9.99, 1600.01):
            with self.assertRaises(ValueError):
                r.calculate_pixel_resolution("4:5竖构图", budget)
        for align in (True, 8.0, "8", 0, 7, 9, 132, None):
            with self.assertRaises(ValueError):
                r.calculate_pixel_resolution("4:5竖构图", 100, align)
        with self.assertRaises(ValueError):
            r.calculate_pixel_resolution("unknown")

    def test_old_workflows_and_direct_api_keep_old_dimensions(self):
        for aspect, size in r.ASPECT_RESOLUTIONS.items():
            self.assertEqual(r.resolution_from_options(aspect, {}), size)
            self.assertEqual(r.resolution_from_options(aspect, r.RESOLUTION_DEFAULTS), size)
            settings = {**r.RESOLUTION_DEFAULTS, "分辨率模式": "按总像素计算", "目标总像素": 2}
            self.assertEqual(r.resolution_from_options(aspect, settings),
                             r.calculate_resolution(aspect, "按总像素计算", 2))
            self.assertEqual(r.resolution_from_options(aspect, {"目标总像素（万）": 200}),
                             r.calculate_pixel_resolution(aspect, 200))

    def test_pixel_budget_only_changes_sizes_on_both_nodes(self):
        for cls, method in ((n.ZImageChinesePromptBuilder, "build_prompt"), (m.ZImageCanvasModule, "build_module")):
            run = getattr(cls(), method)
            for aspect in r.ASPECT_RESOLUTIONS:
                kwargs = {"画面比例": aspect, "自由提示词": "keep this", "输出排版": "按模块分段"}
                legacy = run(**kwargs)
                for budget in (100, 200, 300):
                    result = run(**kwargs, **{"分辨率模式": r.PIXEL_BUDGET_MODE, "目标总像素（万）": budget})
                    self.assertEqual((result[0], result[3]), (legacy[0], legacy[3]))
                    self.assertEqual(result[1:3], r.calculate_pixel_resolution(aspect, budget))
                    if cls is m.ZImageCanvasModule:
                        self.assertEqual(result[0].zimage_resolved_fields["画面比例"], aspect)

    def test_pixel_budget_resolved_and_empty_aspects(self):
        settings = {"分辨率模式": r.PIXEL_BUDGET_MODE, "目标总像素（万）": 200}
        for seed in range(20):
            result = m.ZImageCanvasModule().build_module(画面比例=n.RANDOM_CHOICE, 随机种子=seed, **settings)
            aspect = result[0].zimage_resolved_fields["画面比例"]
            self.assertEqual(result[1:3], r.calculate_pixel_resolution(aspect, 200))
        for preset in n.PRESET_OPTIONS:
            result = n.ZImageChinesePromptBuilder().build_prompt(预设=preset, 画面比例=n.FOLLOW_PRESET, **settings)
            self.assertEqual(result[1:3], r.calculate_pixel_resolution(n.PRESETS[preset]["画面比例"], 200))
            result = n.ZImageChinesePromptBuilder().build_prompt(
                预设=preset, **{f: n.EMPTY_CHOICE for f in n.FIELD_ORDER}, **settings)
            self.assertEqual((result[0], result[3]), ("", ""))
            self.assertEqual(result[1:3], r.calculate_pixel_resolution(n.PRESETS[preset]["画面比例"], 200))
        result = m.ZImageCanvasModule().build_module(
            **{f: n.EMPTY_CHOICE for f in m.MODULE_FIELD_GROUPS["画面基础"]}, **settings)
        self.assertEqual((result[0], result[3]), ("", ""))
        self.assertEqual(result[1:3], r.calculate_pixel_resolution(n.PRESETS[m.DEFAULT_MODULE_PRESET]["画面比例"], 200))

    def test_generated_browser_catalog_matches_backend(self):
        from scripts.generate_resolution_catalog import TARGET, render_catalog
        self.assertEqual(TARGET.read_text(encoding="utf-8"), render_catalog())

    def test_original_sizes_are_not_rounded_or_rescaled(self):
        for aspect, size in r.ASPECT_RESOLUTIONS.items():
            self.assertEqual(r.calculate_resolution(aspect), size)
            self.assertEqual(r.calculate_resolution(aspect, "原推荐尺寸", 16, 128), size)

    def test_invalid_controls_are_rejected(self):
        for mp in (True, None, "2", float("nan"), float("inf"), -1, 0, 16.1):
            with self.assertRaises(ValueError):
                r.calculate_resolution("4:5竖构图", "按总像素计算", mp)
        for align in (True, 8.0, "8", 0, 7, 9, 132, None):
            with self.assertRaises(ValueError):
                r.calculate_resolution("4:5竖构图", "按总像素计算", 1, align)
        with self.assertRaises(ValueError):
            r.calculate_resolution("4:5竖构图", "unknown")

    def test_only_two_nodes_append_resolution_inputs(self):
        classes = {**n.NODE_CLASS_MAPPINGS, **m.NODE_CLASS_MAPPINGS}
        for cls in classes.values():
            schema = cls.INPUT_TYPES()
            if cls in (n.ZImageChinesePromptBuilder, m.ZImageCanvasModule):
                self.assertEqual(list(schema["optional"])[-len(r.RESOLUTION_INPUTS):], list(r.RESOLUTION_INPUTS))
                self.assertNotIn("分辨率模式", schema["required"])
            else:
                self.assertNotIn("分辨率模式", schema.get("optional", {}))

    def test_full_node_changes_only_width_height(self):
        for preset in n.PRESET_OPTIONS:
            for aspect in r.ASPECT_RESOLUTIONS:
                node = n.ZImageChinesePromptBuilder()
                kwargs = dict(预设=preset, 画面比例=aspect, 自由提示词="keep this", 输出排版="按模块分段")
                legacy = node.build_prompt(**kwargs)
                result = node.build_prompt(**kwargs, 分辨率模式="按总像素计算", 目标总像素=2.0, 尺寸对齐倍数=32)
                self.assertEqual((result[0], result[3]), (legacy[0], legacy[3]))
                self.assertEqual(result[1:3], r.calculate_resolution(aspect, "按总像素计算", 2, 32))
                self.assertEqual(legacy[1:3], r.ASPECT_RESOLUTIONS[aspect])

    def test_canvas_only_changes_sizes_preserves_context_and_english(self):
        node = m.ZImageCanvasModule()
        for aspect in r.ASPECT_RESOLUTIONS:
            legacy = node.build_module(画面比例=aspect)
            result = node.build_module(画面比例=aspect, 分辨率模式="按总像素计算", 目标总像素=4, 尺寸对齐倍数=16)
            self.assertEqual((legacy[0], legacy[3]), (result[0], result[3]))
            self.assertEqual(result[0].zimage_resolved_fields["画面比例"], aspect)
            self.assertEqual(result[1:3], r.calculate_resolution(aspect, "按总像素计算", 4, 16))

    def test_empty_modules_keep_text_empty_and_legacy_fallbacks(self):
        full_fields = {f: n.EMPTY_CHOICE for f in n.FIELD_ORDER}
        node = n.ZImageChinesePromptBuilder()
        for preset in n.PRESET_OPTIONS:
            old = node.build_prompt(**full_fields, 预设=preset)
            result = node.build_prompt(**full_fields, 预设=preset, 分辨率模式="按总像素计算", 目标总像素=2)
            self.assertEqual((result[0], result[3]), ("", ""))
            self.assertEqual(old[1:3], r.ASPECT_RESOLUTIONS[n.PRESETS[preset]["画面比例"]])
            self.assertEqual(result[1:3], r.calculate_resolution(n.PRESETS[preset]["画面比例"], "按总像素计算", 2))
        canvas_fields = {f: n.EMPTY_CHOICE for f in m.MODULE_FIELD_GROUPS["画面基础"]}
        result = m.ZImageCanvasModule().build_module(**canvas_fields, 分辨率模式="按总像素计算", 目标总像素=2)
        self.assertEqual((result[0], result[3]), ("", ""))
        self.assertEqual(result[1:3], r.calculate_resolution(n.PRESETS[m.DEFAULT_MODULE_PRESET]["画面比例"], "按总像素计算", 2))

    def test_random_aspect_uses_the_same_resolved_value_as_prompt(self):
        for seed in range(20):
            result = m.ZImageCanvasModule().build_module(画面比例=n.RANDOM_CHOICE,
                随机种子=seed, 分辨率模式="按总像素计算", 目标总像素=2)
            aspect = result[0].zimage_resolved_fields["画面比例"]
            self.assertEqual(result[1:3], r.calculate_resolution(aspect, "按总像素计算", 2))


if __name__ == "__main__":
    unittest.main()
