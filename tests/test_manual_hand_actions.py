"""Precise manual hand actions must not change legacy sampling or fixed inputs."""
import json
import unittest

import nodes as n
import modular_nodes as m
from scripts import generate_frontend_i18n, generate_library_catalog


def meta(result):
    return result['ui']['vividmuse_prompt_diagnostics'][0]


class ManualHandActionTests(unittest.TestCase):
    def args(self, **updates):
        return {**dict.fromkeys(n.FIELD_ORDER, n.EMPTY_CHOICE),
                '预设': n.PRESET_OPTIONS[0], '随机种子': 2,
                '随机范围': n.RANDOM_SCOPES[2], **updates}

    def test_registration_is_append_only_and_legacy_action_unchanged(self):
        self.assertEqual([a['id'] for a in n.MANUAL_HAND_ACTIONS],
                         ['touch_foldover_collar', 'touch_neckline_edge'])
        self.assertEqual(n.FIELD_OPTIONS['手部动作'][-2:], ['一手轻扶翻领', '一手轻扶领口边缘'])
        self.assertEqual(n._english_option_id('手部动作', '一手轻扶衣领'), 'adjust_collar')
        self.assertEqual(n._english_atomic_value('手部动作', '一手轻扶衣领'), 'gently adjusting the collar')
        self.assertEqual(n.POSE_VALUE_TEXT['手部动作']['一手轻扶衣领'],
                         '一只手轻扶衣领边缘，另一只手自然垂落')

    def test_manual_values_not_in_any_existing_pose_random_sources(self):
        sources = {k: v for k, v in vars(n).items()
                   if (('POSE' in k and 'BUNDLE' in k)
                       or k in ('RANDOM_FIELD_OPTIONS', 'PROFILE_POOLS', 'PRESETS'))
                   and isinstance(v, (dict, tuple, list))}
        sources['reference_entries'] = n.REFERENCE_POOL.entries
        for name, data in sources.items():
            text = json.dumps(data, ensure_ascii=False)
            for action in n.MANUAL_HAND_ACTIONS:
                self.assertNotIn(action['label'], text, name)
                self.assertNotIn(action['id'], text, name)

    def test_density_language_layout_and_both_node_renderers(self):
        for action in n.MANUAL_HAND_ACTIONS:
            for density in n.PROMPT_DENSITIES:
                for mode in n.COHERENCE_MODES:
                    for layout in ('连续拼接', '按模块分段'):
                        for cls, en_index in ((n.ZImageChinesePromptBuilder, 3), (m.ZImagePoseModule, 1)):
                            with self.subTest(action=action['id'], density=density, mode=mode, layout=layout, cls=cls):
                                args = self.args(手部动作=action['label'], 提示词密度=density,
                                                 组合协调=mode, 输出排版=layout)
                                run = getattr(cls(), cls.FUNCTION)
                                result = run(unique_id='manual', **args)
                                self.assertEqual(result, run(unique_id='manual', **args))
                                expected = action['text'] if density == '详细' else action['label']
                                self.assertIn(expected, result['result'][0])
                                self.assertIn(action['english'], result['result'][en_index])
                                self.assertEqual(meta(result)['card_candidates']['modules']['姿态动作']['values']['手部动作'], action['label'])

    def test_fixed_hand_survives_other_random_fields_and_coherence(self):
        for action in n.MANUAL_HAND_ACTIONS:
            for mode in n.COHERENCE_MODES:
                for scope in n.RANDOM_SCOPES:
                    for cls in (n.ZImageChinesePromptBuilder, m.ZImagePoseModule):
                        args = self.args(**dict.fromkeys(n.POSE_OUTPUT_FIELDS, n.RANDOM_CHOICE))
                        args.update(手部动作=action['label'], 组合协调=mode, 随机范围=scope,
                                    穿搭结构='连衣裙', 连衣裙类型='衬衫式连衣裙')
                        result = getattr(cls(), cls.FUNCTION)(unique_id='manual', **args)
                        self.assertEqual(meta(result)['resolved']['手部动作'], action['label'])
                        if cls is n.ZImageChinesePromptBuilder:
                            self.assertEqual(meta(result)['resolved']['连衣裙类型'], '衬衫式连衣裙')

    def test_zh_english_and_plain_upstream_chains_preserve_content(self):
        clothing = m.ZImageClothingModule().build_module(**{
            **dict.fromkeys(n.CLOTHING_OUTPUT_FIELDS, n.EMPTY_CHOICE),
            '穿搭结构': '连衣裙', '连衣裙类型': '衬衫式连衣裙'})
        original = dict(clothing[0].zimage_resolved_fields)
        for action in n.MANUAL_HAND_ACTIONS:
            for route in ('zh', 'en', 'plain'):
                for mode in n.COHERENCE_MODES:
                    args = self.args(手部动作=action['label'], 组合协调=mode)
                    if route == 'en':
                        args['前置英文提示词'] = clothing[1]
                    else:
                        args['前置提示词'] = str(clothing[0]) if route == 'plain' else clothing[0]
                    result = m.ZImagePoseModule().build_module(unique_id='manual', **args)
                    prefix_index = 1 if route == 'en' else 0
                    self.assertTrue(result['result'][prefix_index].startswith(str(clothing[prefix_index])))
                    self.assertEqual(result['result'][0].zimage_resolved_fields['手部动作'], action['label'])
                    if route != 'plain':
                        for field, value in original.items():
                            self.assertEqual(result['result'][0].zimage_resolved_fields[field], value)
                    self.assertEqual(clothing[0].zimage_resolved_fields, original)

    def test_card_candidate_round_trip_into_both_nodes(self):
        for label in ('一手轻扶衣领', *(a['label'] for a in n.MANUAL_HAND_ACTIONS)):
            first = n.ZImageChinesePromptBuilder().build_prompt(unique_id='manual', **self.args(手部动作=label))
            values = json.loads(json.dumps(meta(first)['card_candidates']['modules']['姿态动作']['values']))
            for cls in (n.ZImageChinesePromptBuilder, m.ZImagePoseModule):
                second = getattr(cls(), cls.FUNCTION)(unique_id='manual', **self.args(**values))
                self.assertEqual(meta(second)['card_candidates']['modules']['姿态动作']['values'], values)
                self.assertIn(label, second['result'][0])

    def test_generated_search_and_short_english_labels(self):
        search = generate_library_catalog.build_catalog()['fields']['手部动作']
        english = generate_frontend_i18n._option_catalog()['手部动作']
        for action in n.MANUAL_HAND_ACTIONS:
            item = next(item for item in search if item['value'] == action['label'])
            self.assertEqual(item['zh'], action['text'])
            self.assertEqual(item['en'], action['english'])
            self.assertEqual(english[action['label']], action['english_label'])


if __name__ == '__main__':
    unittest.main()
