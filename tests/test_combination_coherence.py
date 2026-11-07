"""Opt-in coherence must preserve literals, scope and original candidate pools."""
import copy
import random
import unittest
from unittest.mock import patch

import nodes as n
import modular_nodes as m
from prompt_diagnostics import card_candidates, module_groups
from combination_coherence import CoherencePass


class CoherenceTests(unittest.TestCase):
    def request(self, **values):
        return {**dict.fromkeys(n.FIELD_ORDER, n.EMPTY_CHOICE), **values}

    def run_case(self, request, seed=29, known=None, writable=None, **options):
        coordination = CoherencePass(
            known_fields=set(n.FIELD_ORDER) if known is None else known,
            writable_fields=set(n.FIELD_ORDER) if writable is None else writable,
            **options,
        )
        fields = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[2], seed,
                                  request, coherence=coordination)
        return fields, coordination

    def classroom(self):
        return self.request(场景地点='校园教室', 基础姿态=n.RANDOM_CHOICE)

    def test_released_classroom_conflict_is_reproduced(self):
        fields = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[2], 29, self.classroom())
        self.assertEqual(fields['基础姿态'], '泳池边坐姿')
        self.assertEqual(fields['场景地点'], '校园教室')

    def test_classroom_random_pose_has_safe_replacement(self):
        fields, trace = self.run_case(self.classroom())
        self.assertEqual(fields['基础姿态'], '自然站立')
        self.assertEqual(fields['场景地点'], '校园教室')
        self.assertEqual(trace.events[0]['status'], 'adjusted')
        self.assertEqual(trace.events[0]['fields'], ['基础姿态'])
        self.assertNotIn('泳池边', n.compose_prompt_text(fields, '详细'))
        for key, value in self.classroom().items():
            if value != n.RANDOM_CHOICE:
                self.assertEqual(fields[key], value, key)

    def test_crossed_legs_has_no_invented_candidate(self):
        request = self.request(基础姿态='盘腿而坐', 腿部动作=n.RANDOM_CHOICE)
        fields, trace = self.run_case(request, seed=1)
        self.assertEqual(fields['腿部动作'], '一脚踩高脚椅横杆')
        self.assertEqual(trace.events[0]['status'], 'no_candidate')
        self.assertFalse(any(b['腿部动作'] == '盘腿而坐' for b in n.POSE_BUNDLES))

    def test_fixed_conflict_is_not_rewritten(self):
        request = self.request(基础姿态='泳池边坐姿', 场景地点='校园教室')
        fields, trace = self.run_case(request)
        self.assertEqual(fields['基础姿态'], '泳池边坐姿')
        self.assertEqual(trace.events[0]['status'], 'preserved_explicit')

    def test_follow_preset_is_not_a_random_permission(self):
        request = self.request(基础姿态=n.FOLLOW_PRESET, 场景地点='校园教室')
        before = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[2], 29, request)
        after, _ = self.run_case(request)
        self.assertEqual(after, before)

    def test_missing_scene_context_is_not_read_from_hidden_defaults(self):
        fields, trace = self.run_case(self.classroom(), known=set(n.POSE_OUTPUT_FIELDS))
        self.assertEqual(fields['基础姿态'], '泳池边坐姿')
        self.assertEqual(trace.events[0]['status'], 'unknown_context')

    def test_plain_or_custom_text_blocks_location_inference(self):
        fields, trace = self.run_case(self.classroom(), opaque_text=True)
        self.assertEqual(fields['基础姿态'], '泳池边坐姿')
        self.assertEqual(trace.events[0]['status'], 'unknown_context')

    def test_unowned_random_fields_are_not_modified(self):
        fields, trace = self.run_case(self.classroom(), writable=set(n.SCENE_GROUP_FIELDS))
        self.assertEqual(fields['基础姿态'], '泳池边坐姿')
        self.assertEqual(trace.events[0]['status'], 'preserved_explicit')

    def test_reproducible_and_no_input_or_catalog_mutation(self):
        request = self.classroom()
        original = copy.deepcopy((request, n.POSE_BUNDLES, n.SCENE_BUNDLES))
        self.assertEqual(self.run_case(request)[0], self.run_case(request)[0])
        self.assertEqual((request, n.POSE_BUNDLES, n.SCENE_BUNDLES), original)

    def test_no_conflict_does_not_draw_coherence_randomness(self):
        with patch.object(CoherencePass, 'rng', side_effect=AssertionError('unexpected draw')):
            request = self.request(基础姿态='自然站立', 场景地点='校园教室')
            fields, trace = self.run_case(request)
        self.assertEqual(trace.events, [])
        self.assertEqual(fields['基础姿态'], '自然站立')

    def test_default_does_not_enter_coherence(self):
        with patch.object(CoherencePass, 'apply', side_effect=AssertionError('default path')):
            fields = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[2], 29, self.classroom())
        self.assertEqual(fields['基础姿态'], '泳池边坐姿')

    def test_explicit_empty_is_preserved(self):
        request = self.classroom()
        request['基础姿态'] = n.EMPTY_CHOICE
        fields, trace = self.run_case(request)
        self.assertEqual(fields['基础姿态'], n.EMPTY_CHOICE)
        self.assertEqual(trace.events, [])

    def test_reference_replacement_blocks_stale_core_pool(self):
        def reference(seed, fields, random_fields):
            fields['基础姿态'] = '泳池边坐姿'
            return {'姿态动作'}
        with patch.object(n.REFERENCE_POOL, 'apply', side_effect=reference):
            fields, trace = self.run_case(self.classroom())
        self.assertEqual(fields['基础姿态'], '泳池边坐姿')
        self.assertEqual(trace.events[0]['status'], 'unsupported_source')

    def pure(self, fields, random_fields, pool, group='姿态动作', **kwargs):
        trace = CoherencePass(known_fields=set(fields), writable_fields=set(fields), **kwargs)
        trace.remember(group, pool)
        changed = trace.apply(fields, set(random_fields), 42,
                              {'姿态动作': n.POSE_OUTPUT_FIELDS, '场景': n.SCENE_GROUP_FIELDS},
                              set(), n.THEME_OPTIONS_BY_CATEGORY.get('幻想概念', ()))
        return fields, trace, changed

    def test_pool_duplicates_retain_weight_and_order(self):
        fields = {'基础姿态': '泳池边坐姿', '场景地点': '校园教室'}
        pool = [{'基础姿态': '自然站立', 'id': x} for x in ('a', 'b', 'a')]
        class Picker:
            def choice(self, values):
                self.values = values
                return values[0]
        picker = Picker()
        with patch.object(CoherencePass, 'rng', return_value=picker):
            _, trace, _ = self.pure(fields, ['基础姿态'], pool)
        self.assertEqual(len(picker.values), 3)
        self.assertEqual(trace.events[0]['candidate_count'], 3)

    def test_unknown_replacement_is_not_assumed_compatible(self):
        fields = {'基础姿态': '泳池边坐姿', '场景地点': '校园教室'}
        _, trace, changed = self.pure(fields, ['基础姿态'], [{'基础姿态': '马背坐姿'}])
        self.assertEqual(changed, set())
        self.assertEqual(trace.events[0]['status'], 'no_candidate')

    def test_reverse_scene_choice_respects_explicit_pose(self):
        fields = {'基础姿态': '泳池边坐姿', '场景地点': '校园教室'}
        fields, _, changed = self.pure(fields, ['场景地点'], [{'场景地点': '室内泳池'}], '场景')
        self.assertEqual(fields, {'基础姿态': '泳池边坐姿', '场景地点': '室内泳池'})
        self.assertEqual(changed, {'场景'})

    def test_fantasy_context_is_not_coordinated(self):
        fields = {'基础姿态': '泳池边坐姿', '场景地点': '校园教室', '写真大类': '幻想概念'}
        _, trace, changed = self.pure(fields, ['基础姿态'], [{'基础姿态': '自然站立'}])
        self.assertEqual(changed, set())
        self.assertEqual(trace.events[0]['status'], 'unknown_context')

    def test_fixed_leg_cannot_be_overwritten_by_pose_bundle(self):
        fields = {'基础姿态': '泳池边坐姿', '场景地点': '校园教室', '腿部动作': '双脚垂入池水'}
        _, trace, changed = self.pure(fields, ['基础姿态'],
                                     [{'基础姿态': '自然站立', '腿部动作': '双脚自然平行'}])
        self.assertEqual(changed, set())
        self.assertEqual(trace.events[0]['status'], 'no_candidate')

    def test_atomic_reference_pose_not_used_as_replacement(self):
        fields = {'基础姿态': '泳池边坐姿', '场景地点': '校园教室'}
        _, trace, changed = self.pure(fields, ['基础姿态'], [{'基础姿态': '驾驶座扶方向盘搭窗沿'}])
        self.assertEqual(changed, set())
        self.assertEqual(trace.events[0]['status'], 'no_candidate')

    def test_reusing_pass_does_not_reuse_previous_pools_or_events(self):
        _, trace = self.run_case(self.classroom())
        self.assertTrue(trace.events)
        n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[2], 1,
                         self.request(), coherence=trace)
        self.assertEqual(trace.events, [])
        self.assertEqual(trace.pools, {})

    def test_camera_rechecked_after_pose_changes(self):
        request = {**self.classroom(), **dict.fromkeys(n.CAMERA_OUTPUT_FIELDS, n.RANDOM_CHOICE)}
        # The original pose selection occurs before the camera draw, so seed 29 remains reproducible.
        fields, trace = self.run_case(request)
        self.assertEqual(fields['基础姿态'], '自然站立')
        self.assertNotEqual(fields['景别'], '坐姿半身')
        self.assertTrue(trace.events)

    def test_unowned_camera_is_not_rechecked(self):
        request = {**self.classroom(), **dict.fromkeys(n.CAMERA_OUTPUT_FIELDS, n.RANDOM_CHOICE)}
        before = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[2], 29, request)
        after, _ = self.run_case(request, writable=set(n.POSE_OUTPUT_FIELDS))
        self.assertEqual({f: before[f] for f in n.CAMERA_OUTPUT_FIELDS},
                         {f: after[f] for f in n.CAMERA_OUTPUT_FIELDS})

    def test_coherence_trace_is_not_reported_as_reference_replacement(self):
        request = {**self.classroom(), **dict.fromkeys(n.CAMERA_OUTPUT_FIELDS, n.RANDOM_CHOICE)}
        trace = n.SamplingTrace(n)
        coordination = CoherencePass(known_fields=set(n.FIELD_ORDER), writable_fields=set(n.FIELD_ORDER))
        fields = n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[2], 29, request,
                                  coherence=coordination, sampling_trace=trace)
        data = trace.snapshot(fields, request)
        self.assertIn({'module': '姿态动作', 'reason': 'coherence_replacement'}, data['unmeasured'])
        self.assertNotIn('姿态动作', trace.reference_modules)
        camera = [row for row in data['draws'] if row['group'] == 'camera']
        self.assertEqual(camera[-1]['stage'], 'after_coherence')
        self.assertEqual(camera[-1]['effect'], 'retained')
        self.assertTrue(all(row['effect'] == 'overwritten' for row in camera[:-1]))

    def test_reverse_crossed_leg_rule_uses_compatible_stool_pose(self):
        fields = {'基础姿态': '盘腿而坐', '腿部动作': '一脚踩高脚椅横杆'}
        fields, trace, changed = self.pure(fields, ['基础姿态'],
                                         [{'基础姿态': '高脚椅坐姿', '腿部动作': '一脚踩高脚椅横杆'}])
        self.assertEqual(fields['基础姿态'], '高脚椅坐姿')
        self.assertEqual(trace.events[0]['status'], 'adjusted')
        self.assertEqual(changed, {'姿态动作'})

    def test_both_random_prefers_pose_not_scene(self):
        fields = {'基础姿态': '泳池边坐姿', '场景地点': '校园教室'}
        trace = CoherencePass(known_fields=set(fields), writable_fields=set(fields))
        trace.remember('场景', [{'场景地点': '室内泳池'}])
        trace.remember('姿态动作', [{'基础姿态': '自然站立'}])
        changed = trace.apply(fields, set(fields), 42,
                              {'姿态动作': n.POSE_OUTPUT_FIELDS, '场景': n.SCENE_GROUP_FIELDS}, set(), ())
        self.assertEqual(fields, {'基础姿态': '自然站立', '场景地点': '校园教室'})
        self.assertEqual(changed, {'姿态动作'})

    def test_projection_is_checked_not_unused_bundle_fields(self):
        fields = {'基础姿态': '泳池边坐姿', '场景地点': '校园教室', '腿部动作': n.EMPTY_CHOICE}
        fields, trace, _ = self.pure(fields, ['基础姿态'],
                                    [{'基础姿态': '自然站立', '腿部动作': '双脚自然平行'}])
        self.assertEqual(fields['腿部动作'], n.EMPTY_CHOICE)
        self.assertEqual(trace.events[0]['fields'], ['基础姿态'])

    def test_rendering_and_pose_card_use_the_same_final_fields(self):
        fields, _ = self.run_case(self.classroom())
        for density in n.PROMPT_DENSITIES:
            zh = m.render_module_fragment('姿态动作', fields, density)
            en = n.render_english_module_fragment('姿态动作', fields, density)
            self.assertNotIn('泳池', zh)
            self.assertNotIn('pool', en.lower())
            self.assertTrue(zh and en)
            cards = card_candidates(n, module_groups(n), fields,
                                    {'姿态动作': zh}, {'姿态动作': en}, {}, modules=('姿态动作',))
            self.assertTrue(cards['modules']['姿态动作']['available'])
            self.assertEqual(cards['modules']['姿态动作']['values']['基础姿态'], '自然站立')

    def test_original_random_streams_are_not_consumed_by_coherence(self):
        original = random.Random
        states = []
        for enable in (False, True):
            instances = []
            def factory(seed):
                instance = original(seed)
                instances.append((seed, instance))
                return instance
            with patch.object(n.random, 'Random', side_effect=factory):
                if enable:
                    self.run_case(self.classroom())
                else:
                    n.resolve_fields(n.PRESET_OPTIONS[0], n.RANDOM_SCOPES[2], 29, self.classroom())
            states.append([(seed, instance.getstate()) for seed, instance in instances])
        self.assertEqual(states[0], states[1][:len(states[0])])
        self.assertGreater(len(states[1]), len(states[0]))

    def test_all_scopes_bounded_seed_sample_has_no_unowned_changes(self):
        for scope in n.RANDOM_SCOPES:
            for seed in range(32):
                request = self.classroom()
                before = n.resolve_fields(n.PRESET_OPTIONS[0], scope, seed, request)
                trace = CoherencePass(known_fields=set(n.FIELD_ORDER), writable_fields=set(n.POSE_OUTPUT_FIELDS))
                after = n.resolve_fields(n.PRESET_OPTIONS[0], scope, seed, request, coherence=trace)
                changed = {f for f in n.FIELD_ORDER if before[f] != after[f]}
                self.assertTrue(changed.issubset({'基础姿态'}))
                if changed:
                    self.assertEqual(before['基础姿态'], '泳池边坐姿')
                    self.assertEqual(after['基础姿态'], '自然站立')

    def test_camera_selector_receives_only_visible_context(self):
        request = {**self.classroom(), '成像媒介': '手机计算摄影',
                   **dict.fromkeys(n.CAMERA_OUTPUT_FIELDS, n.RANDOM_CHOICE)}
        known = set(n.FIELD_ORDER) - {'写真主题', '成像媒介'}
        with patch.object(n, '_camera_bundle_candidates', wraps=n._camera_bundle_candidates) as selector:
            self.run_case(request, known=known)
        self.assertGreaterEqual(selector.call_count, 2)
        self.assertEqual(selector.call_args.args[2]['写真主题'], n.EMPTY_CHOICE)
        self.assertEqual(selector.call_args.args[2]['成像媒介'], n.EMPTY_CHOICE)

    def test_captured_candidate_sequence_is_not_replaced_with_global_options(self):
        request = self.classroom()
        raw_candidates = []
        original = CoherencePass.remember
        def remember(obj, module, candidates):
            if module == '姿态动作':
                raw_candidates.extend(copy.deepcopy(candidates))
            original(obj, module, candidates)
        with patch.object(CoherencePass, 'remember', remember):
            fields, trace = self.run_case(request)
        self.assertEqual(list(trace.pools['姿态动作']), raw_candidates)
        self.assertTrue(any(item['基础姿态'] == fields['基础姿态'] for item in raw_candidates))


if __name__ == '__main__':
    unittest.main()
