"""Bounded, opt-in coordination of two proven structured-field conflicts."""
import hashlib
import random


RULES = (
    ('crossed_legs_stool_support', ('基础姿态', '腿部动作'), ('盘腿而坐', '一脚踩高脚椅横杆')),
    ('pool_pose_classroom_location', ('基础姿态', '场景地点'), ('泳池边坐姿', '校园教室')),
)
EMPTY = '不使用'
STANDING_LEGS = frozenset(('双脚自然平行', '一脚轻微向前', '一腿轻微屈膝', '脚踝交叉'))
MODES = ('默认组合', '协调优先')
INPUT = (list(MODES), {'default': MODES[0], 'tooltip':
    '仅协调允许随机变化的内置字段。指定内容保持原样；自定义文本不参与判断。切换模式可能改变相同种子的结果。'})


def explanation(mode, coordination, scope):
    events = []
    for event in coordination.events if coordination is not None else ():
        module = event.get('module', scope if scope != '全部模块' else '姿态动作')
        if scope not in ('全部模块', module):
            continue
        events.append({**event, 'module': module, 'fields': list(event['fields']),
                       'before': dict(event['before']), 'after': dict(event['after'])})
    return {'version': 1, 'mode': 'coherent' if mode == MODES[1] else 'standard',
            'fallback': mode not in MODES, 'coverage': 'partial', 'truncated': len(events) > 16,
            'events': events[:16]}


def conflicts(fields):
    return [rule for rule in RULES if tuple(fields.get(f) for f in rule[1]) == rule[2]]


def compatible(rule_id, fields, known):
    """Positive evidence, not merely absence of the original forbidden pair."""
    pose, legs, scene = (fields.get(f) for f in ('基础姿态', '腿部动作', '场景地点'))
    if rule_id == 'crossed_legs_stool_support':
        return (pose, legs) in (('盘腿而坐', '盘腿而坐'), ('高脚椅坐姿', '一脚踩高脚椅横杆'))
    if pose == '泳池边坐姿' and scene == '室内泳池':
        return True
    return (scene == '校园教室' and pose == '自然站立'
            and ('腿部动作' not in known or legs in (None, EMPTY) or legs in STANDING_LEGS))


class CoherencePass:
    """One execution's permissions, actual candidate sequences and evidence.

    Callers supply visible structured facts and owned fields. Hidden presets and
    user text cannot grant permission to modify another module.
    """
    def __init__(self, *, known_fields, writable_fields, opaque_text=False):
        self.known_fields = frozenset(known_fields)
        self.writable_fields = frozenset(writable_fields)
        self.opaque_text = opaque_text
        self.reset()

    def reset(self):
        self.pools = {}
        self.events = []

    def remember(self, module, candidates):
        self.pools[module] = tuple(dict(item) for item in candidates)

    def downstream(self, module, status, before, after, count=0):
        fields = [f for f in before if before[f] != after.get(f)]
        if status == 'adjusted' and not fields:
            status = 'retained'
        self.events.append({'rule_id': 'camera_context' if module == '摄影' else 'lighting_context',
                            'module': module, 'status': status, 'fields': fields,
                            'before': {f: before[f] for f in fields},
                            'after': {f: after[f] for f in fields}, 'candidate_count': count})

    @staticmethod
    def rng(seed, group):
        payload = f'vividmuse-coherence-v1:{int(seed) & 0xFFFFFFFFFFFFFFFF}:{group}'
        return random.Random(int.from_bytes(hashlib.sha256(payload.encode('utf-8')).digest(), 'big'))

    def apply(self, fields, random_fields, seed, groups, reference_changed, fantasy_themes):
        writable = self.writable_fields & self.known_fields & random_fields
        changed = set()
        for rule_id, rule_fields, _ in conflicts(fields):
            if not self.writable_fields.intersection(rule_fields):
                continue
            event = {'rule_id': rule_id, 'status': 'unknown_context', 'fields': [],
                     'before': {}, 'after': {}, 'candidate_count': 0}
            self.events.append(event)
            if not set(rule_fields).issubset(self.known_fields):
                continue
            if rule_id == 'pool_pose_classroom_location' and (
                self.opaque_text
                or ('写真大类' in self.known_fields and fields.get('写真大类') == '幻想概念')
                or ('写真主题' in self.known_fields and fields.get('写真主题') in fantasy_themes)
            ):
                continue
            module = next((name for name in ('姿态动作', '场景')
                           if writable.intersection(rule_fields).intersection(groups[name])), None)
            if module is None:
                event['status'] = 'preserved_explicit'
                continue
            event['module'] = module
            if module in reference_changed:
                event['status'] = 'unsupported_source'
                continue
            active = [f for f in groups[module] if f in writable]
            fixed = [f for f in groups[module] if f in self.known_fields and f not in active
                     and fields.get(f, EMPTY) != EMPTY]
            candidates = []
            for item in self.pools.get(module, ()):
                if any(f not in item for f in active) or any(item.get(f) != fields[f] for f in fixed):
                    continue
                proposed = {**fields, **{f: item[f] for f in active}}
                if compatible(rule_id, proposed, self.known_fields) and not conflicts(proposed):
                    candidates.append(proposed)
            event['candidate_count'] = len(candidates)
            if not candidates:
                event['status'] = 'no_candidate'
                continue
            selected = self.rng(seed, module).choice(candidates)
            updated = [f for f in active if selected[f] != fields[f]]
            event.update(status='adjusted', fields=updated,
                         before={f: fields[f] for f in updated},
                         after={f: selected[f] for f in updated})
            fields.update({f: selected[f] for f in updated})
            if updated:
                changed.add(module)
        return changed
