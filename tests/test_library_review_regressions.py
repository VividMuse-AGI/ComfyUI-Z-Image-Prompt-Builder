"""Text-semantic regressions from the September 2026 library review.

These tests verify prompts, not generated-image quality.
"""
import unittest

import nodes as n
import modular_nodes as m


def blank_request():
    return {field: n.EMPTY_CHOICE for field in n.FIELD_ORDER}


def theme_request(theme, **locks):
    category = next(c for c, themes in n.THEME_OPTIONS_BY_CATEGORY.items() if theme in themes)
    return {**{f: n.RANDOM_CHOICE for f in n.FIELD_ORDER},
            "写真大类": category, "写真主题": theme, **locks}


class AtomicOutputReviewTests(unittest.TestCase):
    def test_all_isolated_public_atoms_survive_both_node_paths_and_languages(self):
        classes = {cls.MODULE_NAME: cls for cls in (
            m.ZImageCanvasModule, m.ZImagePersonModule, m.ZImageHairModule,
            m.ZImageClothingModule, m.ZImagePoseModule, m.ZImageSceneModule,
            m.ZImageCameraModule, m.ZImageVisualModule)}
        for module, group in m.MODULE_FIELD_GROUPS.items():
            for field in group:
                if field in n.CONTROL_ONLY_FIELDS:
                    continue
                for value in n.FIELD_OPTIONS[field]:
                    if value in n.DEPENDENCY_PLACEHOLDER_VALUES.get(field, ()):
                        continue
                    for density in n.PROMPT_DENSITIES:
                        kwargs = {**blank_request(), field: value, "预设": n.CUSTOM_PRESET,
                                  "提示词密度": density}
                        full = n.ZImageChinesePromptBuilder().build_prompt(**kwargs)
                        independent = classes[module]().build_module(**kwargs)
                        with self.subTest(field=field, value=value, density=density):
                            self.assertTrue(full[0])
                            self.assertTrue(full[-1])
                            self.assertTrue(independent[0])
                            self.assertTrue(independent[-1])
                            self.assertNotRegex(full[-1], r"[\u3400-\u9fff]")

    def test_inactive_makeup_branch_stays_hidden_in_both_languages(self):
        kwargs = {**blank_request(), "妆容模式": "整体预设", "唇妆颜色": "裸粉色"}
        for density in n.PROMPT_DENSITIES:
            full = n.ZImageChinesePromptBuilder().build_prompt(**kwargs, 提示词密度=density)
            independent = m.ZImagePersonModule().build_module(**kwargs, 提示词密度=density)
            self.assertEqual((full[0], full[-1], *independent), ("", "", "", ""))


