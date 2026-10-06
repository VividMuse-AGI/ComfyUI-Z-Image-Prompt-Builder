"""Read-only execution metadata. No random draws, input writes or new ports."""


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


def execution_result(result, *, core, scope, seed, settings, fields, fragments,
                     english_fragments, render_pair, replacements=None, context=None,
                     request_trace=None):
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
        "random_fields": random_fields,
        "modules": [{"name": name, "source": "user" if isinstance(replacements.get(name), str)
                     and replacements[name].strip() else "builtin",
                     "zh": fragments.get(name, ""), "en": english_fragments.get(name, "")}
                    for name in names],
    }
    return {"result": result, "ui": {"vividmuse_prompt_diagnostics": [metadata]}}
