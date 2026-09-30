"""Behavioral regressions verified from the external v0.6.0 review."""
import unittest
from unittest.mock import patch

import nodes as n
import modular_nodes as m


def blank(**values):
    return {**{field: n.EMPTY_CHOICE for field in n.FIELD_ORDER}, **values}


class ExternalReviewRegressions(unittest.TestCase):
    def test_empty_scene_fields_do_not_force_unrelated_locations(self):
        for preset in n.PRESET_OPTIONS[:-1]:
            base = n._preset_values(preset)
            theme = n.theme_scene_bundles(base['写真主题']) or n._theme_directed_scene_bundles(base['写真主题'])
            preferred = theme or n.PROFILE_SCENE_BUNDLES.get(preset, n.SCENE_BUNDLES)
            allowed = {bundle['场景地点'] for bundle in preferred}
            for seed in range(20):
                result = n.resolve_fields(preset, n.RANDOM_SCOPES[1], seed,
                                         {'背景环境': n.EMPTY_CHOICE, '时间切片': n.RANDOM_CHOICE})
                with self.subTest(preset=preset, seed=seed):
                    self.assertEqual(result['背景环境'], n.EMPTY_CHOICE)
                    self.assertIn(result['场景地点'], allowed)

    def test_cleared_scene_keeps_all_disabled_atoms_and_concept_lock(self):
        requested = {field: n.EMPTY_CHOICE for field in n.SCENE_GROUP_FIELDS}
        requested['时间切片'] = n.RANDOM_CHOICE
        for seed in range(20):
            result = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[1], seed, requested)
            self.assertNotEqual(result['时间切片'], n.EMPTY_CHOICE)
            for field in n.SCENE_GROUP_FIELDS:
                if field != '时间切片':
                    self.assertEqual(result[field], n.EMPTY_CHOICE)
        result = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[1], 42,
                                 {'场景地点': '月夜森林', '天气状态': '细雨', '时间切片': n.RANDOM_CHOICE})
        self.assertEqual(result['场景地点'], '月夜森林')
        self.assertEqual(result['天气状态'], '细雨')

    def test_compact_english_keeps_person_fields_alongside_identity(self):
        for field in (*n.PERSON_FACE_FIELDS, *n.PERSON_EYE_FIELDS, *n.PERSON_SKIN_FIELDS,
                      *n.BODY_OUTPUT_FIELDS, *n.MAKEUP_CUSTOM_FIELDS):
            for value in n.FIELD_OPTIONS[field]:
                fields = blank(**{'年龄阶段': n.FIELD_OPTIONS['年龄阶段'][0], field: value})
                expected = n._english_atomic_value(field, value)
                with self.subTest(field=field, value=value):
                    text = n.render_english_module_fragment('人物', fields, '精简')
                    self.assertIn(expected, text)
                    output = m.ZImagePersonModule().build_module(**fields, 提示词密度='精简')
                    self.assertIn(expected, output[-1])

    def test_compact_english_keeps_hair_camera_and_visual_companions(self):
        groups = {
            '发型': (n.HAIR_OUTPUT_FIELDS, {'发色': n.FIELD_OPTIONS['发色'][0]}),
            '摄影': (tuple(f for f in n.CAMERA_OUTPUT_FIELDS if f != '拍摄距离'),
                     {'景别': '腰部以上'}),
            '视觉表现': (tuple(f for f in n.VISUAL_OUTPUT_FIELDS if f != '影像风格'),
                         {'主配色': n.FIELD_OPTIONS['主配色'][0]}),
        }
        for module, (group, companion) in groups.items():
            for field in group:
                for value in n.FIELD_OPTIONS[field]:
                    fields = blank(**{**companion, field: value})
                    with self.subTest(module=module, field=field, value=value):
                        self.assertIn(n._english_atomic_value(field, value),
                                      n.render_english_module_fragment(module, fields, '精简'))

    def test_compact_clothing_keeps_material_and_accessories_with_garment(self):
        fields = blank(**{'穿搭结构': '上装＋下装', '上装类型': '垂坠衬衫',
                          '上装材质': '棉质', '鞋履': '白色运动鞋', '袜装': '白色运动袜',
                          '服装配件': '纤细项链'})
        en = n.render_english_module_fragment('服装', fields, '精简')
        for term in ('cotton', 'white sneakers', 'white sports socks', 'necklace'):
            self.assertIn(term, en)

    def test_english_join_accepts_chinese_terminal_punctuation(self):
        for end in ('。', '！', '？', '；', '，', '：', '、', '…', '.', '!', '?'):
            result = n.join_english_prompt_text('自由原文' + end, 'Soft light.')
            self.assertEqual(result, '自由原文' + end + ' Soft light.')

    def test_ethnicity_articles_and_proper_names(self):
        expected = {'欧洲裔': 'a European woman', '拉丁美洲裔': 'a Latin American woman',
                    '东亚': 'an East Asian woman', '西亚／中东': 'a West Asian or Middle Eastern woman',
                    '非洲裔': 'an African woman'}
        for value, phrase in expected.items():
            fields = blank(**{'年龄阶段': n.FIELD_OPTIONS['年龄阶段'][0], '族裔大类': value})
            self.assertIn(phrase, n._english_person_identity_text(fields))
        for value in n.FIELD_OPTIONS['地域族裔分支']:
            fields = blank(**{'年龄阶段': n.FIELD_OPTIONS['年龄阶段'][0], '地域族裔分支': value})
            text = n._english_person_identity_text(fields)
            self.assertNotRegex(text, r'\ban (?:European|Latin|West|North|South|Central|Slavic)\b')

    def test_capture_media_and_pattern_nouns(self):
        for value, phrase in [('35毫米胶片摄影', '35mm film photography'),
                             ('数码单反摄影', 'DSLR photography'),
                             ('早期CCD数码摄影', 'early CCD digital photography')]:
            self.assertEqual(n._english_atomic_value('成像媒介', value), phrase)
        expected = {'细小碎花': 'a tiny floral print', '小波点': 'a polka-dot pattern',
                    '纵向罗纹': 'a ribbed texture', '花卉刺绣': 'floral embroidery'}
        for prefix in ('上装', '下装', '连衣裙', '连体服'):
            for value, phrase in expected.items():
                self.assertEqual(n._english_atomic_value(prefix + '图案', value), phrase)

    def test_blank_clothing_properties_do_not_invent_a_garment(self):
        for prefix in ('上装', '下装', '连衣裙', '连体服'):
            for density in n.PROMPT_DENSITIES:
                fields = blank(**{prefix + '颜色': '奶油白'})
                en = n.render_english_module_fragment('服装', fields, density)
                self.assertIn('cream white', en)
                self.assertNotRegex(en, r'\b(?:wearing|top|bottoms|dress|jumpsuit)\b')

    def test_user_module_terminal_punctuation_is_preserved(self):
        for terminal in ('！', '？', '!', '?', '…'):
            supplied = '原文' + terminal
            for density in n.PROMPT_DENSITIES:
                for separate in (False, True):
                    text = n.compose_prompt_text(blank(), density,
                        user_module_fragments={'自定义': supplied}, separate_modules=separate)
                    self.assertEqual(text, supplied)
                for fields in (blank(), n.PRESETS[n.PRESET_OPTIONS[0]]):
                    for module in n.USER_MODULE_INPUTS:
                        for separate in (False, True):
                            text = n.compose_prompt_text(fields, density,
                                user_module_fragments={module: supplied}, separate_modules=separate)
                            self.assertIn(supplied, text)
                            self.assertNotIn(terminal + '。', text)

    def test_whitespace_free_prompt_is_empty_in_continuous_output(self):
        for whitespace in (' \n\t ', '\u3000', ''):
            for position in n.PROMPT_JOIN_POSITIONS:
                self.assertEqual(n.join_prompt_text(whitespace, '', position), '')
                self.assertEqual(n.join_prompt_text(whitespace, '结构化。', position), '结构化。')
                text = n.ZImageChinesePromptBuilder().build_prompt(**blank(), 自由提示词=whitespace,
                                                                   输出排版='连续拼接')
                self.assertEqual((text[0], text[-1]), ('', ''))

    def test_recipe_unspecified_pool_does_not_reject_a_lock(self):
        first, second = n.CLOTHING_RECIPES[:2]
        theme = '审核测试主题'
        rules = {**n._COMBINATION_RULES, 'theme_recipe_ids': {theme: (first['id'], second['id'])}}
        fields = blank(**{'写真主题': theme, '上装颜色': '珊瑚红'})
        original = n._clothing_recipe_values
        def values(recipe, field):
            if field == '上装颜色':
                return None if recipe['id'] == first['id'] else []
            return original(recipe, field)
        with patch.object(n, '_COMBINATION_RULES', rules), patch.object(n, '_clothing_recipe_values', values):
            recipes = n._clothing_recipe_candidates(n.CUSTOM_PRESET, n.RANDOM_SCOPES[0], fields, {'鞋履'})
        self.assertEqual([recipe['id'] for recipe in recipes], [first['id']])

    def test_detailed_fabric_description_occurs_once_and_keeps_specifics(self):
        for garment, material in [('垂坠衬衫', '棉质'), ('挂脖针织上衣', '细罗纹针织'),
                                  (n.EMPTY_CHOICE, '棉质')]:
            fields = blank(**{'穿搭结构': '上装＋下装', '上装类型': garment,
                              '上装颜色': '奶油白', '上装材质': material})
            text = n._clothing_prompt_text(fields, '详细')
            self.assertEqual(text.count(material), 1)
            self.assertIn(n.CLOTHING_VALUE_TEXT['上装材质'][material], text)

    def test_reference_scene_rechecks_lighting_against_its_new_category(self):
        request = {field: n.RANDOM_CHOICE
                   for field in (*n.SCENE_GROUP_FIELDS, *n.LIGHTING_OUTPUT_FIELDS)}
        for entry in n.REFERENCE_POOL.entries:
            if entry['module'] != '场景':
                continue
            def candidates(module, resolved, automatic):
                return [(entry, '背景环境')] if module == '场景' else []
            seen = False
            with patch.object(n.REFERENCE_POOL, 'candidates', candidates):
                for seed in range(16):
                    fields = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[1], seed, request)
                    if fields['背景环境'] != entry['label']:
                        continue
                    seen = True
                    plans = n._scene_compatible_lighting_plans(fields)
                    signatures = {tuple(plan[f] for f in n.LIGHTING_OUTPUT_FIELDS) for plan in plans}
                    self.assertIn(tuple(fields[f] for f in n.LIGHTING_OUTPUT_FIELDS), signatures)
            self.assertTrue(seen, entry['id'])

    def test_profile_pool_does_not_evaluate_unused_global_fallback(self):
        preset = n.PRESET_OPTIONS[0]
        profile = n.PROFILE_POOLS[preset]
        field = next(iter(profile))
        without_field = {key: value for key, value in n.RANDOM_FIELD_OPTIONS.items() if key != field}
        with patch.object(n, 'RANDOM_FIELD_OPTIONS', without_field):
            self.assertIn(n._choose_from_pool(n.random.Random(0), preset, n.RANDOM_SCOPES[0], field),
                          profile[field])

    def test_compact_visual_english_obeys_chinese_density_trimming(self):
        fields = n._preset_values(n.PRESET_OPTIONS[0])
        text = n.render_english_module_fragment('视觉表现', fields, '精简')
        self.assertNotIn(n._english_atomic_value('画面对比', fields['画面对比']), text)
        self.assertNotIn(n._english_atomic_value('颗粒质感', fields['颗粒质感']), text)
        self.assertNotIn(n._english_atomic_value('影像风格', fields['影像风格']), text)
        self.assertIn(n._english_atomic_value('阴影表现', fields['阴影表现']), text)

    def test_unknown_preset_logs_fallback_and_legacy_names_still_resolve(self):
        with self.assertLogs(n.__name__, level='WARNING'):
            fields = n._preset_values('未收录的预设')
        self.assertEqual(fields, n.CUSTOM_DEFAULTS)
        for legacy, current in n.LEGACY_PRESET_NAMES.items():
            self.assertEqual(n._preset_values(legacy), n._preset_values(current))

    def test_explicit_clothing_structure_retains_existing_visibility_contract(self):
        fields = n.resolve_fields(n.CUSTOM_PRESET, n.RANDOM_SCOPES[0], 0,
                                 blank(**{'穿搭结构': '连衣裙', '下装类型': '牛仔裤'}))
        self.assertEqual(fields['下装类型'], n.EMPTY_CHOICE)
        self.assertNotIn('牛仔裤', n.compose_prompt_text(fields))


if __name__ == '__main__':
    unittest.main()
