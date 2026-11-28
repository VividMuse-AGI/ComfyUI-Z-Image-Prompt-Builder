"""Deterministic field resolver and compatibility pool selection."""

from __future__ import annotations

import logging
import random
from typing import Dict, Iterable, Mapping, Sequence

try:
    from .prompt_catalog import *  # noqa: F403
except ImportError:
    from prompt_catalog import *  # noqa: F403

_core_module = None


def set_resolver_core(module) -> None:
    global _core_module
    _core_module = module


def _c(name: str, fallback=None):
    if _core_module is not None and hasattr(_core_module, name):
        return getattr(_core_module, name)
    return fallback

def _preset_values(preset: str) -> Dict[str, str]:
    preset = LEGACY_PRESET_NAMES.get(preset, preset)
    if preset not in PRESETS:
        logging.getLogger(_core_module.__name__ if _core_module is not None else __name__).warning(
            "Unknown Z-Image preset %r; using custom defaults", preset
        )
    return dict(PRESETS.get(preset, CUSTOM_DEFAULTS))


def _known_request(field_name: str, value: str) -> bool:
    return value in FIELD_OPTIONS[field_name]


def _choose_from_pool(
    rng: random.Random,
    preset: str,
    random_scope: str,
    field_name: str,
) -> str:
    if random_scope == RANDOM_SCOPES[2]:
        pool = _c('RANDOM_FIELD_OPTIONS', RANDOM_FIELD_OPTIONS)[field_name]
    else:
        profile_pool = PROFILE_POOLS.get(preset, {})
        pool = (profile_pool[field_name] if field_name in profile_pool
                else _c('RANDOM_FIELD_OPTIONS', RANDOM_FIELD_OPTIONS)[field_name])
    return rng.choice(list(pool))


def _matching_bundles(
    bundles: Iterable[Mapping[str, str]],
    group_fields: Sequence[str],
    resolved: Mapping[str, str],
    random_fields: set[str],
) -> list[Mapping[str, str]]:
    locked_fields = [
        field for field in group_fields
        if field not in random_fields
        and resolved.get(field, EMPTY_CHOICE) != EMPTY_CHOICE
    ]
    matches = [
        bundle
        for bundle in bundles
        if all(bundle[field] == resolved[field] for field in locked_fields)
    ]
    return matches


def _compatible_headwear_options(
    hairstyle: str, candidates: Iterable[str], hand_action: str = ""
) -> list[str]:
    candidates = list(candidates)
    compatible = [
        headwear
        for headwear in candidates
        if hairstyle in HEADWEAR_STYLE_COMPATIBILITY.get(headwear, set())
    ]
    if hairstyle in ("", EMPTY_CHOICE):
        compatible = candidates
    required = POSE_HAND_HEADWEAR_REQUIREMENTS.get(hand_action)
    if required:
        required_compatible = [
            headwear for headwear in compatible if headwear in required
        ]
        if required_compatible:
            return required_compatible
        fallback = [
            headwear for headwear in required
            if hairstyle in HEADWEAR_STYLE_COMPATIBILITY.get(headwear, set())
        ]
        if fallback:
            return fallback
    return compatible


def _hair_fallback_bundles(resolved, random_fields):
    """Handle unbundled length/style locks without sampling conflicting updos."""
    def choices(field):
        value = resolved.get(field, EMPTY_CHOICE)
        return [value] if field not in random_fields and value != EMPTY_CHOICE else FIELD_OPTIONS[field]

    bundles = []
    headwear = resolved.get("头部配饰", EMPTY_CHOICE)
    for length in choices("头发长度"):
        for style in choices("发型造型"):
            if length == "精灵短发" and style != "利落短发轮廓":
                continue
            if style == "利落短发轮廓" and length not in ("精灵短发", "齐下巴"):
                continue
            if length == "齐下巴" and style not in ("利落短发轮廓", "自然披散", "单侧披发", "半扎发", "高颅顶"):
                continue
            if ("头部配饰" not in random_fields and headwear in HEADWEAR_STYLE_COMPATIBILITY
                    and style not in HEADWEAR_STYLE_COMPATIBILITY[headwear]):
                continue
            bundle = {"头发长度": length, "发型造型": style,
                      "发质与卷度": "自然顺直", "刘海": "自然露额"}
            for field in ("发质与卷度", "刘海"):
                if field not in random_fields and resolved.get(field, EMPTY_CHOICE) != EMPTY_CHOICE:
                    bundle[field] = resolved[field]
            bundles.append(bundle)
    # Mutually inconsistent literal locks remain untouched; omit random extras.
    return bundles or [{field: EMPTY_CHOICE for field in HAIR_STRUCTURE_FIELDS}]


def _clothing_recipe_values(recipe: Mapping, field_name: str):
    """None means no curated pool; an empty pool deliberately omits the field."""
    overrides = recipe.get("field_overrides", {})
    if field_name in overrides:
        return list(overrides[field_name])
    library_field = _CLOTHING_RECIPE_FIELD_MAP.get(field_name)
    pool = recipe.get("field_pool", {})
    if library_field not in pool:
        return None
    return [CLOTHING_ID_TO_LABEL[field_name][option_id]
            for option_id in pool[library_field]
            if option_id in CLOTHING_ID_TO_LABEL[field_name]]


def _resolved_theme_category(resolved: Mapping[str, str]) -> str:
    theme = resolved.get("写真主题", "")
    return next((category for category, themes in THEME_OPTIONS_BY_CATEGORY.items()
                 if theme in themes), resolved.get("写真大类", ""))


THEME_CAMERA_PURPOSE_IDS = {
    "专业商务头像写真": ("headshot_85", "forest_chest_85", "cafe_chest_50"),
    "服装电商模特写真": ("studio_full_70", "flash_full_65", "street_full_50"),
    "珠宝首饰广告写真": ("beauty_face_105", "headshot_85", "forest_chest_85"),
    "香水商业广告写真": ("forest_chest_85", "cafe_chest_50", "classic_waist_85", "hands_prop_85"),
    "腕表商业广告写真": ("hands_prop_85", "classic_waist_85", "forest_chest_85"),
    "眼镜商业广告写真": ("beauty_face_105", "headshot_85", "forest_chest_85"),
    "手袋商业广告写真": ("fashion_three_quarter_70", "doorway_three_quarter_65", "studio_full_70"),
    "食品饮料广告写真": ("forest_chest_85", "cafe_chest_50", "classic_waist_85", "hands_prop_85"),
}


