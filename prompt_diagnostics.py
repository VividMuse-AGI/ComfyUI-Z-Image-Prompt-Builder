"""Read-only execution metadata. No random draws, input writes or new ports."""


class SamplingTrace:
    """Bounded evidence from actual draw sites, never an alternative resolver.

    Counts describe active-field projections at a conditional sampling step,
    not distinct output strings, whole-module possibilities or probabilities.
    """

    LIMIT = 16

    def __init__(self, core, scope="全部模块"):
        self.core = core
        self.scope = scope
        self.groups = {
            tuple(core.SCENE_GROUP_FIELDS): ("场景", "scene"),
            tuple(core.CAMERA_OUTPUT_FIELDS): ("摄影", "camera"),
            tuple(core.LIGHTING_OUTPUT_FIELDS): ("视觉表现", "lighting"),
            (*core.COLOR_OUTPUT_FIELDS, *core.FINISH_OUTPUT_FIELDS): ("视觉表现", "color_finish"),
        }
        self.rows = []
        self.selected_values = {}
        self.reference_modules = set()
        self.coherence_modules = set()
        self.truncated = False

    def record(self, group_fields, candidates, active, stage):
        spec = self.groups.get(tuple(group_fields))
        if spec is None or self.scope not in ("全部模块", spec[0]):
            return None
        fields = [field for field in group_fields if field in active]
        if not fields:
            return None
        # A later draw supersedes the earlier draw even when values coincide.
        for row in self.rows:
            if row["group"] == spec[1]:
                row["effect"] = "overwritten"
        if len(self.rows) >= self.LIMIT:
            self.truncated = True
            return None
        index = len(self.rows)
        self.rows.append({
            "module": spec[0], "group": spec[1], "stage": stage,
            "entry_count": len(candidates),
            "distinct_active_count": len({tuple(item[field] for field in fields) for item in candidates}),
            "active_fields": fields, "effect": "unknown",
        })
        return index

    def selected(self, index, selected):
        if index is not None:
            row = self.rows[index]
            self.selected_values[index] = tuple(selected[field] for field in row["active_fields"])

    def reference_changed(self, changed):
        # The extension pool is deliberately unmeasured in this version.
        # Camera/light redraws, when they occur, get their own later records.
        for module in changed:
            if self.scope in ("全部模块", module):
                self.reference_modules.add(module)
        for row in self.rows:
            if row["module"] in changed:
                row["effect"] = "overwritten"

    def snapshot(self, fields, requested):
        draws = []
        for index, row in enumerate(self.rows):
            item = {**row, "active_fields": list(row["active_fields"])}
            if item["effect"] != "overwritten" and index in self.selected_values:
                current = tuple(fields.get(field) for field in item["active_fields"])
                item["effect"] = "retained" if current == self.selected_values[index] else "overwritten"
            draws.append(item)
        groups = module_groups(self.core)
        unmeasured = []
        for module, names in groups.items():
            if self.scope not in ("全部模块", module):
                continue
            active = {name for name in names if requested.get(name) == self.core.RANDOM_CHOICE}
            measured = {field for row in draws if row["module"] == module for field in row["active_fields"]}
            if not active:
                reason = "no_random_fields"
            elif module in self.reference_modules:
                reason = "reference_replacement"
            elif module in self.coherence_modules:
                reason = "coherence_replacement"
            elif active - measured:
                reason = "not_instrumented"
            else:
                continue
            unmeasured.append({"module": module, "reason": reason})
        return {"version": 1, "coverage": "partial", "truncated": self.truncated,
                "draws": draws, "unmeasured": unmeasured}

    def coherence_changed(self, changed):
        for module in changed:
            if self.scope in ("全部模块", module):
                self.coherence_modules.add(module)
        for row in self.rows:
            if row["module"] in changed:
                row["effect"] = "overwritten"


def module_groups(core):
    return {
        "画面基础": ("画面比例", "成像媒介", "写真大类", "写真主题"),
        "人物": tuple(core.PERSON_OUTPUT_FIELDS),
        "发型": ("发色模式", *core.HAIR_OUTPUT_FIELDS),
        "服装": tuple(core.CLOTHING_OUTPUT_FIELDS),
        "姿态动作": tuple(core.POSE_OUTPUT_FIELDS),
        "场景": ("场景大类", *core.SCENE_OUTPUT_FIELDS),
        "摄影": tuple(core.CAMERA_OUTPUT_FIELDS),
        "视觉表现": tuple(core.VISUAL_OUTPUT_FIELDS),
    }


