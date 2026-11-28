"""Chinese natural-language prompt rendering and composition."""

from __future__ import annotations

from typing import Dict, Iterable, Mapping, Sequence

try:
    from .prompt_catalog import *  # noqa: F403
except ImportError:
    from prompt_catalog import *  # noqa: F403

_core_module = None


def set_zh_core(module) -> None:
    global _core_module
    _core_module = module


def _c(name: str, fallback=None):
    if _core_module is not None and hasattr(_core_module, name):
        return getattr(_core_module, name)
    return fallback


def _english_atomic(field_name: str, value: str) -> str:
    try:
        from .prompt_render_en import _english_atomic_value
    except ImportError:
        from prompt_render_en import _english_atomic_value
    return _english_atomic_value(field_name, value)

def _base_prompt_text(fields: Mapping[str, str], density: str) -> str:
    base_fields = ("画面比例", "成像媒介", "写真主题")
    if density == "详细":
        parts = [
            FIELD_TEXT[field_name][fields[field_name]].rstrip("，；。 ")
            for field_name in base_fields
            if fields.get(field_name, EMPTY_CHOICE) != EMPTY_CHOICE
        ]
    else:
        parts = [
            _brief_text(fields, field_name).rstrip("，；。 ")
            for field_name in base_fields
            if fields.get(field_name, EMPTY_CHOICE) != EMPTY_CHOICE
        ]
    return "，".join(part for part in parts if part)


def _brief_text(fields: Mapping[str, str], field_name: str) -> str:
    value = fields[field_name]
    if field_name == "成像媒介":
        return value
    if field_name == "写真主题":
        return f"真实摄影风格的{value}"
    return BRIEF_FIELD_TEXT.get(field_name, {}).get(value, value)


def _person_identity_text(fields: Mapping[str, str]) -> str:
    age_value = fields.get("年龄阶段", EMPTY_CHOICE)
    age = "" if age_value == EMPTY_CHOICE else AGE_STAGE_TEXT.get(age_value, "")

    category = fields.get("族裔大类", EMPTY_CHOICE)
    branch = fields.get("地域族裔分支", EMPTY_CHOICE)
    ethnicity = ""
    if branch not in (EMPTY_CHOICE, ETHNICITY_BRANCH_GENERIC):
        ethnicity = branch
    elif category != EMPTY_CHOICE:
        ethnicity = category

    if age and ethnicity:
        if "外观" in ethnicity:
            return f"一位{age}、具有{ethnicity}的成年女性"
        return f"一位{age}的{ethnicity}成年女性"
    if age:
        return f"一位{age}的成年女性"
    if ethnicity:
        if "外观" in ethnicity:
            return f"一位具有{ethnicity}的成年女性"
        return f"一位{ethnicity}成年女性"
    return ""


def _person_field_prompt_text(
    fields: Mapping[str, str], field_name: str, density: str
) -> str:
    if fields.get(field_name, EMPTY_CHOICE) == EMPTY_CHOICE:
        return ""
    if density == "精简":
        return _brief_text(fields, field_name)
    if density == "标准":
        return _standard_text(fields, field_name)
    return FIELD_TEXT[field_name][fields[field_name]]


def _active_makeup_fields(fields: Mapping[str, str]) -> tuple[str, ...]:
    mode = fields.get("妆容模式", EMPTY_CHOICE)
    if mode == "整体预设":
        return ("整体妆容预设",)
    if mode == "分项自定义":
        return MAKEUP_CUSTOM_FIELDS
    # Blank-canvas atoms remain useful without enabling a whole preset branch.
    return ("整体妆容预设", *MAKEUP_CUSTOM_FIELDS)


def module_atomic_fallback(module_name: str, fields: Mapping[str, str],
                           density: str, *, english: bool = False) -> str:
    """Keep selected atoms when density trimming would empty a whole module."""
    if module_name == "服装":
        fields = _visible_clothing_fields(fields, density)
    groups = {
        "画面基础": ("画面比例", "成像媒介", "写真主题"),
        "人物": (*IDENTITY_FIELDS, *PERSON_FACE_FIELDS, *PERSON_EYE_FIELDS,
               *PERSON_SKIN_FIELDS, *_active_makeup_fields(fields), *BODY_OUTPUT_FIELDS),
        "发型": HAIR_OUTPUT_FIELDS,
        "服装": (*CLOTHING_MODE_FIELDS.get(fields.get("穿搭结构"), CLOTHING_BRANCH_FIELDS),
               "版型细节", "袜装", "鞋履", "服装配件"),
        "姿态动作": POSE_OUTPUT_FIELDS, "场景": SCENE_OUTPUT_FIELDS,
        "摄影": CAMERA_OUTPUT_FIELDS, "视觉表现": VISUAL_OUTPUT_FIELDS,
    }
    parts = []
    for field in groups.get(module_name, ()):
        value = fields.get(field, EMPTY_CHOICE)
        if value not in FIELD_OPTIONS[field] or value in DEPENDENCY_PLACEHOLDER_VALUES.get(field, ()):
            continue
        if english:
            text = _english_atomic(field, value)
        elif density == "精简":
            text = _brief_text(fields, field)
        elif density == "标准":
            text = _standard_text(fields, field)
        else:
            text = FIELD_TEXT[field][value]
        if text:
            parts.append(text.rstrip("，；。 "))
    return (", " if english else "，").join(parts)