def _camera_bundle_candidates(preset, random_scope, resolved, random_fields):
    """Select once: locks, pose, then orientation/theme preferences."""
    theme_changed = resolved.get("写真主题") != PRESETS.get(preset, {}).get("写真主题")
    if random_scope == RANDOM_SCOPES[2] or theme_changed:
        preferred = THEME_CATEGORY_CAMERA_BUNDLES.get(
            _resolved_theme_category(resolved), CAMERA_BUNDLES
        )
    else:
        preferred = PROFILE_CAMERA_BUNDLES.get(preset, CAMERA_BUNDLES)

    compatible = list(CAMERA_BUNDLES)
    if "景别" in random_fields:
        compatible = _c('REFERENCE_POOL').camera_candidates(resolved, compatible)
        compatible = _pose_compatible_camera_bundles(resolved.get("基础姿态", ""), compatible)
        purpose_ids = THEME_CAMERA_PURPOSE_IDS.get(resolved.get("写真主题"))
        if purpose_ids:
            purpose_pool = [b for b in compatible if b["id"] in purpose_ids]
            compatible = purpose_pool or compatible
    medium = resolved.get("成像媒介", EMPTY_CHOICE)
    lens_locked = "等效焦段" not in random_fields and resolved.get("等效焦段") == "手机主摄"
    if medium not in (EMPTY_CHOICE, "手机计算摄影") and not lens_locked:
        compatible = [b for b in compatible if b["等效焦段"] != "手机主摄"]

    aspect = resolved.get("画面比例")
    orientation = (LANDSCAPE_CAMERA_BUNDLES if aspect in LANDSCAPE_ASPECTS else
                   PORTRAIT_CAMERA_BUNDLES if aspect in PORTRAIT_ASPECTS else compatible)
    oriented = [b for b in compatible if b in orientation]
    pools = [
        [b for b in oriented if b in preferred], oriented,
        [b for b in compatible if b in preferred], compatible,
    ]
    for pool in pools:
        matches = _matching_bundles(pool, CAMERA_OUTPUT_FIELDS, resolved, random_fields)
        if matches:
            return matches

    # When locks do not form a stock bundle, keep the shot-size companions
    # coherent first. Remaining explicit values will still not be overwritten.
    shot = resolved.get("景别", EMPTY_CHOICE)
    if "景别" not in random_fields and shot != EMPTY_CHOICE:
        shot_matches = [b for b in compatible if b["景别"] == shot]
        if shot_matches:
            compatible = shot_matches
    locked = [f for f in CAMERA_OUTPUT_FIELDS if f not in random_fields
              and resolved.get(f, EMPTY_CHOICE) != EMPTY_CHOICE]
    score = lambda b: sum(b[f] == resolved[f] for f in locked)
    best = max(map(score, compatible))
    best_pool = [b for b in compatible if score(b) == best]
    oriented_best = [b for b in best_pool if b in orientation]
    return oriented_best or best_pool


def _clothing_recipe_candidates(
    preset: str,
    random_scope: str,
    resolved: Mapping[str, str],
    random_fields: set[str],
) -> list[Mapping]:
    theme = resolved.get("写真主题", "")
    recipe_ids = _c('_COMBINATION_RULES', _COMBINATION_RULES)["theme_recipe_ids"].get(theme)
    if not recipe_ids:
        recipe_ids = _c('_COMBINATION_RULES', _COMBINATION_RULES)["category_recipe_ids"].get(
            _resolved_theme_category(resolved)
        )
    if recipe_ids:
        recipes = [CLOTHING_RECIPE_BY_ID[recipe_id] for recipe_id in recipe_ids]
    elif random_scope == RANDOM_SCOPES[2]:
        recipes = list(CLOTHING_RECIPES)
    else:
        recipes = [CLOTHING_RECIPE_BY_ID[recipe_id] for recipe_id in
                   CLOTHING_PROFILE_RECIPE_IDS.get(preset, ())] or list(CLOTHING_RECIPES)

    overrides = _c('_COMBINATION_RULES', _COMBINATION_RULES)["theme_field_overrides"].get(theme, {})
    if overrides:
        recipes = [{**recipe, "field_overrides": overrides} for recipe in recipes]

    locked_mode = resolved.get("穿搭结构") if "穿搭结构" not in random_fields else None
    locked_branches = {
        f for f in CLOTHING_BRANCH_FIELDS if f not in random_fields
        and resolved.get(f, EMPTY_CHOICE) != EMPTY_CHOICE
    }
    allowed_modes = None
    if locked_mode not in (None, EMPTY_CHOICE):
        allowed_modes = [locked_mode]
    elif "穿搭结构" in random_fields and locked_branches:
        allowed_modes = [mode for mode, fields in CLOTHING_MODE_FIELDS.items()
                         if locked_branches.issubset(fields)]

    def accepts_mode(recipe):
        return allowed_modes is None or bool(set(allowed_modes).intersection(
            _c('_clothing_recipe_values', _clothing_recipe_values)(recipe, "穿搭结构") or ()))

    fallback = [r for r in CLOTHING_RECIPES if accepts_mode(r)]
    if allowed_modes:
        # A concrete garment also constrains a random structure. Theme pools
        # must not silently erase it when they only contain another structure.
        recipes = [r for r in recipes if accepts_mode(r)] or fallback

    active_branches = (set(CLOTHING_MODE_FIELDS[locked_mode])
                       if locked_mode in CLOTHING_MODE_FIELDS else set(CLOTHING_BRANCH_FIELDS))
    locked_types = [f for f in locked_branches & active_branches if f.endswith("类型")]
    if locked_types:
        def accepts_types(recipe):
            return all(resolved[f] in (_c('_clothing_recipe_values', _clothing_recipe_values)(recipe, f) or ())
                       for f in locked_types)
        matching_types = ([r for r in recipes if accepts_types(r)]
                          or [r for r in fallback if accepts_types(r)])
        if not matching_types:
            # Specialist garments such as yoga bodysuits live in theme
            # overrides, not in the original core recipe IDs.
            for theme_name, fields in _c('_COMBINATION_RULES', _COMBINATION_RULES)["theme_field_overrides"].items():
                for recipe_id in _c('_COMBINATION_RULES', _COMBINATION_RULES)["theme_recipe_ids"].get(theme_name, ()):
                    candidate = {**CLOTHING_RECIPE_BY_ID[recipe_id], "field_overrides": fields}
                    if accepts_mode(candidate) and accepts_types(candidate):
                        matching_types.append(candidate)
        recipes = matching_types or recipes

    matched = []
    for recipe in recipes:
        compatible = True
        for field_name in _CLOTHING_RECIPE_FIELD_MAP:
            if field_name in random_fields or field_name == "穿搭结构":
                continue
            selected = resolved.get(field_name, EMPTY_CHOICE)
            if selected == EMPTY_CHOICE:
                continue
            values = _c('_clothing_recipe_values', _clothing_recipe_values)(recipe, field_name)
            if values is not None and selected not in values:
                compatible = False
                break
        if compatible:
            matched.append(recipe)
    return matched or recipes or list(CLOTHING_RECIPES)


