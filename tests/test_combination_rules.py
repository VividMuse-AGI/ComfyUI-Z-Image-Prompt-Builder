"""Cross-module random compatibility regressions."""
import unittest
import nodes as n
import modular_nodes as m

def random_modules(*modules):
    request = {f: n.EMPTY_CHOICE for f in n.FIELD_ORDER}
    for module in modules:
        request.update({f: n.RANDOM_CHOICE for f in m.MODULE_FIELD_GROUPS[module]})
    return request

class CombinationRuleTests(unittest.TestCase):
    def test_switched_theme_drives_clothing_in_all_scopes(self):
        request = random_modules("服装", "姿态动作")
        request.update({"写真大类": "运动健康", "写真主题": "拳击训练力量写真"})
        for scope in n.RANDOM_SCOPES:
            for seed in range(40):
                result = n.resolve_fields(n.PRESET_OPTIONS[1], scope, seed, request)
                self.assertEqual(result["上装类型"], "运动背心")
                self.assertIn(result["下装类型"], ("运动紧身裤", "骑行短裤"))
                self.assertIn(result["鞋履"], ("白色运动鞋", "复古运动鞋"))
                self.assertEqual(result["服装配件"], n.EMPTY_CHOICE)
                self.assertEqual(result["上装图案"], n.EMPTY_CHOICE)
                self.assertIn("拳击手套", result["手部动作"])
                self.assertEqual(result, n.resolve_fields(n.PRESET_OPTIONS[1], scope, seed, request))

    def test_pose_recognition_covers_all_public_options(self):
        registered = [p for group in n.POSE_CAMERA_TYPES.values() for p in group]
        self.assertEqual(set(registered), set(n.FIELD_OPTIONS["基础姿态"]))
        self.assertEqual(len(registered), len(set(registered)))

    def test_seated_full_body_is_allowed_and_static_pose_rejects_dynamic(self):
        for pose in ("泳池边坐姿", "单车侧坐", "地面侧坐", "复古扶手椅坐姿", "沙滩侧卧", "低位鸽子式"):
            choices = n._pose_compatible_camera_bundles(pose, n.CAMERA_BUNDLES)
            shots = {b["景别"] for b in choices}
            self.assertIn("全身构图", shots, pose)
            self.assertIn("带环境全身", shots, pose)
            self.assertNotIn("动态全身", shots, pose)
        for pose in ("泳池边坐姿", "单车侧坐", "地面侧坐"):
            self.assertTrue(any(b["景别"] == "坐姿半身" for b in
                                n._pose_compatible_camera_bundles(pose, n.CAMERA_BUNDLES)))

    def test_camera_filter_applies_to_all_scopes_and_fallbacks(self):
        for scope in n.RANDOM_SCOPES:
            for pose in ("自然站立", "泳池边坐姿", "低位鸽子式", "沙滩侧卧"):
                request = random_modules("摄影")
                request.update({"基础姿态": pose, "写真主题": "室内泳池运动写真",
                                "画面布局": "中央偏右"})
                for seed in range(20):
                    result = n.resolve_fields(n.PRESET_OPTIONS[8], scope, seed, request)
                    if pose == "自然站立":
                        self.assertNotEqual(result["景别"], "坐姿半身")
                    else:
                        self.assertNotEqual(result["景别"], "动态全身")
                    self.assertEqual(result["画面布局"], "中央偏右")

    def test_rule_data_only_uses_current_public_fields_and_recipes(self):
        all_themes = {t for ts in n.THEME_OPTIONS_BY_CATEGORY.values() for t in ts}
        rules = n._COMBINATION_RULES
        self.assertEqual(set(rules["theme_recipe_ids"]), all_themes)
        self.assertEqual(set(rules["category_recipe_ids"]), set(n.THEME_OPTIONS_BY_CATEGORY))
        for pools in (rules["theme_recipe_ids"], rules["category_recipe_ids"]):
            for ids in pools.values():
                self.assertTrue(ids)
                self.assertTrue(set(ids).issubset(n.CLOTHING_RECIPE_BY_ID))
        for theme, fields in rules["theme_field_overrides"].items():
            self.assertIn(theme, all_themes)
            for field, values in fields.items():
                self.assertIn(field, n.CLOTHING_OUTPUT_FIELDS)
                self.assertTrue(set(values).issubset(n.FIELD_OPTIONS[field]), (theme, field))

    def test_manual_clothing_and_camera_choices_and_empty_values_win(self):
        request = random_modules("服装", "摄影")
        request.update({"写真主题": "拳击训练力量写真", "基础姿态": "自然站立",
                        "穿搭结构": "上装＋下装", "上装类型": "垂坠衬衫",
                        "上装材质": "棉质", "下装图案": n.EMPTY_CHOICE,
                        "服装配件": n.EMPTY_CHOICE, "鞋履": "尖头细跟高跟鞋",
                        "景别": "坐姿半身", "等效焦段": n.FIELD_OPTIONS["等效焦段"][0]})
        locked = {f: v for f, v in request.items() if v != n.RANDOM_CHOICE}
        for scope in n.RANDOM_SCOPES:
            result = n.resolve_fields(n.PRESET_OPTIONS[1], scope, 99, request)
            for field, value in locked.items():
                self.assertEqual(result[field], value, field)

    def test_every_theme_with_all_clothing_pose_and_camera_random_is_valid(self):
        import copy
        before_recipes = copy.deepcopy(n.CLOTHING_RECIPES)
        before_rules = copy.deepcopy(n._COMBINATION_RULES)
        for category, themes in n.THEME_OPTIONS_BY_CATEGORY.items():
            for theme in themes:
                for scope in n.RANDOM_SCOPES:
                    for seed in (0, 11, 42):
                        request = random_modules("服装", "姿态动作", "摄影")
                        request.update({"写真大类": category, "写真主题": theme})
                        result = n.resolve_fields(n.PRESET_OPTIONS[1], scope, seed, request)
                        for field, value in result.items():
                            self.assertTrue(value == n.EMPTY_CHOICE or value in n.FIELD_OPTIONS[field])
                        allowed_shots = {b["景别"] for b in n._pose_compatible_camera_bundles(
                            result["基础姿态"], n.CAMERA_BUNDLES)}
                        self.assertIn(result["景别"], allowed_shots, (theme, scope, seed))
                        self.assertEqual(result["背景环境"], n.EMPTY_CHOICE)
                        for field in m.MODULE_FIELD_GROUPS["人物"]:
                            self.assertEqual(result[field], n.EMPTY_CHOICE)
        self.assertEqual(before_recipes, n.CLOTHING_RECIPES)
        self.assertEqual(before_rules, n._COMBINATION_RULES)

    def test_independent_chain_passes_theme_and_pose_in_both_languages(self):
        for theme in ("拳击训练力量写真", "室内泳池运动写真", "瑜伽普拉提生活写真"):
            canvas_kwargs = {f: n.EMPTY_CHOICE for f in m.MODULE_FIELD_GROUPS["画面基础"]}
            canvas_kwargs["写真主题"] = theme
            canvas = m.ZImageCanvasModule().build_module(**canvas_kwargs)
            for density in n.PROMPT_DENSITIES:
                context = m.PromptChainText("", {f: n.EMPTY_CHOICE for f in n.FIELD_ORDER})
                context.zimage_resolved_fields.update(canvas[0].zimage_resolved_fields)
                prefix_zh = prefix_en = context
                for module, cls in (("服装", m.ZImageClothingModule),
                                    ("姿态动作", m.ZImagePoseModule),
                                    ("摄影", m.ZImageCameraModule)):
                    kwargs = {f: n.RANDOM_CHOICE for f in m.MODULE_FIELD_GROUPS[module]}
                    zh, en = cls().build_module(**kwargs, 预设=n.PRESET_OPTIONS[1], 随机种子=7,
                        提示词密度=density, 前置提示词=prefix_zh, 前置英文提示词=prefix_en, 输出排版="按模块分段")
                    self.assertTrue(zh)
                    self.assertNotRegex(en, r"[\u3400-\u9fff]")
                    prefix_zh, prefix_en = zh, en
                state = zh.zimage_resolved_fields
                allowed = {b["景别"] for b in n._pose_compatible_camera_bundles(state["基础姿态"], n.CAMERA_BUNDLES)}
                self.assertIn(state["景别"], allowed)
                if "拳击" in theme:
                    self.assertEqual(state["上装类型"], "运动背心")
                if "泳池" in theme:
                    self.assertEqual(state["基础姿态"], "泳池边坐姿")
                    self.assertEqual(state["鞋履"], n.EMPTY_CHOICE)
                self.assertGreaterEqual(str(zh).count("\n\n"), 2)

    def test_unrecognized_pose_does_not_become_standing(self):
        for pose in ("", n.EMPTY_CHOICE, n.FOLLOW_PRESET, "未来自定义姿态"):
            self.assertEqual(n._pose_compatible_camera_bundles(pose, n.CAMERA_BUNDLES), n.CAMERA_BUNDLES)

    def test_known_static_pose_has_no_incompatible_fallback(self):
        only_dynamic = [b for b in n.CAMERA_BUNDLES if b["景别"] == "动态全身"]
        self.assertEqual(n._pose_compatible_camera_bundles("泳池边坐姿", only_dynamic), [])

    def test_partial_random_does_not_enable_other_modules(self):
        request = random_modules("服装")
        request["写真主题"] = "拳击训练力量写真"
        for scope in n.RANDOM_SCOPES:
            result = n.resolve_fields(n.PRESET_OPTIONS[1], scope, 0, request)
            for field in (*n.POSE_OUTPUT_FIELDS, *n.CAMERA_OUTPUT_FIELDS, *n.SCENE_OUTPUT_FIELDS):
                self.assertEqual(result[field], n.EMPTY_CHOICE)

    def test_aspects_do_not_reintroduce_wrong_pose_framing(self):
        for aspect in [*n.FIELD_OPTIONS["画面比例"], n.RANDOM_CHOICE]:
            for pose in n.FIELD_OPTIONS["基础姿态"]:
                for scope in n.RANDOM_SCOPES:
                    request = random_modules("摄影")
                    request.update({"画面比例": aspect, "基础姿态": pose,
                                    "成像媒介": "专业数码相机摄影"})
                    result = n.resolve_fields(n.PRESET_OPTIONS[1], scope, 17, request)
                    allowed = n._pose_compatible_camera_bundles(pose, n.CAMERA_BUNDLES)
                    self.assertIn(result["景别"], {b["景别"] for b in allowed}, (aspect, pose, scope))
                    self.assertNotEqual(result["等效焦段"], "手机主摄")
                    if aspect != n.RANDOM_CHOICE:
                        self.assertEqual(result["画面比例"], aspect)

    def test_explicit_headshot_uses_matching_companions_even_in_landscape(self):
        stock = n.CAMERA_BUNDLE_BY_ID["headshot_85"]
        for aspect in n.FIELD_OPTIONS["画面比例"]:
            request = random_modules("摄影")
            request.update({"画面比例": aspect, "基础姿态": "自然站立",
                            "写真主题": "专业商务头像写真",
                            "景别": "头肩近景", "对焦位置": "近侧眼睛"})
            for scope in n.RANDOM_SCOPES:
                result = n.resolve_fields(n.PRESET_OPTIONS[1], scope, 7, request)
                self.assertEqual({f: result[f] for f in n.CAMERA_OUTPUT_FIELDS},
                                 {f: stock[f] for f in n.CAMERA_OUTPUT_FIELDS})

    def test_manual_phone_lens_is_not_overwritten(self):
        request = random_modules("摄影")
        request.update({"等效焦段": "手机主摄", "成像媒介": "专业数码相机摄影",
                        "画面比例": "16:9横构图"})
        result = n.resolve_fields(n.PRESET_OPTIONS[1], n.RANDOM_SCOPES[1], 7, request)
        self.assertEqual(result["等效焦段"], "手机主摄")

    def test_acceptance_samples_are_generated_from_current_node(self):
        from scripts.generate_combination_samples import TARGET, build_samples, render_samples
        samples = build_samples()
        self.assertEqual(len(samples), 6)
        self.assertEqual(TARGET.read_text(encoding="utf-8"), render_samples())
        prompts = dict(samples)
        self.assertIn("运动背心", prompts["拳击运动搭配"])
        self.assertIn("泳池边坐姿", prompts["泳池边坐姿全身"])
        self.assertIn("全身构图", prompts["泳池边坐姿全身"])
        self.assertIn("85mm", prompts["商务头像"])
        self.assertNotIn("露脐", prompts["香水瓶身朝向"])
        for prompt in prompts.values():
            self.assertIn("\n\n", prompt)
            self.assertNotIn("跟随预设", prompt)
            self.assertNotIn("不使用", prompt)