def _person_detail_prompt_text(fields: Mapping[str, str], density: str) -> str:
    """Compose face, eyes, skin and exactly one selected makeup branch."""

    active_fields = [
        *PERSON_FACE_FIELDS, *PERSON_EYE_FIELDS, *PERSON_SKIN_FIELDS,
    ]
    active_fields.extend(_active_makeup_fields(fields))
    return "，".join(filter(None, (
        _person_field_prompt_text(fields, field_name, density)
        for field_name in active_fields
    )))


def _body_prompt_text(fields: Mapping[str, str], density: str) -> str:
    """Compose body build, stature and line emphasis in semantic order."""

    return "，".join(filter(None, (
        _person_field_prompt_text(fields, field_name, density)
        for field_name in BODY_OUTPUT_FIELDS
    )))


def _person_prompt_text(fields: Mapping[str, str], density: str) -> str:
    """Compatibility wrapper for callers that need the complete person clause."""

    return "，".join(filter(None, (
        _person_detail_prompt_text(fields, density),
        _body_prompt_text(fields, density),
    )))


def _hair_prompt_text(fields: Mapping[str, str], density: str) -> str:
    selected = {
        field_name: fields.get(field_name, EMPTY_CHOICE)
        for field_name in HAIR_OUTPUT_FIELDS
        if fields.get(field_name, EMPTY_CHOICE) != EMPTY_CHOICE
    }
    if not selected:
        return ""

    if density == "详细":
        return "，".join(
            FIELD_TEXT[field_name][selected[field_name]]
            for field_name in HAIR_OUTPUT_FIELDS
            if field_name in selected
        )

    parts = []
    color = selected.get("发色", "")
    length = selected.get("头发长度", "")
    if color or length:
        parts.append(f"发型为{color}{length}")
    if selected.get("发色色调"):
        parts.append(f"发色带{selected['发色色调']}")
    if selected.get("染色方式"):
        parts.append(f"采用{selected['染色方式']}")
    if selected.get("发质与卷度"):
        parts.append(f"发丝呈{selected['发质与卷度']}")
    if selected.get("发型造型"):
        parts.append(f"头发{selected['发型造型']}")
    if selected.get("刘海"):
        parts.append(f"额前为{selected['刘海']}")
    if selected.get("头部配饰"):
        parts.append(f"佩戴{selected['头部配饰']}")

    if density == "精简":
        return "、".join(part.replace("发型为", "", 1) for part in parts)
    return "，".join(parts)


def _clothing_detail_tail(field_name: str, value: str) -> str:
    detail = CLOTHING_VALUE_TEXT[field_name][value]
    return detail.split("，", 1)[1] if "，" in detail else detail


def _garment_prompt_text(
    fields: Mapping[str, str],
    density: str,
    noun: str,
    type_field: str,
    color_field: str,
    material_field: str,
    pattern_field: str,
) -> str:
    selected = {
        field_name: fields.get(field_name, EMPTY_CHOICE)
        for field_name in (type_field, color_field, material_field, pattern_field)
        if fields.get(field_name, EMPTY_CHOICE) != EMPTY_CHOICE
    }
    if not selected:
        return ""

    garment_type = selected.get(type_field, "")
    color = selected.get(color_field, "")
    material = selected.get(material_field, "")
    pattern = selected.get(pattern_field, "")
    compact_material = material
    if (
        ("针织" in material and "针织" in garment_type)
        or ("西装" in material and "西装" in garment_type)
        or ("牛仔" in material and "牛仔" in garment_type)
        or (material and material in garment_type)
    ):
        compact_material = ""
    if density == "详细" and garment_type:
        # Keep the full fabric description once, in the dedicated detail clause.
        compact_material = ""
    compact = "".join(
        part for part in (color, compact_material, garment_type) if part
    )
    if not compact:
        compact = pattern
    if density == "详细" and material and not garment_type:
        compact = color

    if density == "精简":
        return (
            f"穿{compact}"
            if noun in ("连衣裙", "连体服")
            else f"{noun}{compact}"
        )

    prefix = (
        "穿"
        if noun in ("连衣裙", "连体服")
        else (noun if density == "标准" else f"{noun}为")
    )
    parts = [f"{prefix}{compact}"] if compact else []
    if density == "标准":
        if pattern:
            parts.append(f"带{pattern}图案")
        return "，".join(parts)

    if garment_type:
        parts.append(_clothing_detail_tail(type_field, garment_type))
    if material:
        material_prefix = "面料" if compact else f"{noun}面料"
        parts.append(f"{material_prefix}{CLOTHING_VALUE_TEXT[material_field][material]}")
    if pattern:
        parts.append(CLOTHING_VALUE_TEXT[pattern_field][pattern])
    return "，".join(parts)