class RandomCompatibilityReviewTests(unittest.TestCase):
    def test_sports_context_survives_independent_module_chaining(self):
        for theme in ("室内泳池运动写真", "瑜伽普拉提生活写真"):
            request = {**blank_request(), "写真大类": "运动健康", "写真主题": theme}
            canvas = m.ZImageCanvasModule().build_module(**request)
            pose = m.ZImagePoseModule().build_module(
                前置提示词=canvas[0], 前置英文提示词=canvas[-1],
                **{f: n.RANDOM_CHOICE for f in n.POSE_OUTPUT_FIELDS})
            scene = m.ZImageSceneModule().build_module(
                前置提示词=pose[0], 前置英文提示词=pose[-1],
                **{f: n.RANDOM_CHOICE for f in n.SCENE_GROUP_FIELDS})
            fields = scene[0].zimage_resolved_fields
            if "泳池" in theme:
                self.assertEqual(fields["场景地点"], "室内泳池")
                self.assertEqual(fields["基础姿态"], "泳池边坐姿")
            else:
                self.assertEqual(fields["基础姿态"], "低位鸽子式")
                self.assertIn(fields["场景地点"], {n.SCENE_BUNDLE_BY_ID[i]["场景地点"]
                              for i in ("yoga_scene", "sunlit_living_room_scene")})

    def test_garment_material_is_not_duplicated_in_compact_name(self):
        for density in n.PROMPT_DENSITIES:
            request = {**blank_request(), "穿搭结构": "连衣裙", "连衣裙类型": "缎面吊带长裙",
                       "连衣裙材质": "缎面", "提示词密度": density}
            for text in (n.ZImageChinesePromptBuilder().build_prompt(**request)[0],
                         m.ZImageClothingModule().build_module(**request)[0]):
                self.assertIn("缎面吊带长裙", text)
                self.assertNotIn("缎面缎面", text)

    def test_sports_keep_their_own_scene_and_yoga_pose_in_all_scopes(self):
        expected = {"室内泳池运动写真": {"室内泳池"},
                    "舞蹈排练动态写真": {"舞蹈排练室"},
                    "瑜伽普拉提生活写真": {n.SCENE_BUNDLE_BY_ID[i]["场景地点"]
                        for i in ("yoga_scene", "sunlit_living_room_scene")}}
        for theme, locations in expected.items():
            for scope in n.RANDOM_SCOPES:
                for seed in range(30):
                    result = n.resolve_fields(n.CUSTOM_PRESET, scope, seed, theme_request(theme))
                    self.assertIn(result["场景地点"], locations, (theme, scope, seed))
                    if "瑜伽" in theme:
                        self.assertEqual(result["基础姿态"], "低位鸽子式")
                    request = theme_request(theme, 场景地点="室内泳池")
                    self.assertEqual(n.resolve_fields(n.CUSTOM_PRESET, scope, seed, request)["场景地点"],
                                     "室内泳池")

    def test_automatic_garment_properties_agree_with_named_materials_and_colors(self):
        examples = (("上装", "挺括白衬衫", "颜色", {"奶油白", "象牙白"}),
                    ("连衣裙", "吊带小黑裙", "颜色", {"玄黑色"}),
                    ("下装", "直筒牛仔裤", "材质", {"牛仔"}),
                    ("连衣裙", "缎面吊带长裙", "材质", {"缎面"}),
                    ("上装", "细罗纹吊带上衣", "材质", {"细罗纹针织"}))
        for branch, garment, suffix, allowed in examples:
            request = {**blank_request(), **{f: n.RANDOM_CHOICE for f in n.CLOTHING_OUTPUT_FIELDS},
                       branch + "类型": garment}
            for scope in n.RANDOM_SCOPES:
                for seed in range(30):
                    result = n.resolve_fields(n.CUSTOM_PRESET, scope, seed, request)
                    self.assertEqual(result[branch + "类型"], garment)
                    self.assertIn(result[branch + suffix], allowed | {n.EMPTY_CHOICE})
                    if "吊带" in garment:
                        self.assertNotIn(result["版型细节"], ("泡泡袖", "灯笼袖", "高领结构", "抹胸设计"))

    def test_clothing_literal_conflicts_remain_user_controlled(self):
        request = {**blank_request(), **{f: n.RANDOM_CHOICE for f in n.CLOTHING_OUTPUT_FIELDS},
                   "连衣裙类型": "缎面吊带长裙", "连衣裙材质": "柔软针织", "版型细节": "灯笼袖"}
        result = n.resolve_fields(n.CUSTOM_PRESET, n.RANDOM_SCOPES[2], 0, request)
        self.assertEqual(result["连衣裙材质"], "柔软针织")
        self.assertEqual(result["版型细节"], "灯笼袖")

    def test_pixie_and_hip_length_locks_never_fall_back_to_conflicting_styles(self):
        for length in ("精灵短发", "及臀长发"):
            request = {**blank_request(), **{f: n.RANDOM_CHOICE for f in n.HAIR_OUTPUT_FIELDS},
                       "头发长度": length}
            for scope in n.RANDOM_SCOPES:
                for seed in range(30):
                    result = n.resolve_fields(n.CUSTOM_PRESET, scope, seed, request)
                    self.assertEqual(result["头发长度"], length)
                    if length == "精灵短发":
                        self.assertEqual(result["发型造型"], "利落短发轮廓")
                        self.assertNotIn(result["头部配饰"], ("金色发簪", "玉质发簪"))
                    else:
                        self.assertNotEqual(result["发型造型"], "利落短发轮廓")


    def test_business_headshots_and_product_camera_purpose(self):
        for theme in n.THEME_CAMERA_PURPOSE_IDS:
            for scope in n.RANDOM_SCOPES:
                for seed in range(20):
                    result = n.resolve_fields(n.CUSTOM_PRESET, scope, seed, theme_request(theme))
                    if theme == "专业商务头像写真":
                        self.assertIn(result["景别"], ("头肩近景", "胸部以上"))
                    if result["景别"] == "局部特写":
                        self.assertEqual(result["对焦位置"], "手部与道具")
                    request = theme_request(theme, 景别="环境人像")
                    self.assertEqual(n.resolve_fields(n.CUSTOM_PRESET, scope, seed, request)["景别"], "环境人像")

    def test_automatic_lighting_obeys_time_weather_including_fallbacks(self):
        for scope in n.RANDOM_SCOPES:
            for time, weather in (("阴天下午", "小雪"), ("夜间", "不使用"),
                                  ("正午", "晴朗日照"), ("晴朗清晨", "细雨")):
                for seed in range(20):
                    request = {**blank_request(), **{f: n.RANDOM_CHOICE for f in n.LIGHTING_OUTPUT_FIELDS},
                               "时间切片": time, "天气状态": weather, "光线方向": "右侧"}
                    result = n.resolve_fields(n.CUSTOM_PRESET, scope, seed, request)
                    self.assertEqual(result["光线方向"], "右侧")
                    self.assertNotEqual(result["主光来源"], "日落阳光")
                    if time == "夜间":
                        self.assertNotIn(result["主光来源"], ("窗户日光", "阴天天光", "叶隙阳光", "直射阳光"))
                    if weather in ("细雨", "小雪"):
                        self.assertNotIn(result["主光来源"], ("叶隙阳光", "直射阳光"))
                    request["主光来源"] = "直射阳光"
                    self.assertEqual(n.resolve_fields(n.CUSTOM_PRESET, scope, seed, request)["主光来源"], "直射阳光")


