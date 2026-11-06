"""Read-only sampling evidence must not alter the resolver's random stream."""
import copy
import json
import random
import unittest
from unittest.mock import patch

import nodes as n
import modular_nodes as m
from prompt_diagnostics import SamplingTrace


class RandomExplanationTests(unittest.TestCase):
    def resolve(self, request, seed=42, scope=None):
        trace = SamplingTrace(n, scope or '全部模块')
        normalized = {}
        fields = n.resolve_fields(n.PRESET_OPTIONS[1], n.RANDOM_SCOPES[1], seed,
                                  request, request_trace=normalized, sampling_trace=trace)
        return fields, trace.snapshot(fields, normalized)

    def test_duplicate_entries_and_projection_are_not_candidate_deduplication(self):
        trace = SamplingTrace(n)
        fields = (*n.COLOR_OUTPUT_FIELDS, *n.FINISH_OUTPUT_FIELDS)
        a = dict(n.VISUAL_PROFILES[0])
        b = dict(a, id='different-id')
        # Different inactive values still represent the same active projection.
        b[fields[-1]] = 'other'
        candidates = [a, b, a]
        before = copy.deepcopy(candidates)
        event = trace.record(fields, candidates, {fields[0]}, 'initial')
        trace.selected(event, a)
        data = trace.snapshot(a, {fields[0]: n.RANDOM_CHOICE})
        row = data['draws'][0]
        self.assertEqual((row['entry_count'], row['distinct_active_count']), (3, 1))
        self.assertEqual(row['active_fields'], [fields[0]])
        self.assertEqual(candidates, before)
        self.assertNotIn('candidates', row)
        data['draws'][0]['active_fields'].clear()
        self.assertEqual(trace.snapshot(a, {})['draws'][0]['active_fields'], [fields[0]])

    def test_single_and_multiple_counts(self):
        field = n.CAMERA_OUTPUT_FIELDS[0]
        for values, expected in ((['one'], (1, 1)), (['one', 'two', 'two'], (3, 2))):
            trace = SamplingTrace(n)
            candidates = [{field: value} for value in values]
            event = trace.record(n.CAMERA_OUTPUT_FIELDS, candidates, {field}, 'initial')
            trace.selected(event, candidates[0])
            row = trace.snapshot(candidates[0], {})['draws'][0]
            self.assertEqual((row['entry_count'], row['distinct_active_count']), expected)

    def test_empty_trace_distinguishes_no_random_and_uninstrumented_modules(self):
        _, fixed = self.resolve({})
        self.assertEqual(fixed['draws'], [])
        self.assertTrue(all(row['reason'] == 'no_random_fields' for row in fixed['unmeasured']))
        _, person = self.resolve({'肤色': n.RANDOM_CHOICE}, scope='人物')
        self.assertEqual(person['draws'], [])
        self.assertEqual(person['unmeasured'], [{'module': '人物', 'reason': 'not_instrumented'}])

    def test_rng_call_order_state_and_catalog_are_unchanged(self):
        original_rng = random.Random
        instances = []
        class ObservedRandom(original_rng):
            def __init__(self, seed=None):
                super().__init__(seed)
                self.calls = []
                instances.append(self)
            def choice(self, values):
                self.calls.append(('choice', copy.deepcopy(values)))
                return super().choice(values)
            def randrange(self, *args, **kwargs):
                self.calls.append(('randrange', args, kwargs))
                return super().randrange(*args, **kwargs)
        request = dict.fromkeys(n.FIELD_ORDER, n.RANDOM_CHOICE)
        before = copy.deepcopy((request, n.GROUP_BUNDLES, n.FIELD_OPTIONS))
        global_before = random.getstate()
        for preset in n.PRESET_OPTIONS:
            for scope in n.RANDOM_SCOPES:
                for seed in (0, 42, n.MAX_SEED):
                    runs = []
                    for enabled in (False, True):
                        instances.clear()
                        with patch.object(n.random, 'Random', ObservedRandom):
                            fields = n.resolve_fields(preset, scope, seed, request,
                                sampling_trace=SamplingTrace(n) if enabled else None)
                        runs.append((fields, [(rng.calls, rng.getstate()) for rng in instances]))
                    self.assertEqual(runs[0], runs[1], (preset, scope, seed))
        self.assertEqual((request, n.GROUP_BUNDLES, n.FIELD_OPTIONS), before)
        self.assertEqual(random.getstate(), global_before)

    def test_real_visual_groups_are_separate_and_owned(self):
        request = dict.fromkeys(n.VISUAL_OUTPUT_FIELDS, n.RANDOM_CHOICE)
        _, data = self.resolve(request, scope='视觉表现')
        self.assertEqual({row['group'] for row in data['draws']}, {'lighting', 'color_finish'})
        for row in data['draws']:
            self.assertEqual(row['module'], '视觉表现')
            self.assertGreaterEqual(row['entry_count'], row['distinct_active_count'])
            self.assertGreater(row['distinct_active_count'], 0)
        self.assertEqual(data['coverage'], 'partial')

    def test_actual_pools_match_observed_choice_inputs_with_locks_and_fallback(self):
        request = dict.fromkeys((*n.SCENE_GROUP_FIELDS, *n.CAMERA_OUTPUT_FIELDS, *n.VISUAL_OUTPUT_FIELDS), n.RANDOM_CHOICE)
        request.update({'场景地点': '公园草地', '主配色': n.EMPTY_CHOICE,
                        '景别': '胸部以上', '成像媒介': '便携数码相机摄影'})
        recorded = []
        original = random.Random.choice
        def observe(rng, seq):
            recorded.append(copy.deepcopy(seq))
            return original(rng, seq)
        with patch.object(random.Random, 'choice', observe):
            fields, data = self.resolve(request)
        self.assertEqual(fields['主配色'], n.EMPTY_CHOICE)
        self.assertEqual(fields['场景地点'], request['场景地点'])
        self.assertEqual(fields['景别'], request['景别'])
        for row in data['draws']:
            active = row['active_fields']
            self.assertTrue(any(len(pool) == row['entry_count'] and
                all(isinstance(b, dict) and all(f in b for f in active) for b in pool) and
                len({tuple(b[f] for f in active) for b in pool}) == row['distinct_active_count']
                for pool in recorded), row)

    def test_reference_scene_replacement_and_second_draws_supersede_initial(self):
        request = dict.fromkeys((*n.SCENE_GROUP_FIELDS, *n.CAMERA_OUTPUT_FIELDS, *n.VISUAL_OUTPUT_FIELDS), n.RANDOM_CHOICE)
        def replace(seed, resolved, automatic):
            resolved['场景地点'] = '公园草地'
            return {'场景'}
        with patch.object(n.REFERENCE_POOL, 'apply', side_effect=replace):
            _, data = self.resolve(request)
        rows = data['draws']
        self.assertEqual(next(r for r in rows if r['group'] == 'scene')['effect'], 'overwritten')
        camera = [r for r in rows if r['group'] == 'camera']
        self.assertEqual([r['stage'] for r in camera], ['initial', 'after_reference'])
        self.assertEqual(camera[0]['effect'], 'overwritten')
        self.assertEqual(camera[1]['effect'], 'retained')
        light = [r for r in rows if r['group'] == 'lighting']
        self.assertEqual([r['stage'] for r in light], ['initial', 'after_reference'])
        self.assertEqual(light[0]['effect'], 'overwritten')
        self.assertEqual(light[1]['effect'], 'retained')
        self.assertIn({'module': '场景', 'reason': 'reference_replacement'}, data['unmeasured'])

    def test_no_compatible_second_lighting_draw_keeps_initial_evidence(self):
        request = dict.fromkeys(n.VISUAL_OUTPUT_FIELDS, n.RANDOM_CHOICE)
        with patch.object(n.REFERENCE_POOL, 'apply', return_value={'场景'}), \
                patch.object(n, '_scene_compatible_lighting_plans', return_value=[]):
            _, data = self.resolve(request)
        light = [r for r in data['draws'] if r['group'] == 'lighting']
        self.assertEqual(len(light), 1)
        self.assertEqual(light[0]['stage'], 'initial')
        self.assertEqual(light[0]['effect'], 'retained')

    def test_scene_neutral_fallback_is_a_real_single_candidate(self):
        request = dict.fromkeys(n.SCENE_GROUP_FIELDS, n.RANDOM_CHOICE)
        request.update({'场景地点': '公园草地', '背景环境': '高级灰摄影棚'})
        with patch.object(n, '_neutral_scene_bundle_for_explicit_locks',
                          wraps=n._neutral_scene_bundle_for_explicit_locks) as fallback, \
                patch.object(n.REFERENCE_POOL, 'apply', return_value=set()):
            fields, data = self.resolve(request)
        self.assertEqual(fallback.call_count, 1)
        row = next(r for r in data['draws'] if r['group'] == 'scene')
        self.assertEqual((row['entry_count'], row['distinct_active_count']), (1, 1))
        self.assertEqual(fields['场景地点'], request['场景地点'])
        self.assertEqual(fields['背景环境'], request['背景环境'])

    def test_missing_supported_draw_is_not_reported_as_zero(self):
        trace = SamplingTrace(n, '摄影')
        data = trace.snapshot({}, {'景别': n.RANDOM_CHOICE})
        self.assertEqual(data['draws'], [])
        self.assertEqual(data['unmeasured'], [{'module': '摄影', 'reason': 'not_instrumented'}])

    def test_legacy_request_normalization_and_text_replacement_remain_separate(self):
        result = n.ZImageChinesePromptBuilder().build_prompt(unique_id='42',
            光线方案=n.RANDOM_CHOICE, 用户视觉表现片段='保留用户自定义视觉描述')
        data = result['ui']['vividmuse_prompt_diagnostics'][0]
        self.assertEqual({r['group'] for r in data['random_explanation']['draws']}, {'lighting'})
        self.assertTrue(all(r['status'] == 'user_replaced' for r in data['random_fields']))
        self.assertIn('保留用户自定义视觉描述', data['zh'])

    def test_later_normalization_is_not_claimed_as_retained(self):
        trace = SamplingTrace(n)
        field = n.CAMERA_OUTPUT_FIELDS[0]
        event = trace.record(n.CAMERA_OUTPUT_FIELDS, [{field: 'a'}], {field}, 'initial')
        trace.selected(event, {field: 'a'})
        self.assertEqual(trace.snapshot({field: 'b'}, {})['draws'][0]['effect'], 'overwritten')

    def test_bounded_trace_and_missing_measurement_are_explicit(self):
        trace = SamplingTrace(n)
        field = n.CAMERA_OUTPUT_FIELDS[0]
        for i in range(20):
            event = trace.record(n.CAMERA_OUTPUT_FIELDS, [{field: 'a'}], {field}, 'initial')
            trace.selected(event, {field: 'a'})
        result = trace.snapshot({field: 'a'}, {field: n.RANDOM_CHOICE})
        self.assertEqual(len(result['draws']), 16)
        self.assertTrue(result['truncated'])
        self.assertEqual(result['coverage'], 'partial')

    def test_node_payload_is_additive_and_direct_api_unchanged(self):
        classes = [n.ZImageChinesePromptBuilder] + [cls for cls in m.NODE_CLASS_MAPPINGS.values()
            if issubclass(cls, m.ZImageModuleNodeBase)]
        for cls in classes:
            method = getattr(cls(), cls.FUNCTION)
            args = dict.fromkeys(n.FIELD_ORDER, n.RANDOM_CHOICE)
            direct = method(**args)
            result = method(unique_id='42', **args)
            self.assertIsInstance(direct, tuple)
            self.assertEqual(direct, result['result'])
            data = result['ui']['vividmuse_prompt_diagnostics'][0]
            self.assertEqual(data['version'], 1)
            explanation = data['random_explanation']
            self.assertEqual(explanation['version'], 1)
            if cls is not n.ZImageChinesePromptBuilder:
                self.assertTrue(all(r['module'] == cls.MODULE_NAME for r in explanation['draws'] + explanation['unmeasured']))
            json.dumps(result)


if __name__ == '__main__':
    unittest.main()