def _visible_clothing_fields(fields: Mapping[str, str], density: str) -> Mapping[str, str]:
    """Suppress clearly out-of-frame legwear without changing saved selections."""
    if density != "详细" and fields.get("景别") in ("面部特写", "头肩近景", "胸部以上"):
        return {**fields, "袜装": EMPTY_CHOICE, "鞋履": EMPTY_CHOICE}
    return fields


def _clothing_prompt_text(fields: Mapping[str, str], density: str) -> str:
    fields = _visible_clothing_fields(fields, density)
    mode = fields.get("穿搭结构", EMPTY_CHOICE)
    garments = []
    if mode == "连衣裙":
        text = _garment_prompt_text(
            fields, density, "连衣裙", "连衣裙类型", "连衣裙颜色",
            "连衣裙材质", "连衣裙图案"
        )
        if text:
            garments.append(text)
    elif mode == "连体服":
        text = _garment_prompt_text(
            fields, density, "连体服", "连体服类型", "连体服颜色",
            "连体服材质", "连体服图案"
        )
        if text:
            garments.append(text)
    elif mode in ("上装＋下装", "西装套装", "叠穿造型"):
        top = _garment_prompt_text(
            fields, density, "上装", "上装类型", "上装颜色",
            "上装材质", "上装图案"
        )
        bottom = _garment_prompt_text(
            fields, density, "下装", "下装类型", "下装颜色",
            "下装材质", "下装图案"
        )
        garments.extend(part for part in (top, bottom) if part)
        if garments and mode == "西装套装" and density == "详细":
            garments.append("组成上下呼应的西装套装")
        elif garments and mode == "叠穿造型":
            garments.append("形成层次清楚的叠穿造型")
    else:
        # Blank-canvas mode: isolated clothing fields may still be used alone.
        for field_name in CLOTHING_BRANCH_FIELDS:
            value = fields.get(field_name, EMPTY_CHOICE)
            if value != EMPTY_CHOICE:
                garments.append(value)

    detail = fields.get("版型细节", EMPTY_CHOICE)
    if detail != EMPTY_CHOICE:
        if density == "详细":
            garments.append(CLOTHING_VALUE_TEXT["版型细节"][detail])
        else:
            garments.append(detail)
    for field_name in ("袜装", "鞋履", "服装配件"):
        value = fields.get(field_name, EMPTY_CHOICE)
        if value == EMPTY_CHOICE:
            continue
        rendered = (
            CLOTHING_VALUE_TEXT[field_name][value]
            if density == "详细"
            else ACCESSORY_SET_COMPACT_TEXT.get(value, value)
        )
        if density == "详细":
            lead = "脚穿" if field_name == "鞋履" else "搭配"
            garments.append(
                rendered
                if rendered.startswith(("搭配", "脚穿"))
                else f"{lead}{rendered}"
            )
        else:
            garments.append(f"搭配{rendered}")
    return "，".join(garments)


_UPPER_SHOT_NAMES = ("面部特写", "头肩近景", "胸部以上")
_FOOT_WEIGHT_VALUES = ("双脚均衡承重", "重心落左腿", "重心落右腿")


def _visible_pose_fields(fields: Mapping[str, str], density: str) -> Mapping[str, str]:
    """Suppress clearly out-of-frame leg/foot details without changing saved selections."""
    if density != "详细" and fields.get("景别") in _UPPER_SHOT_NAMES:
        updates = {"腿部动作": EMPTY_CHOICE}
        if fields.get("身体重心") in _FOOT_WEIGHT_VALUES:
            updates["身体重心"] = EMPTY_CHOICE
        return {**fields, **updates}
    return fields


def _pose_prompt_text(fields: Mapping[str, str], density: str) -> str:
    fields = _visible_pose_fields(fields, density)
    selected = {
        field_name: fields.get(field_name, EMPTY_CHOICE)
        for field_name in POSE_OUTPUT_FIELDS
        if fields.get(field_name, EMPTY_CHOICE) != EMPTY_CHOICE
    }
    if not selected:
        return ""

    if density == "精简":
        compact_fields = ("基础姿态", "手部动作", "视线", "表情")
        return "，".join(
            _c('REFERENCE_POOL').text(field_name, selected[field_name])
            for field_name in compact_fields
            if field_name in selected
        )
    if density == "标准":
        standard_parts = []
        for field_name in POSE_OUTPUT_FIELDS:
            if field_name not in selected:
                continue
            value = selected[field_name]
            value = _c('REFERENCE_POOL').text(field_name, _PRESET_POSE_STANDARD_TEXT.get(value, value))
            if field_name == "画面瞬间" and value.startswith((
                "枝叶下", "墙边", "咖啡馆", "沙发上", "窗边", "阳台",
                "电梯前", "棚拍间隙", "雨中"
            )):
                value = f"在{value}"
            elif field_name == "手部动作":
                value = {
                    "签字笔与文件夹": "一手握文件夹，另一手夹签字笔轻触太阳穴",
                    "门把手与折扇": "一手握门把，另一手举起折扇",
                }.get(value, value)
            standard_parts.append(value)
        return "，".join(dict.fromkeys(standard_parts))
    return "，".join(
        POSE_VALUE_TEXT[field_name][selected[field_name]]
        for field_name in POSE_OUTPUT_FIELDS
        if field_name in selected
    )


