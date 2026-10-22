"""Conservative, opt-in rendering view. Never mutate resolved selections."""

FRAMING_MODES = ["保持当前规则", "按景别适配"]
FRAMING_INPUT = (FRAMING_MODES, {
    "default": FRAMING_MODES[0],
    "tooltip": "保持当前规则不改变现有输出。按景别适配仅省略明确在画外的内置下装、鞋袜和腿部动作，保留原选择与用户文本；独立模块需要上游摄影节点的明确景别。",
})

_LOWER_CLOTHING = ("下装类型", "下装颜色", "下装材质", "下装图案")
_UPPER_SHOTS = ("面部特写", "头肩近景", "胸部以上", "腰部以上")
_FULL_SHOTS = ("全身构图", "带环境全身", "动态全身")


def framing_view(fields, mode=FRAMING_MODES[0], *, shot=None,
                 scope="全部模块", replacements=(), camera_opaque=False):
    """Return a fresh effective view and an auditable omission report.

    A seated half portrait may include thighs/knees, so only shoes and legwear
    are omitted. Compound poses, dresses and fit details remain indivisible.
    No inference from prose or an invisible module preset is permitted.
    """
    effective = dict(fields)
    mode = mode if mode in FRAMING_MODES else FRAMING_MODES[0]
    report = {"mode": mode, "shot": shot, "status": "disabled", "omitted": []}
    if mode == FRAMING_MODES[0]:
        return effective, report
    if camera_opaque:
        report["status"] = "opaque_camera"
        return effective, report
    if not shot or shot == "不使用":
        report["status"] = "no_context"
        return effective, report
    if shot not in (*_UPPER_SHOTS, "坐姿半身", *_FULL_SHOTS):
        report["status"] = "unsupported_shot"
        return effective, report
    report["status"] = "applied"
    omitted = {}
    if shot in _UPPER_SHOTS:
        omitted["服装"] = (*_LOWER_CLOTHING, "袜装", "鞋履")
        omitted["姿态动作"] = ("腿部动作",)
    elif shot == "坐姿半身":
        omitted["服装"] = ("袜装", "鞋履")
    for module, names in omitted.items():
        if (scope != "全部模块" and scope != module) or module in replacements:
            continue
        for name in names:
            value = fields.get(name, "不使用")
            if value != "不使用":
                effective[name] = "不使用"
                report["omitted"].append({"module": module, "field": name,
                                          "value": value, "reason": "outside_frame"})
    return effective, report