def card_candidates(core, groups, fields, fragments, english_fragments, replacements,
                    *, modules=("人物", "发型", "服装", "姿态动作")):
    """Snapshot canonical execution values before framing, without resolving again."""
    candidates = {}
    for module in modules:
        if module not in groups:
            continue
        names = groups[module]
        replacement = replacements.get(module)
        if isinstance(replacement, str) and replacement.strip():
            reason = "user_replaced"
        elif not (fragments.get(module, "").strip()
                  or english_fragments.get(module, "").strip()):
            reason = "empty_module"
        elif any(name not in fields for name in names):
            reason = "incomplete_fields"
        elif any(not isinstance(fields[name], str)
                 or fields[name] in (core.FOLLOW_PRESET, core.RANDOM_CHOICE)
                 or (fields[name] != core.EMPTY_CHOICE
                     and fields[name] not in core.FIELD_OPTIONS[name]) for name in names):
            reason = "unsupported_values"
        else:
            reason = None
        candidates[module] = {"available": reason is None, "reason": reason}
        if reason is None:
            candidates[module]["values"] = {name: fields[name] for name in names}
    return {"version": 1, "modules": candidates}


def shoot_plan_candidates(core, groups, fields, fragments, english_fragments, replacements):
    """Independent additive protocol; never infer modules from upstream text."""
    result = card_candidates(core, groups, fields, fragments, english_fragments,
                             replacements, modules=("场景", "摄影", "视觉表现"))
    for module, candidate in result["modules"].items():
        if not candidate["available"]:
            continue
        values = candidate["values"]
        reason = None
        if all(value == core.EMPTY_CHOICE for value in values.values()):
            reason = "empty_module"
        elif module == "场景":
            category, location = values["场景大类"], values["场景地点"]
            if category != core.EMPTY_CHOICE and location != core.EMPTY_CHOICE:
                allowed = core.SCENE_LOCATIONS_BY_CATEGORY.get(category, ())
                if location not in allowed:
                    reason = "incompatible_scene"
        if reason:
            result["modules"][module] = {"available": False, "reason": reason}
    return result


def execution_result(result, *, core, scope, seed, settings, fields, fragments,
                     english_fragments, render_pair, replacements=None, context=None,
                    request_trace=None, framing=None, sampling_trace=None, coherence=None):
    """Measure text effects by rendering resolved fields, never resolving again.

    Removing one field is a text-sensitivity check, not a candidate-count estimate
    or a guarantee that varying that field will change an image.
    """
    groups = module_groups(core)
    selected_groups = groups if scope == "全部模块" else {scope: groups[scope]}
    replacements = replacements or {}
    field_modules = {field: name for name, group in selected_groups.items() for field in group}
    baseline = None
    random_fields = []
    request_trace = request_trace or settings
    framing_omitted = {row["field"] for row in (framing or {}).get("omitted", [])}
    for field, name in field_modules.items():
        configured = settings.get(field) == core.RANDOM_CHOICE
        normalized_random = request_trace.get(field) == core.RANDOM_CHOICE
        if not configured and not normalized_random:
            continue
        value = fields.get(field, core.EMPTY_CHOICE)
        if isinstance(replacements.get(name), str) and replacements[name].strip():
            status = "user_replaced"
        elif not normalized_random:
            status = "not_randomized"
        elif value == core.EMPTY_CHOICE:
            status = "empty"
        elif field in framing_omitted:
            status = "framing_omitted"
        else:
            if baseline is None:
                baseline = render_pair(fields)
            without = {**fields, field: core.EMPTY_CHOICE}
            status = "text_affecting" if render_pair(without) != baseline else "not_in_text"
        random_fields.append({"field": field, "module": name, "value": value, "status": status,
                              "configured": configured, "normalized_random": normalized_random})
    names = [*selected_groups]
    if scope == "全部模块":
        names.append("自定义")
    metadata = {
        "version": 1, "scope": scope, "seed": str(int(seed) & core.MAX_SEED),
        "settings": {k: str(v) if isinstance(v, str) else v for k, v in settings.items()
                     if k not in ("unique_id", "随机种子")},
        "context": dict(context or {}),
        "zh": str(result[0]), "en": str(result[-1]),
        "resolved": {field: fields.get(field, core.EMPTY_CHOICE) for field in field_modules},
        "card_candidates": card_candidates(core, selected_groups, fields, fragments,
                                           english_fragments, replacements),
        "shoot_plan_candidates": shoot_plan_candidates(
            core, selected_groups, fields, fragments, english_fragments, replacements),
        "random_fields": random_fields,
        "modules": [{"name": name, "source": "user" if isinstance(replacements.get(name), str)
                     and replacements[name].strip() else "builtin",
                     "zh": fragments.get(name, ""), "en": english_fragments.get(name, "")}
                    for name in names],
    }
    if framing is not None:
        metadata["framing"] = framing
    if sampling_trace is not None:
        metadata["random_explanation"] = sampling_trace.snapshot(fields, request_trace)
    if coherence is not None:
        metadata["coherence_explanation"] = coherence
    return {"result": result, "ui": {"vividmuse_prompt_diagnostics": [metadata]}}