def _scene_prompt_text(fields: Mapping[str, str], density: str) -> str:
    selected = {
        field_name: fields.get(field_name, EMPTY_CHOICE)
        for field_name in SCENE_OUTPUT_FIELDS
        if fields.get(field_name, EMPTY_CHOICE) != EMPTY_CHOICE
    }
    if not selected:
        return ""

    location = selected.get("场景地点", "")
    time_slice = selected.get("时间切片", "")
    weather = selected.get("天气状态", "")
    foreground = selected.get("前景框景", "")
    background = selected.get("背景环境", "")
    details = selected.get("环境细节", "")
    surface = selected.get("空间材质", "")
    spatial = selected.get("空间层次", "")

    def with_suffix(value: str, suffix: str) -> str:
        if ("背景环境", value) in _c('REFERENCE_POOL').by_option:
            return _c('REFERENCE_POOL').text("背景环境", value)
        if suffix == "前景" and value == "无明显前景":
            return "前景干净通透"
        return value if value.endswith(suffix) else f"{value}{suffix}"

    if density == "精简":
        parts = []
        if location:
            parts.append(location)
        if time_slice:
            parts.append(time_slice)
        if foreground:
            parts.append(with_suffix(foreground, "前景"))
        if background and background != location:
            parts.append(with_suffix(background, "背景"))
        return "，".join(parts)

    if density == "标准":
        parts = []
        opening = []
        if location:
            opening.append(f"场景位于{location}")
        if time_slice:
            opening.append(time_slice)
        if weather:
            opening.append(weather)
        if opening:
            parts.append("，".join(opening))
        if foreground:
            parts.append(with_suffix(foreground, "前景"))
        if background and background != location:
            parts.append(with_suffix(background, "背景"))
        if details:
            parts.append(f"保留{details}")
        return "，".join(parts)

    parts = []
    loc_text = FIELD_TEXT["场景地点"][location] if location else ""
    if loc_text:
        parts.append(loc_text)
    if time_slice:
        parts.append(FIELD_TEXT["时间切片"][time_slice])
    if weather:
        parts.append(FIELD_TEXT["天气状态"][weather])
    if foreground:
        parts.append(FIELD_TEXT["前景框景"][foreground])
    if background:
        bg_text = FIELD_TEXT["背景环境"][background]
        loc_core = loc_text.removeprefix("场景位于").strip("，；。 ")
        bg_core = bg_text.removeprefix("背景为").strip("，；。 ")
        if background != location and not (loc_core and bg_core and bg_core in loc_core):
            parts.append(bg_text)
    if details:
        parts.append(FIELD_TEXT["环境细节"][details])
    if surface:
        parts.append(FIELD_TEXT["空间材质"][surface])
    if spatial:
        parts.append(FIELD_TEXT["空间层次"][spatial])
    return "；".join(part.rstrip("，；。 ") for part in parts)


_CAMERA_ANGLE_STANDARD = {
    "平视": "平视机位",
    "略高机位": "略高机位轻微俯拍",
    "高位俯拍": "高位俯拍",
    "略低机位": "略低机位轻微仰拍",
    "低位仰拍": "低位仰拍",
    "胸口高度": "胸口高度平视机位",
    "腰部高度": "腰部高度平视机位",
    "正上方俯拍": "正上方俯拍",
    "贴近地面": "贴近地面向上拍摄",
    "侧前方机位": "侧前方机位",
    "侧面机位": "侧面机位",
}

_CAMERA_SHOT_STANDARD = {
    "面部特写": "面部特写",
    "头肩近景": "头肩近景",
    "胸部以上": "胸部以上近景",
    "腰部以上": "腰部以上半身",
    "坐姿半身": "坐姿半身构图",
    "三分之二身": "三分之二身构图",
    "全身构图": "全身构图",
    "带环境全身": "带环境全身构图",
    "环境人像": "环境人像构图",
    "局部特写": "局部特写",
    "动态全身": "动态全身构图",
}


def _camera_prompt_text(fields: Mapping[str, str], density: str) -> str:
    """Compose atomic camera controls as one coherent photography clause."""

    active = {
        field_name: fields.get(field_name, EMPTY_CHOICE)
        for field_name in CAMERA_OUTPUT_FIELDS
        if fields.get(field_name, EMPTY_CHOICE) != EMPTY_CHOICE
    }
    if not active:
        return ""

    if density == "详细":
        parts = []
        for field_name in CAMERA_OUTPUT_FIELDS:
            value = active.get(field_name)
            if not value:
                continue
            if field_name == "拍摄距离":
                parts.append(f"摄影机距离约{value}")
            else:
                parts.append(FIELD_TEXT[field_name][value])
        return "，".join(part.rstrip("，；。 ") for part in parts)

    parts = []
    if "景别" in active:
        parts.append(_CAMERA_SHOT_STANDARD.get(active["景别"], active["景别"]))
    if "画面布局" in active:
        parts.append(active["画面布局"])
    if "等效焦段" in active:
        lens = active["等效焦段"]
        parts.append(lens if lens == "手机主摄" else f"{lens}镜头")
    # Exact distance is intentionally reserved for detailed density. It is a
    # useful expert control but redundant in the default natural-language prompt.
    if "机位" in active:
        parts.append(_CAMERA_ANGLE_STANDARD.get(active["机位"], active["机位"]))
    if "景深" in active:
        parts.append(active["景深"])
    if "对焦位置" in active:
        parts.append(f"对焦{active['对焦位置']}")
    return "，".join(parts)


