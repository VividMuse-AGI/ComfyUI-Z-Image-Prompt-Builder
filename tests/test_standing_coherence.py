"""v0.19 exact conflict coverage; fixtures never broaden runtime pools."""
import copy
import unittest
from unittest.mock import patch

import nodes as n
import modular_nodes as m
import combination_coherence as c


def meta(result):
    return result['ui']['vividmuse_prompt_diagnostics'][0]


class StandingCoherenceTests(unittest.TestCase):
    def inputs(self, **updates):
        return {**dict.fromkeys(n.FIELD_ORDER, n.EMPTY_CHOICE),
                '预设': n.PRESET_OPTIONS[0], '随机范围': n.RANDOM_SCOPES[0],
                '随机种子': 2, '基础姿态': '自然站立', '手部动作': '双手托住咖啡杯',
                '腿部动作': n.RANDOM_CHOICE, '组合协调': '协调优先', **updates}

    def full(self, **updates):
        return n.ZImageChinesePromptBuilder().build_prompt(unique_id='1', **self.inputs(**updates))

    def test_real_random_seated_and_pigeon_conflicts_retained_with_reason(self):
        for pose in c.STANDING_POSES:
            for updates, rule, leg in [({}, 'standing_seated_legs', '坐姿一腿稍向前'),
                                      ({'随机范围': n.RANDOM_SCOPES[2], '随机种子': 0},
                                       'standing_pigeon_legs', '鸽子式腿部伸展')]:
                before = self.full(基础姿态=pose, **updates, 组合协调='默认组合')
                after = self.full(基础姿态=pose, **updates)
                info = meta(after)
                self.assertEqual(after['result'], before['result'])
                self.assertEqual(info['resolved'], meta(before)['resolved'])
                self.assertEqual(info['card_candidates'], meta(before)['card_candidates'])
                self.assertEqual(info['resolved']['腿部动作'], leg)
                self.assertEqual(info['resolved']['手部动作'], '双手托住咖啡杯')
                event, = info['coherence_explanation']['events']
                self.assertEqual((event['rule_id'], event['status'], event['candidate_count']),
                                 (rule, 'no_candidate', 0))
                self.assertEqual(after, self.full(基础姿态=pose, **updates))

    def test_twelve_exact_pairs_protect_explicit_values(self):
        for pose in c.STANDING_POSES:
            for leg in (*c.SEATED_LEGS, '鸽子式腿部伸展'):
                result = self.full(基础姿态=pose, 腿部动作=leg)
                event, = meta(result)['coherence_explanation']['events']
                self.assertEqual(event['status'], 'preserved_explicit')
                self.assertEqual(meta(result)['resolved']['基础姿态'], pose)
                self.assertEqual(meta(result)['resolved']['腿部动作'], leg)

    def test_counterexamples_empty_and_uncovered_pairs_are_not_generalized(self):
        pairs = [('自然站立', '一腿轻微屈膝'), ('侧身站立', '脚踝交叉'),
                 ('椅子前缘坐姿', '坐姿双膝并拢'), ('低位鸽子式', '鸽子式腿部伸展'),
                 ('自然站立', '膝部交叠坐姿'), ('持剑站立', '坐姿双膝并拢'),
                 (n.EMPTY_CHOICE, '坐姿双膝并拢'), ('自然站立', n.EMPTY_CHOICE)]
        for pose, leg in pairs:
            self.assertEqual(c.conflicts({'基础姿态': pose, '腿部动作': leg}), [])

    def test_free_text_and_fantasy_are_conservative(self):
        for updates in ({'自由提示词': '保留这段内容。'}, {'写真大类': '幻想概念'}):
            before = self.full(**updates, 组合协调='默认组合')
            after = self.full(**updates)
            self.assertEqual(after['result'], before['result'])
            self.assertEqual(meta(after)['coherence_explanation']['events'][0]['status'], 'unknown_context')

    def test_pose_module_keeps_upstream_and_explicit_conflict(self):
        prefix = m.PromptChainText('上游保留。', {'场景地点': '校园教室'})
        args = {**dict.fromkeys(n.POSE_OUTPUT_FIELDS, n.EMPTY_CHOICE),
                '基础姿态': '自然站立', '腿部动作': '坐姿双膝并拢',
                '前置提示词': prefix, '组合协调': '协调优先'}
        result = m.ZImagePoseModule().build_module(unique_id='1', **args)
        self.assertEqual(meta(result)['coherence_explanation']['events'][0]['status'], 'preserved_explicit')
        self.assertTrue(result['result'][0].startswith(str(prefix)))
        self.assertEqual(result['result'][0].zimage_resolved_fields['场景地点'], '校园教室')
        self.assertEqual(prefix.zimage_resolved_fields, {'场景地点': '校园教室'})

    def pure(self, fields, random_fields, pool, known=None, owned=None, reference=()):
        trace = c.CoherencePass(known_fields=fields if known is None else known,
                               writable_fields=fields if owned is None else owned)
        trace.remember('姿态动作', pool)
        changed = trace.apply(fields, set(random_fields), 42,
                              {'姿态动作': n.POSE_OUTPUT_FIELDS, '场景': n.SCENE_GROUP_FIELDS}, set(reference), ())
        return trace, changed

    def test_real_pose_module_random_conflict_matches_full_node(self):
        args = self.inputs()
        args['前置提示词'] = m.PromptChainText('场景原文。', {'场景地点': '校园教室'})
        before = m.ZImagePoseModule().build_module(unique_id='1', **{**args, '组合协调': '默认组合'})
        after = m.ZImagePoseModule().build_module(unique_id='1', **args)
        self.assertEqual(after['result'], before['result'])
        self.assertEqual(meta(after)['coherence_explanation']['events'][0]['status'], 'no_candidate')
        self.assertEqual(meta(after)['coherence_explanation']['events'][0]['rule_id'], 'standing_seated_legs')
        self.assertEqual(after['result'][0].zimage_resolved_fields, before['result'][0].zimage_resolved_fields)

    def test_fixture_positive_replacement_uses_projection_and_original_pool(self):
        fields = {'基础姿态': '自然站立', '腿部动作': '坐姿双膝并拢', '手部动作': n.EMPTY_CHOICE}
        pool = [{'基础姿态': '自然站立', '腿部动作': '一腿轻微屈膝', '手部动作': '一手插入口袋'}]
        before = copy.deepcopy(pool)
        trace, changed = self.pure(fields, ['腿部动作'], pool)
        self.assertEqual(changed, {'姿态动作'})
        self.assertEqual(fields['腿部动作'], '一腿轻微屈膝')
        self.assertEqual(fields['手部动作'], n.EMPTY_CHOICE)
        self.assertEqual(pool, before)
        self.assertEqual(trace.events[0]['fields'], ['腿部动作'])

    def test_fixture_reverse_candidate_and_unknown_candidate(self):
        for pose, expected in [('椅子前缘坐姿', 'adjusted'), ('未知坐姿', 'no_candidate')]:
            fields = {'基础姿态': '自然站立', '腿部动作': '坐姿双膝并拢'}
            trace, _ = self.pure(fields, ['基础姿态'], [{'基础姿态': pose, '腿部动作': '坐姿双膝并拢'}])
            self.assertEqual(trace.events[0]['status'], expected)
        self.assertFalse(c.compatible('future', {'基础姿态': '泳池边坐姿', '场景地点': '室内泳池'}, set()))

    def test_missing_unowned_reference_and_fixed_fields(self):
        for options, status in [({'known': {'基础姿态'}}, 'unknown_context'),
                                ({'owned': {'场景地点'}}, None),
                                ({'reference': {'姿态动作'}}, 'unsupported_source')]:
            fields = {'基础姿态': '自然站立', '腿部动作': '坐姿双膝并拢'}
            trace, changed = self.pure(fields, ['腿部动作'], [], **options)
            self.assertFalse(changed)
            self.assertEqual([e['status'] for e in trace.events], [] if status is None else [status])
        fields = {'基础姿态': '自然站立', '腿部动作': '坐姿双膝并拢', '手部动作': '双手托住咖啡杯'}
        trace, changed = self.pure(fields, ['腿部动作'],
                                  [{'基础姿态': '自然站立', '腿部动作': '一腿轻微屈膝', '手部动作': '一手插入口袋'}])
        self.assertFalse(changed)
        self.assertEqual(trace.events[0]['status'], 'no_candidate')

    def test_synthetic_multi_rule_group_filters_once_preserves_duplicates(self):
        # Mechanism fixture only: current production trigger pairs are mutually exclusive.
        fields = {'基础姿态': '自然站立', '腿部动作': '坐姿双膝并拢'}
        rules = tuple((rid, tuple(fields), tuple(fields.values())) for rid in sorted(c.STANDING_RULES))
        pool = [{'基础姿态': '自然站立', '腿部动作': leg} for leg in ('一腿轻微屈膝', '双脚自然平行', '双脚自然平行')]
        original = c.compatible
        def compatible(rid, proposed, known):
            return original(rid, proposed, known) and (rid != 'standing_pigeon_legs' or proposed['腿部动作'] == '双脚自然平行')
        picker = unittest.mock.Mock()
        picker.choice.side_effect = lambda values: values[0]
        with patch.object(c, 'RULES', rules), patch.object(c, 'compatible', compatible), patch.object(c.CoherencePass, 'rng', return_value=picker) as rng:
            trace, changed = self.pure(fields, ['腿部动作'], pool)
        self.assertEqual(rng.call_count, 1)
        self.assertEqual(len(picker.choice.call_args.args[0]), 2)
        self.assertEqual([e['candidate_count'] for e in trace.events], [2, 2])
        self.assertEqual(fields['腿部动作'], '双脚自然平行')
        self.assertEqual(changed, {'姿态动作'})


if __name__ == '__main__':
    unittest.main()