def _random_clothing_value(
    rng: random.Random,
    field_name: str,
    recipe: Mapping,
) -> str:
    curated = _c('_clothing_recipe_values', _clothing_recipe_values)(recipe, field_name)
    if curated is not None:
        return rng.choice(curated) if curated else EMPTY_CHOICE
    if field_name == "服装配件":
        # Manual options stay intact; both random single items and sets are curated.
        choices = list(_c('_COMBINATION_RULES', _COMBINATION_RULES)["accessory_recipe_values"].get(recipe.get("id"), ()))
        choices.extend(ACCESSORY_SET_LABELS[bundle_id] for bundle_id in
                       ACCESSORY_SET_RECIPE_IDS.get(recipe.get("id"), ()))
        return rng.choice(choices) if choices else EMPTY_CHOICE
    if field_name == "版型细节":
        return rng.choice(_c('RANDOM_FIELD_OPTIONS', RANDOM_FIELD_OPTIONS)[field_name])
    library_field_id = _CLOTHING_RECIPE_FIELD_MAP.get(field_name)
    recipe_ids = recipe.get("field_pool", {}).get(library_field_id, [])
    labels = [
        CLOTHING_ID_TO_LABEL[field_name][option_id]
        for option_id in recipe_ids
        if option_id in CLOTHING_ID_TO_LABEL[field_name]
    ]
    if labels:
        return rng.choice(labels)
    if field_name in CLOTHING_OPTIONAL_FIELDS:
        return EMPTY_CHOICE
    return rng.choice(_c('RANDOM_FIELD_OPTIONS', RANDOM_FIELD_OPTIONS)[field_name])


def _garment_property_limits(garment: str) -> dict[str, tuple[str, ...]]:
    """Properties already stated in a garment name must not contradict it."""
    limits = {}
    for keyword, materials in (
        ("细罗纹", ("细罗纹针织",)),
        ("针织", ("细罗纹针织", "柔软针织", "羊毛针织")),
        ("牛仔", ("牛仔",)), ("缎面", ("缎面",)),
        ("蕾丝", ("蕾丝",)), ("棉麻", ("棉麻",)),
        ("纱裙", ("薄纱", "欧根纱")),
        ("皮", ("哑光皮革", "漆皮", "麂皮")),
        ("亮片", ("亮片面料",)), ("比基尼", ("泳装弹力面料",)),
    ):
        if keyword in garment:
            limits.setdefault("材质", materials)
    if "白衬衫" in garment:
        limits["颜色"] = ("奶油白", "象牙白")
    if "小黑裙" in garment:
        limits["颜色"] = ("玄黑色",)
    if "碎花" in garment:
        limits["图案"] = ("细小碎花",)
    if "格纹" in garment:
        limits["图案"] = ("细格纹", "大格纹")
    return limits


def _cohere_random_clothing(rng, recipe, resolved, automatic_fields):
    """Constrain automatic choices only; literal choices and omissions win."""
    for branch in ("连衣裙", "连体服", "上装", "下装"):
        type_field = branch + "类型"
        garment = resolved.get(type_field, EMPTY_CHOICE)
        if garment == EMPTY_CHOICE:
            continue
        if type_field in automatic_fields:
            def accepts_locks(candidate):
                return all(
                    branch + suffix in automatic_fields
                    or resolved.get(branch + suffix, EMPTY_CHOICE) in (EMPTY_CHOICE, *allowed)
                    for suffix, allowed in _garment_property_limits(candidate).items()
                )
            if not accepts_locks(garment):
                choices = [v for v in (_c('_clothing_recipe_values', _clothing_recipe_values)(recipe, type_field) or ())
                           if accepts_locks(v)]
                garment = rng.choice(choices) if choices else EMPTY_CHOICE
                resolved[type_field] = garment
        for suffix, allowed in _garment_property_limits(garment).items():
            field = branch + suffix
            if field not in automatic_fields or resolved.get(field) in (EMPTY_CHOICE, *allowed):
                continue
            choices = [v for v in (_c('_clothing_recipe_values', _clothing_recipe_values)(recipe, field) or ()) if v in allowed]
            choices = choices or [v for v in allowed if v in FIELD_OPTIONS[field]]
            resolved[field] = rng.choice(choices) if choices else EMPTY_CHOICE

    if "版型细节" not in automatic_fields or resolved.get("版型细节") == EMPTY_CHOICE:
        return
    # Unqualified neckline/sleeve details describe the upper garment, not trousers.
    upper = next((resolved.get(f) for f in ("连衣裙类型", "连体服类型", "上装类型")
                  if resolved.get(f, EMPTY_CHOICE) != EMPTY_CHOICE), "")
    detail = resolved["版型细节"]
    incompatible = (
        (detail in ("泡泡袖", "灯笼袖") and any(k in upper for k in
            ("吊带", "挂脖", "无袖", "背心", "抹胸", "马甲", "单肩")))
        or (detail in ("深V领口", "方形领口", "船形领口", "抹胸设计")
            and any(k in upper for k in ("高领", "挂脖", "船领")))
        or (detail in ("高领结构", "抹胸设计")
            and any(k in upper for k in ("吊带", "挂脖", "露肩", "一字肩", "单肩", "抹胸")))
        or (detail == "侧开衩" and not any("裙" in resolved.get(f, "")
            for f in ("连衣裙类型", "下装类型")))
        or (detail == "露脐设计" and resolved.get("穿搭结构") in ("连衣裙", "连体服"))
    )
    if incompatible:
        resolved["版型细节"] = EMPTY_CHOICE