def _standard_text(fields: Mapping[str, str], field_name: str) -> str:
    value = fields[field_name]
    return STANDARD_FIELD_TEXT.get(field_name, {}).get(
        value, FIELD_TEXT[field_name][value]
    )


def _visual_prompt_text(fields: Mapping[str, str], density: str) -> str:
    active = {
        field_name: fields[field_name]
        for field_name in VISUAL_OUTPUT_FIELDS
        if fields.get(field_name) not in (None, EMPTY_CHOICE)
    }
    if not active:
        return ""

    if density == "详细":
        sections = []
        for field_group in (
            LIGHTING_OUTPUT_FIELDS, COLOR_OUTPUT_FIELDS, FINISH_OUTPUT_FIELDS
        ):
            values = [
                FIELD_TEXT[field_name][active[field_name]].rstrip("，；。 ")
                for field_name in field_group
                if field_name in active
            ]
            if values:
                sections.append("，".join(values))
        return "；".join(sections)

    lighting = []
    if "主光来源" in active:
        lighting.append(active["主光来源"])
    if "光线方向" in active:
        direction = f"从{active['光线方向']}"
        if lighting:
            lighting[-1] += direction
        else:
            lighting.append(direction)
    if "照明落点" in active:
        target = f"照亮{active['照明落点']}"
        if lighting:
            lighting[-1] += target
        else:
            lighting.append(target)
    effects = []
    if "光线质地" in active:
        effects.append(active["光线质地"])
    if "阴影表现" in active:
        effects.append(active["阴影表现"])
    if effects:
        lighting.append(f"呈现{'与'.join(effects)}")

    color = []
    if "主配色" in active:
        color.append(f"{active['主配色']}主配色")
    if "色温倾向" in active:
        color.append(active["色温倾向"])
    if "画面对比" in active:
        color.append(active["画面对比"])

    finish = []
    finish_detail_fields = ("细节质地", "高光处理", "颗粒质感")
    if "影像风格" in active and not any(
        field_name in active for field_name in finish_detail_fields
    ):
        finish.append(active["影像风格"])
    for field_name in finish_detail_fields:
        if field_name in active:
            finish.append(active[field_name])

    sections = []
    if lighting:
        if density == "精简":
            sections.append("，".join(lighting[:2]))
        else:
            sections.append("，".join(lighting))
    if color:
        sections.append("，".join(color[:2] if density == "精简" else color))
    if finish:
        sections.append("、".join(finish[:2] if density == "精简" else finish))
    return "；".join(sections)



def _normalize_user_module_fragment(value: str) -> str:
    """Trim only outer separators so imported Chinese prose joins cleanly."""

    if not isinstance(value, str):
        return ""
    return value.strip().strip("，；。,. ;\t\r\n")


def _terminate_chinese_prompt(text: str) -> str:
    """End a generated section without stacking punctuation onto user prose."""
    text = text.strip().rstrip("，；,; ")
    if not text or text.endswith(tuple("。！？.!?…")):
        return text
    return f"{text}。"


def _module_paragraphs(parts: Iterable[str]) -> str:
    """One positive-language paragraph per nonempty module, without labels."""
    clean = (_terminate_chinese_prompt(part) for part in parts)
    return "\n\n".join(part for part in clean if part)


def join_prompt_paragraphs(first: str, second: str) -> str:
    """Keep user text intact; whitespace-only inputs do not add empty paragraphs."""
    return "\n\n".join(part for part in (first, second) if part and part.strip())