class EnglishSemanticsReviewTests(unittest.TestCase):
    def test_detailed_makeup_preserves_base_and_lip_description(self):
        for makeup, phrases in (("清透裸粉妆", ("translucent base", "pink blush", "nude-pink lips")),
                                ("明艳红唇妆", ("clean base", "defined eyeliner", "red lips")),
                                ("豆沙柔雾妆", ("soft-matte base", "subtle eye makeup", "dusty-rose lips"))):
            request = {**blank_request(), "整体妆容预设": makeup, "提示词密度": "详细"}
            for result in (n.ZImageChinesePromptBuilder().build_prompt(**request)[-1],
                           m.ZImagePersonModule().build_module(**request)[-1]):
                for phrase in phrases:
                    self.assertIn(phrase, result)

    def test_clean_foreground_is_positive_and_empty_stays_empty(self):
        for density in n.PROMPT_DENSITIES:
            request = {**blank_request(), "前景框景": "无明显前景", "提示词密度": density}
            for result in (n.ZImageChinesePromptBuilder().build_prompt(**request)[0],
                           m.ZImageSceneModule().build_module(**request)[0]):
                self.assertIn("干净通透", result)
                self.assertNotIn("无明显前景", result)
            request["前景框景"] = n.EMPTY_CHOICE
            self.assertEqual(m.ZImageSceneModule().build_module(**request), ("", ""))

    def test_corrected_words_reach_full_and_module_outputs(self):
        cases = (("头发长度", "及臀长发", "hip-length hair", m.ZImageHairModule),
                 ("刘海", "全幅齐刘海", "straight-across bangs", m.ZImageHairModule),
                 ("上装类型", "运动背心", "athletic tank top", m.ZImageClothingModule),
                 ("等效焦段", "手机主摄", "phone main camera", m.ZImageCameraModule),
                 ("眼线造型", "彩色眼线", "colored eyeliner", m.ZImagePersonModule),
                 ("写真主题", "黑白电影肖像", "black-and-white cinematic portrait", m.ZImageCanvasModule))
        for field, value, phrase, cls in cases:
            for density in n.PROMPT_DENSITIES:
                request = {**blank_request(), field: value, "提示词密度": density}
                full = n.ZImageChinesePromptBuilder().build_prompt(**request)[-1]
                independent = cls().build_module(**request)[-1]
                self.assertIn(phrase, full)
                self.assertIn(phrase, independent)
                self.assertNotIn("sports bra", full)
                self.assertNotIn("eyeliner eyeliner", full)


if __name__ == "__main__":
    unittest.main()