def _resolve_clothing_fields(
    rng: random.Random,
    preset: str,
    random_scope: str,
    requested: Mapping[str, str],
    resolved: Dict[str, str],
    random_fields: set[str],
) -> set[str]:
    active_random = random_fields.intersection(CLOTHING_OUTPUT_FIELDS)
    mode_request = requested.get("穿搭结构", FOLLOW_PRESET)
    mode_changed = (
        mode_request in FIELD_OPTIONS["穿搭结构"]
        and mode_request != PRESETS.get(preset, {}).get("穿搭结构")
    )
    if not active_random and not mode_changed:
        return set()

    recipes = _clothing_recipe_candidates(
        preset, random_scope, resolved, random_fields
    )
    recipe = rng.choice(recipes)
    locked_branch_fields = {
        field_name for field_name in CLOTHING_BRANCH_FIELDS
        if field_name not in random_fields
        and resolved.get(field_name, EMPTY_CHOICE) != EMPTY_CHOICE
    }
    conflicting_branches = False
    if "穿搭结构" in active_random:
        mode_choices = (_c('_clothing_recipe_values', _clothing_recipe_values)(recipe, "穿搭结构")
                        or FIELD_OPTIONS["穿搭结构"])
        if locked_branch_fields:
            compatible_modes = [mode for mode, fields in CLOTHING_MODE_FIELDS.items()
                                if locked_branch_fields.issubset(fields)]
            if compatible_modes:
                mode_choices = [mode for mode in mode_choices if mode in compatible_modes] or compatible_modes
            else:
                # No structure can contain every explicit branch. Keep those
                # atoms and omit additional random garments instead of losing data.
                conflicting_branches = True
                mode_choices = [EMPTY_CHOICE]
        resolved["穿搭结构"] = rng.choice(mode_choices)

    mode = resolved.get("穿搭结构", EMPTY_CHOICE)
    visible_fields = set(CLOTHING_MODE_FIELDS.get(mode, CLOTHING_BRANCH_FIELDS))
    if conflicting_branches:
        visible_fields = locked_branch_fields
    required_visible = {
        field for field in visible_fields
        if not field.endswith("图案")
    }

    automatic_fields = set(active_random)
    for field_name in CLOTHING_BRANCH_FIELDS:
        if field_name not in visible_fields:
            resolved[field_name] = EMPTY_CHOICE
            continue
        should_randomize = field_name in active_random
        should_fill_new_branch = (
            mode_changed
            and field_name in required_visible
            and requested.get(field_name, FOLLOW_PRESET) == FOLLOW_PRESET
            and resolved.get(field_name, EMPTY_CHOICE) == EMPTY_CHOICE
        )
        if should_randomize or should_fill_new_branch:
            automatic_fields.add(field_name)
            resolved[field_name] = _random_clothing_value(
                rng, field_name, recipe
            )

    for field_name in ("版型细节", "袜装", "鞋履", "服装配件"):
        if field_name in active_random:
            resolved[field_name] = _random_clothing_value(
                rng, field_name, recipe
            )
    _cohere_random_clothing(rng, recipe, resolved, automatic_fields)
    return active_random