def compose_prompt_text(
    fields: Mapping[str, str],
    density: str = "标准",
    user_person_fragment: str = "",
    user_pose_fragment: str = "",
    user_module_fragments: Mapping[str, str] | None = None,
    separate_modules: bool = False,
    module_fragments: Dict[str, str] | None = None,
) -> str:
    """Compose a positive prompt at the requested information density."""

    if density not in PROMPT_DENSITIES:
        density = "标准"

    def record_fragments(values):
        if module_fragments is not None:
            module_fragments.update(zip(USER_MODULE_INPUTS, values))

    record_fragments([""] * len(USER_MODULE_INPUTS))

    brief = lambda field: _brief_text(fields, field)
    full = lambda field: FIELD_TEXT[field][fields[field]]
    standard = lambda field: _standard_text(fields, field)
    identity = _person_identity_text(fields)
    person_detail_text = _person_detail_prompt_text(fields, density)
    body_text = _body_prompt_text(fields, density)
    supplied_modules = user_module_fragments or {}
    user_modules = {
        module_name: _normalize_user_module_fragment(supplied_modules.get(module_name, ""))
        for module_name in USER_MODULE_INPUTS
    }
    if not user_modules["人物"]:
        user_modules["人物"] = _normalize_user_module_fragment(user_person_fragment)
    if not user_modules["姿态动作"]:
        user_modules["姿态动作"] = _normalize_user_module_fragment(user_pose_fragment)
    user_base_text = user_modules["画面基础"]
    user_person_text = user_modules["人物"]
    user_hair_text = user_modules["发型"]
    user_clothing_text = user_modules["服装"]
    user_pose_text = user_modules["姿态动作"]
    user_scene_text = user_modules["场景"]
    user_camera_text = user_modules["摄影"]
    user_visual_text = user_modules["视觉表现"]
    user_custom_text = user_modules["自定义"]
    person_core_text = user_person_text or "，".join(
        part for part in (identity, person_detail_text, body_text) if part
    )
    pose_core_text = user_pose_text or _pose_prompt_text(fields, density)
    standard_pose_core_text = user_pose_text or (
        f"人物{pose_core_text}"
        if pose_core_text and not pose_core_text.startswith("人物")
        else pose_core_text
    )

    # When any module is disabled, compose only the modules the user kept.
    # This makes the clear button a blank canvas for partial prompts.
    output_fields = [field for field in FIELD_ORDER if field not in CONTROL_ONLY_FIELDS]
    base_output_fields = ("画面比例", "成像媒介", "写真主题")
    active_clothing_fields = set(CLOTHING_MODE_FIELDS.get(
        fields.get("穿搭结构", EMPTY_CHOICE), ()
    ))
    inactive_clothing_fields = set(CLOTHING_BRANCH_FIELDS) - active_clothing_fields
    makeup_mode = fields.get("妆容模式", EMPTY_CHOICE)
    if makeup_mode == "整体预设":
        inactive_makeup_fields = set(MAKEUP_CUSTOM_FIELDS)
        hidden_makeup_fields = inactive_makeup_fields
    elif makeup_mode == "分项自定义":
        inactive_makeup_fields = {"整体妆容预设"}
        hidden_makeup_fields = inactive_makeup_fields
    else:
        inactive_makeup_fields = {"整体妆容预设", *MAKEUP_CUSTOM_FIELDS}
        # Blank-canvas mode has no active dependency branch. An explicitly
        # selected makeup atom remains independently useful in that state.
        hidden_makeup_fields = set()
    optional_output_fields = {
        *HAIR_ADVANCED_FIELDS,
        "头部配饰",
        *inactive_makeup_fields,
        *CLOTHING_OPTIONAL_FIELDS,
        *inactive_clothing_fields,
        "天气状态",
        "空间材质",
    }
    if any(
        fields.get(field) == EMPTY_CHOICE
        for field in output_fields
        if field not in optional_output_fields
    ):
        selected_fields = [
            field
            for field in output_fields
            if fields.get(field) != EMPTY_CHOICE
            and fields.get(field)
            not in DEPENDENCY_PLACEHOLDER_VALUES.get(field, ())
        ]
        if not selected_fields and not identity and not any(user_modules.values()):
            return ""
        formatter = full
        if density == "精简":
            formatter = brief
        elif density == "标准":
            formatter = standard
        parts = []
        grouped_parts = {name: [] for name in USER_MODULE_INPUTS}
        field_modules = {
            field: name for name, group in (
                ("画面基础", base_output_fields),
                ("人物", PERSON_OUTPUT_FIELDS),
                ("发型", HAIR_OUTPUT_FIELDS),
                ("服装", CLOTHING_OUTPUT_FIELDS),
                ("姿态动作", POSE_OUTPUT_FIELDS),
                ("场景", SCENE_OUTPUT_FIELDS),
                ("摄影", CAMERA_OUTPUT_FIELDS),
                ("视觉表现", VISUAL_OUTPUT_FIELDS),
            ) for field in group
        }

        def append_part(text: str) -> None:
            parts.append(text)
            grouped_parts[field_modules.get(field, "自定义")].append(text)

        def append_person_part(text: str) -> None:
            if not text:
                return
            if grouped_parts["人物"]:
                grouped_parts["人物"][-1] = f"{grouped_parts['人物'][-1]}，{text}"
                parts[-1] = f"{parts[-1]}，{text}"
            else:
                append_part(text)

        def group_text_or_atomic_fallback(
            group_text: str,
            group_fields: Sequence[str],
            inactive_fields: Iterable[str] = (),
        ) -> str:
            rendered_group = group_text.rstrip("，；。 ")
            if rendered_group:
                return rendered_group
            inactive = set(inactive_fields)
            atomic_parts = []
            for group_field in group_fields:
                if group_field not in selected_fields or group_field in inactive:
                    continue
                rendered = formatter(group_field).rstrip("，；。 ")
                if rendered:
                    atomic_parts.append(rendered)
            return "，".join(atomic_parts)

        base_added = False
        identity_added = False
        person_detail_added = False
        body_added = False
        hair_added = False
        clothing_added = False
        pose_added = False
        scene_added = False
        camera_added = False
        visual_added = False
        for field in output_fields:
            if field in base_output_fields:
                if not base_added:
                    rendered_base = user_base_text or _base_prompt_text(fields, density)
                    if rendered_base:
                        append_part(rendered_base)
                    base_added = True
                continue
            if field in IDENTITY_FIELDS:
                if not identity_added:
                    if user_person_text:
                        append_person_part(user_person_text)
                    else:
                        identity_text = group_text_or_atomic_fallback(
                            identity, IDENTITY_FIELDS
                        )
                        if identity_text:
                            append_person_part(identity_text)
                    identity_added = True
                continue
            if field in PERSON_DETAIL_OUTPUT_FIELDS:
                if not person_detail_added:
                    if user_person_text:
                        person_detail_added = True
                        continue
                    rendered = group_text_or_atomic_fallback(
                        person_detail_text,
                        PERSON_DETAIL_OUTPUT_FIELDS,
                        hidden_makeup_fields,
                    )
                    if rendered:
                        append_person_part(rendered)
                    person_detail_added = True
                continue
            if field in BODY_OUTPUT_FIELDS:
                if not body_added:
                    if user_person_text:
                        body_added = True
                        continue
                    rendered = group_text_or_atomic_fallback(
                        body_text, BODY_OUTPUT_FIELDS
                    )
                    if rendered:
                        append_person_part(rendered)
                    body_added = True
                continue
            if field in POSE_OUTPUT_FIELDS:
                if not pose_added:
                    if user_pose_text:
                        append_part(user_pose_text)
                    else:
                        rendered = group_text_or_atomic_fallback(
                            pose_core_text, POSE_OUTPUT_FIELDS
                        )
                        if rendered:
                            append_part(rendered)
                    pose_added = True
                continue
            if field in SCENE_OUTPUT_FIELDS:
                if not scene_added:
                    scene_text = user_scene_text or _scene_prompt_text(fields, density)
                    rendered = group_text_or_atomic_fallback(
                        scene_text, SCENE_OUTPUT_FIELDS
                    )
                    if rendered:
                        append_part(rendered)
                    scene_added = True
                continue
            if field in CAMERA_OUTPUT_FIELDS:
                if not camera_added:
                    camera_text = user_camera_text or _camera_prompt_text(fields, density)
                    rendered = group_text_or_atomic_fallback(
                        camera_text, CAMERA_OUTPUT_FIELDS
                    )
                    if rendered:
                        append_part(rendered)
                    camera_added = True
                continue
            if field in VISUAL_OUTPUT_FIELDS:
                if not visual_added:
                    visual_text = user_visual_text or _visual_prompt_text(fields, density)
                    rendered = group_text_or_atomic_fallback(
                        visual_text, VISUAL_OUTPUT_FIELDS
                    )
                    if rendered:
                        append_part(rendered)
                    visual_added = True
                continue
            if field in CLOTHING_OUTPUT_FIELDS:
                if not clothing_added:
                    clothing_text = user_clothing_text or _clothing_prompt_text(fields, density)
                    rendered = group_text_or_atomic_fallback(
                        clothing_text, CLOTHING_OUTPUT_FIELDS
                    )
                    if rendered:
                        append_part(rendered)
                    clothing_added = True
                continue
            if field in HAIR_OUTPUT_FIELDS:
                if not hair_added:
                    hair_text = user_hair_text or _hair_prompt_text(fields, density)
                    rendered = group_text_or_atomic_fallback(
                        hair_text, HAIR_OUTPUT_FIELDS
                    )
                    if rendered:
                        append_part(rendered)
                    hair_added = True
                continue
            if fields.get(field) != EMPTY_CHOICE:
                append_part(formatter(field).rstrip("，；。 "))
        if user_custom_text:
            parts.append(user_custom_text)
        grouped_parts["自定义"] = [user_custom_text]
        record_fragments([
            "；".join(part for part in values if part)
            for values in grouped_parts.values()
        ])
        if separate_modules:
            return _module_paragraphs(
                "；".join(part for part in values if part)
                for values in grouped_parts.values()
            )
        prompt_body = "；".join(part for part in parts if part)
        return _terminate_chinese_prompt(prompt_body)

    if density == "精简":
        base_text = user_base_text or _base_prompt_text(fields, density)
        hair_text = user_hair_text or _hair_prompt_text(fields, density)
        clothing_text = user_clothing_text or _clothing_prompt_text(fields, density)
        scene_text = user_scene_text or _scene_prompt_text(fields, density)
        camera_text = user_camera_text or _camera_prompt_text(fields, density)
        visual_text = user_visual_text or _visual_prompt_text(fields, density)
        record_fragments((base_text, person_core_text, hair_text, clothing_text,
                          pose_core_text, scene_text, camera_text, visual_text, user_custom_text))
        if separate_modules:
            return _module_paragraphs((
                base_text, person_core_text, hair_text, clothing_text,
                pose_core_text, scene_text, camera_text, visual_text, user_custom_text,
            ))
        segments = [
            f"{base_text}；",
            f"{person_core_text}，{hair_text}，{clothing_text}；",
            f"{pose_core_text}；",
            f"{scene_text}；",
            f"{visual_text}；",
            _terminate_chinese_prompt(camera_text),
        ]
        if user_custom_text:
            segments.append(_terminate_chinese_prompt(user_custom_text))
        return "".join(segments)

    if density == "标准":
        base_text = user_base_text or _base_prompt_text(fields, density)
        hair_text = user_hair_text or _hair_prompt_text(fields, density)
        clothing_text = user_clothing_text or _clothing_prompt_text(fields, density)
        scene_text = user_scene_text or _scene_prompt_text(fields, density)
        camera_text = user_camera_text or _camera_prompt_text(fields, density)
        visual_text = user_visual_text or _visual_prompt_text(fields, density)
        record_fragments((base_text, person_core_text, hair_text, clothing_text,
                          standard_pose_core_text, scene_text, camera_text, visual_text, user_custom_text))
        if separate_modules:
            return _module_paragraphs((
                base_text, person_core_text, hair_text, clothing_text,
                standard_pose_core_text, scene_text, camera_text, visual_text, user_custom_text,
            ))
        segments = [
            f"{_terminate_chinese_prompt(base_text)}{person_core_text}；",
            f"{hair_text}；{_terminate_chinese_prompt(clothing_text)}",
            _terminate_chinese_prompt(standard_pose_core_text),
            _terminate_chinese_prompt(scene_text),
            _terminate_chinese_prompt(visual_text),
            _terminate_chinese_prompt(camera_text),
        ]
        if user_custom_text:
            segments.append(_terminate_chinese_prompt(user_custom_text))
        return "".join(segments)

    base_text = user_base_text or _base_prompt_text(fields, density)
    hair_text = user_hair_text or _hair_prompt_text(fields, density)
    clothing_text = user_clothing_text or _clothing_prompt_text(fields, density)
    scene_text = user_scene_text or _scene_prompt_text(fields, density)
    camera_text = user_camera_text or _camera_prompt_text(fields, density)
    visual_text = user_visual_text or _visual_prompt_text(fields, density)
    record_fragments((base_text, person_core_text, hair_text, clothing_text,
                      standard_pose_core_text, scene_text, camera_text, visual_text, user_custom_text))
    if separate_modules:
        return _module_paragraphs((
            base_text, person_core_text, hair_text, clothing_text,
            standard_pose_core_text, scene_text, camera_text, visual_text, user_custom_text,
        ))
    segments = [
        f"{base_text}，{person_core_text}；",
        f"{hair_text}；{clothing_text}；",
        f"{standard_pose_core_text}；",
        f"{scene_text}；",
        f"{visual_text}；",
        _terminate_chinese_prompt(camera_text),
    ]
    if user_custom_text:
        segments.append(_terminate_chinese_prompt(user_custom_text))
    return "".join(segments)


