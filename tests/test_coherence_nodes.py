"""Public-node integration, conservative context and legacy defaults."""
import copy
import unittest
from unittest.mock import patch

import nodes as n
import modular_nodes as m


def metadata(result):
    return result['ui']['vividmuse_prompt_diagnostics'][0]


class CoherenceNodeTests(unittest.TestCase):
    def full_args(self, **updates):
        return {**dict.fromkeys(n.FIELD_ORDER, n.EMPTY_CHOICE),
                '预设': n.PRESET_OPTIONS[0], '随机范围': n.RANDOM_SCOPES[2], '随机种子': 29,
                '基础姿态': n.RANDOM_CHOICE, '场景地点': '校园教室', **updates}

    def full(self, **updates):
        return n.ZImageChinesePromptBuilder().build_prompt(unique_id='1', **self.full_args(**updates))

    def chain(self, cls=m.ZImagePoseModule, context=None, **updates):
        if context is None:
            context = {'场景地点': '校园教室'}
        args = {**dict.fromkeys(m.MODULE_FIELD_GROUPS[cls.MODULE_NAME], n.EMPTY_CHOICE),
                '预设': '自定义组合', '随机种子': 29, '组合协调': '协调优先',
                '基础姿态': n.RANDOM_CHOICE,
                '前置提示词': m.PromptChainText('上游原文。', context), **updates}
        return cls().build_module(unique_id='1', **args)

    def test_only_three_nodes_append_optional_input(self):
        classes = {**n.NODE_CLASS_MAPPINGS, **m.NODE_CLASS_MAPPINGS}
        exposed = []
        for name, cls in classes.items():
            schema = cls.INPUT_TYPES()
            if '组合协调' not in schema.get('optional', {}):
                continue
            exposed.append(name)
            self.assertEqual(list(schema['optional'])[-1], '组合协调')
            choices, opts = schema['optional']['组合协调']
            self.assertEqual(choices, ['默认组合', '协调优先'])
            self.assertEqual(opts['default'], '默认组合')
            self.assertFalse(opts.get('forceInput'))
        self.assertEqual(set(exposed), {'VividMuse_ZImageChinesePromptBuilder',
                                       'VividMuse_ZImagePoseModule', 'VividMuse_ZImageSceneModule'})

    def test_missing_standard_unknown_modes_do_not_enter_new_random_path(self):
        with patch.object(n, 'CoherencePass', side_effect=AssertionError('default constructed pass')):
            old = self.full()
            standard = self.full(组合协调='默认组合')
            unknown = self.full(组合协调='future')
        self.assertNotIn('coherence_explanation', metadata(old))
        for result in (standard, unknown):
            self.assertEqual(result['result'], old['result'])
            stripped = copy.deepcopy(metadata(result))
            stripped.pop('coherence_explanation')
            stripped['settings'].pop('组合协调')
            self.assertEqual(stripped, metadata(old))
        self.assertTrue(metadata(unknown)['coherence_explanation']['fallback'])

    def test_real_full_conflict_adjusted_and_reproducible(self):
        result = self.full(组合协调='协调优先')
        self.assertEqual(result, self.full(组合协调='协调优先'))
        info = metadata(result)
        event = info['coherence_explanation']['events'][0]
        self.assertEqual(event['status'], 'adjusted')
        self.assertEqual(event['after'], {'基础姿态': '自然站立'})
        self.assertIn('自然站立', result['result'][0])
        self.assertNotIn('pool', result['result'][3])
        self.assertEqual(info['resolved']['基础姿态'], '自然站立')
        self.assertEqual(info['card_candidates']['modules']['姿态动作']['values']['基础姿态'], '自然站立')

    def test_fixed_and_no_candidate_report_without_edit(self):
        for fields, status in [({'基础姿态': '泳池边坐姿'}, 'preserved_explicit'),
                               ({'基础姿态': '盘腿而坐', '腿部动作': n.RANDOM_CHOICE, '随机种子': 1}, 'no_candidate')]:
            old = self.full(**fields)
            new = self.full(组合协调='协调优先', **fields)
            self.assertEqual(new['result'], old['result'])
            self.assertEqual(metadata(new)['coherence_explanation']['events'][0]['status'], status)

    def test_free_text_and_user_modules_are_preserved(self):
        for field in ['自由提示词', *n.USER_MODULE_INPUTS.values()]:
            for layout in ['连续拼接', '按模块分段']:
                args = {field: '用户保留的文字。', '输出排版': layout}
                old, new = self.full(**args), self.full(组合协调='协调优先', **args)
                self.assertEqual(new['result'], old['result'], (field, layout))
                self.assertIn('用户保留的文字', new['result'][0])
                self.assertNotEqual(metadata(new)['coherence_explanation']['events'][0]['status'], 'adjusted')

    def test_scene_to_pose_changes_only_owned_fields_and_both_languages(self):
        upstream = {'场景地点': '校园教室', '发色': '黑色'}
        prefix = m.PromptChainText('上游原文。', upstream)
        en = m.PromptChainText('Original upstream text.', upstream)
        result = self.chain(前置提示词=prefix, 前置英文提示词=en, 输出排版='按模块分段')
        zh, english = result['result']
        self.assertTrue(zh.startswith(str(prefix) + '\n\n'))
        self.assertTrue(english.startswith(str(en) + '\n\n'))
        self.assertEqual(zh.zimage_resolved_fields['基础姿态'], '自然站立')
        for key, value in upstream.items():
            self.assertEqual(zh.zimage_resolved_fields[key], value)
        self.assertEqual(prefix.zimage_resolved_fields, upstream)
        self.assertEqual(zh.zimage_resolved_fields, english.zimage_resolved_fields)
        self.assertEqual(metadata(result)['coherence_explanation']['events'][0]['status'], 'adjusted')

    def test_pose_to_scene_uses_real_original_scene_pool(self):
        upstream = {'基础姿态': '泳池边坐姿'}
        result = self.chain(m.ZImageSceneModule, upstream, 随机种子=21, 场景地点=n.RANDOM_CHOICE)
        info = metadata(result)
        self.assertEqual(info['coherence_explanation']['events'][0]['after'], {'场景地点': '室内泳池'})
        self.assertEqual(result['result'][0].zimage_resolved_fields['基础姿态'], '泳池边坐姿')

    def test_plain_text_and_opaque_txt_cannot_supply_structured_evidence(self):
        sources = ['上游校园教室。',
                   m.PromptChainText('用户场景。', {'场景地点': '校园教室'}, {'场景'}),
                   m.PromptChainText('未知自定义。', {'场景地点': '校园教室'}, {'自定义'})]
        for prefix in sources:
            old = self.chain(前置提示词=prefix, 组合协调='默认组合')
            new = self.chain(前置提示词=prefix)
            self.assertEqual(old['result'], new['result'])
            self.assertFalse(any(e['status'] == 'adjusted' for e in metadata(new)['coherence_explanation']['events']))

    def test_english_context_fallback_and_plain_chinese_conservative_skip(self):
        en = m.PromptChainText('classroom.', {'场景地点': '校园教室'})
        result = self.chain(前置提示词='', 前置英文提示词=en)
        self.assertEqual(result['result'][0].zimage_resolved_fields['基础姿态'], '自然站立')
        result = self.chain(前置提示词='自定义可能补充场景。', 前置英文提示词=en)
        self.assertEqual(metadata(result)['coherence_explanation']['events'][0]['status'], 'unknown_context')

    def test_mode_does_not_inherit_in_chain_or_bypass(self):
        scene = self.chain(m.ZImageSceneModule, {}, 场景地点='校园教室')
        prefix = scene['result'][0]  # Bypass is represented by forwarding this exact value.
        pose = self.chain(前置提示词=prefix, 组合协调='默认组合')
        self.assertEqual(pose['result'][0].zimage_resolved_fields['基础姿态'], '泳池边坐姿')
        self.assertEqual(metadata(pose)['coherence_explanation']['mode'], 'standard')
        self.assertFalse(hasattr(prefix, 'coherence_mode'))

    def test_clothing_context_or_no_context_cannot_invent_scene(self):
        for context in ({}, {'上装': '衬衫'}):
            result = self.chain(context=context)
            self.assertFalse(any(e['status'] == 'adjusted' for e in metadata(result)['coherence_explanation']['events']))

    def test_fixed_camera_is_preserved_and_random_camera_reports_actual_refresh(self):
        fixed = self.full(组合协调='协调优先', 景别='全身构图')
        self.assertEqual(metadata(fixed)['resolved']['景别'], '全身构图')
        self.assertEqual(metadata(fixed)['coherence_explanation']['events'][-1]['status'], 'preserved_explicit')
        random = self.full(组合协调='协调优先', **dict.fromkeys(n.CAMERA_OUTPUT_FIELDS, n.RANDOM_CHOICE))
        draws = metadata(random)['random_explanation']['draws']
        self.assertEqual(draws[-1]['stage'], 'after_coherence')
        self.assertEqual(draws[-1]['effect'], 'retained')

    def test_scene_only_schema_setting_does_not_change_other_node_contracts(self):
        for cls in (m.ZImagePersonModule, m.ZImageClothingModule, m.ZImageCameraModule):
            args = dict.fromkeys(m.MODULE_FIELD_GROUPS[cls.MODULE_NAME], n.EMPTY_CHOICE)
            old = cls().build_module(**args)
            self.assertEqual(old, cls().build_module(组合协调='协调优先', **args))

    def test_real_reverse_scene_refreshes_light_or_keeps_when_context_missing(self):
        for complete_scene in (False, True):
            args = {'预设': '自定义组合', '随机种子': 21, '基础姿态': '泳池边坐姿',
                    '场景地点': n.RANDOM_CHOICE, **dict.fromkeys(n.LIGHTING_OUTPUT_FIELDS, n.RANDOM_CHOICE)}
            if complete_scene:
                args.update(dict.fromkeys(n.SCENE_GROUP_FIELDS, n.RANDOM_CHOICE))
            old = self.full(**args)
            result = self.full(组合协调='协调优先', **args)
            info = metadata(result)
            self.assertEqual(info['resolved']['场景地点'], '室内泳池')
            self.assertEqual(info['resolved']['基础姿态'], '泳池边坐姿')
            light = info['coherence_explanation']['events'][-1]
            self.assertEqual(light['rule_id'], 'lighting_context')
            if complete_scene:
                self.assertEqual(light['status'], 'adjusted')
                draws = [e for e in info['random_explanation']['draws'] if e['group'] == 'lighting']
                self.assertEqual(draws[-1]['stage'], 'after_coherence')
                self.assertEqual(draws[-1]['effect'], 'retained')
                self.assertTrue(all(e['effect'] == 'overwritten' for e in draws[:-1]))
            else:
                self.assertEqual(light['status'], 'no_candidate')
                for f in n.LIGHTING_OUTPUT_FIELDS:
                    self.assertEqual(info['resolved'][f], metadata(old)['resolved'][f])

    def test_no_camera_candidate_preserves_draw_and_reports_bounded_failure(self):
        args = dict.fromkeys(n.CAMERA_OUTPUT_FIELDS, n.RANDOM_CHOICE)
        old = self.full(**args)
        original = n._camera_bundle_candidates
        calls = []
        def candidates(*values):
            calls.append(values)
            return original(*values) if len(calls) == 1 else []
        with patch.object(n, '_camera_bundle_candidates', side_effect=candidates):
            result = self.full(组合协调='协调优先', **args)
        self.assertEqual(len(calls), 2)
        self.assertEqual(metadata(result)['coherence_explanation']['events'][-1]['status'], 'no_candidate')
        for f in n.CAMERA_OUTPUT_FIELDS:
            self.assertEqual(metadata(result)['resolved'][f], metadata(old)['resolved'][f])

    def test_scene_node_does_not_report_unowned_pose_only_conflict(self):
        result = self.chain(m.ZImageSceneModule, {'基础姿态': '盘腿而坐', '腿部动作': '一脚踩高脚椅横杆'},
                            场景地点='校园教室')
        self.assertEqual(metadata(result)['coherence_explanation']['events'], [])

    def test_real_txt_nodes_preserve_unstructured_provenance_through_modules(self):
        prefix = m.PromptChainText('教室。', {'场景地点': '校园教室'})
        values = [m.ZImageTxtPromptLibrary().build_prompt(前置提示词=prefix, 自由提示词='用户补充场景。')[0]]
        for module in ('场景', '自定义'):
            values.append(m.ZImageTxtModuleLibrary().build_prompt(
                前置提示词=prefix, 模块类型=module, 模块提示词='用户补充场景。')[0])
        for value in values:
            self.assertTrue(value.zimage_unstructured_text)
            # An intervening standard module must not launder custom text into known facts.
            bridged = m.ZImageHairModule().build_module(前置提示词=value)[0]
            self.assertTrue(bridged.zimage_unstructured_text)
            before = self.chain(前置提示词=bridged, 组合协调='默认组合')
            after = self.chain(前置提示词=bridged)
            self.assertEqual(after['result'], before['result'])
            self.assertFalse(any(e['status'] == 'adjusted' for e in metadata(after)['coherence_explanation']['events']))
            self.assertTrue(after['result'][0].startswith(str(bridged)))
        self.assertFalse(prefix.zimage_unstructured_text)
        empty = m.ZImageTxtPromptLibrary().build_prompt(前置提示词=prefix, 自由提示词='  ')[0]
        self.assertFalse(empty.zimage_unstructured_text)

    def test_plain_text_bridge_does_not_become_structured_only(self):
        prefix = m.ZImageSceneModule().build_module(前置提示词='自定义说明。', 场景地点='校园教室')[0]
        self.assertTrue(prefix.zimage_unstructured_text)
        result = self.chain(前置提示词=prefix)
        self.assertEqual(metadata(result)['coherence_explanation']['events'][0]['status'], 'unknown_context')


if __name__ == '__main__':
    unittest.main()