def resolve_fields(
    preset: str,
    random_scope: str,
    seed: int,
    requested: Mapping[str, str],
    *,
    request_trace: Dict[str, str] | None = None,
    sampling_trace: SamplingTrace | None = None,
    coherence: CoherencePass | None = None,
) -> Dict[str, str]:
    """Resolve presets, explicit locks and deterministic random fields."""

    if coherence is not None:
        coherence.reset()

    preset = LEGACY_PRESET_NAMES.get(preset, preset)
    random_scope = LEGACY_RANDOM_SCOPES.get(random_scope, random_scope)
    if random_scope not in RANDOM_SCOPES:
        random_scope = RANDOM_SCOPES[0]

    requested = dict(requested)
    _c('REFERENCE_POOL').prepare_request(requested)
    requested_age = requested.get("年龄阶段")
    if requested_age in LEGACY_AGE_STAGES:
        requested["年龄阶段"] = LEGACY_AGE_STAGES[requested_age]
    legacy_light = requested.get("光线方案")
    if legacy_light == RANDOM_CHOICE:
        for field_name in LIGHTING_OUTPUT_FIELDS:
            requested.setdefault(field_name, RANDOM_CHOICE)
    elif legacy_light == EMPTY_CHOICE:
        for field_name in LIGHTING_OUTPUT_FIELDS:
            requested.setdefault(field_name, EMPTY_CHOICE)
    elif legacy_light in _LEGACY_LIGHTING_PLAN_IDS:
        legacy_plan = LIGHTING_PLAN_BY_ID[_LEGACY_LIGHTING_PLAN_IDS[legacy_light][0]]
        for field_name in LIGHTING_OUTPUT_FIELDS:
            requested.setdefault(field_name, legacy_plan[field_name])

    legacy_visual_profile_ids = {
        "嫩绿与白色高明度": "japanese_summer_film",
        "暖棕奶白肤色": "warm_cafe_digital",
        "黑红金暖灰": "night_flash_fashion",
        "职场暖灰酒红点缀": "office_luxury_clean",
        "奶油暖白低饱和": "phone_natural",
        "青橙都市夜色": "urban_neon_cinema",
        "高级灰黑白配色": "studio_neutral_commercial",
        "木色墨黑米白": "new_chinese_matte",
        "日系胶片柔焦": "japanese_summer_film",
        "便携数码相机直出": "warm_cafe_digital",
        "直接闪光商业写真": "night_flash_fashion",
        "细腻商业精修柔焦": "office_luxury_clean",
        "真实手机摄影质感": "phone_natural",
        "都市胶片颗粒": "urban_neon_cinema",
        "影棚杂志精修": "clean_beauty_editorial",
        "新中式柔和电影感": "new_chinese_matte",
    }
    legacy_visual_values = [
        requested.get("成像质感"),
        requested.get("色彩方案"),
    ]
    if RANDOM_CHOICE in legacy_visual_values:
        for field_name in (*COLOR_OUTPUT_FIELDS, *FINISH_OUTPUT_FIELDS):
            requested.setdefault(field_name, RANDOM_CHOICE)
    elif legacy_visual_values and all(
        value in (None, EMPTY_CHOICE) for value in legacy_visual_values
    ) and any(value == EMPTY_CHOICE for value in legacy_visual_values):
        for field_name in (*COLOR_OUTPUT_FIELDS, *FINISH_OUTPUT_FIELDS):
            requested.setdefault(field_name, EMPTY_CHOICE)
    else:
        legacy_profile_id = next((
            legacy_visual_profile_ids[value]
            for value in legacy_visual_values
            if value in legacy_visual_profile_ids
        ), None)
        if legacy_profile_id:
            legacy_profile = VISUAL_PROFILE_BY_ID[legacy_profile_id]
            for field_name in (*COLOR_OUTPUT_FIELDS, *FINISH_OUTPUT_FIELDS):
                requested.setdefault(field_name, legacy_profile[field_name])

    legacy_camera_values = [
        requested.get(field_name)
        for field_name in ("构图景别", "镜头参数", "景深对焦")
        if field_name in requested
    ]
    if RANDOM_CHOICE in legacy_camera_values:
        for field_name in CAMERA_OUTPUT_FIELDS:
            requested.setdefault(field_name, RANDOM_CHOICE)
    elif legacy_camera_values and all(
        value == EMPTY_CHOICE for value in legacy_camera_values
    ):
        for field_name in CAMERA_OUTPUT_FIELDS:
            requested.setdefault(field_name, EMPTY_CHOICE)
    else:
        legacy_bundle_id = next(
            (
                LEGACY_CAMERA_BUNDLE_BY_VALUE[value]
                for value in legacy_camera_values
                if value in LEGACY_CAMERA_BUNDLE_BY_VALUE
            ),
            None,
        )
        if legacy_bundle_id:
            legacy_bundle = CAMERA_BUNDLE_BY_ID[legacy_bundle_id]
            for field_name in CAMERA_OUTPUT_FIELDS:
                requested.setdefault(field_name, legacy_bundle[field_name])

    legacy_clothing = requested.get("服装造型")
    if legacy_clothing in LEGACY_CLOTHING_COMBINATIONS:
        for field_name in CLOTHING_OUTPUT_FIELDS:
            if field_name in CLOTHING_BRANCH_FIELDS:
                requested[field_name] = EMPTY_CHOICE
        requested.update(LEGACY_CLOTHING_COMBINATIONS[legacy_clothing])

    legacy_base = requested.get("基础姿态")
    legacy_action = requested.get("动作链")
    legacy_expression = requested.get("表情视线")
    if legacy_action == RANDOM_CHOICE:
        for field_name in POSE_OUTPUT_FIELDS:
            if field_name not in requested or field_name == "基础姿态":
                requested[field_name] = RANDOM_CHOICE
    else:
        legacy_bundle_id = LEGACY_POSE_BUNDLE_BY_ACTION.get(legacy_action)
        if legacy_bundle_id:
            requested.update({
                field_name: POSE_BUNDLE_BY_ID[legacy_bundle_id][field_name]
                for field_name in POSE_OUTPUT_FIELDS
            })
        elif legacy_action == "双手自然放松":
            requested["手部动作"] = "双臂自然垂落"
    if legacy_base not in (None, FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE):
        legacy_bundle_id = LEGACY_POSE_BUNDLE_BY_BASE.get(legacy_base)
        if legacy_bundle_id:
            for field_name in POSE_OUTPUT_FIELDS:
                requested.setdefault(
                    field_name,
                    POSE_BUNDLE_BY_ID[legacy_bundle_id][field_name],
                )
            requested["基础姿态"] = POSE_BUNDLE_BY_ID[legacy_bundle_id]["基础姿态"]
    if legacy_expression in LEGACY_EXPRESSION_GAZE:
        requested.update(LEGACY_EXPRESSION_GAZE[legacy_expression])

    rng = _c('random', random).Random(int(seed) & MAX_SEED)
    resolved = _preset_values(preset)
    random_fields: set[str] = set()
    if request_trace is not None:
        request_trace.update({name: requested.get(name, FOLLOW_PRESET) for name in FIELD_ORDER})

    for field_name in FIELD_ORDER:
        value = requested.get(field_name, FOLLOW_PRESET)
        if value == EMPTY_CHOICE:
            resolved[field_name] = EMPTY_CHOICE
        elif value == RANDOM_CHOICE:
            random_fields.add(field_name)
        elif _known_request(field_name, value):
            resolved[field_name] = value

    # Resolve the controlling category before any dependent random fields.
    grouped_random_fields: set[str] = set()
    if "画面比例" in random_fields:
        resolved["画面比例"] = _choose_from_pool(rng, preset, random_scope, "画面比例")
        grouped_random_fields.add("画面比例")
    if "写真大类" in random_fields:
        resolved["写真大类"] = _choose_from_pool(
            rng, preset, random_scope, "写真大类"
        )
        grouped_random_fields.add("写真大类")
    if "写真主题" in random_fields:
        theme_pool = THEME_OPTIONS_BY_CATEGORY.get(
            resolved.get("写真大类", ""), tuple(THEME_TEXT)
        )
        resolved["写真主题"] = rng.choice(list(theme_pool))
        grouped_random_fields.add("写真主题")
    if "成像媒介" in random_fields:
        if random_scope == RANDOM_SCOPES[2]:
            medium_pool = THEME_SUBJECT_FIELD_POOLS.get(
                resolved.get("写真主题", ""), {}
            ).get("成像媒介") or THEME_CATEGORY_FIELD_POOLS.get(
                resolved.get("写真大类", ""), {}
            ).get("成像媒介", FIELD_OPTIONS["成像媒介"])
            resolved["成像媒介"] = rng.choice(list(medium_pool))
        else:
            resolved["成像媒介"] = _choose_from_pool(
                rng, preset, random_scope, "成像媒介"
            )
        grouped_random_fields.add("成像媒介")
    capture_medium_id = CAPTURE_MEDIUM_LABEL_TO_ID.get(
        resolved.get("成像媒介", ""), ""
    )
    if "族裔大类" in random_fields:
        resolved["族裔大类"] = _choose_from_pool(
            rng, preset, random_scope, "族裔大类"
        )
        grouped_random_fields.add("族裔大类")
    if "地域族裔分支" in random_fields:
        branch_pool = ETHNICITY_BRANCHES_BY_CATEGORY.get(
            resolved.get("族裔大类", ""), tuple(ETHNICITY_BRANCH_TEXT)
        )
        resolved["地域族裔分支"] = rng.choice(list(branch_pool))
        grouped_random_fields.add("地域族裔分支")

    grouped_random_fields.update(
        _resolve_clothing_fields(
            rng,
            preset,
            random_scope,
            requested,
            resolved,
            random_fields,
        )
    )

    selected_scene_bundle = None
    if random_fields.intersection(LIGHTING_OUTPUT_FIELDS):
        locked_scene_matches = _matching_bundles(
            SCENE_BUNDLES, SCENE_GROUP_FIELDS, resolved, set()
        )
        if locked_scene_matches:
            selected_scene_bundle = locked_scene_matches[0]
    for group_fields, global_bundles, profile_bundles in GROUP_BUNDLES:
        active = random_fields.intersection(group_fields)
        if not active:
            continue

        explicit_scene_locks: Dict[str, str] = {}
        scene_theme_bundles: Sequence[Mapping[str, str]] = ()
        scene_profile_bundles: Sequence[Mapping[str, str]] = ()
        scene_category_or_profile_bundles: Sequence[Mapping[str, str]] = ()
        category = resolved.get("写真大类", "")
        if random_scope == RANDOM_SCOPES[2]:
            if group_fields == POSE_OUTPUT_FIELDS:
                bundles = _theme_directed_pose_bundles(
                    resolved.get("写真主题", "")
                ) or THEME_CATEGORY_POSE_BUNDLES.get(category, global_bundles)
            elif group_fields == SCENE_GROUP_FIELDS:
                theme = resolved.get("写真主题", "")
                scene_theme_bundles = (
                    theme_scene_bundles(theme)
                    or _theme_directed_scene_bundles(theme)
                )
                scene_category_or_profile_bundles = (
                    THEME_CATEGORY_SCENE_BUNDLES.get(
                        category, global_bundles
                    )
                )
                bundles = (
                    scene_theme_bundles
                    or scene_category_or_profile_bundles
                )
            elif group_fields == CAMERA_OUTPUT_FIELDS:
                bundles = THEME_CATEGORY_CAMERA_BUNDLES.get(category, global_bundles)
            elif group_fields == LIGHTING_OUTPUT_FIELDS:
                bundles = THEME_CATEGORY_LIGHTING_PLANS.get(category, global_bundles)
            elif group_fields == (*COLOR_OUTPUT_FIELDS, *FINISH_OUTPUT_FIELDS):
                bundles = THEME_CATEGORY_VISUAL_PROFILES.get(category, global_bundles)
            else:
                bundles = global_bundles
        else:
            bundles = profile_bundles.get(preset, global_bundles)
            if group_fields == POSE_OUTPUT_FIELDS:
                bundles = SPECIALIST_THEME_POSE_BUNDLES.get(
                    resolved.get("写真主题", ""), bundles
                )
                if resolved.get("写真主题") == "瑜伽普拉提生活写真":
                    bundles = _pose_bundles("approved_low_pigeon")
            if group_fields == SCENE_GROUP_FIELDS:
                theme = resolved.get("写真主题", "")
                scene_theme_bundles = (
                    theme_scene_bundles(theme)
                    or _theme_directed_scene_bundles(theme)
                )
                category_bundles = THEME_CATEGORY_SCENE_BUNDLES.get(
                    category, global_bundles
                )
                scene_profile_bundles = bundles
                scene_category_or_profile_bundles = category_bundles
                bundles = (
                    scene_theme_bundles
                    or scene_profile_bundles
                    or scene_category_or_profile_bundles
                )

        if group_fields == LIGHTING_OUTPUT_FIELDS:
            scene_context = {**(selected_scene_bundle or {}),
                             **{f: resolved.get(f, EMPTY_CHOICE) for f in SCENE_GROUP_FIELDS}}
            scene_bundles = _c('_scene_compatible_lighting_plans', _scene_compatible_lighting_plans)(scene_context)
            if scene_bundles:
                scene_ids = {bundle["id"] for bundle in scene_bundles}
                compatible = [bundle for bundle in bundles if bundle["id"] in scene_ids]
                bundles = compatible or scene_bundles
            medium_bundles = CAPTURE_MEDIUM_LIGHTING_PLANS_BY_ID.get(
                capture_medium_id, ()
            )
            if medium_bundles:
                medium_ids = {bundle["id"] for bundle in medium_bundles}
                compatible = [bundle for bundle in bundles if bundle["id"] in medium_ids]
                if compatible:
                    bundles = compatible
            global_bundles = [b for b in global_bundles
                              if _lighting_matches_environment(b, resolved, random_fields)]
            bundles = [b for b in bundles if _lighting_matches_environment(b, resolved, random_fields)] or global_bundles
        elif group_fields == (*COLOR_OUTPUT_FIELDS, *FINISH_OUTPUT_FIELDS):
            medium_bundles = _visual_profile_candidates_for_medium_id(
                capture_medium_id
            )
            medium_ids = {bundle["id"] for bundle in medium_bundles}
            compatible = [bundle for bundle in bundles if bundle["id"] in medium_ids]
            # Physical capture medium outranks theme styling. Unknown future IDs
            # use only the neutral generic photography pool above.
            bundles = compatible or list(medium_bundles)

        if group_fields == HAIR_STRUCTURE_FIELDS:
            headwear = resolved.get("头部配饰", EMPTY_CHOICE)
            headwear_is_locked = (
                "头部配饰" not in random_fields
                and headwear not in (EMPTY_CHOICE, FOLLOW_PRESET)
            )
            if headwear_is_locked and headwear in HEADWEAR_STYLE_COMPATIBILITY:
                allowed_styles = HEADWEAR_STYLE_COMPATIBILITY.get(headwear, set())
                compatible = [
                    bundle for bundle in bundles
                    if bundle["发型造型"] in allowed_styles
                ]
                bundles = compatible
        elif group_fields == POSE_OUTPUT_FIELDS:
            headwear = resolved.get("头部配饰", EMPTY_CHOICE)
            headwear_locked = (
                "头部配饰" not in random_fields
                and headwear not in (EMPTY_CHOICE, FOLLOW_PRESET)
            )
            if headwear_locked:
                compatible = [
                    bundle for bundle in bundles
                    if not POSE_HAND_HEADWEAR_REQUIREMENTS.get(bundle["手部动作"])
                    or headwear in POSE_HAND_HEADWEAR_REQUIREMENTS[bundle["手部动作"]]
                ]
                if compatible:
                    bundles = compatible
        if group_fields == SCENE_GROUP_FIELDS:
            explicit_scene_locks = {
                field_name: requested[field_name]
                for field_name in SCENE_GROUP_FIELDS
                if field_name in requested
                and (
                    requested[field_name] == EMPTY_CHOICE
                    or _known_request(field_name, requested[field_name])
                )
            }

            def matches_explicit_scene_locks(
                bundle: Mapping[str, str],
            ) -> bool:
                return all(
                    bundle[field_name] == value
                    for field_name, value in explicit_scene_locks.items()
                    if value != EMPTY_CHOICE
                )

            candidates = [
                bundle for bundle in scene_theme_bundles
                if matches_explicit_scene_locks(bundle)
            ]
            if not candidates:
                candidates = [
                    bundle for bundle in scene_profile_bundles
                    if matches_explicit_scene_locks(bundle)
                ]
            if not candidates:
                candidates = [
                    bundle for bundle in scene_category_or_profile_bundles
                    if matches_explicit_scene_locks(bundle)
                ]
            if not candidates:
                candidates = [
                    bundle for bundle in global_bundles
                    if matches_explicit_scene_locks(bundle)
                ]
            if not candidates:
                candidates = [
                    bundle for bundle in ALL_LOCATION_THEME_SCENE_BUNDLES
                    if matches_explicit_scene_locks(bundle)
                ]
            if not candidates:
                candidates = [_c('_neutral_scene_bundle_for_explicit_locks', _neutral_scene_bundle_for_explicit_locks)(
                    resolved.get("写真主题", ""), explicit_scene_locks
                )]
        elif group_fields == CAMERA_OUTPUT_FIELDS:
            candidates = _c('_camera_bundle_candidates', _camera_bundle_candidates)(preset, random_scope, resolved, random_fields)
        elif group_fields == HAIR_STRUCTURE_FIELDS:
            candidates = _matching_bundles(bundles, group_fields, resolved, random_fields)
            if not candidates:
                candidates = _matching_bundles(global_bundles, group_fields, resolved, random_fields)
                headwear = resolved.get("头部配饰", EMPTY_CHOICE)
                if "头部配饰" not in random_fields and headwear in HEADWEAR_STYLE_COMPATIBILITY:
                    candidates = [b for b in candidates
                                  if b["发型造型"] in HEADWEAR_STYLE_COMPATIBILITY[headwear]]
            candidates = candidates or _hair_fallback_bundles(resolved, random_fields)
        else:
            candidates = _matching_bundles(
                bundles, group_fields, resolved, random_fields
            )
            explicit_capture_style = requested.get("影像风格")
            medium_capture_styles = (
                {bundle["影像风格"] for bundle in bundles}
                if group_fields == (*COLOR_OUTPUT_FIELDS, *FINISH_OUTPUT_FIELDS)
                and capture_medium_id in CAPTURE_MEDIUM_VISUAL_PROFILES_BY_ID
                else set()
            )
            explicit_capture_style_conflict = (
                explicit_capture_style in FIELD_OPTIONS["影像风格"]
                and explicit_capture_style not in medium_capture_styles
            )
            preserve_known_medium_pool = (
                bool(medium_capture_styles)
                and not explicit_capture_style_conflict
            )
            if not candidates and not preserve_known_medium_pool:
                # A literal physical capture-style lock may intentionally
                # outrank the medium. Ordinary color/finish locks may not.
                candidates = _matching_bundles(
                    global_bundles, group_fields, resolved, random_fields
                )
            candidates = candidates or list(bundles)
        sampling_event = (sampling_trace.record(group_fields, candidates, active, "initial")
                          if sampling_trace is not None else None)
        if coherence is not None and group_fields in (POSE_OUTPUT_FIELDS, SCENE_GROUP_FIELDS):
            coherence.remember("姿态动作" if group_fields == POSE_OUTPUT_FIELDS else "场景", candidates)
        selected_bundle = rng.choice(candidates)
        if sampling_trace is not None:
            sampling_trace.selected(sampling_event, selected_bundle)
        if group_fields == SCENE_GROUP_FIELDS:
            for field_name in SCENE_GROUP_FIELDS:
                if field_name not in explicit_scene_locks:
                    resolved[field_name] = selected_bundle[field_name]
        else:
            for field_name in active:
                resolved[field_name] = selected_bundle[field_name]
        if group_fields == SCENE_GROUP_FIELDS:
            selected_scene_bundle = dict(selected_bundle)
            for field_name in SCENE_GROUP_FIELDS:
                selected_scene_bundle[field_name] = resolved.get(
                    field_name, EMPTY_CHOICE
                )
        grouped_random_fields.update(active)

    for field_name in FIELD_ORDER:
        if field_name in random_fields and field_name not in grouped_random_fields:
            if field_name == "头部配饰":
                profile_pool = PROFILE_POOLS.get(preset, {})
                base_pool = (
                    _c('RANDOM_FIELD_OPTIONS', RANDOM_FIELD_OPTIONS)[field_name]
                    if random_scope == RANDOM_SCOPES[2]
                    else (profile_pool[field_name] if field_name in profile_pool
                          else _c('RANDOM_FIELD_OPTIONS', RANDOM_FIELD_OPTIONS)[field_name])
                )
                compatible_pool = _compatible_headwear_options(
                    resolved.get("发型造型", ""),
                    base_pool,
                    resolved.get("手部动作", ""),
                )
                resolved[field_name] = rng.choice(compatible_pool) if compatible_pool else EMPTY_CHOICE
            else:
                resolved[field_name] = _choose_from_pool(
                    rng, preset, random_scope, field_name
                )

    if resolved.get("发色模式") != "进阶染发":
        for field_name in HAIR_ADVANCED_FIELDS:
            requested_value = requested.get(field_name, FOLLOW_PRESET)
            blank_canvas_atomic_value = (
                requested.get("发色模式") == EMPTY_CHOICE
                and _known_request(field_name, requested_value)
            )
            if not blank_canvas_atomic_value:
                resolved[field_name] = EMPTY_CHOICE

    clothing_mode = resolved.get("穿搭结构", EMPTY_CHOICE)
    if clothing_mode in CLOTHING_MODE_FIELDS:
        visible_clothing_fields = set(CLOTHING_MODE_FIELDS[clothing_mode])
        for field_name in CLOTHING_BRANCH_FIELDS:
            if field_name not in visible_clothing_fields:
                resolved[field_name] = EMPTY_CHOICE

    allowed_themes = THEME_OPTIONS_BY_CATEGORY.get(resolved.get("写真大类", ""))
    requested_theme = requested.get("写真主题", FOLLOW_PRESET)
    explicit_theme_lock = _known_request("写真主题", requested_theme)
    if (
        allowed_themes
        and resolved.get("写真主题") not in allowed_themes
        and requested_theme != EMPTY_CHOICE
        and not explicit_theme_lock
    ):
        resolved["写真主题"] = (
            rng.choice(list(allowed_themes))
            if requested_theme == RANDOM_CHOICE
            else allowed_themes[0]
        )

    allowed_branches = ETHNICITY_BRANCHES_BY_CATEGORY.get(
        resolved.get("族裔大类", "")
    )
    requested_branch = requested.get("地域族裔分支", FOLLOW_PRESET)
    explicit_branch_lock = _known_request("地域族裔分支", requested_branch)
    if (
        allowed_branches
        and resolved.get("地域族裔分支") not in allowed_branches
        and requested_branch != EMPTY_CHOICE
        and not explicit_branch_lock
    ):
        resolved["地域族裔分支"] = (
            rng.choice(list(allowed_branches))
            if requested_branch == RANDOM_CHOICE
            else ETHNICITY_BRANCH_GENERIC
        )

    changed = _c('REFERENCE_POOL').apply(seed, resolved, random_fields)
    if sampling_trace is not None:
        sampling_trace.reference_changed(changed)
    if changed.intersection(("姿态动作", "场景")) and random_fields.intersection(CAMERA_OUTPUT_FIELDS):
        camera_candidates = _c('_camera_bundle_candidates', _camera_bundle_candidates)(preset, random_scope, resolved, random_fields)
        sampling_event = (sampling_trace.record(CAMERA_OUTPUT_FIELDS, camera_candidates, random_fields,
                                                "after_reference") if sampling_trace is not None else None)
        camera = rng.choice(camera_candidates)
        if sampling_trace is not None:
            sampling_trace.selected(sampling_event, camera)
        for field in random_fields.intersection(CAMERA_OUTPUT_FIELDS):
            resolved[field] = camera[field]
    if "场景" in changed and random_fields.intersection(LIGHTING_OUTPUT_FIELDS):
        plans = _c('_scene_compatible_lighting_plans', _scene_compatible_lighting_plans)(resolved)
        plans = [p for p in plans if _lighting_matches_environment(p, resolved, random_fields)]
        compatible = _matching_bundles(plans, LIGHTING_OUTPUT_FIELDS, resolved, random_fields)
        if compatible:
            sampling_event = (sampling_trace.record(LIGHTING_OUTPUT_FIELDS, compatible, random_fields,
                                                    "after_reference") if sampling_trace is not None else None)
            lighting = rng.choice(compatible)
            if sampling_trace is not None:
                sampling_trace.selected(sampling_event, lighting)
            for field in random_fields.intersection(LIGHTING_OUTPUT_FIELDS):
                resolved[field] = lighting[field]

    if coherence is not None:
        coordinated = coherence.apply(
            resolved, random_fields, seed,
            {"姿态动作": POSE_OUTPUT_FIELDS, "场景": SCENE_GROUP_FIELDS},
            changed, THEME_OPTIONS_BY_CATEGORY.get("幻想概念", ()),
        )
        if sampling_trace is not None:
            sampling_trace.coherence_changed(coordinated)
        owned_random = random_fields & coherence.known_fields & coherence.writable_fields
        visible_context = {f: resolved[f] if f in coherence.known_fields else EMPTY_CHOICE for f in FIELD_ORDER}
        if coordinated.intersection(("姿态动作", "场景")) and owned_random.intersection(CAMERA_OUTPUT_FIELDS):
            candidates = _c('_camera_bundle_candidates', _camera_bundle_candidates)(preset, random_scope, visible_context, owned_random)
            before = {f: resolved[f] for f in CAMERA_OUTPUT_FIELDS if f in owned_random}
            if candidates:
                event = (sampling_trace.record(CAMERA_OUTPUT_FIELDS, candidates, owned_random, "after_coherence")
                         if sampling_trace is not None else None)
                camera = coherence.rng(seed, "摄影").choice(candidates)
                if sampling_trace is not None:
                    sampling_trace.selected(event, camera)
                for field in owned_random.intersection(CAMERA_OUTPUT_FIELDS):
                    resolved[field] = camera[field]
            coherence.downstream("摄影", "adjusted" if candidates else "no_candidate", before, resolved, len(candidates))
        elif coordinated.intersection(("姿态动作", "场景")) and any(
            f in coherence.known_fields and resolved[f] != EMPTY_CHOICE for f in CAMERA_OUTPUT_FIELDS
        ):
            coherence.downstream("摄影", "preserved_explicit", {}, {})
        if "场景" in coordinated and owned_random.intersection(LIGHTING_OUTPUT_FIELDS):
            plans = _c('_scene_compatible_lighting_plans', _scene_compatible_lighting_plans)(visible_context)
            plans = [p for p in plans if _lighting_matches_environment(p, visible_context, owned_random)]
            candidates = _matching_bundles(plans, LIGHTING_OUTPUT_FIELDS, visible_context, owned_random)
            before = {f: resolved[f] for f in LIGHTING_OUTPUT_FIELDS if f in owned_random}
            if candidates:
                event = (sampling_trace.record(LIGHTING_OUTPUT_FIELDS, candidates, owned_random, "after_coherence")
                         if sampling_trace is not None else None)
                lighting = coherence.rng(seed, "视觉表现").choice(candidates)
                if sampling_trace is not None:
                    sampling_trace.selected(event, lighting)
                for field in owned_random.intersection(LIGHTING_OUTPUT_FIELDS):
                    resolved[field] = lighting[field]
            coherence.downstream("视觉表现", "adjusted" if candidates else "no_candidate", before, resolved, len(candidates))
        elif "场景" in coordinated and any(
            f in coherence.known_fields and resolved[f] != EMPTY_CHOICE for f in LIGHTING_OUTPUT_FIELDS
        ):
            coherence.downstream("视觉表现", "preserved_explicit", {}, {})

    return resolved