def join_prompt_text(
    free_prompt: str,
    structured_prompt: str,
    position: str,
) -> str:
    """Join free text and structured text without rewriting either body."""

    free_text = "" if free_prompt is None or not free_prompt.strip() else free_prompt
    structured_text = ("" if structured_prompt is None or not structured_prompt.strip()
                       else structured_prompt)
    if free_text == "":
        return structured_text
    if structured_text == "":
        return free_text

    if position == "结构化模块在前":
        first, second = structured_text, free_text
    else:
        first, second = free_text, structured_text

    last_content_character = first.rstrip(" \t\r\n")[-1:]
    separator = "" if last_content_character in "，；。,.;！？!?：:" else "；"
    return f"{first}{separator}{second}"




__all__ = [
    "_core_module",
    "set_zh_core",
    "_c",
    "_english_atomic",
    "_base_prompt_text",
    "_brief_text",
    "_person_identity_text",
    "_person_field_prompt_text",
    "_active_makeup_fields",
    "module_atomic_fallback",
    "_person_detail_prompt_text",
    "_body_prompt_text",
    "_person_prompt_text",
    "_hair_prompt_text",
    "_clothing_detail_tail",
    "_garment_prompt_text",
    "_visible_clothing_fields",
    "_clothing_prompt_text",
    "_UPPER_SHOT_NAMES",
    "_FOOT_WEIGHT_VALUES",
    "_visible_pose_fields",
    "_pose_prompt_text",
    "_scene_prompt_text",
    "_CAMERA_ANGLE_STANDARD",
    "_CAMERA_SHOT_STANDARD",
    "_camera_prompt_text",
    "_standard_text",
    "_visual_prompt_text",
    "_normalize_user_module_fragment",
    "_terminate_chinese_prompt",
    "_module_paragraphs",
    "join_prompt_paragraphs",
    "compose_prompt_text",
    "join_prompt_text",
]
