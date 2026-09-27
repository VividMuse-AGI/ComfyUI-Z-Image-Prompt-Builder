"""Visually reviewed phrase additions, with conservative automatic eligibility.

These are text-tested candidates, not model-image-validated presets. Complete
actions stay atomic so independent hand/leg draws cannot split their support
and prop relationships. Literal selections and disabled fields always win.
"""

import json
import random
from pathlib import Path

ACTION_SHOTS = ("腰部以上", "三分之二身", "全身构图", "带环境全身", "环境人像", "坐姿半身")


class ReferencePool:
    def __init__(self, core):
        self.core = core
        self.entries = json.loads((Path(__file__).parent / "phrase_library" /
                                   "reference_expansion_v1.json").read_text(encoding="utf-8"))["entries"]
        self.by_option = {}
        self.by_id = {entry["id"]: entry for entry in self.entries}
        # The swimsuit material already exists for separates; reuse its wording
        # for one-piece swimwear instead of pairing swimwear with suit fabrics.
        field, label = "连体服材质", "泳装弹力面料"
        if label not in core["FIELD_OPTIONS"][field]:
            core["FIELD_OPTIONS"][field].append(label)
            core["FIELD_TEXT"][field][label] = "连体服面料为泳装弹力面料"
            core["CLOTHING_VALUE_TEXT"][field][label] = "泳装弹力面料"
            core["_ENGLISH_VALUE_OVERRIDES"][field, label] = "stretch swimwear fabric"
        for entry in self.entries:
            for field in entry["fields"]:
                label = entry["label"]
                if label in core["FIELD_OPTIONS"][field]:
                    raise ValueError(f"Duplicate reference option: {field}/{label}")
                self.by_option[field, label] = entry
                core["FIELD_OPTIONS"][field].append(label)
                core["FIELD_TEXT"][field][label] = entry["text"]
                core["_ENGLISH_VALUE_OVERRIDES"][field, label] = entry["english"]
                for name in ("POSE_VALUE_TEXT", "CLOTHING_VALUE_TEXT", "SCENE_VALUE_TEXT"):
                    if field in core[name]:
                        core[name][field][label] = entry["text"]
                if field == "基础姿态":
                    kind = entry.get("camera_type", "standing")
                    core["POSE_CAMERA_TYPE_BY_LABEL"][label] = kind
                    core["POSE_CAMERA_TYPES"][kind].append(label)
                    if kind == "seated":
                        core["SEATED_POSES"].add(label)

    def text(self, field, label):
        entry = self.by_option.get((field, label))
        return entry["text"] if entry else label

    def camera_candidates(self, resolved, bundles):
        allowed = None
        pose = self.by_option.get(("基础姿态", resolved.get("基础姿态")))
        scene = self.by_option.get(("背景环境", resolved.get("背景环境")))
        if pose:
            allowed = set(pose.get("shots", ACTION_SHOTS))
        if scene and scene["id"] == "C19":
            cabin = {"腰部以上", "胸部以上", "坐姿半身"}
            allowed = cabin if allowed is None else allowed & cabin
        return [b for b in bundles if allowed is None or b["景别"] in allowed]

    def prepare_request(self, requested):
        """Complete selections replace inherited/random atoms, never literals."""
        c = self.core
        if ("基础姿态", requested.get("基础姿态")) in self.by_option:
            for field in c["POSE_OUTPUT_FIELDS"]:
                if field != "基础姿态" and requested.get(field, c["FOLLOW_PRESET"]) in (
                    c["FOLLOW_PRESET"], c["RANDOM_CHOICE"]
                ):
                    requested[field] = c["EMPTY_CHOICE"]
        entry = self.by_option.get(("背景环境", requested.get("背景环境")))
        if entry:
            for field in c["SCENE_GROUP_FIELDS"]:
                if field != "背景环境" and requested.get(field, c["FOLLOW_PRESET"]) in (
                    c["FOLLOW_PRESET"], c["RANDOM_CHOICE"]
                ):
                    requested[field] = entry.get("set", {}).get(field, c["EMPTY_CHOICE"])

    def _eligible(self, entry, field, resolved, automatic):
        c = self.core
        empty = c["EMPTY_CHOICE"]
        if field not in automatic:
            return False
        theme = resolved.get("写真主题", empty)
        if (
            theme in c["SPECIALIST_THEME_POSE_BUNDLES"]
            or theme == "瑜伽普拉提生活写真"
        ):
            return False
        if theme != empty and not any(k in theme for k in entry["themes"]):
            return False
        scene = " ".join(resolved.get(f, empty) for f in ("场景地点", "背景环境"))
        has_scene = any(resolved.get(f, empty) != empty for f in ("场景地点", "背景环境"))
        if entry.get("scene") and has_scene and not any(k in scene for k in entry["scene"]):
            return False
        if any(k in " ".join(v for f, v in resolved.items() if f not in entry["fields"])
               for k in entry.get("avoid", ())):
            return False
        for name, allowed in entry.get("require", {}).items():
            if resolved.get(name, empty) not in allowed:
                return False
        for name, value in entry.get("set", {}).items():
            if name not in automatic and resolved.get(name, empty) != value:
                return False
        if entry["module"] == "姿态动作":
            # Complete chains never overwrite partial manual pose instructions.
            if not set(c["POSE_OUTPUT_FIELDS"]).issubset(automatic):
                return False
            shot = resolved.get("景别", empty)
            if shot != empty and "景别" not in automatic and shot not in entry.get("shots", ACTION_SHOTS):
                return False
        elif entry["module"] == "场景":
            # A replacement background must not retain another location/furniture.
            if not set(c["SCENE_GROUP_FIELDS"]).issubset(automatic):
                return False
            # Generic words such as "flowers" must not turn an explicitly
            # outdoor theme into an indoor furniture setting (or vice versa).
            outside = {"自然户外", "都市户外"}
            current_category = resolved.get("场景大类", empty)
            next_category = entry.get("set", {}).get("场景大类", empty)
            if (theme != empty and current_category != empty
                    and (current_category in outside) != (next_category in outside)
                    and "交通空间" not in (current_category, next_category)):
                return False
            pose = " ".join(resolved.get(f, empty) for f in c["POSE_OUTPUT_FIELDS"])
            if (not set(c["POSE_OUTPUT_FIELDS"]).issubset(automatic)
                    and any(resolved.get(f, empty) != empty for f in c["POSE_OUTPUT_FIELDS"])):
                if not entry.get("pose") or not any(k in pose for k in entry["pose"]):
                    return False
            if "景别" not in automatic and resolved.get("景别", empty) in ("面部特写", "头肩近景", "胸部以上"):
                return False
            if (entry["id"] == "C19" and "景别" not in automatic
                    and resolved.get("景别", empty) not in (empty, "腰部以上", "坐姿半身")):
                return False
        elif entry["module"] == "发型":
            style = resolved.get("发型造型", empty)
            if style != empty and style not in entry["styles"]:
                return False
            if c["POSE_HAND_HEADWEAR_REQUIREMENTS"].get(resolved.get("手部动作")):
                return False
        elif entry["module"] == "服装":
            mode = resolved.get("穿搭结构", empty)
            if mode == empty:
                return False
            if any(k in " ".join(resolved.get(f, "") for f in
                                  ("上装类型", "下装类型", "连体服类型"))
                   for k in ("运动", "瑜伽", "骑行", "拳击")):
                return False
            visible = c["CLOTHING_MODE_FIELDS"].get(mode, c["CLOTHING_BRANCH_FIELDS"])
            if field in c["CLOTHING_BRANCH_FIELDS"] and field not in visible:
                return False
            if field.endswith("图案"):
                branch = field[:-2]
                garment = resolved.get(branch + "类型", empty)
                if garment == empty or "图案" in c["_garment_property_limits"](garment):
                    return False
                if entry.get("white_base"):
                    if resolved.get(branch + "颜色") not in ("奶油白", "象牙白"):
                        return False
        # A later draw must not break requirements of an earlier addition (for
        # example a back-seam stocking needs a rear-facing pose to remain visible).
        proposed = self._proposal(entry, field, resolved, automatic)
        for (other_field, label), other in self.by_option.items():
            if proposed.get(other_field) != label or other is entry:
                continue
            if any(proposed.get(name, empty) not in allowed
                   for name, allowed in other.get("require", {}).items()):
                return False
        return True

    def _proposal(self, entry, field, resolved, automatic):
        c = self.core
        proposed = dict(resolved)
        module = entry["module"]
        if module in ("姿态动作", "场景"):
            group = c["POSE_OUTPUT_FIELDS"] if module == "姿态动作" else c["SCENE_GROUP_FIELDS"]
            proposed.update({name: c["EMPTY_CHOICE"] for name in group})
        if module == "场景" and set(c["POSE_OUTPUT_FIELDS"]).issubset(automatic):
            proposed.update({name: c["EMPTY_CHOICE"] for name in c["POSE_OUTPUT_FIELDS"]})
            pose_id = {"C19": "C06a", "C32": "B008Q2"}.get(entry["id"])
            proposed["基础姿态"] = self.by_id[pose_id]["label"] if pose_id else "自然站立"
        proposed[field] = entry["label"]
        proposed.update(entry.get("set", {}))
        return proposed

    def candidates(self, module, resolved, automatic):
        return [(entry, field) for entry in self.entries if entry["module"] == module
                for field in entry["fields"] if self._eligible(entry, field, resolved, automatic)]

    def apply(self, seed, resolved, automatic):
        changed = set()
        if not automatic:
            return changed
        c = self.core
        # Separate deterministic stream: fixed presets and existing draws retain
        # their values whenever no compatible addition is selected.
        rng = random.Random((int(seed) & c["MAX_SEED"]) ^ 0x524546504F4F4C)
        for module in ("场景", "服装", "姿态动作", "发型"):
            candidates = self.candidates(module, resolved, automatic)
            if not candidates or rng.randrange(4):
                continue
            entry, field = rng.choice(candidates)
            proposed = self._proposal(entry, field, resolved, automatic)
            if any(proposed[f] != resolved[f] for f in c["POSE_OUTPUT_FIELDS"]):
                changed.add("姿态动作")
            resolved.update(proposed)
            changed.add(module)
        return changed