STUDIO_EVENT_INCOMPATIBLE_LOCATIONS = frozenset({
    "公园草地", "沙滩", "都市街道", "繁忙街道路口", "室内泳池",
})


def pose_scene_view(fields: Mapping[str, str], request_trace: Mapping[str, str],
                    *, scene_available: bool) -> Dict[str, str]:
    """Omit only a random studio moment with known conflicting scene context.

    Run after all random pools; never redraw or infer a scene from hidden
    defaults, free text or an opaque TXT replacement. Explicit values survive.
    """
    result = dict(fields)
    if (scene_available
            and request_trace.get("画面瞬间") == RANDOM_CHOICE
            and fields.get("画面瞬间") == "棚拍间隙调整姿态"
            and fields.get("场景地点") in STUDIO_EVENT_INCOMPATIBLE_LOCATIONS):
        result["画面瞬间"] = EMPTY_CHOICE
    return result




__all__ = [
    "_core_module",
    "set_resolver_core",
    "_c",
    "_preset_values",
    "_known_request",
    "_choose_from_pool",
    "_matching_bundles",
    "_compatible_headwear_options",
    "_hair_fallback_bundles",
    "_clothing_recipe_values",
    "_resolved_theme_category",
    "THEME_CAMERA_PURPOSE_IDS",
    "_camera_bundle_candidates",
    "_clothing_recipe_candidates",
    "_random_clothing_value",
    "_garment_property_limits",
    "_cohere_random_clothing",
    "_resolve_clothing_fields",
    "resolve_fields",
    "STUDIO_EVENT_INCOMPATIBLE_LOCATIONS",
    "pose_scene_view",
]
