import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import nodes as n
import modular_nodes as m


class PoseSceneGuardTests(unittest.TestCase):
    def fixture(self):
        return json.loads((Path(__file__).parent / 'fixtures/studio_scene_conflict.json').read_text(encoding='utf-8'))

    def execute(self, inputs, cls=n.ZImageChinesePromptBuilder):
        return getattr(cls(), cls.FUNCTION)(unique_id='1', **inputs)['ui']['vividmuse_prompt_diagnostics'][0]

    def test_reported_workflow_omits_only_conflicting_random_event(self):
        inputs = self.fixture()
        before = copy.deepcopy(inputs)
        raw = n.resolve_fields(inputs['预设'], inputs['随机范围'], inputs['随机种子'], inputs)
        self.assertEqual(raw['画面瞬间'], '棚拍间隙调整姿态')
        self.assertEqual(raw['场景地点'], '公园草地')
        data = self.execute(inputs)
        self.assertEqual(data['resolved'], {**raw, '画面瞬间': n.EMPTY_CHOICE})
        self.assertNotIn('棚拍间隙', data['zh'])
        self.assertNotIn('studio poses', data['en'])
        self.assertIn('侧身站立', data['zh'])
        self.assertEqual(inputs, before)
        self.assertEqual(data, self.execute(inputs))

    def test_guard_is_pure_and_preserves_unrelated_fields(self):
        inputs = self.fixture()
        raw = n.resolve_fields(inputs['预设'], inputs['随机范围'], inputs['随机种子'], inputs)
        original = copy.deepcopy(raw)
        for location in n.STUDIO_EVENT_INCOMPATIBLE_LOCATIONS:
            self.assertIn(location, n.FIELD_OPTIONS['场景地点'])
            fields = {**raw, '场景地点': location}
            result = n.pose_scene_view(fields, {'画面瞬间': n.RANDOM_CHOICE}, scene_available=True)
            self.assertEqual(result, {**fields, '画面瞬间': n.EMPTY_CHOICE})
        self.assertEqual(raw, original)
        for location in ('摄影棚', '高级灰摄影棚', n.EMPTY_CHOICE, 'unknown'):
            fields = {**raw, '场景地点': location}
            self.assertEqual(n.pose_scene_view(fields, inputs, scene_available=True), fields)
        self.assertEqual(n.pose_scene_view(raw, inputs, scene_available=False), raw)
        for value in ('棚拍间隙调整姿态', n.FOLLOW_PRESET, n.EMPTY_CHOICE):
            self.assertEqual(n.pose_scene_view(raw, {'画面瞬间': value}, scene_available=True), raw)

    def test_manual_fixed_preset_empty_and_txt_scenes(self):
        base = self.fixture()
        for changes in ({'画面瞬间': '棚拍间隙调整姿态'},
                        {'用户场景片段': '自定义摄影棚'},
                        {'场景地点': n.EMPTY_CHOICE},
                        {'用户姿态动作片段': '自定义动作'},
                        {'预设': '影棚水光妆美容特写', '画面瞬间': n.FOLLOW_PRESET}):
            data = self.execute({**base, **changes})
            self.assertEqual(data['resolved']['画面瞬间'], '棚拍间隙调整姿态')

    def test_densities_and_direct_api_match(self):
        for density in n.PROMPT_DENSITIES:
            inputs = {**self.fixture(), '提示词密度': density}
            data = self.execute(inputs)
            self.assertEqual(data['resolved']['画面瞬间'], n.EMPTY_CHOICE)
            direct = n.ZImageChinesePromptBuilder().build_prompt(**inputs)
            self.assertEqual((data['zh'], data['en']), (direct[0], direct[-1]))

    def test_normalized_request_and_no_extra_resolve(self):
        inputs = {**self.fixture(), '动作链': n.RANDOM_CHOICE}
        del inputs['画面瞬间']
        with patch.object(n, 'resolve_fields', wraps=n.resolve_fields) as resolve:
            data = self.execute(inputs)
        self.assertEqual(resolve.call_count, 1)
        self.assertEqual(data['resolved']['画面瞬间'], n.EMPTY_CHOICE)

    def test_pose_module_never_uses_invisible_scene(self):
        inputs = self.fixture()
        raw = n.resolve_fields(inputs['预设'], n.RANDOM_SCOPES[1], inputs['随机种子'], inputs)
        # Force a resolved random event to test scope independently of bundle sampling.
        raw['画面瞬间'] = '棚拍间隙调整姿态'
        def resolve(*args, request_trace=None, **kwargs):
            if request_trace is not None:
                request_trace.update({'画面瞬间': n.RANDOM_CHOICE})
            return dict(raw)
        with patch.object(n, 'resolve_fields', side_effect=resolve):
            solo = self.execute(inputs, m.ZImagePoseModule)
            self.assertEqual(solo['resolved']['画面瞬间'], raw['画面瞬间'])
            for prefix, expected in (
                (m.PromptChainText('scene', {'场景地点': '公园草地'}), n.EMPTY_CHOICE),
                (m.PromptChainText('scene', {'场景地点': '摄影棚'}), raw['画面瞬间']),
                (m.PromptChainText('scene', {'场景地点': '公园草地'}, {'场景'}), raw['画面瞬间']),
            ):
                # The real resolver copies explicit upstream scene values into its result.
                raw['场景地点'] = prefix.zimage_resolved_fields['场景地点']
                data = self.execute({**inputs, '前置提示词': prefix}, m.ZImagePoseModule)
                self.assertEqual(data['resolved']['画面瞬间'], expected)
            plain = self.execute({**inputs, '前置提示词': '场景位于公园草地'}, m.ZImagePoseModule)
            self.assertEqual(plain['resolved']['画面瞬间'], raw['画面瞬间'])

    def test_all_scopes_final_random_scene_and_card_candidates(self):
        for scope in n.RANDOM_SCOPES:
            for seed in (0, 42, 188745341356234):
                inputs = {**self.fixture(), '随机范围': scope, '随机种子': seed,
                          **dict.fromkeys(n.SCENE_GROUP_FIELDS, n.RANDOM_CHOICE)}
                raw = n.resolve_fields(inputs['预设'], scope, seed, inputs)
                data = self.execute(inputs)
                expected = dict(raw)
                if raw['画面瞬间'] == '棚拍间隙调整姿态' and raw['场景地点'] in n.STUDIO_EVENT_INCOMPATIBLE_LOCATIONS:
                    expected['画面瞬间'] = n.EMPTY_CHOICE
                self.assertEqual(data['resolved'], expected)
                for module in ('人物', '服装'):
                    values = data['card_candidates']['modules'][module]['values']
                    self.assertEqual(values, {k: raw[k] for k in values})


if __name__ == '__main__':
    unittest.main()
