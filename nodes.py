"""Dropdown-driven Chinese portrait prompt builder for Z-Image."""

from __future__ import annotations

import json
import random
import re
from itertools import product
from pathlib import Path
from typing import Dict, Iterable, Mapping, Sequence


FOLLOW_PRESET = "跟随预设"
RANDOM_CHOICE = "随机抽取"
EMPTY_CHOICE = "不使用"
CUSTOM_PRESET = "自定义组合"
MAX_SEED = 0xFFFFFFFFFFFFFFFF
LEGACY_PRESET_NAMES = {
    "日系森系夏日柔光写真": "日系草地单车夏日柔光写真",
    "古风汉服写真": "古风汉服园林柔光写真",
    "海边假日度假写真": "海边夏日泳装写真",
}

PRESET_OPTIONS = [
    "日系草地单车夏日柔光写真",
    "日系咖啡馆暖调近景人像",
    "夜间室内轻奢硬闪时尚写真",
    "都市职场轻奢坐姿写真",
    "古风汉服园林柔光写真",
    "海边夏日泳装写真",
    "赛博都市夜景写真",
    "影棚水光妆美容特写",
    "落地窗瑜伽塑形写真",
    "旅馆窗边电影静帧",
    CUSTOM_PRESET,
]

RANDOM_SCOPES = [
    "局部微调（动作、表情、色彩、质感）",
    "同主题重拍（保留主题和人物）",
    "跨风格混搭（全部字段）",
]

LEGACY_RANDOM_SCOPES = {
    "轻微变化": RANDOM_SCOPES[0],
    "标准变化": RANDOM_SCOPES[1],
    "大胆探索": RANDOM_SCOPES[2],
}
LEGACY_AGE_STAGES = {
    "60–69岁": "60岁以上",
    "70岁以上": "60岁以上",
}


PROMPT_DENSITIES = ["精简", "标准", "详细"]
PROMPT_JOIN_POSITIONS = ["自由提示词在前", "结构化模块在前"]
USER_MODULE_INPUTS = {
    "画面基础": "用户画面基础片段",
    "人物": "用户人物片段",
    "发型": "用户发型片段",
    "服装": "用户服装片段",
    "姿态动作": "用户姿态动作片段",
    "场景": "用户场景片段",
    "摄影": "用户摄影片段",
    "视觉表现": "用户视觉表现片段",
    "自定义": "用户自定义片段",
}

LIBRARY_ROOT = Path(__file__).resolve().parent / "phrase_library"


def _load_phrase_library(filename: str) -> dict:
    return json.loads((LIBRARY_ROOT / filename).read_text(encoding="utf-8"))


def _render_library_field(library: Mapping, field_id: str) -> Dict[str, str]:
    field = library["fields"][field_id]
    return {
        option["label"]: field["template"].format(value=option["value"])
        for option in field["options"]
    }


def _library_id_to_label(library: Mapping, field_id: str) -> Dict[str, str]:
    return {
        option["id"]: option["label"]
        for option in library["fields"][field_id]["options"]
    }


def _library_label_to_id(library: Mapping, field_id: str) -> Dict[str, str]:
    return {
        option["label"]: option["id"]
        for option in library["fields"][field_id]["options"]
    }


def _library_option_values(library: Mapping, field_id: str) -> Dict[str, str]:
    return {
        option["label"]: option["value"]
        for option in library["fields"][field_id]["options"]
    }


_CORE_LIBRARY = _load_phrase_library("core_v1.json")
_ADVANCED_LIBRARY = _load_phrase_library("advanced_extensions_v1.json")
_COMPATIBILITY_LIBRARY = _load_phrase_library("compatibility_v1.json")
_POSE_LIBRARY = _load_phrase_library("pose_v1.json")
_SCENE_LIBRARY = _load_phrase_library("scene_v1.json")
_CAMERA_VISUAL_LIBRARY = _load_phrase_library("camera_visual_v1.json")
_THEME_MEDIA_LIBRARY: dict = _load_phrase_library("theme_media_v1.json")
_DETAIL_PROPS_LIBRARY: dict = _load_phrase_library("detail_props_v1.json")

CAMERA_LIBRARY_FIELDS = {
    "景别": "camera.shot_size",
    "画面布局": "camera.composition",
    "等效焦段": "camera.lens",
    "拍摄距离": "camera.distance",
    "机位": "camera.angle",
    "景深": "camera.depth",
    "对焦位置": "camera.focus",
}
CAMERA_OUTPUT_FIELDS = tuple(CAMERA_LIBRARY_FIELDS)
CAMERA_FIELD_TEXT = {
    field_name: _render_library_field(_CAMERA_VISUAL_LIBRARY, field_id)
    for field_name, field_id in CAMERA_LIBRARY_FIELDS.items()
}
CAMERA_VALUE_TEXT = {
    field_name: _library_option_values(_CAMERA_VISUAL_LIBRARY, field_id)
    for field_name, field_id in CAMERA_LIBRARY_FIELDS.items()
}
_CAMERA_ID_TO_LABEL = {
    field_name: _library_id_to_label(_CAMERA_VISUAL_LIBRARY, field_id)
    for field_name, field_id in CAMERA_LIBRARY_FIELDS.items()
}

CAMERA_BUNDLES = []
CAMERA_BUNDLE_BY_ID = {}
for _bundle in _CAMERA_VISUAL_LIBRARY["bundles"]["camera_setups"]:
    _converted = {
        field_name: _CAMERA_ID_TO_LABEL[field_name][
            _bundle["fields"][field_id]
        ]
        for field_name, field_id in CAMERA_LIBRARY_FIELDS.items()
    }
    _converted["id"] = _bundle["id"]
    _converted["label"] = _bundle["label"]
    _converted["tags"] = tuple(_bundle.get("tags", ()))
    CAMERA_BUNDLES.append(_converted)
    CAMERA_BUNDLE_BY_ID[_bundle["id"]] = _converted


def _camera_bundles(*bundle_ids: str) -> list[Mapping[str, str]]:
    return [CAMERA_BUNDLE_BY_ID[bundle_id] for bundle_id in bundle_ids]


LIGHTING_LIBRARY_FIELDS = {
    "主光来源": "lighting.source",
    "光线方向": "lighting.direction",
    "光线质地": "lighting.quality",
    "照明落点": "lighting.target",
    "阴影表现": "lighting.shadow",
}
COLOR_LIBRARY_FIELDS = {
    "主配色": "color.palette",
    "色温倾向": "color.temperature",
    "画面对比": "color.contrast",
}
FINISH_LIBRARY_FIELDS = {
    "影像风格": "finish.capture",
    "细节质地": "finish.texture",
    "高光处理": "finish.highlight",
    "颗粒质感": "finish.grain",
}
LIGHTING_OUTPUT_FIELDS = tuple(LIGHTING_LIBRARY_FIELDS)
COLOR_OUTPUT_FIELDS = tuple(COLOR_LIBRARY_FIELDS)
FINISH_OUTPUT_FIELDS = tuple(FINISH_LIBRARY_FIELDS)
VISUAL_OUTPUT_FIELDS = (
    *LIGHTING_OUTPUT_FIELDS,
    *COLOR_OUTPUT_FIELDS,
    *FINISH_OUTPUT_FIELDS,
)
VISUAL_LIBRARY_FIELDS = {
    **LIGHTING_LIBRARY_FIELDS,
    **COLOR_LIBRARY_FIELDS,
    **FINISH_LIBRARY_FIELDS,
}
VISUAL_FIELD_TEXT = {
    field_name: _render_library_field(_CAMERA_VISUAL_LIBRARY, field_id)
    for field_name, field_id in VISUAL_LIBRARY_FIELDS.items()
}
VISUAL_VALUE_TEXT = {
    field_name: _library_option_values(_CAMERA_VISUAL_LIBRARY, field_id)
    for field_name, field_id in VISUAL_LIBRARY_FIELDS.items()
}
_VISUAL_ID_TO_LABEL = {
    field_name: _library_id_to_label(_CAMERA_VISUAL_LIBRARY, field_id)
    for field_name, field_id in VISUAL_LIBRARY_FIELDS.items()
}


def _convert_visual_bundle(bundle: Mapping, field_map: Mapping[str, str]) -> dict:
    converted = {
        field_name: _VISUAL_ID_TO_LABEL[field_name][bundle["fields"][field_id]]
        for field_name, field_id in field_map.items()
    }
    converted["id"] = bundle["id"]
    converted["label"] = bundle["label"]
    converted["tags"] = tuple(bundle.get("tags", ()))
    return converted


LIGHTING_PLANS = [
    _convert_visual_bundle(bundle, LIGHTING_LIBRARY_FIELDS)
    for bundle in _CAMERA_VISUAL_LIBRARY["bundles"]["lighting_plans"]
]
LIGHTING_PLAN_BY_ID = {bundle["id"]: bundle for bundle in LIGHTING_PLANS}
VISUAL_PROFILES = [
    _convert_visual_bundle(bundle, {**COLOR_LIBRARY_FIELDS, **FINISH_LIBRARY_FIELDS})
    for bundle in _CAMERA_VISUAL_LIBRARY["bundles"]["visual_profiles"]
]
VISUAL_PROFILE_BY_ID = {bundle["id"]: bundle for bundle in VISUAL_PROFILES}


def _lighting_plans(*bundle_ids: str) -> list[Mapping[str, str]]:
    return [LIGHTING_PLAN_BY_ID[bundle_id] for bundle_id in bundle_ids]


def _visual_profiles(*bundle_ids: str) -> list[Mapping[str, str]]:
    return [VISUAL_PROFILE_BY_ID[bundle_id] for bundle_id in bundle_ids]


# A portrait canvas accepts most portrait setups. A landscape canvas is more
# selective and keeps enough lateral or environmental space for the subject.
PORTRAIT_CAMERA_BUNDLES = [
    bundle for bundle in CAMERA_BUNDLES
    if bundle["id"] != "landscape_gaze_space_50"
]
LANDSCAPE_CAMERA_BUNDLES = _camera_bundles(
    "phone_waist",
    "doorway_three_quarter_65",
    "street_full_50",
    "sport_dynamic_50",
    "low_angle_dynamic_35",
    "travel_environment_35",
    "interior_environment_28",
    "landscape_gaze_space_50",
    "telephoto_environment_135",
    "symmetry_gallery_40",
)

PROFILE_CAMERA_BUNDLES = {
    "日系草地单车夏日柔光写真": _camera_bundles(
        "forest_chest_85", "headshot_85", "classic_waist_85"
    ),
    "日系咖啡馆暖调近景人像": _camera_bundles(
        "cafe_chest_50", "sofa_seated_85", "phone_waist"
    ),
    "夜间室内轻奢硬闪时尚写真": _camera_bundles(
        "flash_full_65", "doorway_three_quarter_65", "fashion_three_quarter_70"
    ),
    "都市职场轻奢坐姿写真": _camera_bundles(
        "office_seated_70", "sofa_seated_85", "classic_waist_85"
    ),
    "古风汉服园林柔光写真": _camera_bundles(
        "classic_waist_85", "frame_within_frame_50", "garment_detail_105"
    ),
    "海边夏日泳装写真": _camera_bundles(
        "travel_environment_35", "landscape_gaze_space_50", "telephoto_environment_135"
    ),
    "赛博都市夜景写真": _camera_bundles(
        "leading_lines_env_35", "street_full_50", "fashion_three_quarter_70"
    ),
}

PROFILE_CAMERA_BUNDLES.update({
    "日系草地单车夏日柔光写真": _camera_bundles("classic_waist_85", "travel_environment_35", "hands_prop_85"),
    "日系咖啡馆暖调近景人像": _camera_bundles("high_angle_full_35", "phone_waist", "cafe_chest_50"),
    "夜间室内轻奢硬闪时尚写真": _camera_bundles("triangle_full_50", "sofa_seated_85", "flash_full_65"),
    "都市职场轻奢坐姿写真": _camera_bundles("office_seated_70", "sofa_seated_85", "classic_waist_85"),
    "古风汉服园林柔光写真": _camera_bundles("classic_waist_85", "frame_within_frame_50", "hands_prop_85"),
    "海边夏日泳装写真": _camera_bundles("landscape_gaze_space_50", "travel_environment_35", "low_angle_full_28"),
    "赛博都市夜景写真": _camera_bundles("leading_lines_env_35", "landscape_gaze_space_50", "low_angle_dynamic_35"),
    "影棚水光妆美容特写": _camera_bundles("beauty_face_105", "headshot_85", "hands_prop_85"),
    "落地窗瑜伽塑形写真": _camera_bundles("landscape_gaze_space_50", "sport_dynamic_50", "low_angle_full_28"),
    "旅馆窗边电影静帧": _camera_bundles("landscape_gaze_space_50", "interior_environment_28", "frame_within_frame_50"),
})

POSE_LIBRARY_FIELDS = {
    "画面瞬间": "pose.event",
    "基础姿态": "pose.base",
    "身体方向": "pose.body_direction",
    "身体重心": "pose.weight",
    "肩颈状态": "pose.shoulders",
    "手部动作": "pose.hand_action",
    "腿部动作": "pose.leg_action",
    "头部方向": "pose.head_direction",
    "视线": "pose.gaze",
    "表情": "pose.expression",
}
POSE_OUTPUT_FIELDS = tuple(POSE_LIBRARY_FIELDS)
POSE_FIELD_TEXT = {
    field_name: _render_library_field(_POSE_LIBRARY, field_id)
    for field_name, field_id in POSE_LIBRARY_FIELDS.items()
}
POSE_VALUE_TEXT = {
    field_name: _library_option_values(_POSE_LIBRARY, field_id)
    for field_name, field_id in POSE_LIBRARY_FIELDS.items()
}
_POSE_ID_TO_LABEL = {
    field_name: _library_id_to_label(_POSE_LIBRARY, field_id)
    for field_name, field_id in POSE_LIBRARY_FIELDS.items()
}
POSE_BUNDLES = []
POSE_BUNDLE_BY_ID = {}
for _bundle in _POSE_LIBRARY["bundles"]["pose_action_chains"]:
    _converted = {
        field_name: _POSE_ID_TO_LABEL[field_name][
            _bundle["fields"][field_id]
        ]
        for field_name, field_id in POSE_LIBRARY_FIELDS.items()
    }
    _converted["id"] = _bundle["id"]
    _converted["label"] = _bundle["label"]
    _converted["tags"] = tuple(_bundle.get("tags", ()))
    POSE_BUNDLES.append(_converted)
    POSE_BUNDLE_BY_ID[_bundle["id"]] = _converted

_HEADWEAR_ID_TO_LABEL = _library_id_to_label(_CORE_LIBRARY, "hair.headwear")
POSE_HAND_HEADWEAR_REQUIREMENTS = {}
for _option in _POSE_LIBRARY["fields"]["pose.hand_action"]["options"]:
    _required_ids = _option.get("requires", {}).get("hair.headwear", [])
    if _required_ids:
        POSE_HAND_HEADWEAR_REQUIREMENTS[_option["label"]] = {
            _HEADWEAR_ID_TO_LABEL[option_id]
            for option_id in _required_ids
            if option_id in _HEADWEAR_ID_TO_LABEL
        }

LEGACY_POSE_BUNDLE_BY_BASE = {
    "枝叶下侧身站立": "forest_hat_bouquet",
    "卡座后靠右倾坐姿": "cafe_booth_direct",
    "门间侧转单腿站立": "doorway_fan_flash",
    "沙发边缘前倾坐姿": "workplace_folder_forward",
    "窗边放松侧坐": "window_curtain_quiet",
    "墙边自然站立": "wall_collar_fashion",
    "高脚椅端正坐姿": "studio_stool_direct",
    "走廊短暂停步": "elevator_handbag_wait",
}
LEGACY_POSE_BUNDLE_BY_ACTION = {
    "抱雏菊扶草帽": "forest_hat_bouquet",
    "右手门把左手折扇": "doorway_fan_flash",
    "右手签字笔左手文件夹": "workplace_folder_forward",
    "单手托杯另一手扶桌": "cafe_table_candid",
    "单手扶镜框另一手垂落": "glasses_sofa_confident",
    "双手轻握手袋": "elevator_handbag_wait",
    "一手插袋一手扶领": "wall_collar_fashion",
}
LEGACY_EXPRESSION_GAZE = {
    "回眸清甜浅笑": {"头部方向": "向右回眸", "视线": "柔和看向镜头", "表情": "清甜微笑"},
    "平静直视镜头": {"头部方向": "头部正对镜头", "视线": "直视镜头", "表情": "平静自然"},
    "冷静自信直视": {"头部方向": "头部正对镜头", "视线": "直视镜头", "表情": "冷静自信"},
    "轻微侧目浅笑": {"头部方向": "头部转向右侧", "视线": "侧目看向镜头", "表情": "温柔浅笑"},
    "安静看向窗外": {"头部方向": "头部转向左侧", "视线": "看向窗外", "表情": "平静自然"},
    "明艳克制直视": {"头部方向": "头部正对镜头", "视线": "直视镜头", "表情": "明艳自信"},
    "自然放松微笑": {"头部方向": "头部正对镜头", "视线": "柔和看向镜头", "表情": "自然放松微笑"},
}

SCENE_LIBRARY_FIELDS = {
    "场景地点": "scene.location",
    "时间切片": "scene.time",
    "天气状态": "scene.weather",
    "前景框景": "scene.foreground",
    "背景环境": "scene.background",
    "环境细节": "scene.detail",
    "空间材质": "scene.surface",
    "空间层次": "scene.spatial",
}
SCENE_OUTPUT_FIELDS = tuple(SCENE_LIBRARY_FIELDS)
SCENE_GROUP_FIELDS = ("场景大类", *SCENE_OUTPUT_FIELDS)
SCENE_FIELD_TEXT = {
    field_name: _render_library_field(_SCENE_LIBRARY, field_id)
    for field_name, field_id in SCENE_LIBRARY_FIELDS.items()
}
SCENE_VALUE_TEXT = {
    field_name: _library_option_values(_SCENE_LIBRARY, field_id)
    for field_name, field_id in SCENE_LIBRARY_FIELDS.items()
}
_SCENE_ID_TO_LABEL = {
    field_name: _library_id_to_label(_SCENE_LIBRARY, field_id)
    for field_name, field_id in SCENE_LIBRARY_FIELDS.items()
}
_SCENE_DETAIL_ID_TO_VALUE = {
    option["id"]: option["value"]
    for option in _SCENE_LIBRARY["fields"]["scene.detail"]["options"]
}

# The dedicated scene library supplies outdoor and anchor locations. The
# advanced library adds sixty concrete indoor locations without duplicating
# the rest of the scene grammar.
SCENE_FIELD_TEXT["场景地点"].update(
    _render_library_field(_ADVANCED_LIBRARY, "scene.indoor_location")
)
SCENE_VALUE_TEXT["场景地点"].update(
    _library_option_values(_ADVANCED_LIBRARY, "scene.indoor_location")
)
_INDOOR_LOCATION_ID_TO_LABEL = _library_id_to_label(
    _ADVANCED_LIBRARY, "scene.indoor_location"
)
_INDOOR_FAMILY_ID_TO_LABEL = _library_id_to_label(
    _ADVANCED_LIBRARY, "scene.indoor_family"
)

SCENE_CATEGORY_TEXT = {
    option["label"]: option["value"]
    for option in _ADVANCED_LIBRARY["fields"]["scene.indoor_family"]["options"]
}
SCENE_CATEGORY_TEXT.update({
    "自然户外": "自然植被、海岸与开阔户外空间",
    "都市户外": "城市街道、天台与现代建筑外部空间",
})

_FORMAL_LOCATION_CATEGORY_BY_ID = {
    "summer_garden": "自然户外",
    "forest_path": "自然户外",
    "cafe_booth": "餐饮与酒店",
    "cafe_window": "餐饮与酒店",
    "cream_apartment": "居住空间",
    "office_lounge": "办公工作",
    "hotel_corridor": "餐饮与酒店",
    "apartment_doorway": "居住空间",
    "gray_studio": "专业特色",
    "new_chinese_tearoom": "东方传统",
    "hongkong_diner": "餐饮与酒店",
    "urban_sidewalk": "都市户外",
    "glass_lobby": "办公工作",
    "hotel_balcony": "餐饮与酒店",
    "city_rooftop": "都市户外",
    "seaside": "自然户外",
    "bookstore": "商业零售",
    "art_gallery": "文化艺术",
    "flower_shop": "商业零售",
    "tennis_court": "运动康体",
    "fitness_studio": "运动康体",
    "campus_classroom": "文化艺术",
    "campus_playground": "运动康体",
    "outdoor_basketball_court": "运动康体",
    "stone_arch_bridge": "都市户外",
    "wharf": "都市户外",
    "coastal_lighthouse": "自然户外",
    "hot_spring_pool": "东方传统",
    "sandy_beach": "自然户外",
    "bamboo_grove": "自然户外",
    "lakeside": "自然户外",
}

SCENE_LOCATIONS_BY_CATEGORY = {
    category: [] for category in SCENE_CATEGORY_TEXT
}
for _option in _ADVANCED_LIBRARY["fields"]["scene.indoor_location"]["options"]:
    _category = _INDOOR_FAMILY_ID_TO_LABEL[_option["tags"][0]]
    SCENE_LOCATIONS_BY_CATEGORY[_category].append(_option["label"])
for _option in _SCENE_LIBRARY["fields"]["scene.location"]["options"]:
    _category = _FORMAL_LOCATION_CATEGORY_BY_ID[_option["id"]]
    if _option["label"] not in SCENE_LOCATIONS_BY_CATEGORY[_category]:
        SCENE_LOCATIONS_BY_CATEGORY[_category].append(_option["label"])

SCENE_CONCEPT_LOCATIONS = {
    "月夜森林": ("自然户外", "月光照亮、薄雾沿地面展开的深色森林"),
    "哥特古堡厅堂": ("专业特色", "尖拱、石柱与高窗构成的哥特古堡厅堂"),
    "未来赛博街区": ("都市户外", "霓虹标牌与湿润路面构成的未来城市街区"),
    "蒸汽机械空间": ("工业功能", "铜色管道、齿轮与压力表组成的蒸汽机械空间"),
    "超现实梦境花园": ("自然户外", "尺度夸张的花朵与浅色雾气组成的梦境花园"),
    "星云神殿": ("专业特色", "高大石柱、星云天空与发光纹路组成的幻想神殿"),
    "水下幻境": ("专业特色", "气泡与水生植物缓慢漂浮的通透水下空间"),
    "冰雪宫殿": ("专业特色", "半透明冰柱、冰晶拱门与覆雪地面组成的宫殿"),
    "云海仙境": ("自然户外", "层叠云海、远山与浅色古典建筑组成的仙境"),
    "花瓣风暴装置空间": ("专业特色", "留白影棚与大量悬浮花瓣组成的动态装置空间"),
}
for _label, (_category, _value) in SCENE_CONCEPT_LOCATIONS.items():
    SCENE_FIELD_TEXT["场景地点"][_label] = f"场景位于{_value}"
    SCENE_VALUE_TEXT["场景地点"][_label] = _value
    SCENE_LOCATIONS_BY_CATEGORY[_category].append(_label)
SCENE_LOCATIONS_BY_CATEGORY = {
    category: tuple(locations)
    for category, locations in SCENE_LOCATIONS_BY_CATEGORY.items()
}


def _scene_detail_selection(detail_ids: Sequence[str]) -> tuple[str, str]:
    labels = [_SCENE_ID_TO_LABEL["环境细节"][detail_id] for detail_id in detail_ids]
    values = [_SCENE_DETAIL_ID_TO_VALUE[detail_id] for detail_id in detail_ids]
    label = "、".join(labels)
    if len(values) > 1:
        value = "、".join(values[:-1]) + f"和{values[-1]}"
    else:
        value = values[0]
    SCENE_FIELD_TEXT["环境细节"][label] = f"场景中只保留{value}"
    SCENE_VALUE_TEXT["环境细节"][label] = value
    return label, value


SCENE_BUNDLES = []
SCENE_BUNDLE_BY_ID = {}
for _bundle in _SCENE_LIBRARY["bundles"]["scene_compositions"]:
    _fields = _bundle["fields"]
    _location_id = _fields["scene.location"]
    _converted = {
        "场景大类": _FORMAL_LOCATION_CATEGORY_BY_ID[_location_id],
        **{field_name: EMPTY_CHOICE for field_name in SCENE_OUTPUT_FIELDS},
    }
    for _field_name, _field_id in SCENE_LIBRARY_FIELDS.items():
        if _field_id not in _fields or _field_id == "scene.detail":
            continue
        _converted[_field_name] = _SCENE_ID_TO_LABEL[_field_name][
            _fields[_field_id]
        ]
    _converted["环境细节"] = _scene_detail_selection(
        _fields["scene.detail"]
    )[0]
    _converted.update({
        "id": _bundle["id"],
        "label": _bundle["label"],
        "tags": tuple(_bundle.get("tags", ())),
    })
    SCENE_BUNDLES.append(_converted)
    SCENE_BUNDLE_BY_ID[_bundle["id"]] = _converted

for _bundle in _ADVANCED_LIBRARY["bundles"]["indoor_scene_compositions"]:
    _fields = _bundle["fields"]
    _family_id = _fields["scene.indoor_family"]
    _converted = {
        "场景大类": _INDOOR_FAMILY_ID_TO_LABEL[_family_id],
        **{field_name: EMPTY_CHOICE for field_name in SCENE_OUTPUT_FIELDS},
        "场景地点": _INDOOR_LOCATION_ID_TO_LABEL[
            _fields["scene.indoor_location"]
        ],
    }
    for _field_name, _field_id in SCENE_LIBRARY_FIELDS.items():
        if _field_id not in _fields or _field_id in (
            "scene.location", "scene.detail"
        ):
            continue
        _converted[_field_name] = _SCENE_ID_TO_LABEL[_field_name][
            _fields[_field_id]
        ]
    _converted["环境细节"] = _scene_detail_selection(
        _fields["scene.detail"]
    )[0]
    _converted.update({
        "id": _bundle["id"],
        "label": _bundle["label"],
        "tags": tuple(_bundle.get("tags", ())),
    })
    SCENE_BUNDLES.append(_converted)
    SCENE_BUNDLE_BY_ID[_bundle["id"]] = _converted


def _register_scene_detail(label: str, value: str) -> str:
    SCENE_FIELD_TEXT["环境细节"][label] = f"场景中只保留{value}"
    SCENE_VALUE_TEXT["环境细节"][label] = value
    return label


_CONCEPT_SCENE_SPECS = (
    ("moon_forest_concept", "月夜森林", "自然户外", "夜间", "薄雾", "失焦绿叶", "浓密枝叶、少量发光植物", EMPTY_CHOICE, "植物层叠空间"),
    ("gothic_castle_concept", "哥特古堡厅堂", "专业特色", "深夜", EMPTY_CHOICE, "纵向门框", "尖拱、高窗、石柱", "浅灰石材", "走廊纵深"),
    ("cyber_street_concept", "未来赛博街区", "都市户外", "夜间", "雨后", "玻璃反射", "霓虹标牌、湿润路面、远处车辆", "拉丝金属", "反射空间层次"),
    ("steampunk_room_concept", "蒸汽机械空间", "工业功能", "入夜不久", EMPTY_CHOICE, "虚化训练器械", "铜色管道、齿轮、压力表", "拉丝金属", "走廊纵深"),
    ("dream_garden_concept", "超现实梦境花园", "自然户外", "傍晚", "薄雾", "小白花", "巨大花朵、浅色雾气、弯曲小径", EMPTY_CHOICE, "植物层叠空间"),
    ("nebula_temple_concept", "星云神殿", "专业特色", "蓝调时刻", EMPTY_CHOICE, "纵向门框", "高大石柱、发光纹路、星云天空", "浅灰石材", "前中后三层"),
    ("underwater_realm_concept", "水下幻境", "专业特色", "正午", EMPTY_CHOICE, "失焦光点", "漂浮气泡、水生植物、折射光纹", EMPTY_CHOICE, "前中后三层"),
    ("ice_palace_concept", "冰雪宫殿", "专业特色", "晴朗清晨", "小雪", "失焦光点", "冰晶拱门、半透明冰柱、覆雪地面", EMPTY_CHOICE, "前中后三层"),
    ("cloud_realm_concept", "云海仙境", "自然户外", "晴朗清晨", "薄雾", "失焦光点", "层叠云海、远山、浅色古典建筑", EMPTY_CHOICE, "开阔户外纵深"),
    ("petal_storm_concept", "花瓣风暴装置空间", "专业特色", "正午", EMPTY_CHOICE, "失焦光点", "悬浮花瓣、留白背景、少量花枝", "白色涂料墙面", "单侧环境留白"),
)
for (
    _bundle_id, _location, _category, _time, _weather, _foreground,
    _details, _surface, _spatial
) in _CONCEPT_SCENE_SPECS:
    _detail_label = _register_scene_detail(_details, _details)
    _converted = {
        "场景大类": _category,
        "场景地点": _location,
        "时间切片": _time,
        "天气状态": _weather,
        "前景框景": _foreground,
        "背景环境": EMPTY_CHOICE,
        "环境细节": _detail_label,
        "空间材质": _surface,
        "空间层次": _spatial,
        "id": _bundle_id,
        "label": _location,
        "tags": ("幻想概念", _category),
    }
    SCENE_BUNDLES.append(_converted)
    SCENE_BUNDLE_BY_ID[_bundle_id] = _converted

HAIR_MODE_TEXT = {
    "基础发色": "使用单一基础发色",
    "进阶染发": "使用带色调与染色方式的进阶发色",
}
HAIR_LIBRARY_FIELDS = {
    "发色": (_CORE_LIBRARY, "hair.color"),
    "发色色调": (_ADVANCED_LIBRARY, "hair.undertone"),
    "染色方式": (_ADVANCED_LIBRARY, "hair.dye_pattern"),
    "头发长度": (_CORE_LIBRARY, "hair.length"),
    "发质与卷度": (_CORE_LIBRARY, "hair.texture"),
    "发型造型": (_CORE_LIBRARY, "hair.style"),
    "刘海": (_CORE_LIBRARY, "hair.bangs"),
    "头部配饰": (_CORE_LIBRARY, "hair.headwear"),
}
HAIR_FIELD_TEXT = {
    field_name: _render_library_field(library, field_id)
    for field_name, (library, field_id) in HAIR_LIBRARY_FIELDS.items()
}
HAIR_OUTPUT_FIELDS = (
    "发色", "发色色调", "染色方式", "头发长度", "发质与卷度", "发型造型", "刘海", "头部配饰"
)
HAIR_STRUCTURE_FIELDS = ("头发长度", "发质与卷度", "发型造型", "刘海")
HAIR_ADVANCED_FIELDS = ("发色色调", "染色方式")

_hair_structure_library_ids = {
    "头发长度": "hair.length",
    "发质与卷度": "hair.texture",
    "发型造型": "hair.style",
    "刘海": "hair.bangs",
}
_hair_structure_id_to_label = {
    field_name: _library_id_to_label(_CORE_LIBRARY, field_id)
    for field_name, field_id in _hair_structure_library_ids.items()
}
HAIR_STRUCTURE_BUNDLES = []
HAIR_STRUCTURE_BUNDLE_BY_ID = {}
for _bundle in _ADVANCED_LIBRARY["bundles"]["hair_style_bundles"]:
    _converted = {
        field_name: _hair_structure_id_to_label[field_name][
            _bundle["fields"][field_id]
        ]
        for field_name, field_id in _hair_structure_library_ids.items()
    }
    HAIR_STRUCTURE_BUNDLES.append(_converted)
    HAIR_STRUCTURE_BUNDLE_BY_ID[_bundle["id"]] = _converted

HAIR_PROFILE_BUNDLE_IDS = {
    "日系草地单车夏日柔光写真": (
        "chest_soft_waves_air", "waist_straight_wispy", "half_up_curtain", "straw_hat_long_waves"
    ),
    "日系咖啡馆暖调近景人像": (
        "chin_bob_air_bangs", "chin_bob_wispy", "shoulder_inward_air", "collarbone_loose_curtain", "low_ponytail_side_bangs"
    ),
    "夜间室内轻奢硬闪时尚写真": (
        "high_bun_open", "high_bun_face_strands", "side_swept_large_waves", "side_swept_wet", "french_twist_open"
    ),
    "都市职场轻奢坐姿写真": (
        "low_ponytail_center", "low_bun_middle", "collarbone_sleek_side", "french_twist_side"
    ),
    "古风汉服园林柔光写真": (
        "low_bun_middle", "low_bun_wispy", "flower_pin_low_bun",
        "gold_pin_high_bun", "single_braid_jade_pin",
    ),
    "海边夏日泳装写真": (
        "chest_soft_waves_air", "straw_hat_long_waves", "waist_loose_curls_center",
        "low_ponytail_center", "single_braid_wispy",
    ),
    "赛博都市夜景写真": (
        "side_swept_wet", "side_swept_large_waves", "high_ponytail_open",
        "half_up_pearl_clip", "collarbone_sleek_side",
    ),
}
HAIR_PROFILE_BUNDLE_IDS.update({
    "日系草地单车夏日柔光写真": ("half_up_curtain", "chest_soft_waves_air", "waist_straight_wispy"),
    "日系咖啡馆暖调近景人像": ("waist_straight_wispy", "chest_soft_waves_air", "collarbone_loose_curtain"),
    "夜间室内轻奢硬闪时尚写真": ("side_swept_large_waves", "chest_large_waves_middle", "french_twist_open"),
    "都市职场轻奢坐姿写真": ("waist_straight_wispy", "collarbone_sleek_side", "low_bun_middle"),
    "古风汉服园林柔光写真": ("flower_pin_low_bun", "gold_pin_high_bun", "single_braid_jade_pin"),
    "海边夏日泳装写真": ("chest_soft_waves_air", "waist_straight_wispy", "low_ponytail_center"),
    "赛博都市夜景写真": ("chin_bob_wispy", "chin_bob_air_bangs", "collarbone_sleek_side"),
    "影棚水光妆美容特写": ("low_bun_wispy", "collarbone_sleek_side", "high_bun_face_strands"),
    "落地窗瑜伽塑形写真": ("shoulder_waves_center", "high_ponytail_open", "messy_bun_air"),
    "旅馆窗边电影静帧": ("collarbone_loose_curtain", "low_ponytail_center", "shoulder_waves_center"),
})

PROFILE_HAIR_BUNDLES = {
    preset: [HAIR_STRUCTURE_BUNDLE_BY_ID[bundle_id] for bundle_id in bundle_ids]
    for preset, bundle_ids in HAIR_PROFILE_BUNDLE_IDS.items()
}

HEADWEAR_STYLE_COMPATIBILITY = {
    "浅草色编织草帽": {"自然披散", "松弛低马尾", "单侧披发", "松散单辫", "低位双辫"},
    "宽檐毡帽": {"自然披散", "松弛低马尾", "单侧披发"},
    "羊毛贝雷帽": {"自然披散", "松弛低马尾", "低位双辫", "利落短发轮廓"},
    "丝质发带": {"自然披散", "松弛低马尾", "半扎发", "利落短发轮廓"},
    "黑色细发带": {"自然披散", "利落高马尾", "松弛丸子头", "半扎发", "利落短发轮廓"},
    "珍珠发夹": {"自然披散", "松弛低马尾", "半扎发", "单侧披发", "利落短发轮廓"},
    "几何金属发夹": {"自然披散", "利落高马尾", "松弛丸子头", "半扎发", "单侧披发", "利落短发轮廓"},
    "丝绒蝴蝶结": {"松弛低马尾", "利落高马尾", "半扎发", "松散单辫"},
    "小白花发饰": {"自然披散", "松弛丸子头", "半扎发", "整洁低盘发", "整洁高盘发", "松散单辫"},
    "玉质发簪": {"整洁低盘发", "整洁高盘发", "法式扭卷盘发", "松散单辫"},
    "金色发簪": {"整洁低盘发", "整洁高盘发", "法式扭卷盘发"},
    "纯色棒球帽": {"自然披散", "松弛低马尾", "利落高马尾", "低位双辫", "利落短发轮廓"},
}

CLOTHING_MODE_FIELDS = {
    "连衣裙": (
        "连衣裙类型", "连衣裙颜色", "连衣裙材质", "连衣裙图案"
    ),
    "连体服": (
        "连体服类型", "连体服颜色", "连体服材质", "连体服图案"
    ),
    "上装＋下装": (
        "上装类型", "上装颜色", "上装材质", "上装图案",
        "下装类型", "下装颜色", "下装材质", "下装图案",
    ),
    "西装套装": (
        "上装类型", "上装颜色", "上装材质", "上装图案",
        "下装类型", "下装颜色", "下装材质", "下装图案",
    ),
    "叠穿造型": (
        "上装类型", "上装颜色", "上装材质", "上装图案",
        "下装类型", "下装颜色", "下装材质", "下装图案",
    ),
}
CLOTHING_BRANCH_FIELDS = tuple(dict.fromkeys(
    field for fields in CLOTHING_MODE_FIELDS.values() for field in fields
))
CLOTHING_OPTIONAL_FIELDS = (
    "连衣裙图案", "连体服图案", "上装图案", "下装图案", "版型细节", "袜装", "鞋履", "服装配件"
)
CLOTHING_OUTPUT_FIELDS = (
    "穿搭结构", *CLOTHING_BRANCH_FIELDS, "版型细节", "袜装", "鞋履", "服装配件"
)
CLOTHING_LIBRARY_FIELDS = {
    "穿搭结构": "clothing.mode",
    "连衣裙类型": "clothing.dress_type",
    "连体服类型": "clothing.jumpsuit_type",
    "连衣裙颜色": "clothing.color",
    "连体服颜色": "clothing.color",
    "上装颜色": "clothing.color",
    "下装颜色": "clothing.color",
    "连衣裙材质": "clothing.material",
    "连体服材质": "clothing.material",
    "上装材质": "clothing.material",
    "下装材质": "clothing.material",
    "连衣裙图案": "clothing.pattern",
    "连体服图案": "clothing.pattern",
    "上装图案": "clothing.pattern",
    "下装图案": "clothing.pattern",
    "上装类型": "clothing.top_type",
    "下装类型": "clothing.bottom_type",
    "版型细节": "clothing.fit_detail",
    "袜装": "clothing.legwear",
    "鞋履": "clothing.shoes",
    "服装配件": "clothing.accessory",
}
CLOTHING_FIELD_TEXT = {
    field_name: _render_library_field(_CORE_LIBRARY, field_id)
    for field_name, field_id in CLOTHING_LIBRARY_FIELDS.items()
}
CLOTHING_VALUE_TEXT = {
    field_name: _library_option_values(_CORE_LIBRARY, field_id)
    for field_name, field_id in CLOTHING_LIBRARY_FIELDS.items()
}
CLOTHING_LABEL_TO_ID = {
    field_name: _library_label_to_id(_CORE_LIBRARY, field_id)
    for field_name, field_id in CLOTHING_LIBRARY_FIELDS.items()
}
CLOTHING_ID_TO_LABEL = {
    field_name: _library_id_to_label(_CORE_LIBRARY, field_id)
    for field_name, field_id in CLOTHING_LIBRARY_FIELDS.items()
}

_CLOTHING_RECIPE_FIELD_MAP = {
    "穿搭结构": "clothing.mode",
    "连衣裙类型": "clothing.dress_type",
    "连衣裙颜色": "clothing.color",
    "连衣裙材质": "clothing.material",
    "连衣裙图案": "clothing.pattern",
    "连体服类型": "clothing.jumpsuit_type",
    "连体服颜色": "clothing.color",
    "连体服材质": "clothing.material",
    "连体服图案": "clothing.pattern",
    "上装类型": "clothing.top_type",
    "上装颜色": "clothing.color",
    "上装材质": "clothing.material",
    "上装图案": "clothing.pattern",
    "下装类型": "clothing.bottom_type",
    "下装颜色": "clothing.color",
    "下装材质": "clothing.material",
    "下装图案": "clothing.pattern",
    "袜装": "clothing.legwear",
    "鞋履": "clothing.shoes",
}
CLOTHING_RECIPES = [
    recipe for recipe in _COMPATIBILITY_LIBRARY["portrait_recipes"]
    if any(key.startswith("clothing.") for key in recipe.get("field_pool", {}))
]
CLOTHING_RECIPE_BY_ID = {recipe["id"]: recipe for recipe in CLOTHING_RECIPES}
CLOTHING_PROFILE_RECIPE_IDS = {
    "日系草地单车夏日柔光写真": ("summer_forest_girl", "flower_shop_ccd", "seaside_golden_vacation"),
    "日系咖啡馆暖调近景人像": ("warm_cafe_portrait", "bookstore_intellectual", "french_apartment_window", "retro_hongkong_diner"),
    "夜间室内轻奢硬闪时尚写真": ("doorway_flash_fashion", "low_key_hotel_cinema", "urban_neon_walk"),
    "都市职场轻奢坐姿写真": ("office_luxury_seated", "minimal_gallery_editorial", "neutral_ecommerce_full"),
    "古风汉服园林柔光写真": ("hanfu_garden_portrait",),
    "海边夏日泳装写真": ("seaside_golden_vacation",),
    "赛博都市夜景写真": ("cyber_neon_night",),
}

CLOTHING_PROFILE_RECIPE_IDS.update({
    "日系草地单车夏日柔光写真": ("seaside_golden_vacation", "tennis_active", "flower_shop_ccd"),
    "日系咖啡馆暖调近景人像": ("warm_cafe_portrait", "french_apartment_window", "bookstore_intellectual"),
    "夜间室内轻奢硬闪时尚写真": ("low_key_hotel_cinema", "doorway_flash_fashion", "urban_neon_walk"),
    "都市职场轻奢坐姿写真": ("office_luxury_seated", "minimal_gallery_editorial", "neutral_ecommerce_full"),
    "古风汉服园林柔光写真": ("hanfu_garden_portrait", "new_chinese_tearoom"),
    "海边夏日泳装写真": ("seaside_golden_vacation", "tennis_active"),
    "赛博都市夜景写真": ("cyber_neon_night", "urban_neon_walk"),
    "影棚水光妆美容特写": ("studio_beauty_closeup",),
    "落地窗瑜伽塑形写真": ("tennis_active", "neutral_ecommerce_full"),
    "旅馆窗边电影静帧": ("low_key_hotel_cinema", "french_apartment_window"),
})

LEGACY_CLOTHING_COMBINATIONS = {
    "薄荷碎花吊带连衣裙": {
        "穿搭结构": "连衣裙", "连衣裙类型": "碎花吊带连衣裙",
        "连衣裙颜色": "薄荷绿", "连衣裙材质": "雪纺", "连衣裙图案": "细小碎花",
    },
    "棕白条纹挂脖针织上衣": {
        "穿搭结构": "上装＋下装", "上装类型": "挂脖针织上衣",
        "上装颜色": "咖色", "上装材质": "细罗纹针织", "上装图案": "横向条纹",
        "下装类型": "垂坠中长裙", "下装颜色": "奶油白", "下装材质": "西装面料",
    },
    "黑色轻奢镂空短裙套装": {
        "穿搭结构": "连衣裙", "连衣裙类型": "高领修身连衣裙",
        "连衣裙颜色": "玄黑色", "连衣裙材质": "薄纱",
        "版型细节": "侧开衩", "袜装": "蕾丝袜口大腿袜", "鞋履": "漆皮高跟鞋",
    },
    "玄黑西装短裙酒红丝袜口": {
        "穿搭结构": "西装套装", "上装类型": "修身西装马甲",
        "上装颜色": "玄黑色", "上装材质": "西装面料",
        "下装类型": "西装短裙", "下装颜色": "炭灰色", "下装材质": "西装面料",
        "版型细节": "深V领口", "袜装": "深灰半透明连裤袜",
    },
    "新中式盘扣上衣长裙": {
        "穿搭结构": "上装＋下装", "上装类型": "新中式盘扣上衣",
        "上装颜色": "鼠尾草绿", "上装材质": "棉麻",
        "下装类型": "垂坠中长裙", "下装颜色": "象牙白", "下装材质": "棉麻",
    },
}

ASPECT_RESOLUTIONS = {
    "2:3竖构图": (832, 1248),
    "3:4竖构图": (768, 1024),
    "4:5竖构图": (896, 1120),
    "9:16竖构图": (720, 1280),
    "9:21竖构图": (576, 1344),
    "1:1方形构图": (1024, 1024),
    "3:2横构图": (1248, 832),
    "4:3横构图": (1024, 768),
    "5:4横构图": (1120, 896),
    "16:9横构图": (1280, 720),
    "21:9横构图": (1344, 576),
}

LANDSCAPE_ASPECTS = frozenset(
    aspect for aspect, (width, height) in ASPECT_RESOLUTIONS.items() if width > height
)
PORTRAIT_ASPECTS = frozenset(
    aspect for aspect, (width, height) in ASPECT_RESOLUTIONS.items() if width < height
)

CAPTURE_MEDIUM_TEXT = _render_library_field(
    _THEME_MEDIA_LIBRARY, "capture.medium"
)
CAPTURE_MEDIUM_LABEL_TO_ID: Dict[str, str] = _library_label_to_id(
    _THEME_MEDIA_LIBRARY, "capture.medium"
)
CAPTURE_MEDIUM_ID_TO_LABEL: Dict[str, str] = _library_id_to_label(
    _THEME_MEDIA_LIBRARY, "capture.medium"
)

THEME_OPTIONS_BY_CATEGORY = {
    "日常生活": [
        "日系咖啡馆生活写真", "窗边奶油暖调生活写真", "居家晨光松弛写真",
        "花店日常清新写真", "雨天室内安静写真", "书店周末阅读写真",
        "厨房烘焙日常写真", "唱片店闲逛写真", "画室创作日常写真", "周末市集漫步写真",
        "阳台绿植晨间写真", "深夜书房独处写真",
    ],
    "时尚编辑": [
        "夜间室内轻奢时尚写真", "高级杂志棚拍写真", "极简黑白时尚写真",
        "都市街头穿搭写真", "金属未来感时尚写真", "红毯礼服时尚写真",
        "彩色几何棚拍写真", "极简西装廓形写真", "柔软针织质感写真", "实验花艺时尚写真",
        "复古胶片质感时尚写真", "高定礼服后台写真",
    ],
    "商业广告": [
        "都市职场轻奢写真", "专业商务头像写真", "服装电商模特写真",
        "珠宝首饰广告写真", "香水商业广告写真", "高级酒店品牌写真",
        "腕表商业广告写真", "眼镜商业广告写真", "手袋商业广告写真", "婚纱礼服品牌写真",
        "汽车商业广告写真", "食品饮料广告写真",
    ],
    "美妆美容": [
        "影棚水光妆美容特写", "自然真实肤质特写", "清透裸妆美容写真",
        "浓郁红唇妆面特写", "彩色眼妆创意特写", "护肤品清洁美容广告",
        "柔雾哑光妆面特写", "珠光眼妆创意特写", "清透腮红妆面写真", "护发造型美容广告",
        "美甲特写美容写真", "香氛喷雾美容广告",
    ],
    "都市叙事": [
        "都市夜行叙事写真", "玻璃幕墙通勤写真", "地铁站台都市写真",
        "雨夜街头霓虹写真", "天台蓝调时刻写真", "旧城区巷道纪实写真",
        "便利店夜间叙事写真", "停车场冷调都市写真", "街道路口纪实写真", "城市天桥通勤写真",
        "夜市烟火叙事写真", "雨伞街头剪影写真",
    ],
    "自然户外": [
        "日系森系夏日写真", "春日花海清新写真", "湖畔清风自然写真",
        "草原旷野环境写真", "秋日枫林氛围写真", "冬日雪林清冷写真",
        "竹林清幽自然写真", "海岸悬崖环境写真", "沙漠落日旷野写真", "乡间小路生活写真",
        "瀑布溪流清新写真", "高原湖泊纯净写真",
    ],
    "旅行度假": [
        "海边夏日度假写真", "酒店阳台度假写真", "山野徒步旅行写真",
        "古镇漫步旅行写真", "热带泳池假日写真", "公路旅行随行写真",
        "海岛小镇漫步写真", "山间露营旅行写真", "葡萄园庄园旅行写真", "火车站候车旅行写真",
        "和服京都之旅写真", "温泉度假休闲写真",
    ],
    "运动健康": [
        "网球场阳光运动写真", "健身房力量训练写真", "瑜伽普拉提生活写真",
        "城市慢跑活力写真", "室内泳池运动写真", "舞蹈排练动态写真",
        "拳击训练力量写真", "户外骑行活力写真", "羽毛球训练写真", "室内攀岩运动写真",
        "滑雪运动写真", "冲浪运动写真",
    ],
    "中式美学": [
        "新中式室内写真", "茶室竹影中式写真", "旗袍民国雅致写真",
        "宋韵素雅庭院写真", "唐风华贵宫廷写真", "水墨留白中式写真",
        "江南园林雨景写真", "敦煌壁画灵感写真", "明制雅致庭院写真", "传统书院文雅写真",
        "汉服襦裙写真", "少数民族风情写真",
    ],
    "复古年代": [
        "复古港风夜景写真", "九十年代家居写真", "千禧复古派对写真",
        "美式复古汽车旅馆写真", "法式旧公寓复古写真", "八十年代影楼复古写真",
        "七十年代暖调客厅写真", "复古迪斯科舞厅写真", "经典火车站旅人写真", "美式公路餐厅复古写真",
        "昭和和风复古写真", "上海滩十里洋场写真",
    ],
    "电影叙事": [
        "室内克制情绪电影写真", "暖调室内电影叙事写真", "蓝调城市电影静帧",
        "悬疑走廊叙事写真", "明亮梦境电影写真", "黑白电影肖像",
        "雨夜独行电影静帧", "公寓独处剧情写真", "旅馆窗边电影静帧", "公路停靠电影叙事",
        "剧院舞台电影静帧", "海港码头电影静帧",
    ],
    "幻想概念": [
        "月夜森林精灵概念写真", "哥特古堡暗黑写真", "未来都市赛博写真",
        "蒸汽机械复古幻想写真", "梦境花园超现实写真", "星云神殿概念写真",
        "水下幻境概念写真", "冰雪宫殿幻想写真", "云雾仙境幻想写真", "花瓣风暴概念写真",
        "人鱼海岸概念写真", "天使羽翼概念写真",
    ],
}

THEME_CATEGORY_TEXT = {
    category: f"{category}类女性人像" for category in THEME_OPTIONS_BY_CATEGORY
}
THEME_TEXT = {
    theme: f"真实摄影风格的{theme}"
    for themes in THEME_OPTIONS_BY_CATEGORY.values()
    for theme in themes
}

AGE_STAGE_TEXT = {
    "20–29岁": "20岁左右",
    "30–39岁": "30岁左右",
    "40–49岁": "40岁左右",
    "50–59岁": "50岁左右",
    "60岁以上": "60岁左右",
}

ETHNICITY_BRANCH_GENERIC = "大类通用外观"
ETHNICITY_BRANCHES_BY_CATEGORY = {
    "东亚": [ETHNICITY_BRANCH_GENERIC, "东北亚地域外观", "东亚南部地域外观"],
    "东南亚": [ETHNICITY_BRANCH_GENERIC, "大陆东南亚地域外观", "海岛东南亚地域外观"],
    "南亚": [ETHNICITY_BRANCH_GENERIC, "北部南亚地域外观", "南部南亚地域外观"],
    "中亚": [ETHNICITY_BRANCH_GENERIC, "草原中亚地域外观", "西部中亚地域外观"],
    "西亚／中东": [ETHNICITY_BRANCH_GENERIC, "阿拉伯裔", "波斯裔", "黎凡特地域外观", "安纳托利亚地域外观"],
    "欧洲裔": [ETHNICITY_BRANCH_GENERIC, "斯拉夫裔", "北欧裔", "西欧裔", "地中海欧洲裔"],
    "非洲裔": [ETHNICITY_BRANCH_GENERIC, "北非地域外观", "西非地域外观", "东非地域外观", "中非地域外观", "南部非洲地域外观"],
    "拉丁美洲裔": [ETHNICITY_BRANCH_GENERIC, "安第斯地域外观", "加勒比地域外观", "南锥体地域外观"],
    "多族裔混合外观": [ETHNICITY_BRANCH_GENERIC, "东亚与欧洲混合族裔", "非洲与欧洲混合族裔", "南亚与欧洲混合族裔", "拉丁美洲与欧洲混合族裔"],
}
ETHNICITY_CATEGORY_TEXT = {
    category: f"{category}成年女性" for category in ETHNICITY_BRANCHES_BY_CATEGORY
}
ETHNICITY_BRANCH_TEXT = {
    branch: f"{branch}成年女性"
    for branches in ETHNICITY_BRANCHES_BY_CATEGORY.values()
    for branch in branches
}

PURE_CONTROL_FIELDS = frozenset({
    "写真大类", "发色模式", "穿搭结构", "场景大类", "妆容模式"
})
HYBRID_OUTPUT_FIELDS = frozenset({"族裔大类"})
DEPENDENCY_PLACEHOLDER_VALUES = {
    "地域族裔分支": frozenset({ETHNICITY_BRANCH_GENERIC}),
}
CONTROL_ONLY_FIELDS = PURE_CONTROL_FIELDS
IDENTITY_FIELDS = ("年龄阶段", "族裔大类", "地域族裔分支")

PERSON_CORE_LIBRARY_FIELDS = {
    "脸型": "person.face_shape",
    "轮廓细节": "person.face_contour_detail",
    "眼型": "person.eye_shape",
    "瞳色": "person.iris_color",
    "眼睑特征": "person.eyelid",
    "肤色": "person.skin_tone",
    "肤质": "person.skin_texture",
    "整体妆容预设": "person.makeup",
    "基础身形": "person.body_build",
    "身量观感": "person.stature",
    "线条重点": "person.line_emphasis",
}
PERSON_DETAIL_LIBRARY_FIELDS = {
    "底妆质感": "makeup.base",
    "眼影色系": "makeup.eyeshadow",
    "眼线造型": "makeup.eyeliner",
    "唇妆颜色": "makeup.lip_color",
    "唇面质感": "makeup.lip_finish",
}
PERSON_FIELD_LIBRARY_IDS: Dict[str, tuple[dict, str]] = {
    **{
        field_name: (_CORE_LIBRARY, field_id)
        for field_name, field_id in PERSON_CORE_LIBRARY_FIELDS.items()
    },
    **{
        field_name: (_DETAIL_PROPS_LIBRARY, field_id)
        for field_name, field_id in PERSON_DETAIL_LIBRARY_FIELDS.items()
    },
}
MAKEUP_CUSTOM_FIELDS = tuple(PERSON_DETAIL_LIBRARY_FIELDS)
BODY_OUTPUT_FIELDS = ("基础身形", "身量观感", "线条重点")
PERSON_FACE_FIELDS = ("脸型", "轮廓细节")
PERSON_EYE_FIELDS = ("眼型", "瞳色", "眼睑特征")
PERSON_SKIN_FIELDS = ("肤色", "肤质")
PERSON_DETAIL_OUTPUT_FIELDS = (
    *PERSON_FACE_FIELDS, *PERSON_EYE_FIELDS, *PERSON_SKIN_FIELDS,
    "妆容模式", "整体妆容预设", *MAKEUP_CUSTOM_FIELDS,
)
PERSON_OUTPUT_FIELDS = (
    *IDENTITY_FIELDS,
    *PERSON_DETAIL_OUTPUT_FIELDS,
    *BODY_OUTPUT_FIELDS,
)
PERSON_FIELD_TEXT = {
    field_name: _render_library_field(library, field_id)
    for field_name, (library, field_id) in PERSON_FIELD_LIBRARY_IDS.items()
}
MAKEUP_MODE_TEXT = {
    "整体预设": "使用整体妆容预设",
    "分项自定义": "使用分项自定义妆容配置",
}

FIELD_ORDER = [
    "画面比例",
    "成像媒介",
    "写真大类",
    "写真主题",
    "年龄阶段",
    "族裔大类",
    "地域族裔分支",
    *PERSON_OUTPUT_FIELDS[3:],
    "发色模式",
    "发色",
    "发色色调",
    "染色方式",
    "头发长度",
    "发质与卷度",
    "发型造型",
    "刘海",
    "头部配饰",
    "穿搭结构",
    "连衣裙类型",
    "连衣裙颜色",
    "连衣裙材质",
    "连衣裙图案",
    "连体服类型",
    "连体服颜色",
    "连体服材质",
    "连体服图案",
    "上装类型",
    "上装颜色",
    "上装材质",
    "上装图案",
    "下装类型",
    "下装颜色",
    "下装材质",
    "下装图案",
    "版型细节",
    "袜装",
    "鞋履",
    "服装配件",
    "画面瞬间",
    "基础姿态",
    "身体方向",
    "身体重心",
    "肩颈状态",
    "手部动作",
    "腿部动作",
    "头部方向",
    "视线",
    "表情",
    "场景大类",
    "场景地点",
    "时间切片",
    "天气状态",
    "前景框景",
    "背景环境",
    "环境细节",
    "空间材质",
    "空间层次",
    *LIGHTING_OUTPUT_FIELDS,
    *COLOR_OUTPUT_FIELDS,
    "景别",
    "画面布局",
    "等效焦段",
    "拍摄距离",
    "机位",
    "景深",
    "对焦位置",
    *FINISH_OUTPUT_FIELDS,
]

FIELD_TEXT: Dict[str, Dict[str, str]] = {
    "画面比例": {
        "2:3竖构图": "2:3竖构图",
        "3:4竖构图": "3:4竖构图",
        "4:5竖构图": "4:5竖构图",
        "9:16竖构图": "9:16竖构图",
        "9:21竖构图": "9:21竖构图",
        "1:1方形构图": "1:1方形构图",
        "3:2横构图": "3:2横构图",
        "4:3横构图": "4:3横构图",
        "5:4横构图": "5:4横构图",
        "16:9横构图": "16:9横构图",
        "21:9横构图": "21:9横构图",
    },
    "成像媒介": CAPTURE_MEDIUM_TEXT,
    "写真大类": THEME_CATEGORY_TEXT,
    "写真主题": THEME_TEXT,
    "年龄阶段": AGE_STAGE_TEXT,
    "族裔大类": ETHNICITY_CATEGORY_TEXT,
    "地域族裔分支": ETHNICITY_BRANCH_TEXT,
    "妆容模式": MAKEUP_MODE_TEXT,
    **PERSON_FIELD_TEXT,
    "发色模式": HAIR_MODE_TEXT,
    "发色": HAIR_FIELD_TEXT["发色"],
    "发色色调": HAIR_FIELD_TEXT["发色色调"],
    "染色方式": HAIR_FIELD_TEXT["染色方式"],
    "头发长度": HAIR_FIELD_TEXT["头发长度"],
    "发质与卷度": HAIR_FIELD_TEXT["发质与卷度"],
    "发型造型": HAIR_FIELD_TEXT["发型造型"],
    "刘海": HAIR_FIELD_TEXT["刘海"],
    "头部配饰": HAIR_FIELD_TEXT["头部配饰"],
    "穿搭结构": CLOTHING_FIELD_TEXT["穿搭结构"],
    "连衣裙类型": CLOTHING_FIELD_TEXT["连衣裙类型"],
    "连衣裙颜色": CLOTHING_FIELD_TEXT["连衣裙颜色"],
    "连衣裙材质": CLOTHING_FIELD_TEXT["连衣裙材质"],
    "连衣裙图案": CLOTHING_FIELD_TEXT["连衣裙图案"],
    "连体服类型": CLOTHING_FIELD_TEXT["连体服类型"],
    "连体服颜色": CLOTHING_FIELD_TEXT["连体服颜色"],
    "连体服材质": CLOTHING_FIELD_TEXT["连体服材质"],
    "连体服图案": CLOTHING_FIELD_TEXT["连体服图案"],
    "上装类型": CLOTHING_FIELD_TEXT["上装类型"],
    "上装颜色": CLOTHING_FIELD_TEXT["上装颜色"],
    "上装材质": CLOTHING_FIELD_TEXT["上装材质"],
    "上装图案": CLOTHING_FIELD_TEXT["上装图案"],
    "下装类型": CLOTHING_FIELD_TEXT["下装类型"],
    "下装颜色": CLOTHING_FIELD_TEXT["下装颜色"],
    "下装材质": CLOTHING_FIELD_TEXT["下装材质"],
    "下装图案": CLOTHING_FIELD_TEXT["下装图案"],
    "版型细节": CLOTHING_FIELD_TEXT["版型细节"],
    "袜装": CLOTHING_FIELD_TEXT["袜装"],
    "鞋履": CLOTHING_FIELD_TEXT["鞋履"],
    "服装配件": _render_library_field(_CORE_LIBRARY, "clothing.accessory"),
    "画面瞬间": POSE_FIELD_TEXT["画面瞬间"],
    "基础姿态": POSE_FIELD_TEXT["基础姿态"],
    "身体方向": POSE_FIELD_TEXT["身体方向"],
    "身体重心": POSE_FIELD_TEXT["身体重心"],
    "肩颈状态": POSE_FIELD_TEXT["肩颈状态"],
    "手部动作": POSE_FIELD_TEXT["手部动作"],
    "腿部动作": POSE_FIELD_TEXT["腿部动作"],
    "头部方向": POSE_FIELD_TEXT["头部方向"],
    "视线": POSE_FIELD_TEXT["视线"],
    "表情": POSE_FIELD_TEXT["表情"],
    "场景大类": SCENE_CATEGORY_TEXT,
    "场景地点": SCENE_FIELD_TEXT["场景地点"],
    "时间切片": SCENE_FIELD_TEXT["时间切片"],
    "天气状态": SCENE_FIELD_TEXT["天气状态"],
    "前景框景": {**SCENE_FIELD_TEXT["前景框景"], **{
        "失焦嫩绿枫叶框景": "前景有大片失焦嫩绿色枫叶形成自然遮挡与框景",
        "浅木色桌沿前景": "画面下方由浅木色桌沿形成稳定的前景边界",
        "灰色门框纵向框景": "灰色门板与门框形成清晰的纵向框景",
        "深灰文件夹前景": "深灰色文件夹竖立在画面前景，与人物手部形成明确互动",
        "虚化咖啡杯与桌角": "前景保留轻度虚化的咖啡杯与桌角，增强生活空间层次",
        "窗框留白框景": "一侧窗框形成简洁纵向框景，并保留适量画面留白",
        "无明显前景": "前景保持干净通透，以人物作为唯一视觉中心",
    }},
    "背景环境": {**SCENE_FIELD_TEXT["背景环境"], **{
        "高亮夏日树林庭院": "背景为高亮虚化的夏日庭院绿景，浓密枝叶形成通透自然的空间层次",
        "林间小径树干纵深": "背景为向远处延伸的林间小径与高大树干，枝叶形成自然纵深",
        "暖木咖啡馆卡座": "背景为暖木墙面、深棕色皮质卡座、餐桌和轻度虚化的菜单牌，保留真实咖啡馆生活细节",
        "临街咖啡馆窗景": "背景为临街咖啡馆靠窗座位，透过玻璃可见轻度虚化的城市街景",
        "暖色走廊灰色门板": "背景为暖色走廊、浅色墙面与地砖，灰色门板保持清晰材质层次",
        "暖色酒店走廊": "背景为向远处延伸的现代酒店走廊、暖色墙灯与细腻地毯",
        "米杏沙发浅灰紫墙面": "背景保留米杏色沙发、浅灰紫墙面与左侧轻度虚化的绿色植物，空间简洁",
        "奶油色窗边室内": "背景为奶油色窗边室内、浅色桌面和柔和窗帘，只保留少量生活细节",
        "奶油公寓客厅": "背景为奶油色墙面、浅色沙发与柔软窗帘构成的通透公寓客厅",
        "现代办公休息区": "背景为现代办公楼内的简洁休息区，米杏沙发、浅灰墙面与绿植保持有序",
        "玻璃幕墙都市夜景": "背景为轻度虚化的玻璃幕墙与都市夜景光点，空间现代而不杂乱",
        "都市商业街": "背景为现代商业区人行道、玻璃建筑立面与轻度虚化的行人",
        "玻璃建筑大堂": "背景为大面积玻璃幕墙、石材地面与连续环境反射构成的现代建筑大堂",
        "酒店阳台开阔景观": "背景为酒店阳台与开阔的城市或海岸景观，远处层次清楚",
        "城市天台天际线": "背景为建筑天台、层次清楚的楼顶轮廓与远处城市天际线",
        "海边地平线": "背景为平缓沙面、向远处延伸的海面与清晰地平线",
        "独立书店书架": "背景为独立书店内排列整齐的木质书架与书籍脊背",
        "当代美术馆白墙": "背景为留白充足的当代美术馆白色展墙与少量大型画作",
        "临街花店陈列": "背景为临街花店内分层陈列的鲜花、绿叶与包装纸",
        "室外网球场": "背景为绿色室外网球场、清晰白色边线与远处金属围网",
        "明亮健身训练室": "背景为镜面、训练器械与浅色地面构成的明亮健身训练室",
        "复古茶餐厅": "背景为旧式卡座、花纹墙砖与暖色吊灯构成的复古茶餐厅",
        "高级灰摄影棚": "背景为简洁高级灰摄影棚，明暗渐变平滑，道具数量保持克制",
        "木质新中式室内": "背景为留白克制的木质新中式室内，只保留屏风、桌案和竹影三处细节",
        "家庭烘焙厨房": "背景为明亮整洁的家庭厨房，木质操作台、烤箱与少量烘焙器具形成生活层次",
        "复古唱片店": "背景为复古唱片店的木质唱片架、封套陈列与暖色墙灯",
        "自然采光画室": "背景为自然采光画室，画架、画布与少量颜料工具有序分布",
        "周末市集摊位": "背景为户外周末市集，布棚、鲜花与手作摊位沿街自然延伸",
        "彩色几何摄影棚": "背景为彩色几何块面构成的摄影棚，线条利落，道具保持克制",
        "花艺装置摄影棚": "背景为大型花枝与留白结构组成的花艺装置摄影棚",
        "婚纱礼服陈列厅": "背景为明亮雅致的婚纱礼服陈列厅，垂落帘幕与镜面保持简洁",
        "夜间便利店": "背景为夜间便利店的明亮货架、玻璃门与街边灯光",
        "地下停车场": "背景为冷灰色地下停车场，立柱、顶灯与车位线形成纵深",
        "繁忙街道路口": "背景为城市街道路口，斑马线、信号灯与轻度虚化的行人构成纪实层次",
        "城市人行天桥": "背景为现代城市人行天桥，栏杆线条与远处建筑形成清晰透视",
        "春日花海": "背景为成片开放的春日花海与远处柔和绿地，空间开阔通透",
        "静谧湖畔": "背景为平静湖面、近岸草地与远处树线，水面保留自然反光",
        "开阔草原": "背景为开阔草原与低缓地平线，远处天空占据较大画面面积",
        "秋日枫林": "背景为层次分明的秋日枫林与落叶小径，红橙叶片自然交叠",
        "冬日雪林": "背景为安静的冬日雪林，积雪地面与深色树干形成冷暖层次",
        "清幽竹林": "背景为纵向延伸的清幽竹林与窄小石径，画面留白克制",
        "海岸悬崖": "背景为海岸悬崖、翻涌海面与开阔天空，远近层次清楚",
        "沙漠旷野": "背景为连绵沙丘与开阔地平线，沙面保留清晰风纹",
        "乡间小路": "背景为穿过田野与树篱的乡间小路，空间自然延伸至远处",
        "海岛小镇街巷": "背景为临海小镇的浅色街巷、低矮建筑与远处海面",
        "山间露营地": "背景为山间草地、简洁帐篷与远处层叠山线，道具数量克制",
        "葡萄园庄园": "背景为排列整齐的葡萄藤、浅色庄园建筑与缓坡地形",
        "火车站候车厅": "背景为火车站候车厅的长椅、时刻屏与向远处延伸的站台入口",
        "拳击训练馆": "背景为拳击训练馆的拳台、沙袋与深色训练器械",
        "户外骑行道路": "背景为开阔的户外骑行道路、连续护栏与远处自然景观",
        "室内羽毛球馆": "背景为明亮室内羽毛球馆，球网、场地边线与高顶结构清晰可辨",
        "室内攀岩馆": "背景为室内攀岩馆的彩色岩点与高墙结构，空间纵深明确",
        "江南园林": "背景为江南园林的白墙黛瓦、曲折回廊与湿润石径",
        "敦煌壁画空间": "背景为受敦煌壁画启发的赭石墙面、飞天纹样与克制金色细节",
        "明制中式庭院": "背景为规整的中式庭院、木构门窗与青砖地面，空间秩序清楚",
        "传统书院": "背景为传统书院的木质书架、长案与透入室内的庭院光线",
        "七十年代客厅": "背景为七十年代暖调客厅，木质家具、花纹织物与旧式台灯协调陈列",
        "复古迪斯科舞厅": "背景为复古迪斯科舞厅的镜面球、彩色灯带与深色舞池",
        "经典火车站月台": "背景为经典火车站月台、旧式站牌与向远处延伸的轨道",
        "美式公路餐厅": "背景为美式公路餐厅的红色卡座、金属包边桌面与霓虹招牌",
        "月夜森林": "背景为月光照亮的深色森林、薄雾与少量发光植物，空间真实可辨",
        "哥特古堡厅堂": "背景为哥特古堡厅堂的尖拱、石柱与高窗，结构庄严而克制",
        "未来赛博街区": "背景为未来城市街区的霓虹标牌、湿润路面与高层建筑",
        "蒸汽机械空间": "背景为铜色管道、齿轮与压力表组成的蒸汽机械空间",
        "超现实梦境花园": "背景为尺度夸张的花朵、浅色雾气与弯曲小径组成的超现实花园",
        "星云神殿": "背景为高大石柱、星云天空与微弱发光纹路组成的幻想神殿",
        "水下幻境": "背景为通透水下空间、漂浮气泡与缓慢摆动的水生植物",
        "冰雪宫殿": "背景为半透明冰柱、冰晶拱门与覆雪地面组成的冷色宫殿",
        "云海仙境": "背景为层叠云海、远山与若隐若现的浅色古典建筑",
        "花瓣风暴装置空间": "背景为简洁摄影棚与大量悬浮花瓣组成的动态装置空间",
        "温泉汤池": "背景为蒸汽氤氲的温泉汤池与暖色石壁，水面泛起柔和涟漪",
        "和风木造庭院": "背景为日式木造庭院、枯山水与纸拉门，光影清透而克制",
        "瀑布溪流": "背景为倾泻而下的瀑布与清澈溪流，水雾朦胧、岩壁湿润",
        "剧院舞台": "背景为昏暗的剧院舞台、深红帷幕与一束顶光，空间纵深幽深",
        "海港码头": "背景为延伸入海的码头、缆桩与停泊船只，海风气息浓厚",
        "天使羽翼殿堂": "背景为柔和光雾缭绕的纯白殿堂，光柱倾泻而下",
        "少数民族集市": "背景为色彩浓郁的民族风情集市，织锦与银饰悬挂其间",
        "昭和和风房间": "背景为昭和年代的和风房间，障子门、矮桌与旧式暖灯",
        "上海滩街景": "背景为老上海滩街景，霓虹招牌、石库门与黄包车剪影",
    }},
    "环境细节": SCENE_FIELD_TEXT["环境细节"],
    "空间材质": SCENE_FIELD_TEXT["空间材质"],
    "空间层次": SCENE_FIELD_TEXT["空间层次"],
    **VISUAL_FIELD_TEXT,
    "景别": CAMERA_FIELD_TEXT["景别"],
    "画面布局": CAMERA_FIELD_TEXT["画面布局"],
    "等效焦段": CAMERA_FIELD_TEXT["等效焦段"],
    "拍摄距离": CAMERA_FIELD_TEXT["拍摄距离"],
    "机位": CAMERA_FIELD_TEXT["机位"],
    "景深": CAMERA_FIELD_TEXT["景深"],
    "对焦位置": CAMERA_FIELD_TEXT["对焦位置"],
}

# Exact-location themes reuse the same human-facing label for their scene
# location and background. Register those labels before FIELD_OPTIONS freezes
# the public widget choices, so complete theme bundles never carry an invalid
# synthetic location value.
for _background_label, _background_text in FIELD_TEXT["背景环境"].items():
    if (
        _background_label != EMPTY_CHOICE
        and _background_label not in FIELD_TEXT["场景地点"]
    ):
        FIELD_TEXT["场景地点"][_background_label] = _background_text.replace(
            "背景为", "场景位于", 1
        )


# Preset-specific atoms keep the built-in examples faithful to their approved
# references while still exposing every detail as an editable structured field.
_PRESET_FIELD_TEXT_ADDITIONS = {
    "发色": {"银白色": "银白色头发"},
    "发型造型": {"双环发髻": "头发梳成精致双环发髻"},
    "连体服类型": {"无袖瑜伽连体衣": "修身无袖瑜伽连体衣"},
    "上装类型": {
        "简洁短袖T恤": "简洁短袖T恤",
        "亮片吊带上衣": "亮片修身吊带上衣",
        "挂脖比基尼上装": "挂脖比基尼上装",
    },
    "下装类型": {
        "高开衩缎面长裙": "高开衩缎面长裙",
        "系带比基尼泳裤": "侧边系带比基尼泳裤",
    },
    "上装颜色": {"珊瑚红": "珊瑚红色"},
    "下装颜色": {"珊瑚红": "珊瑚红色"},
    "上装材质": {
        "亮片面料": "细密亮片面料",
        "泳装弹力面料": "泳装弹力面料",
    },
    "下装材质": {"泳装弹力面料": "泳装弹力面料"},
    "服装配件": {"浅粉色修身长袖内搭": "浅粉色修身长袖内搭"},
    "画面瞬间": {
        "夜间会所短暂停留": "在夜间会所短暂停留",
        "沙滩上短暂停留": "在沙滩上短暂停留",
        "瑜伽体式停留": "保持瑜伽体式的片刻",
        "窗边安静独处": "在窗边安静独处",
    },
    "基础姿态": {
        "单车侧坐": "侧身坐在复古自行车车座上",
        "复古扶手椅坐姿": "坐在复古雕花扶手椅上",
        "沙滩侧卧": "侧卧在明亮沙滩上并微微撑起上半身",
        "地面侧坐": "侧坐在地面上",
        "低位鸽子式": "在瑜伽垫上完成低位鸽子式变体",
        "窗边座椅坐姿": "侧身坐在窗边座椅上",
    },
    "手部动作": {
        "举白玫瑰并扶大腿": "一只手将白玫瑰举至脸侧，另一只手自然落在大腿上",
        "双手放在脑后": "双手抬起放在脑后，手臂自然展开",
        "一手扶膝一手搭扶手": "一只手轻放在膝盖上，另一只手搭在座椅扶手上",
        "双手持刺绣团扇": "双手一上一下握住一柄刺绣团扇",
        "侧卧双手支撑": "一侧前臂支撑身体，另一只手自然落在沙面",
        "双手交叠搭膝": "双手与前臂自然交叠在抬起的膝盖上",
        "瑜伽手部支撑": "一只手轻放在前侧大腿，另一只手自然落在髋侧",
        "双手捧白色瓷杯": "双手轻轻捧住一只白色瓷杯",
    },
    "腿部动作": {
        "扶手椅曲腿伸展": "一条腿屈膝抬起，另一条腿向画面下方舒展",
        "侧卧屈伸腿": "一条腿自然舒展，另一条腿屈曲形成清晰层次",
        "地面屈膝伸腿": "一条腿屈膝抬起，另一条腿沿地面向前伸展",
        "鸽子式腿部伸展": "前侧腿屈膝折叠，另一条腿沿地面向后伸直，脚背自然贴地",
    },
    "场景地点": {
        "公园草地": "场景位于阳光下的公园草地",
        "复古会所": "场景位于昏暗复古会所",
        "工业地下通道": "场景位于地下工业通道",
    },
    "背景环境": {
        "阳光公园草坪": "背景为阳光下的公园草坪与虚化树木",
        "复古会所雕花座椅": "背景为深色雕花座椅与东方装饰屏风",
        "工业通道铁丝网": "背景为铁丝网、混凝土地面与幽暗工业通道",
        "珊瑚粉薄荷绿渐变背景": "背景为珊瑚粉与薄荷绿色柔和渐变",
        "明亮落地窗客厅": "背景为浅灰布艺沙发、通透落地窗与室内绿植",
        "旧式旅馆房间": "背景为窗户、床铺、旧木家具与暖黄台灯组成的旧式旅馆房间",
    },
    "环境细节": {
        "复古自行车与白玫瑰": "复古自行车、白玫瑰与明亮草坪",
        "仙鹤屏风与深色家具": "东方仙鹤装饰屏风与深色木质家具",
        "铁丝网与工业地面": "铁丝网、混凝土地面与彩色灯光反射",
        "美容反光板": "影棚渐变背景与下方美容反光板",
        "沙发落地窗与绿植": "浅灰布艺沙发、落地窗与室内绿植",
        "旧木家具与暖黄台灯": "旧木家具、床铺与暖黄台灯",
    },
    "主配色": {
        "珊瑚粉与薄荷绿": "珊瑚粉与薄荷绿",
        "浅灰与暖白": "浅灰与暖白",
        "香槟粉与深棕黑": "香槟粉与深棕黑",
        "冷蓝与暖黄": "冷蓝与暖黄",
    },
}
for _field_name, _values in _PRESET_FIELD_TEXT_ADDITIONS.items():
    FIELD_TEXT[_field_name].update(_values)
    for _module_text in (
        POSE_VALUE_TEXT,
        SCENE_VALUE_TEXT,
        CLOTHING_VALUE_TEXT,
        HAIR_FIELD_TEXT,
        VISUAL_VALUE_TEXT,
    ):
        if _field_name in _module_text:
            _module_text[_field_name].update(_values)

_PRESET_POSE_STANDARD_TEXT = {
    label: text
    for field_name in POSE_OUTPUT_FIELDS
    for label, text in _PRESET_FIELD_TEXT_ADDITIONS.get(field_name, {}).items()
}

FIELD_OPTIONS = {name: list(FIELD_TEXT[name]) for name in FIELD_ORDER}

PRESETS: Dict[str, Dict[str, str]] = {
    "日系草地单车夏日柔光写真": {
        "画面比例": "2:3竖构图",
        "成像媒介": "35毫米胶片摄影",
        "写真大类": "自然户外",
        "写真主题": "日系森系夏日写真",
        "年龄阶段": "20–29岁",
        "族裔大类": "东亚",
        "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色",
        "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE,
        "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发",
        "发质与卷度": "柔和微卷",
        "发型造型": "自然披散",
        "刘海": "轻薄空气刘海",
        "头部配饰": "浅草色编织草帽",
        "穿搭结构": "连衣裙",
        "连衣裙类型": "碎花吊带连衣裙",
        "连衣裙颜色": "薄荷绿",
        "连衣裙材质": "雪纺",
        "连衣裙图案": "细小碎花",
        "连体服类型": EMPTY_CHOICE,
        "连体服颜色": EMPTY_CHOICE,
        "连体服材质": EMPTY_CHOICE,
        "连体服图案": EMPTY_CHOICE,
        "上装类型": EMPTY_CHOICE,
        "上装颜色": EMPTY_CHOICE,
        "上装材质": EMPTY_CHOICE,
        "上装图案": EMPTY_CHOICE,
        "下装类型": EMPTY_CHOICE,
        "下装颜色": EMPTY_CHOICE,
        "下装材质": EMPTY_CHOICE,
        "下装图案": EMPTY_CHOICE,
        "版型细节": "自然垂褶",
        "袜装": EMPTY_CHOICE,
        "鞋履": EMPTY_CHOICE,
        "画面瞬间": "枝叶下短暂停留",
        "基础姿态": "侧身站立",
        "身体方向": "左侧三分之二身",
        "身体重心": "右腿承重",
        "肩颈状态": "双肩放松平稳",
        "手部动作": "抱花束并扶帽檐",
        "腿部动作": "一腿轻微屈膝",
        "头部方向": "向右回眸",
        "视线": "柔和看向镜头",
        "表情": "温柔浅笑",
        "场景大类": "自然户外",
        "场景地点": "夏日庭院",
        "时间切片": "夏日午后",
        "天气状态": "湿润夏日",
        "前景框景": "嫩绿枫叶",
        "背景环境": "高亮庭院绿景",
        "环境细节": "浓密枝叶、白色小雏菊、浅色石板路",
        "空间材质": EMPTY_CHOICE,
        "空间层次": "植物层叠空间",
        "光线方案": "树叶斑驳逆光",
        "色彩方案": "嫩绿与白色高明度",
        "景别": "胸部以上",
        "画面布局": "中央偏右",
        "等效焦段": "85mm",
        "拍摄距离": "1.5米",
        "机位": "平视",
        "景深": "前景虚化",
        "对焦位置": "双眼与面部",
        "成像质感": "日系胶片柔焦",
    },
    "日系咖啡馆暖调近景人像": {
        "画面比例": "3:4竖构图",
        "成像媒介": "便携数码相机摄影",
        "写真大类": "日常生活",
        "写真主题": "日系咖啡馆生活写真",
        "年龄阶段": "20–29岁",
        "族裔大类": "东亚",
        "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色",
        "发色": "深栗棕色",
        "发色色调": EMPTY_CHOICE,
        "染色方式": EMPTY_CHOICE,
        "头发长度": "齐下巴",
        "发质与卷度": "整齐内扣",
        "发型造型": "利落短发轮廓",
        "刘海": "轻薄空气刘海",
        "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "上装＋下装",
        "连衣裙类型": EMPTY_CHOICE,
        "连衣裙颜色": EMPTY_CHOICE,
        "连衣裙材质": EMPTY_CHOICE,
        "连衣裙图案": EMPTY_CHOICE,
        "连体服类型": EMPTY_CHOICE,
        "连体服颜色": EMPTY_CHOICE,
        "连体服材质": EMPTY_CHOICE,
        "连体服图案": EMPTY_CHOICE,
        "上装类型": "挂脖针织上衣",
        "上装颜色": "咖色",
        "上装材质": "细罗纹针织",
        "上装图案": "横向条纹",
        "下装类型": "垂坠中长裙",
        "下装颜色": "奶油白",
        "下装材质": "西装面料",
        "下装图案": EMPTY_CHOICE,
        "版型细节": "修身贴合",
        "袜装": EMPTY_CHOICE,
        "鞋履": EMPTY_CHOICE,
        "画面瞬间": "咖啡馆短暂休息",
        "基础姿态": "卡座放松坐姿",
        "身体方向": "右侧三分之二身",
        "身体重心": "重心轻微后移",
        "肩颈状态": "肩膀轻微内收",
        "手部动作": "双手自然放在大腿上",
        "腿部动作": "坐姿双膝并拢",
        "头部方向": "头部正对镜头",
        "视线": "直视镜头",
        "表情": "平静自然",
        "场景大类": "餐饮与酒店",
        "场景地点": "咖啡馆卡座",
        "时间切片": "入夜不久",
        "天气状态": EMPTY_CHOICE,
        "前景框景": "浅木桌沿",
        "背景环境": "暖木咖啡馆",
        "环境细节": "浅木餐桌、菜单牌、咖啡杯碟",
        "空间材质": "深棕皮革",
        "空间层次": "紧凑室内层次",
        "光线方案": "暖色顶光正面环境光",
        "色彩方案": "暖棕奶白肤色",
        "景别": "胸部以上",
        "画面布局": "居中构图",
        "等效焦段": "50mm",
        "拍摄距离": "1米",
        "机位": "略高机位",
        "景深": "浅景深",
        "对焦位置": "双眼与面部",
        "成像质感": "便携数码相机直出",
    },
    "夜间室内轻奢硬闪时尚写真": {
        "画面比例": "2:3竖构图",
        "成像媒介": "专业数码相机摄影",
        "写真大类": "时尚编辑",
        "写真主题": "夜间室内轻奢时尚写真",
        "年龄阶段": "20–29岁",
        "族裔大类": "东亚",
        "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色",
        "发色": "自然黑色",
        "发色色调": EMPTY_CHOICE,
        "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发",
        "发质与卷度": "柔和微卷",
        "发型造型": "整洁高盘发",
        "刘海": "轻盈碎刘海",
        "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "连衣裙",
        "连衣裙类型": "高领修身连衣裙",
        "连衣裙颜色": "玄黑色",
        "连衣裙材质": "薄纱",
        "连衣裙图案": EMPTY_CHOICE,
        "连体服类型": EMPTY_CHOICE,
        "连体服颜色": EMPTY_CHOICE,
        "连体服材质": EMPTY_CHOICE,
        "连体服图案": EMPTY_CHOICE,
        "上装类型": EMPTY_CHOICE,
        "上装颜色": EMPTY_CHOICE,
        "上装材质": EMPTY_CHOICE,
        "上装图案": EMPTY_CHOICE,
        "下装类型": EMPTY_CHOICE,
        "下装颜色": EMPTY_CHOICE,
        "下装材质": EMPTY_CHOICE,
        "下装图案": EMPTY_CHOICE,
        "版型细节": "侧开衩",
        "袜装": "蕾丝袜口大腿袜",
        "鞋履": "漆皮高跟鞋",
        "画面瞬间": "推门时停下",
        "基础姿态": "门框间站立",
        "身体方向": "右侧三分之二身",
        "身体重心": "左腿承重",
        "肩颈状态": "一侧肩膀降低",
        "手部动作": "门把手与折扇",
        "腿部动作": "屈膝抬腿交叉",
        "头部方向": "头部正对镜头",
        "视线": "直视镜头",
        "表情": "明艳自信",
        "场景大类": "居住空间",
        "场景地点": "室内门廊",
        "时间切片": "入夜不久",
        "天气状态": EMPTY_CHOICE,
        "前景框景": "纵向门框",
        "背景环境": "灰色门板与走廊",
        "环境细节": "金属门把手、浅色石材地面",
        "空间材质": "灰色木饰面",
        "空间层次": "纵向框景",
        "光线方案": "镜头方向直接硬闪",
        "色彩方案": "黑红金暖灰",
        "景别": "全身构图",
        "画面布局": "门框框景",
        "等效焦段": "65mm",
        "拍摄距离": "3.5米",
        "机位": "略低机位",
        "景深": "中等景深",
        "对焦位置": "完整人物",
        "成像质感": "直接闪光商业写真",
    },
    "都市职场轻奢坐姿写真": {
        "画面比例": "2:3竖构图",
        "成像媒介": "全画幅微单摄影",
        "写真大类": "商业广告",
        "写真主题": "都市职场轻奢写真",
        "年龄阶段": "20–29岁",
        "族裔大类": "东亚",
        "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色",
        "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE,
        "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发",
        "发质与卷度": "顺滑高光质感",
        "发型造型": "整洁低盘发",
        "刘海": "自然中分",
        "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "西装套装",
        "连衣裙类型": EMPTY_CHOICE,
        "连衣裙颜色": EMPTY_CHOICE,
        "连衣裙材质": EMPTY_CHOICE,
        "连衣裙图案": EMPTY_CHOICE,
        "连体服类型": EMPTY_CHOICE,
        "连体服颜色": EMPTY_CHOICE,
        "连体服材质": EMPTY_CHOICE,
        "连体服图案": EMPTY_CHOICE,
        "上装类型": "修身西装马甲",
        "上装颜色": "玄黑色",
        "上装材质": "西装面料",
        "上装图案": EMPTY_CHOICE,
        "下装类型": "西装短裙",
        "下装颜色": "炭灰色",
        "下装材质": "西装面料",
        "下装图案": EMPTY_CHOICE,
        "版型细节": "深V领口",
        "袜装": "深灰半透明连裤袜",
        "鞋履": EMPTY_CHOICE,
        "画面瞬间": "查看文件",
        "基础姿态": "沙发前倾坐姿",
        "身体方向": "正面朝向镜头",
        "身体重心": "重心轻微前移",
        "肩颈状态": "前倾时肩颈放松",
        "手部动作": "签字笔与文件夹",
        "腿部动作": "坐姿双膝并拢",
        "头部方向": "头部正对镜头",
        "视线": "直视镜头",
        "表情": "冷静自信",
        "场景大类": "办公工作",
        "场景地点": "办公休息区",
        "时间切片": "上午晚些时候",
        "天气状态": EMPTY_CHOICE,
        "前景框景": "桌面文件",
        "背景环境": "办公沙发与墙面",
        "环境细节": "绿色植物、玻璃立柱、浅色石材地面",
        "空间材质": "米杏织物",
        "空间层次": "紧凑室内层次",
        "光线方案": "正面柔和散射光",
        "色彩方案": "职场暖灰酒红点缀",
        "景别": "坐姿半身",
        "画面布局": "中央偏右",
        "等效焦段": "70mm",
        "拍摄距离": "2米",
        "机位": "略高机位",
        "景深": "浅景深",
        "对焦位置": "双眼与面部",
        "成像质感": "细腻商业精修柔焦",
    },
    "古风汉服园林柔光写真": {
        "画面比例": "2:3竖构图",
        "成像媒介": "全画幅微单摄影",
        "写真大类": "中式美学",
        "写真主题": "汉服襦裙写真",
        "年龄阶段": "20–29岁",
        "族裔大类": "东亚",
        "地域族裔分支": "大类通用外观",
        "脸型": "标准鹅蛋脸",
        "轮廓细节": "下颌线柔和",
        "眼型": "杏仁眼",
        "瞳色": "深棕色",
        "眼睑特征": "自然双眼皮",
        "肤色": "暖白肤色",
        "肤质": "自然细腻",
        "妆容模式": "整体预设",
        "整体妆容预设": "清透裸粉妆",
        "底妆质感": EMPTY_CHOICE,
        "眼影色系": EMPTY_CHOICE,
        "眼线造型": EMPTY_CHOICE,
        "唇妆颜色": EMPTY_CHOICE,
        "唇面质感": EMPTY_CHOICE,
        "基础身形": "自然匀称",
        "身量观感": "中等身量",
        "线条重点": "肩颈线条舒展",
        "发色模式": "基础发色",
        "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE,
        "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发",
        "发质与卷度": "自然顺直",
        "发型造型": "整洁低盘发",
        "刘海": "自然中分",
        "头部配饰": "金色发簪",
        "穿搭结构": "连衣裙",
        "连衣裙类型": "汉服",
        "连衣裙颜色": "酒红色",
        "连衣裙材质": "真丝",
        "连衣裙图案": "暗纹提花",
        "连体服类型": EMPTY_CHOICE,
        "连体服颜色": EMPTY_CHOICE,
        "连体服材质": EMPTY_CHOICE,
        "连体服图案": EMPTY_CHOICE,
        "上装类型": EMPTY_CHOICE,
        "上装颜色": EMPTY_CHOICE,
        "上装材质": EMPTY_CHOICE,
        "上装图案": EMPTY_CHOICE,
        "下装类型": EMPTY_CHOICE,
        "下装颜色": EMPTY_CHOICE,
        "下装材质": EMPTY_CHOICE,
        "下装图案": EMPTY_CHOICE,
        "版型细节": "明确收腰",
        "袜装": EMPTY_CHOICE,
        "鞋履": EMPTY_CHOICE,
        "服装配件": "珍珠耳坠",
        "画面瞬间": "回眸一笑",
        "基础姿态": "自然站立",
        "身体方向": "左侧三分之二身",
        "身体重心": "右腿承重",
        "肩颈状态": "双肩放松平稳",
        "手部动作": "双手身前轻握",
        "腿部动作": "一腿轻微屈膝",
        "头部方向": "向右回眸",
        "视线": "柔和看向镜头",
        "表情": "温柔浅笑",
        "场景大类": "东方传统",
        "场景地点": "江南园林",
        "时间切片": "阴天下午",
        "天气状态": EMPTY_CHOICE,
        "前景框景": "树枝前景",
        "背景环境": "江南园林",
        "环境细节": "木质屏风",
        "空间材质": EMPTY_CHOICE,
        "空间层次": "前中后三层",
        "主光来源": "叶隙阳光",
        "光线方向": "左后方",
        "光线质地": "斑驳光影",
        "照明落点": "面部与肩颈",
        "阴影表现": "枝叶投影",
        "主配色": "薄荷绿与白",
        "色温倾向": "轻微偏暖",
        "画面对比": "低反差",
        "景别": "胸部以上",
        "画面布局": "中央偏右",
        "等效焦段": "85mm",
        "拍摄距离": "1.5米",
        "机位": "平视",
        "景深": "前景虚化",
        "对焦位置": "双眼与面部",
        "影像风格": "彩色负片",
        "细节质地": "胶片柔度",
        "高光处理": "轻微溢光",
        "颗粒质感": "细微颗粒",
    },
    "海边夏日泳装写真": {
        "画面比例": "2:3竖构图",
        "成像媒介": "便携数码相机摄影",
        "写真大类": "旅行度假",
        "写真主题": "海边夏日度假写真",
        "年龄阶段": "20–29岁",
        "族裔大类": "东亚",
        "地域族裔分支": "大类通用外观",
        "脸型": "标准鹅蛋脸",
        "轮廓细节": "下颌线柔和",
        "眼型": "杏仁眼",
        "瞳色": "深棕色",
        "眼睑特征": "自然双眼皮",
        "肤色": "暖白肤色",
        "肤质": "自然细腻",
        "妆容模式": "整体预设",
        "整体妆容预设": "清透裸粉妆",
        "底妆质感": EMPTY_CHOICE,
        "眼影色系": EMPTY_CHOICE,
        "眼线造型": EMPTY_CHOICE,
        "唇妆颜色": EMPTY_CHOICE,
        "唇面质感": EMPTY_CHOICE,
        "基础身形": "自然匀称",
        "身量观感": "中等身量",
        "线条重点": "肩颈线条舒展",
        "发色模式": "基础发色",
        "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE,
        "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发",
        "发质与卷度": "柔和微卷",
        "发型造型": "自然披散",
        "刘海": "轻薄空气刘海",
        "头部配饰": "浅草色编织草帽",
        "穿搭结构": "连衣裙",
        "连衣裙类型": "缎面吊带长裙",
        "连衣裙颜色": "天蓝色",
        "连衣裙材质": "雪纺",
        "连衣裙图案": EMPTY_CHOICE,
        "连体服类型": EMPTY_CHOICE,
        "连体服颜色": EMPTY_CHOICE,
        "连体服材质": EMPTY_CHOICE,
        "连体服图案": EMPTY_CHOICE,
        "上装类型": EMPTY_CHOICE,
        "上装颜色": EMPTY_CHOICE,
        "上装材质": EMPTY_CHOICE,
        "上装图案": EMPTY_CHOICE,
        "下装类型": EMPTY_CHOICE,
        "下装颜色": EMPTY_CHOICE,
        "下装材质": EMPTY_CHOICE,
        "下装图案": EMPTY_CHOICE,
        "版型细节": "自然垂褶",
        "袜装": EMPTY_CHOICE,
        "鞋履": EMPTY_CHOICE,
        "服装配件": "珍珠耳坠",
        "画面瞬间": "回眸一笑",
        "基础姿态": "自然站立",
        "身体方向": "左侧三分之二身",
        "身体重心": "右腿承重",
        "肩颈状态": "双肩放松平稳",
        "手部动作": "指向远方",
        "腿部动作": "一腿轻微屈膝",
        "头部方向": "向右回眸",
        "视线": "柔和看向镜头",
        "表情": "明朗笑容",
        "场景大类": "自然户外",
        "场景地点": "海边",
        "时间切片": "日落前金色时刻",
        "天气状态": "晴朗日照",
        "前景框景": "水面光斑",
        "背景环境": "海边地平线",
        "环境细节": "细小海浪",
        "空间材质": EMPTY_CHOICE,
        "空间层次": "开阔户外纵深",
        "主光来源": "叶隙阳光",
        "光线方向": "左后方",
        "光线质地": "斑驳光影",
        "照明落点": "面部与肩颈",
        "阴影表现": "枝叶投影",
        "主配色": "薄荷绿与白",
        "色温倾向": "轻微偏暖",
        "画面对比": "低反差",
        "景别": "胸部以上",
        "画面布局": "中央偏右",
        "等效焦段": "85mm",
        "拍摄距离": "1.5米",
        "机位": "平视",
        "景深": "前景虚化",
        "对焦位置": "双眼与面部",
        "影像风格": "彩色负片",
        "细节质地": "胶片柔度",
        "高光处理": "轻微溢光",
        "颗粒质感": "细微颗粒",
    },
    "赛博都市夜景写真": {
        "画面比例": "2:3竖构图",
        "成像媒介": "全画幅微单摄影",
        "写真大类": "幻想概念",
        "写真主题": "未来都市赛博写真",
        "年龄阶段": "20–29岁",
        "族裔大类": "东亚",
        "地域族裔分支": "大类通用外观",
        "脸型": "标准鹅蛋脸",
        "轮廓细节": "下颌线柔和",
        "眼型": "杏仁眼",
        "瞳色": "深棕色",
        "眼睑特征": "自然双眼皮",
        "肤色": "暖白肤色",
        "肤质": "自然细腻",
        "妆容模式": "整体预设",
        "整体妆容预设": "清透裸粉妆",
        "底妆质感": EMPTY_CHOICE,
        "眼影色系": EMPTY_CHOICE,
        "眼线造型": EMPTY_CHOICE,
        "唇妆颜色": EMPTY_CHOICE,
        "唇面质感": EMPTY_CHOICE,
        "基础身形": "自然匀称",
        "身量观感": "中等身量",
        "线条重点": "肩颈线条舒展",
        "发色模式": "进阶染发",
        "发色": "蓝黑色",
        "发色色调": "蓝黑反光",
        "染色方式": "均匀单色染",
        "头发长度": "及胸长发",
        "发质与卷度": "柔和微卷",
        "发型造型": "自然披散",
        "刘海": "轻薄空气刘海",
        "头部配饰": "几何金属发夹",
        "穿搭结构": "连衣裙",
        "连衣裙类型": "抹胸连衣裙",
        "连衣裙颜色": "玄黑色",
        "连衣裙材质": "漆皮",
        "连衣裙图案": "拼色结构",
        "连体服类型": EMPTY_CHOICE,
        "连体服颜色": EMPTY_CHOICE,
        "连体服材质": EMPTY_CHOICE,
        "连体服图案": EMPTY_CHOICE,
        "上装类型": EMPTY_CHOICE,
        "上装颜色": EMPTY_CHOICE,
        "上装材质": EMPTY_CHOICE,
        "上装图案": EMPTY_CHOICE,
        "下装类型": EMPTY_CHOICE,
        "下装颜色": EMPTY_CHOICE,
        "下装材质": EMPTY_CHOICE,
        "下装图案": EMPTY_CHOICE,
        "版型细节": "修身贴合",
        "袜装": EMPTY_CHOICE,
        "鞋履": EMPTY_CHOICE,
        "服装配件": "珍珠耳坠",
        "画面瞬间": "行走中回头",
        "基础姿态": "行走中停步",
        "身体方向": "左侧三分之二身",
        "身体重心": "重心轻微前移",
        "肩颈状态": "双肩放松平稳",
        "手部动作": "双臂自然垂落",
        "腿部动作": "自然迈步",
        "头部方向": "向右回眸",
        "视线": "柔和看向镜头",
        "表情": "明艳自信",
        "场景大类": "都市户外",
        "场景地点": "未来赛博街区",
        "时间切片": "夜间",
        "天气状态": EMPTY_CHOICE,
        "前景框景": "失焦光点",
        "背景环境": "未来赛博街区",
        "环境细节": "霓虹招牌",
        "空间材质": EMPTY_CHOICE,
        "空间层次": "反射空间层次",
        "主光来源": "叶隙阳光",
        "光线方向": "左后方",
        "光线质地": "斑驳光影",
        "照明落点": "面部与肩颈",
        "阴影表现": "枝叶投影",
        "主配色": "薄荷绿与白",
        "色温倾向": "轻微偏暖",
        "画面对比": "低反差",
        "景别": "胸部以上",
        "画面布局": "中央偏右",
        "等效焦段": "85mm",
        "拍摄距离": "1.5米",
        "机位": "平视",
        "景深": "前景虚化",
        "对焦位置": "双眼与面部",
        "影像风格": "彩色负片",
        "细节质地": "胶片柔度",
        "高光处理": "轻微溢光",
        "颗粒质感": "细微颗粒",
    },
}


def _new_empty_preset() -> Dict[str, str]:
    return {field_name: EMPTY_CHOICE for field_name in FIELD_ORDER}


for _new_preset_name in (
    "影棚水光妆美容特写",
    "落地窗瑜伽塑形写真",
    "旅馆窗边电影静帧",
):
    PRESETS[_new_preset_name] = _new_empty_preset()


_PRESET_BASE_OVERRIDES = {
    "日系草地单车夏日柔光写真": {
        "画面比例": "2:3竖构图", "成像媒介": "全画幅微单摄影",
        "写真大类": "运动健康", "写真主题": "户外骑行活力写真",
        "年龄阶段": "20–29岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色", "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE, "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发", "发质与卷度": "柔和微卷",
        "发型造型": "半扎发", "刘海": "自然中分", "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "上装＋下装",
        "上装类型": "简洁短袖T恤", "上装颜色": "奶油白",
        "上装材质": "棉质", "上装图案": EMPTY_CHOICE,
        "下装类型": "直筒牛仔裤", "下装颜色": "藏青色",
        "下装材质": "牛仔", "下装图案": EMPTY_CHOICE,
        "版型细节": "高腰结构", "袜装": EMPTY_CHOICE,
        "鞋履": EMPTY_CHOICE,
        "画面瞬间": "回眸一笑", "基础姿态": "单车侧坐",
        "身体方向": "右侧三分之二身", "身体重心": "坐姿重心居中",
        "肩颈状态": "双肩放松平稳", "手部动作": "举白玫瑰并扶大腿",
        "腿部动作": "坐姿一腿稍向前", "头部方向": "向左回眸",
        "视线": "柔和看向镜头", "表情": "温柔浅笑",
        "场景大类": "自然户外", "场景地点": "公园草地",
        "时间切片": "日落前金色时刻", "天气状态": "晴朗日照",
        "前景框景": "失焦绿叶", "背景环境": "阳光公园草坪",
        "环境细节": "复古自行车与白玫瑰", "空间材质": EMPTY_CHOICE,
        "空间层次": "开阔户外纵深",
        "景别": "三分之二身", "画面布局": "中央偏左",
        "等效焦段": "85mm", "拍摄距离": "2米", "机位": "平视",
        "景深": "浅景深", "对焦位置": "双眼与面部",
    },
    "日系咖啡馆暖调近景人像": {
        "画面比例": "3:4竖构图", "成像媒介": "手机计算摄影",
        "写真大类": "日常生活", "写真主题": "日系咖啡馆生活写真",
        "年龄阶段": "20–29岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色", "发色": "深栗棕色",
        "发色色调": EMPTY_CHOICE, "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发", "发质与卷度": "自然顺直",
        "发型造型": "自然披散", "刘海": "轻薄空气刘海", "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "上装＋下装", "上装类型": "一字肩上衣",
        "上装颜色": "天蓝色", "上装材质": "柔软针织", "上装图案": "横向条纹",
        "下装类型": "直筒西裤", "下装颜色": "玄黑色",
        "下装材质": "西装面料", "下装图案": EMPTY_CHOICE,
        "版型细节": "宽松垂坠", "袜装": EMPTY_CHOICE, "鞋履": EMPTY_CHOICE,
        "画面瞬间": "端起咖啡杯", "基础姿态": "椅子前缘坐姿",
        "身体方向": "正面朝向镜头", "身体重心": "坐姿重心居中",
        "肩颈状态": "肩膀轻微内收", "手部动作": "双手托住咖啡杯",
        "腿部动作": "坐姿双膝并拢", "头部方向": "头部正对镜头",
        "视线": "直视镜头", "表情": "平静自然",
        "场景大类": "餐饮与酒店", "场景地点": "咖啡馆窗边",
        "时间切片": "上午晚些时候", "天气状态": "晴朗日照",
        "前景框景": "浅木桌沿", "背景环境": "临街咖啡馆窗景",
        "环境细节": "浅木餐桌、咖啡杯碟", "空间材质": "暖木材质",
        "空间层次": "俯视纵深",
        "景别": "坐姿半身", "画面布局": "居中构图",
        "等效焦段": "28mm", "拍摄距离": "1米", "机位": "高位俯拍",
        "景深": "中浅景深", "对焦位置": "双眼与面部",
    },
    "夜间室内轻奢硬闪时尚写真": {
        "画面比例": "3:4竖构图", "成像媒介": "早期CCD数码摄影",
        "写真大类": "时尚编辑", "写真主题": "夜间室内轻奢时尚写真",
        "年龄阶段": "20–29岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色", "发色": "自然黑色",
        "发色色调": EMPTY_CHOICE, "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发", "发质与卷度": "柔和微卷",
        "发型造型": "自然披散", "刘海": "自然露额", "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "上装＋下装", "上装类型": "亮片吊带上衣",
        "上装颜色": "奶油白", "上装材质": "亮片面料", "上装图案": EMPTY_CHOICE,
        "下装类型": "高开衩缎面长裙", "下装颜色": "干枯玫瑰色",
        "下装材质": "缎面", "下装图案": EMPTY_CHOICE,
        "版型细节": "侧开衩", "袜装": EMPTY_CHOICE, "鞋履": "高跟凉鞋",
        "画面瞬间": "夜间会所短暂停留", "基础姿态": "复古扶手椅坐姿",
        "身体方向": "斜向镜头前方", "身体重心": "重心落向右侧坐骨",
        "肩颈状态": "双肩向后打开", "手部动作": "双手放在脑后",
        "腿部动作": "扶手椅曲腿伸展", "头部方向": "头部正对镜头",
        "视线": "直视镜头", "表情": "明艳自信",
        "场景大类": "餐饮与酒店", "场景地点": "复古会所",
        "时间切片": "深夜", "天气状态": EMPTY_CHOICE,
        "前景框景": "椅背边缘", "背景环境": "复古会所雕花座椅",
        "环境细节": "仙鹤屏风与深色家具", "空间材质": "深棕皮革",
        "空间层次": "紧凑室内层次",
        "景别": "全身构图", "画面布局": "对角线构图",
        "等效焦段": "50mm", "拍摄距离": "2.5米", "机位": "略低机位",
        "景深": "中等景深", "对焦位置": "完整人物",
    },
    "都市职场轻奢坐姿写真": {
        "画面比例": "3:4竖构图", "成像媒介": "全画幅微单摄影",
        "写真大类": "商业广告", "写真主题": "都市职场轻奢写真",
        "年龄阶段": "30–39岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色", "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE, "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发", "发质与卷度": "自然顺直",
        "发型造型": "自然披散", "刘海": "自然中分", "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "上装＋下装", "上装类型": "垂坠衬衫",
        "上装颜色": "巧克力棕", "上装材质": "柔软针织", "上装图案": EMPTY_CHOICE,
        "下装类型": "西装短裙", "下装颜色": "象牙白",
        "下装材质": "西装面料", "下装图案": EMPTY_CHOICE,
        "版型细节": "修身贴合", "袜装": "蕾丝袜口大腿袜",
        "鞋履": "漆皮高跟鞋",
        "画面瞬间": "坐下整理思绪", "基础姿态": "椅子前缘坐姿",
        "身体方向": "正面朝向镜头", "身体重心": "坐姿重心居中",
        "肩颈状态": "双肩放松平稳", "手部动作": "一手扶膝一手搭扶手",
        "腿部动作": "膝部交叠坐姿", "头部方向": "头部正对镜头",
        "视线": "直视镜头", "表情": "冷静自信",
        "场景大类": "办公工作", "场景地点": "行政办公室",
        "时间切片": "上午晚些时候", "天气状态": "晴朗日照",
        "前景框景": "桌面文件", "背景环境": "玻璃建筑大堂",
        "环境细节": "绿色植物、玻璃立柱、浅色石材地面",
        "空间材质": "通透玻璃", "空间层次": "前中后三层",
        "景别": "全身构图", "画面布局": "居中构图",
        "等效焦段": "70mm", "拍摄距离": "3.5米", "机位": "平视",
        "景深": "中浅景深", "对焦位置": "完整人物",
    },
    "古风汉服园林柔光写真": {
        "画面比例": "3:4竖构图", "成像媒介": "全画幅微单摄影",
        "写真大类": "中式美学", "写真主题": "汉服襦裙写真",
        "年龄阶段": "20–29岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色", "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE, "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发", "发质与卷度": "自然顺直",
        "发型造型": "双环发髻", "刘海": "轻薄空气刘海", "头部配饰": "小白花发饰",
        "穿搭结构": "连衣裙", "连衣裙类型": "汉服",
        "连衣裙颜色": "象牙白", "连衣裙材质": "薄纱", "连衣裙图案": "花卉刺绣",
        "版型细节": "层叠衣摆", "袜装": EMPTY_CHOICE, "鞋履": EMPTY_CHOICE,
        "画面瞬间": "回眸一笑", "基础姿态": "侧身站立",
        "身体方向": "四分之三背身", "身体重心": "右腿承重",
        "肩颈状态": "双肩放松平稳", "手部动作": "双手持刺绣团扇",
        "腿部动作": "一腿轻微屈膝", "头部方向": "向右回眸",
        "视线": "柔和看向镜头", "表情": "明朗笑容",
        "场景大类": "东方传统", "场景地点": "江南园林",
        "时间切片": "夏日午后", "天气状态": "薄云天气",
        "前景框景": "树枝前景", "背景环境": "江南园林",
        "环境细节": "木质屏风、茶具、竹影", "空间材质": "暖木材质",
        "空间层次": "植物层叠空间",
        "景别": "胸部以上", "画面布局": "中央偏右",
        "等效焦段": "85mm", "拍摄距离": "1.5米", "机位": "平视",
        "景深": "浅景深", "对焦位置": "双眼与面部",
    },
    "海边夏日泳装写真": {
        "画面比例": "3:2横构图", "成像媒介": "数码单反摄影",
        "写真大类": "旅行度假", "写真主题": "海边夏日度假写真",
        "年龄阶段": "20–29岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色", "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE, "染色方式": EMPTY_CHOICE,
        "头发长度": "及胸长发", "发质与卷度": "自然顺直",
        "发型造型": "自然披散", "刘海": "轻薄空气刘海", "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "上装＋下装", "上装类型": "挂脖比基尼上装",
        "上装颜色": "珊瑚红", "上装材质": "泳装弹力面料", "上装图案": EMPTY_CHOICE,
        "下装类型": "系带比基尼泳裤", "下装颜色": "珊瑚红",
        "下装材质": "泳装弹力面料", "下装图案": EMPTY_CHOICE,
        "版型细节": "修身贴合", "袜装": EMPTY_CHOICE, "鞋履": EMPTY_CHOICE,
        "画面瞬间": "沙滩上短暂停留", "基础姿态": "沙滩侧卧",
        "身体方向": "右侧侧身", "身体重心": "重心落向右侧坐骨",
        "肩颈状态": "肩背舒展", "手部动作": "侧卧双手支撑",
        "腿部动作": "侧卧屈伸腿", "头部方向": "头部正对镜头",
        "视线": "柔和看向镜头", "表情": "自然放松微笑",
        "场景大类": "自然户外", "场景地点": "沙滩",
        "时间切片": "正午", "天气状态": "晴朗日照",
        "前景框景": "无明显前景", "背景环境": "海边地平线",
        "环境细节": "细小海浪", "空间材质": EMPTY_CHOICE,
        "空间层次": "开阔户外纵深",
        "景别": "全身构图", "画面布局": "对角线构图",
        "等效焦段": "50mm", "拍摄距离": "2.5米", "机位": "贴近地面",
        "景深": "中浅景深", "对焦位置": "完整人物",
    },
    "赛博都市夜景写真": {
        "画面比例": "3:2横构图", "成像媒介": "专业数码相机摄影",
        "写真大类": "幻想概念", "写真主题": "未来都市赛博写真",
        "年龄阶段": "20–29岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色", "发色": "银白色",
        "发色色调": EMPTY_CHOICE, "染色方式": EMPTY_CHOICE,
        "头发长度": "齐下巴", "发质与卷度": "自然顺直",
        "发型造型": "利落短发轮廓", "刘海": "全幅齐刘海", "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "连体服", "连体服类型": "收腰连体短裤",
        "连体服颜色": "玄黑色", "连体服材质": "哑光皮革", "连体服图案": "拼色结构",
        "版型细节": "修身贴合", "袜装": EMPTY_CHOICE, "鞋履": "过膝长靴",
        "画面瞬间": "墙边安静等待", "基础姿态": "地面侧坐",
        "身体方向": "右侧三分之二身", "身体重心": "重心落向右侧坐骨",
        "肩颈状态": "肩膀轻微内收", "手部动作": "双手交叠搭膝",
        "腿部动作": "地面屈膝伸腿", "头部方向": "头部转向左侧",
        "视线": "看向画面左侧近处", "表情": "清冷疏离",
        "场景大类": "工业功能", "场景地点": "工业地下通道",
        "时间切片": "深夜", "天气状态": EMPTY_CHOICE,
        "前景框景": "失焦光点", "背景环境": "工业通道铁丝网",
        "环境细节": "铁丝网与工业地面", "空间材质": "清水混凝土",
        "空间层次": "走廊纵深",
        "景别": "全身构图", "画面布局": "对角线构图",
        "等效焦段": "35mm", "拍摄距离": "2.5米", "机位": "贴近地面",
        "景深": "中等景深", "对焦位置": "完整人物",
    },
    "影棚水光妆美容特写": {
        "画面比例": "4:5竖构图", "成像媒介": "中画幅数码摄影",
        "写真大类": "美妆美容", "写真主题": "影棚水光妆美容特写",
        "年龄阶段": "20–29岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色", "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE, "染色方式": EMPTY_CHOICE,
        "头发长度": "锁骨发", "发质与卷度": "自然顺直",
        "发型造型": "整洁低盘发", "刘海": "轻盈碎刘海", "头部配饰": EMPTY_CHOICE,
        "穿搭结构": EMPTY_CHOICE,
        "画面瞬间": "棚拍间隙调整姿态", "基础姿态": "自然站立",
        "身体方向": "正面朝向镜头", "身体重心": "双脚均衡承重",
        "肩颈状态": "双肩放松平稳", "手部动作": "一手托腮",
        "腿部动作": EMPTY_CHOICE, "头部方向": "向右轻微侧倾",
        "视线": "直视镜头", "表情": "温柔浅笑",
        "场景大类": "专业特色", "场景地点": "摄影棚",
        "时间切片": EMPTY_CHOICE, "天气状态": EMPTY_CHOICE,
        "前景框景": "发丝前景", "背景环境": "珊瑚粉薄荷绿渐变背景",
        "环境细节": "美容反光板", "空间材质": "白色涂料墙面",
        "空间层次": "单侧环境留白",
        "景别": "面部特写", "画面布局": "贴近裁切",
        "等效焦段": "105mm", "拍摄距离": "0.5米", "机位": "平视",
        "景深": "极浅景深", "对焦位置": "双眼与面部",
    },
    "落地窗瑜伽塑形写真": {
        "画面比例": "16:9横构图", "成像媒介": "全画幅微单摄影",
        "写真大类": "运动健康", "写真主题": "瑜伽普拉提生活写真",
        "年龄阶段": "20–29岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色", "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE, "染色方式": EMPTY_CHOICE,
        "头发长度": "锁骨发", "发质与卷度": "柔和微卷",
        "发型造型": "自然披散", "刘海": "自然露额", "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "连体服", "连体服类型": "无袖瑜伽连体衣",
        "连体服颜色": "炭灰色", "连体服材质": "细罗纹针织", "连体服图案": EMPTY_CHOICE,
        "版型细节": "修身贴合", "袜装": EMPTY_CHOICE, "鞋履": EMPTY_CHOICE,
        "画面瞬间": "瑜伽体式停留", "基础姿态": "低位鸽子式",
        "身体方向": "右侧侧身", "身体重心": "重心落向右侧坐骨",
        "肩颈状态": "肩背舒展", "手部动作": "瑜伽手部支撑",
        "腿部动作": "鸽子式腿部伸展", "头部方向": "头部转向左侧",
        "视线": "侧目看向镜头", "表情": "平静自然",
        "场景大类": "居住空间", "场景地点": "采光客厅",
        "时间切片": "上午晚些时候", "天气状态": "晴朗日照",
        "前景框景": "无明显前景", "背景环境": "明亮落地窗客厅",
        "环境细节": "沙发落地窗与绿植", "空间材质": "米杏织物",
        "空间层次": "窗内外层次",
        "景别": "全身构图", "画面布局": "中央偏右",
        "等效焦段": "50mm", "拍摄距离": "2.5米", "机位": "贴近地面",
        "景深": "中浅景深", "对焦位置": "面部与上半身",
    },
    "旅馆窗边电影静帧": {
        "画面比例": "21:9横构图", "成像媒介": "35毫米胶片摄影",
        "写真大类": "电影叙事", "写真主题": "旅馆窗边电影静帧",
        "年龄阶段": "30–39岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
        "发色模式": "基础发色", "发色": "深棕黑色",
        "发色色调": EMPTY_CHOICE, "染色方式": EMPTY_CHOICE,
        "头发长度": "锁骨发", "发质与卷度": "柔和微卷",
        "发型造型": "自然披散", "刘海": "自然中分", "头部配饰": EMPTY_CHOICE,
        "穿搭结构": "上装＋下装", "上装类型": "针织套头毛衣",
        "上装颜色": "燕麦色", "上装材质": "柔软针织", "上装图案": EMPTY_CHOICE,
        "下装类型": "垂坠中长裙", "下装颜色": "炭灰色",
        "下装材质": "棉麻", "下装图案": EMPTY_CHOICE,
        "版型细节": "宽松垂坠", "袜装": EMPTY_CHOICE, "鞋履": EMPTY_CHOICE,
        "画面瞬间": "窗边安静独处", "基础姿态": "窗边座椅坐姿",
        "身体方向": "左侧侧身", "身体重心": "重心落向左侧坐骨",
        "肩颈状态": "肩膀轻微内收", "手部动作": "双手捧白色瓷杯",
        "腿部动作": "坐姿双腿偏向一侧", "头部方向": "头部转向右侧",
        "视线": "看向窗外", "表情": "若有所思",
        "场景大类": "餐饮与酒店", "场景地点": "酒店客房",
        "时间切片": "蓝调时刻", "天气状态": "阴天",
        "前景框景": "窗帘边缘", "背景环境": "旧式旅馆房间",
        "环境细节": "旧木家具与暖黄台灯", "空间材质": "暖木材质",
        "空间层次": "窗内外层次",
        "景别": "环境人像", "画面布局": "左侧三分线",
        "等效焦段": "50mm", "拍摄距离": "2.5米", "机位": "平视",
        "景深": "中等景深", "对焦位置": "人物与环境",
    },
}
for _preset_name, _overrides in _PRESET_BASE_OVERRIDES.items():
    PRESETS[_preset_name].update(_overrides)
    _active_clothing_fields = set(
        CLOTHING_MODE_FIELDS.get(PRESETS[_preset_name]["穿搭结构"], ())
    )
    for _field_name in CLOTHING_BRANCH_FIELDS:
        if _field_name not in _active_clothing_fields:
            PRESETS[_preset_name][_field_name] = EMPTY_CHOICE


_EMPTY_CUSTOM_MAKEUP = {
    field_name: EMPTY_CHOICE for field_name in MAKEUP_CUSTOM_FIELDS
}
_PRESET_PERSON_VALUES = {
    "日系草地单车夏日柔光写真": {
        "脸型": "标准鹅蛋脸", "轮廓细节": "下颌线柔和",
        "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
        "肤色": "暖白肤色", "肤质": "自然细腻",
        "妆容模式": "整体预设", "整体妆容预设": "清透裸粉妆",
        **_EMPTY_CUSTOM_MAKEUP,
        "基础身形": "自然匀称", "身量观感": "中等身量",
        "线条重点": "肩颈线条舒展",
    },
    "日系咖啡馆暖调近景人像": {
        "脸型": "圆润脸型", "轮廓细节": "面颊饱满",
        "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
        "肤色": "暖白肤色", "肤质": "自然细腻",
        "妆容模式": "整体预设", "整体妆容预设": "清透裸粉妆",
        **_EMPTY_CUSTOM_MAKEUP,
        "基础身形": "柔和丰润", "身量观感": "中等身量",
        "线条重点": "肩颈线条舒展",
    },
    "夜间室内轻奢硬闪时尚写真": {
        "脸型": "修长脸型", "轮廓细节": "下颌线清晰",
        "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
        "肤色": "冷白肤色", "肤质": "柔雾均匀",
        "妆容模式": "整体预设", "整体妆容预设": "明艳红唇妆",
        **_EMPTY_CUSTOM_MAKEUP,
        "基础身形": "柔和丰润", "身量观感": "高挑身量",
        "线条重点": "腰胯曲线柔和",
    },
    "都市职场轻奢坐姿写真": {
        "脸型": "修长脸型", "轮廓细节": "下颌线清晰",
        "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
        "肤色": "暖白肤色", "肤质": "自然细腻",
        "妆容模式": "整体预设", "整体妆容预设": "清透裸粉妆",
        **_EMPTY_CUSTOM_MAKEUP,
        "基础身形": "自然匀称", "身量观感": "中等身量",
        "线条重点": "腰线自然清晰",
    },
    "古风汉服园林柔光写真": {
        "脸型": "标准鹅蛋脸",
        "轮廓细节": "下颌线柔和",
        "眼型": "杏仁眼",
        "瞳色": "深棕色",
        "眼睑特征": "自然双眼皮",
        "肤色": "暖白肤色",
        "肤质": "自然细腻",
        "妆容模式": "整体预设",
        "整体妆容预设": "清透裸粉妆",
        "底妆质感": EMPTY_CHOICE,
        "眼影色系": EMPTY_CHOICE,
        "眼线造型": EMPTY_CHOICE,
        "唇妆颜色": EMPTY_CHOICE,
        "唇面质感": EMPTY_CHOICE,
        "基础身形": "自然匀称",
        "身量观感": "中等身量",
        "线条重点": "肩颈线条舒展",
        **_EMPTY_CUSTOM_MAKEUP,
    },
    "海边夏日泳装写真": {
        "脸型": "标准鹅蛋脸",
        "轮廓细节": "下颌线柔和",
        "眼型": "杏仁眼",
        "瞳色": "深棕色",
        "眼睑特征": "自然双眼皮",
        "肤色": "暖白肤色",
        "肤质": "自然细腻",
        "妆容模式": "整体预设",
        "整体妆容预设": "清透裸粉妆",
        "底妆质感": EMPTY_CHOICE,
        "眼影色系": EMPTY_CHOICE,
        "眼线造型": EMPTY_CHOICE,
        "唇妆颜色": EMPTY_CHOICE,
        "唇面质感": EMPTY_CHOICE,
        "基础身形": "自然匀称",
        "身量观感": "中等身量",
        "线条重点": "肩颈线条舒展",
        **_EMPTY_CUSTOM_MAKEUP,
    },
    "赛博都市夜景写真": {
        "脸型": "修长脸型",
        "轮廓细节": "下颌线清晰",
        "眼型": "杏仁眼",
        "瞳色": "深棕色",
        "眼睑特征": "自然双眼皮",
        "肤色": "冷白肤色",
        "肤质": "柔雾均匀",
        "妆容模式": "整体预设",
        "整体妆容预设": "明艳红唇妆",
        "底妆质感": EMPTY_CHOICE,
        "眼影色系": EMPTY_CHOICE,
        "眼线造型": EMPTY_CHOICE,
        "唇妆颜色": EMPTY_CHOICE,
        "唇面质感": EMPTY_CHOICE,
        "基础身形": "柔和丰润",
        "身量观感": "高挑身量",
        "线条重点": "腰胯曲线柔和",
        **_EMPTY_CUSTOM_MAKEUP,
    },
}
_PRESET_CLOTHING_ACCESSORIES = {
    "日系草地单车夏日柔光写真": "珍珠耳坠",
    "日系咖啡馆暖调近景人像": "珍珠耳坠",
    "夜间室内轻奢硬闪时尚写真": "金属流苏耳饰",
    "都市职场轻奢坐姿写真": "细框矩形眼镜",
    "古风汉服园林柔光写真": "珍珠耳坠",
    "海边夏日泳装写真": "珍珠耳坠",
    "赛博都市夜景写真": "金属流苏耳饰",
}

_PRESET_PERSON_VALUES.update({
    "影棚水光妆美容特写": {
        "脸型": "标准鹅蛋脸", "轮廓细节": "下颌线柔和",
        "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
        "肤色": "暖白肤色", "肤质": "柔润水光",
        "妆容模式": "整体预设", "整体妆容预设": "蜜桃珊瑚妆",
        **_EMPTY_CUSTOM_MAKEUP,
        "基础身形": "自然匀称", "身量观感": "中等身量",
        "线条重点": "肩颈线条舒展",
    },
    "落地窗瑜伽塑形写真": {
        "脸型": "标准鹅蛋脸", "轮廓细节": "下颌线柔和",
        "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
        "肤色": "暖白肤色", "肤质": "真实皮肤纹理",
        "妆容模式": "整体预设", "整体妆容预设": "自然裸妆",
        **_EMPTY_CUSTOM_MAKEUP,
        "基础身形": "健康运动型", "身量观感": "中等身量",
        "线条重点": "腰胯曲线柔和",
    },
    "旅馆窗边电影静帧": {
        "脸型": "标准鹅蛋脸", "轮廓细节": "颧骨柔和",
        "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
        "肤色": "自然浅肤色", "肤质": "真实皮肤纹理",
        "妆容模式": "整体预设", "整体妆容预设": "自然裸妆",
        **_EMPTY_CUSTOM_MAKEUP,
        "基础身形": "自然匀称", "身量观感": "中等身量",
        "线条重点": "肩颈线条舒展",
    },
})
_PRESET_CLOTHING_ACCESSORIES.update({
    "日系草地单车夏日柔光写真": "金属腕表",
    "日系咖啡馆暖调近景人像": "纤细项链",
    "夜间室内轻奢硬闪时尚写真": "金属流苏耳饰",
    "都市职场轻奢坐姿写真": EMPTY_CHOICE,
    "古风汉服园林柔光写真": EMPTY_CHOICE,
    "海边夏日泳装写真": EMPTY_CHOICE,
    "赛博都市夜景写真": "浅粉色修身长袖内搭",
    "影棚水光妆美容特写": EMPTY_CHOICE,
    "落地窗瑜伽塑形写真": EMPTY_CHOICE,
    "旅馆窗边电影静帧": EMPTY_CHOICE,
})

for _preset_name, _person_values in _PRESET_PERSON_VALUES.items():
    _preset = PRESETS[_preset_name]
    _preset.update(_person_values)
    _preset["服装配件"] = _PRESET_CLOTHING_ACCESSORIES[_preset_name]

# The first prototype stored visual direction in three large phrases. Expand
# those presets into atomic controls so users can override only one property.
_PRESET_VISUAL_BUNDLES = {
    "日系草地单车夏日柔光写真": (
        "forest_dappled_backlight", "japanese_summer_film"
    ),
    "日系咖啡馆暖调近景人像": (
        "cafe_warm_ambient", "warm_cafe_digital"
    ),
    "夜间室内轻奢硬闪时尚写真": (
        "camera_hard_flash", "night_flash_fashion"
    ),
    "都市职场轻奢坐姿写真": (
        "bounce_front_fill", "office_luxury_clean"
    ),
    "古风汉服园林柔光写真": (
        "window_soft_side", "new_chinese_matte"
    ),
    "海边夏日泳装写真": (
        "golden_backlight", "beach_vacation"
    ),
    "赛博都市夜景写真": (
        "neon_mixed_side", "purple_neon_digital"
    ),
}
_PRESET_VISUAL_BUNDLES.update({
    "日系草地单车夏日柔光写真": ("golden_backlight", "earthy_outdoor"),
    "日系咖啡馆暖调近景人像": ("window_soft_side", "phone_natural"),
    "夜间室内轻奢硬闪时尚写真": ("camera_hard_flash", "ccd_lifestyle"),
    "都市职场轻奢坐姿写真": ("window_soft_side", "office_luxury_clean"),
    "古风汉服园林柔光写真": ("forest_dappled_backlight", "new_chinese_matte"),
    "海边夏日泳装写真": ("direct_sun_side", "beach_vacation"),
    "赛博都市夜景写真": ("neon_mixed_side", "purple_neon_digital"),
    "影棚水光妆美容特写": ("beauty_clamshell", "clean_beauty_editorial"),
    "落地窗瑜伽塑形写真": ("window_soft_side", "sport_bright_crisp"),
    "旅馆窗边电影静帧": ("tungsten_practical_side", "hongkong_tungsten_film"),
})

for _preset_name, (_lighting_id, _visual_id) in _PRESET_VISUAL_BUNDLES.items():
    _preset = PRESETS[_preset_name]
    _preset.pop("光线方案", None)
    _preset.pop("色彩方案", None)
    _preset.pop("成像质感", None)
    _preset.update({
        field_name: LIGHTING_PLAN_BY_ID[_lighting_id][field_name]
        for field_name in LIGHTING_OUTPUT_FIELDS
    })
    _preset.update({
        field_name: VISUAL_PROFILE_BY_ID[_visual_id][field_name]
        for field_name in (*COLOR_OUTPUT_FIELDS, *FINISH_OUTPUT_FIELDS)
    })

_PRESET_VISUAL_FIELD_OVERRIDES = {
    "夜间室内轻奢硬闪时尚写真": {
        "主配色": "香槟粉与深棕黑", "色温倾向": "轻微偏暖",
        "画面对比": "中高反差", "影像风格": "CCD数码相机",
        "细节质地": "CCD直接感", "高光处理": "镜面高光",
        "颗粒质感": "CCD彩色噪点",
    },
    "影棚水光妆美容特写": {
        "主配色": "珊瑚粉与薄荷绿", "色温倾向": "中性",
        "画面对比": "中低反差", "影像风格": "中画幅相机",
        "细节质地": "细腻商业精修", "高光处理": "明亮洁净",
        "颗粒质感": "洁净画面",
    },
    "落地窗瑜伽塑形写真": {
        "主配色": "浅灰与暖白", "色温倾向": "中性",
        "画面对比": "低反差", "影像风格": "全画幅相机",
        "细节质地": "自然细节", "高光处理": "柔和过渡",
        "颗粒质感": "洁净画面",
    },
    "旅馆窗边电影静帧": {
        "主配色": "冷蓝与暖黄", "色温倾向": "冷暖混合",
        "画面对比": "中低反差", "影像风格": "电影剧照",
        "细节质地": "胶片柔度", "高光处理": "暖色辉光",
        "颗粒质感": "细微颗粒",
    },
}
for _preset_name, _values in _PRESET_VISUAL_FIELD_OVERRIDES.items():
    PRESETS[_preset_name].update(_values)


PRESETS[CUSTOM_PRESET] = {
    field_name: EMPTY_CHOICE for field_name in FIELD_ORDER
}
PRESETS[CUSTOM_PRESET].update({
    "画面比例": "2:3竖构图", "成像媒介": "全画幅微单摄影",
    "年龄阶段": "20–29岁", "族裔大类": "东亚",
    "地域族裔分支": "大类通用外观",
    "脸型": "标准鹅蛋脸", "轮廓细节": "颧骨柔和",
    "眼型": "杏仁眼", "瞳色": "深棕色", "眼睑特征": "自然双眼皮",
    "肤色": "自然浅肤色", "肤质": "真实皮肤纹理",
    "妆容模式": "整体预设", "整体妆容预设": "自然裸妆",
    **_EMPTY_CUSTOM_MAKEUP,
    "基础身形": "自然匀称", "身量观感": "中等身量",
    "线条重点": "腰线自然清晰",
})
for _preset_name in PRESET_OPTIONS:
    _preset = PRESETS[_preset_name]
    PRESETS[_preset_name] = {
        field_name: _preset.get(field_name, EMPTY_CHOICE) for field_name in FIELD_ORDER
    }

CUSTOM_DEFAULTS = dict(PRESETS[CUSTOM_PRESET])

PROFILE_POOLS: Dict[str, Dict[str, Sequence[str]]] = {
    "日系草地单车夏日柔光写真": {
        "画面比例": ["2:3竖构图", "3:4竖构图", "4:5竖构图", "3:2横构图", "4:3横构图"],
        "成像媒介": ["全画幅微单摄影", "35毫米胶片摄影", "便携数码相机摄影"],
        "写真大类": ["自然户外", "旅行度假", "中式美学"],
        "写真主题": ["日系森系夏日写真", "窗边奶油暖调生活写真", "花店日常清新写真"],
        "年龄阶段": ["20–29岁", "30–39岁"],
        "族裔大类": ["东亚"],
        "地域族裔分支": ["大类通用外观", "东北亚地域外观", "东亚南部地域外观"],
        "脸型": ["标准鹅蛋脸", "圆润脸型"],
        "轮廓细节": ["下颌线柔和", "颧骨柔和", "面颊饱满"],
        "眼型": ["杏仁眼", "明亮圆眼", "柔和垂眼"],
        "瞳色": ["深棕色", "黑褐色", "浅棕色"],
        "眼睑特征": ["自然双眼皮", "内双"],
        "肤色": ["暖白肤色", "自然浅肤色"],
        "肤质": ["自然细腻", "真实皮肤纹理", "柔润水光"],
        "妆容模式": ["整体预设"],
        "整体妆容预设": ["清透裸粉妆", "自然裸妆", "蜜桃珊瑚妆"],
        "发色模式": ["基础发色", "进阶染发"],
        "发色": ["深棕黑色", "深栗棕色", "冷调茶棕色", "柔和浅棕色"],
        "发色色调": ["自然中性色调", "温暖棕调", "蜂蜜暖调"],
        "染色方式": ["均匀单色染", "深发根渐变", "柔和手扫染"],
        "头部配饰": ["浅草色编织草帽", "小白花发饰", "丝质发带", "珍珠发夹"],
        "基础身形": ["自然匀称", "纤细匀称", "柔和丰润"],
        "身量观感": ["中等身量", "小巧身量"],
        "线条重点": ["肩颈线条舒展", "腰线自然清晰"],
        "前景框景": ["失焦嫩绿枫叶框景", "窗框留白框景", "无明显前景"],
        "背景环境": ["高亮夏日树林庭院", "奶油色窗边室内"],
    },
    "日系咖啡馆暖调近景人像": {
        "画面比例": ["3:4竖构图", "2:3竖构图", "4:5竖构图", "4:3横构图", "3:2横构图"],
        "成像媒介": ["便携数码相机摄影", "早期CCD数码摄影", "35毫米胶片摄影"],
        "写真大类": ["日常生活", "复古年代", "都市叙事"],
        "写真主题": ["日系咖啡馆生活写真", "窗边奶油暖调生活写真", "居家晨光松弛写真"],
        "年龄阶段": ["20–29岁", "30–39岁"],
        "族裔大类": ["东亚"],
        "地域族裔分支": ["大类通用外观", "东北亚地域外观", "东亚南部地域外观"],
        "脸型": ["圆润脸型", "标准鹅蛋脸"],
        "轮廓细节": ["面颊饱满", "颧骨柔和", "下颌线柔和"],
        "眼型": ["杏仁眼", "明亮圆眼", "柔和垂眼"],
        "瞳色": ["深棕色", "黑褐色", "浅棕色"],
        "眼睑特征": ["自然双眼皮", "内双"],
        "肤色": ["暖白肤色", "自然浅肤色"],
        "肤质": ["自然细腻", "真实皮肤纹理", "柔润水光"],
        "妆容模式": ["整体预设"],
        "整体妆容预设": ["清透裸粉妆", "自然裸妆", "奶茶棕妆"],
        "发色模式": ["基础发色", "进阶染发"],
        "发色": ["深栗棕色", "巧克力棕", "冷调茶棕色", "柔和浅棕色"],
        "发色色调": ["自然中性色调", "温暖棕调", "灰调"],
        "染色方式": ["均匀单色染", "深发根渐变", "细密挑染"],
        "头部配饰": ["羊毛贝雷帽", "珍珠发夹", "黑色细发带", "丝质发带"],
        "基础身形": ["柔和丰润", "自然匀称"],
        "身量观感": ["中等身量", "小巧身量"],
        "线条重点": ["肩颈线条舒展", "腰线自然清晰", "腰胯曲线柔和"],
        "前景框景": ["浅木色桌沿前景", "虚化咖啡杯与桌角", "窗框留白框景"],
        "背景环境": ["暖木咖啡馆卡座", "奶油色窗边室内"],
    },
    "夜间室内轻奢硬闪时尚写真": {
        "画面比例": ["2:3竖构图", "3:4竖构图", "4:5竖构图", "3:2横构图", "16:9横构图"],
        "成像媒介": ["专业数码相机摄影", "全画幅微单摄影", "早期CCD数码摄影", "35毫米胶片摄影"],
        "写真大类": ["时尚编辑", "都市叙事", "电影叙事", "复古年代", "幻想概念"],
        "写真主题": ["夜间室内轻奢时尚写真", "高级杂志棚拍写真", "极简黑白时尚写真"],
        "年龄阶段": ["20–29岁", "30–39岁", "40–49岁"],
        "族裔大类": ["东亚", "欧洲裔", "西亚／中东"],
        "地域族裔分支": ["大类通用外观"],
        "脸型": ["修长脸型", "标准鹅蛋脸", "菱形脸"],
        "轮廓细节": ["下颌线清晰", "颧骨清晰", "面颊清瘦"],
        "眼型": ["杏仁眼", "微挑眼", "细长眼"],
        "瞳色": ["深棕色", "黑褐色", "琥珀色"],
        "眼睑特征": ["自然双眼皮", "内双"],
        "肤色": ["冷白肤色", "暖白肤色", "自然浅肤色"],
        "肤质": ["柔雾均匀", "真实皮肤纹理", "自然细腻"],
        "妆容模式": ["整体预设"],
        "整体妆容预设": ["明艳红唇妆", "浆果色妆容", "豆沙柔雾妆"],
        "发色模式": ["基础发色", "进阶染发"],
        "发色": ["自然黑色", "深棕黑色", "酒红棕色", "蓝黑色", "铂金浅金色"],
        "发色色调": ["蓝黑反光", "红棕底调", "珍珠冷光", "自然中性色调"],
        "染色方式": ["均匀单色染", "宽束挑染", "耳侧色块染", "内层染"],
        "头部配饰": ["几何金属发夹", "金色发簪", "黑色细发带", "丝绒蝴蝶结"],
        "基础身形": ["柔和丰润", "自然匀称", "纤细匀称"],
        "身量观感": ["高挑身量", "中等身量"],
        "线条重点": ["腰胯曲线柔和", "腿部线条修长", "腰线自然清晰"],
        "前景框景": ["灰色门框纵向框景", "窗框留白框景", "无明显前景"],
        "背景环境": ["暖色走廊灰色门板", "玻璃幕墙都市夜景", "高级灰摄影棚"],
    },
    "都市职场轻奢坐姿写真": {
        "画面比例": ["2:3竖构图", "3:4竖构图", "4:5竖构图", "4:3横构图", "5:4横构图"],
        "成像媒介": ["全画幅微单摄影", "中画幅数码摄影", "专业数码相机摄影"],
        "写真大类": ["商业广告", "时尚编辑", "都市叙事"],
        "写真主题": ["都市职场轻奢写真", "专业商务头像写真", "高级酒店品牌写真"],
        "年龄阶段": ["20–29岁", "30–39岁", "40–49岁"],
        "族裔大类": ["东亚", "欧洲裔", "西亚／中东"],
        "地域族裔分支": ["大类通用外观"],
        "脸型": ["修长脸型", "标准鹅蛋脸", "柔和方圆脸"],
        "轮廓细节": ["下颌线清晰", "颧骨柔和", "面颊清瘦"],
        "眼型": ["杏仁眼", "细长眼", "微挑眼"],
        "瞳色": ["深棕色", "黑褐色", "浅棕色"],
        "眼睑特征": ["自然双眼皮", "内双"],
        "肤色": ["暖白肤色", "自然浅肤色", "冷白肤色"],
        "肤质": ["自然细腻", "真实皮肤纹理", "柔雾均匀"],
        "妆容模式": ["整体预设"],
        "整体妆容预设": ["清透裸粉妆", "奶茶棕妆", "豆沙柔雾妆"],
        "发色模式": ["基础发色", "进阶染发"],
        "发色": ["自然黑色", "深棕黑色", "深栗棕色", "巧克力棕", "冷调茶棕色"],
        "发色色调": ["自然中性色调", "灰调", "温暖棕调"],
        "染色方式": ["均匀单色染", "深发根渐变", "细密挑染"],
        "头部配饰": ["珍珠发夹", "几何金属发夹", "黑色细发带", "丝质发带"],
        "基础身形": ["自然匀称", "纤细匀称", "柔和丰润"],
        "身量观感": ["中等身量", "高挑身量"],
        "线条重点": ["腰线自然清晰", "肩颈线条舒展", "腰胯曲线柔和"],
        "前景框景": ["深灰文件夹前景", "浅木色桌沿前景", "窗框留白框景"],
        "背景环境": ["米杏沙发浅灰紫墙面", "奶油色窗边室内", "高级灰摄影棚"],
    },
    "古风汉服园林柔光写真": {
        "画面比例": ["2:3竖构图", "3:4竖构图", "4:5竖构图", "3:2横构图", "4:3横构图"],
        "成像媒介": ["全画幅微单摄影", "35毫米胶片摄影", "便携数码相机摄影"],
        "写真大类": ["中式美学"],
        "写真主题": ["汉服襦裙写真", "旗袍民国雅致写真", "宋韵素雅庭院写真"],
        "年龄阶段": ["20–29岁", "30–39岁"],
        "族裔大类": ["东亚"],
        "地域族裔分支": ["大类通用外观", "东北亚地域外观", "东亚南部地域外观"],
        "脸型": ["标准鹅蛋脸", "圆润脸型"],
        "轮廓细节": ["下颌线柔和", "颧骨柔和", "面颊饱满"],
        "眼型": ["杏仁眼", "明亮圆眼", "柔和垂眼"],
        "瞳色": ["深棕色", "黑褐色", "浅棕色"],
        "眼睑特征": ["自然双眼皮", "内双"],
        "肤色": ["暖白肤色", "自然浅肤色"],
        "肤质": ["自然细腻", "真实皮肤纹理", "柔润水光"],
        "妆容模式": ["整体预设"],
        "整体妆容预设": ["清透裸粉妆", "自然裸妆", "蜜桃珊瑚妆"],
        "发色模式": ["基础发色", "进阶染发"],
        "发色": ["深棕黑色", "深栗棕色", "冷调茶棕色", "柔和浅棕色"],
        "发色色调": ["自然中性色调", "温暖棕调", "蜂蜜暖调"],
        "染色方式": ["均匀单色染", "深发根渐变", "柔和手扫染"],
        "头部配饰": ["金色发簪", "玉质发簪", "小白花发饰"],
        "基础身形": ["自然匀称", "纤细匀称", "柔和丰润"],
        "身量观感": ["中等身量", "小巧身量"],
        "线条重点": ["肩颈线条舒展", "腰线自然清晰"],
        "前景框景": ["树枝前景", "纱帘前景", "屏风边缘"],
        "背景环境": ["江南园林", "木质新中式室内"],
    },
    "海边夏日泳装写真": {
        "画面比例": ["2:3竖构图", "3:4竖构图", "4:5竖构图", "3:2横构图", "4:3横构图"],
        "成像媒介": ["全画幅微单摄影", "35毫米胶片摄影", "便携数码相机摄影"],
        "写真大类": ["旅行度假", "自然户外"],
        "写真主题": ["海边夏日度假写真", "热带泳池假日写真", "海岛小镇漫步写真"],
        "年龄阶段": ["20–29岁", "30–39岁"],
        "族裔大类": ["东亚"],
        "地域族裔分支": ["大类通用外观", "东北亚地域外观", "东亚南部地域外观"],
        "脸型": ["标准鹅蛋脸", "圆润脸型"],
        "轮廓细节": ["下颌线柔和", "颧骨柔和", "面颊饱满"],
        "眼型": ["杏仁眼", "明亮圆眼", "柔和垂眼"],
        "瞳色": ["深棕色", "黑褐色", "浅棕色"],
        "眼睑特征": ["自然双眼皮", "内双"],
        "肤色": ["暖白肤色", "自然浅肤色"],
        "肤质": ["自然细腻", "真实皮肤纹理", "柔润水光"],
        "妆容模式": ["整体预设"],
        "整体妆容预设": ["清透裸粉妆", "自然裸妆", "蜜桃珊瑚妆"],
        "发色模式": ["基础发色", "进阶染发"],
        "发色": ["深棕黑色", "深栗棕色", "冷调茶棕色", "柔和浅棕色"],
        "发色色调": ["自然中性色调", "温暖棕调", "蜂蜜暖调"],
        "染色方式": ["均匀单色染", "深发根渐变", "柔和手扫染"],
        "头部配饰": ["浅草色编织草帽", "丝质发带", "珍珠发夹"],
        "基础身形": ["自然匀称", "纤细匀称", "柔和丰润"],
        "身量观感": ["中等身量", "小巧身量"],
        "线条重点": ["肩颈线条舒展", "腰线自然清晰"],
        "前景框景": ["水面光斑", "失焦光点", "无明显前景"],
        "背景环境": ["海边地平线", "酒店阳台开阔景观"],
    },
    "赛博都市夜景写真": {
        "画面比例": ["2:3竖构图", "3:4竖构图", "4:5竖构图", "3:2横构图", "4:3横构图"],
        "成像媒介": ["全画幅微单摄影", "35毫米胶片摄影", "便携数码相机摄影"],
        "写真大类": ["幻想概念", "都市叙事"],
        "写真主题": ["未来都市赛博写真", "都市夜行叙事写真", "蒸汽机械复古幻想写真"],
        "年龄阶段": ["20–29岁", "30–39岁"],
        "族裔大类": ["东亚"],
        "地域族裔分支": ["大类通用外观", "东北亚地域外观", "东亚南部地域外观"],
        "脸型": ["标准鹅蛋脸", "修长脸型", "菱形脸"],
        "轮廓细节": ["下颌线清晰", "颧骨清晰", "面颊清瘦"],
        "眼型": ["杏仁眼", "微挑眼", "细长眼"],
        "瞳色": ["深棕色", "黑褐色", "浅棕色"],
        "眼睑特征": ["自然双眼皮", "内双"],
        "肤色": ["冷白肤色", "暖白肤色", "自然浅肤色"],
        "肤质": ["柔雾均匀", "真实皮肤纹理", "自然细腻"],
        "妆容模式": ["整体预设"],
        "整体妆容预设": ["明艳红唇妆", "浆果色妆容", "豆沙柔雾妆"],
        "发色模式": ["基础发色", "进阶染发"],
        "发色": ["自然黑色", "深棕黑色", "蓝黑色", "酒红棕色", "铂金浅金色"],
        "发色色调": ["蓝黑反光", "红棕底调", "珍珠冷光", "自然中性色调"],
        "染色方式": ["均匀单色染", "宽束挑染", "耳侧色块染", "内层染"],
        "头部配饰": ["几何金属发夹", "黑色细发带", "珍珠发夹"],
        "基础身形": ["自然匀称", "纤细匀称", "柔和丰润"],
        "身量观感": ["高挑身量", "中等身量"],
        "线条重点": ["腿部线条修长", "腰线自然清晰", "腰胯曲线柔和"],
        "前景框景": ["失焦光点", "玻璃反射", "无明显前景"],
        "背景环境": ["未来赛博街区", "玻璃幕墙都市夜景"],
    },
}


PROFILE_POOLS["日系草地单车夏日柔光写真"].update({
    "画面比例": ["2:3竖构图", "3:4竖构图", "3:2横构图", "4:3横构图"],
    "成像媒介": ["全画幅微单摄影", "35毫米胶片摄影", "便携数码相机摄影"],
    "写真大类": ["运动健康", "自然户外", "日常生活"],
    "写真主题": ["户外骑行活力写真", "日系森系夏日写真", "乡间小路生活写真"],
    "前景框景": ["失焦绿叶", "无明显前景", "失焦光点"],
    "背景环境": ["阳光公园草坪", "乡间小路", "静谧湖畔"],
})
PROFILE_POOLS["海边夏日泳装写真"].update({
    "画面比例": ["3:2横构图", "4:3横构图", "16:9横构图", "3:4竖构图"],
    "成像媒介": ["数码单反摄影", "全画幅微单摄影", "便携数码相机摄影"],
    "写真大类": ["旅行度假", "自然户外"],
    "写真主题": ["海边夏日度假写真", "热带泳池假日写真", "海岛小镇漫步写真"],
})
PROFILE_POOLS.update({
    "影棚水光妆美容特写": {
        "画面比例": ["4:5竖构图", "3:4竖构图", "1:1方形构图"],
        "成像媒介": ["中画幅数码摄影", "专业数码相机摄影", "全画幅微单摄影"],
        "写真大类": ["美妆美容", "商业广告"],
        "写真主题": ["影棚水光妆美容特写", "自然真实肤质特写", "清透裸妆美容写真"],
        "年龄阶段": ["20–29岁", "30–39岁"],
        "族裔大类": ["东亚"],
        "背景环境": ["珊瑚粉薄荷绿渐变背景", "高级灰摄影棚", "彩色几何摄影棚"],
    },
    "落地窗瑜伽塑形写真": {
        "画面比例": ["16:9横构图", "3:2横构图", "4:3横构图"],
        "成像媒介": ["全画幅微单摄影", "专业数码相机摄影", "手机计算摄影"],
        "写真大类": ["运动健康", "日常生活"],
        "写真主题": ["瑜伽普拉提生活写真", "健身房力量训练写真", "居家晨光松弛写真"],
        "年龄阶段": ["20–29岁", "30–39岁"],
        "族裔大类": ["东亚"],
        "背景环境": ["明亮落地窗客厅", "明亮健身训练室", "奶油公寓客厅"],
    },
    "旅馆窗边电影静帧": {
        "画面比例": ["21:9横构图", "16:9横构图", "3:2横构图"],
        "成像媒介": ["35毫米胶片摄影", "全画幅微单摄影", "早期CCD数码摄影"],
        "写真大类": ["电影叙事", "复古年代"],
        "写真主题": ["旅馆窗边电影静帧", "室内克制情绪电影写真", "暖调室内电影叙事写真"],
        "年龄阶段": ["20–29岁", "30–39岁", "40–49岁"],
        "族裔大类": ["东亚"],
        "背景环境": ["旧式旅馆房间", "奶油色窗边室内", "暖色酒店走廊"],
    },
})

# Older releases exposed three combined camera dropdowns. Keep a narrow
# migration map so saved workflows resolve to the nearest formal setup.
LEGACY_CAMERA_BUNDLE_BY_VALUE = {
    "胸部以上中央偏右88%": "forest_chest_85",
    "胸部以上居中90%": "cafe_chest_50",
    "全身居中92%保留鞋子": "flash_full_65",
    "坐姿裁至小腿90%": "office_seated_70",
    "半身三分法85%": "classic_waist_85",
    "大腿以上居中88%": "fashion_three_quarter_70",
    "全身留白85%": "studio_full_70",
    "肩部以上贴近92%": "beauty_face_105",
    "环境半身左侧三分线70%": "travel_environment_35",
    "环境全身右侧三分线72%": "street_full_50",
    "横版坐姿视线留白75%": "landscape_gaze_space_50",
    "电影感中景侧向留白68%": "landscape_gaze_space_50",
    "85mm约1.5米平视": "forest_chest_85",
    "50mm约1米略高平视": "cafe_chest_50",
    "65mm约3.5米轻微仰拍": "flash_full_65",
    "70mm约2.2米轻微俯拍": "office_seated_70",
    "85mm约2米平视": "classic_waist_85",
    "70mm约2.8米平视": "fashion_three_quarter_70",
    "50mm约3米平视": "studio_full_70",
    "105mm约1.8米平视": "beauty_face_105",
    "35mm约2.5米平视": "travel_environment_35",
    "35mm约4米平视": "travel_environment_35",
    "50mm约2.5米平视": "landscape_gaze_space_50",
}

def _pose_bundles(*bundle_ids: str) -> list[Mapping[str, str]]:
    return [POSE_BUNDLE_BY_ID[bundle_id] for bundle_id in bundle_ids]


PROFILE_POSE_BUNDLES = {
    "日系草地单车夏日柔光写真": _pose_bundles(
        "forest_hat_bouquet", "window_curtain_quiet", "side_hair_touch_beauty"
    ),
    "日系咖啡馆暖调近景人像": _pose_bundles(
        "cafe_booth_direct", "cafe_cup_relaxed", "cafe_table_candid", "sofa_relaxed_side_gaze"
    ),
    "夜间室内轻奢硬闪时尚写真": _pose_bundles(
        "doorway_fan_flash", "wall_collar_fashion", "fashion_pocket_standing", "sofa_relaxed_side_gaze"
    ),
    "都市职场轻奢坐姿写真": _pose_bundles(
        "workplace_folder_forward", "glasses_sofa_confident", "studio_stool_direct", "elevator_handbag_wait"
    ),
    "古风汉服园林柔光写真": _pose_bundles(
        "hanfu_garden_lookback", "new_chinese_folded_hands", "sword_standing"
    ),
    "海边夏日泳装写真": _pose_bundles(
        "seaside_turn_smile", "walking_turn_street", "balcony_railing_distance"
    ),
    "赛博都市夜景写真": _pose_bundles(
        "cyber_walk_confident", "walking_turn_street"
    ),
}

PROFILE_POSE_BUNDLES.update({
    "日系草地单车夏日柔光写真": _pose_bundles("cycling_bike", "seaside_turn_smile", "side_hair_touch_beauty"),
    "日系咖啡馆暖调近景人像": _pose_bundles("cafe_cup_relaxed", "cafe_table_candid", "cafe_booth_direct"),
    "夜间室内轻奢硬闪时尚写真": _pose_bundles("sofa_relaxed_side_gaze", "wall_collar_fashion", "doorway_fan_flash"),
    "都市职场轻奢坐姿写真": _pose_bundles("studio_stool_direct", "workplace_folder_forward", "glasses_sofa_confident"),
    "古风汉服园林柔光写真": _pose_bundles("hanfu_garden_lookback", "new_chinese_folded_hands"),
    "海边夏日泳装写真": _pose_bundles("seaside_turn_smile", "sofa_relaxed_side_gaze"),
    "赛博都市夜景写真": _pose_bundles("sofa_relaxed_side_gaze", "cyber_walk_confident"),
    "影棚水光妆美容特写": _pose_bundles("side_hair_touch_beauty", "waist_hand_direct"),
    "落地窗瑜伽塑形写真": _pose_bundles("sport_shoelace_crouch", "sofa_relaxed_side_gaze"),
    "旅馆窗边电影静帧": _pose_bundles("window_curtain_quiet", "cafe_cup_relaxed", "chair_elbow_thoughtful"),
})

THEME_CATEGORY_POSE_BUNDLES = {
    "日常生活": _pose_bundles("cafe_booth_direct", "cafe_cup_relaxed", "cafe_table_candid", "window_curtain_quiet", "sofa_relaxed_side_gaze"),
    "时尚编辑": _pose_bundles("doorway_fan_flash", "wall_collar_fashion", "walking_turn_street", "fashion_pocket_standing", "side_hair_touch_beauty", "waist_hand_direct"),
    "商业广告": _pose_bundles("workplace_folder_forward", "studio_stool_direct", "elevator_handbag_wait", "glasses_sofa_confident", "waist_hand_direct"),
    "美妆美容": _pose_bundles("side_hair_touch_beauty", "studio_stool_direct", "waist_hand_direct"),
    "都市叙事": _pose_bundles("walking_turn_street", "umbrella_rain_pause", "elevator_handbag_wait", "wall_collar_fashion"),
    "自然户外": _pose_bundles("forest_hat_bouquet", "balcony_railing_distance", "walking_turn_street", "side_hair_touch_beauty"),
    "旅行度假": _pose_bundles("balcony_railing_distance", "walking_turn_street", "umbrella_rain_pause", "forest_hat_bouquet"),
    "运动健康": _pose_bundles("sport_shoelace_crouch", "walking_turn_street", "waist_hand_direct"),
    "中式美学": _pose_bundles("new_chinese_folded_hands", "window_curtain_quiet", "chair_elbow_thoughtful"),
    "复古年代": _pose_bundles("cafe_table_candid", "doorway_fan_flash", "sofa_relaxed_side_gaze", "walking_turn_street"),
    "电影叙事": _pose_bundles("chair_elbow_thoughtful", "window_curtain_quiet", "umbrella_rain_pause", "sofa_relaxed_side_gaze"),
    "幻想概念": _pose_bundles("forest_hat_bouquet", "doorway_fan_flash", "wall_collar_fashion", "balcony_railing_distance"),
}

THEME_POSE_KEYWORD_BUNDLES = [
    (("网球", "健身", "普拉提", "慢跑", "泳池运动", "舞蹈", "拳击", "骑行", "羽毛球", "攀岩"), _pose_bundles("sport_shoelace_crouch", "walking_turn_street", "waist_hand_direct")),
    (("咖啡馆", "茶餐厅"), _pose_bundles("cafe_booth_direct", "cafe_cup_relaxed", "cafe_table_candid")),
    (("窗边", "居家", "家居", "旧公寓", "雨天室内"), _pose_bundles("window_curtain_quiet", "sofa_relaxed_side_gaze", "chair_elbow_thoughtful")),
    (("走廊", "酒店", "红毯", "汽车旅馆"), _pose_bundles("doorway_fan_flash", "wall_collar_fashion", "sofa_relaxed_side_gaze")),
    (("森系", "花店", "山野", "庭院", "花海", "湖畔", "草原", "枫林", "雪林", "竹林", "海岸", "沙漠", "乡间"), _pose_bundles("forest_hat_bouquet", "side_hair_touch_beauty", "walking_turn_street")),
    (("海边", "热带泳池"), _pose_bundles("balcony_railing_distance", "walking_turn_street")),
    (("商务", "电商", "珠宝", "香水", "美妆", "妆面", "肤质", "护肤品", "影楼", "棚拍", "黑白"), _pose_bundles("waist_hand_direct", "studio_stool_direct", "side_hair_touch_beauty")),
    (("通勤", "地铁", "街头", "天台", "旧城区", "古镇", "公路旅行"), _pose_bundles("walking_turn_street", "elevator_handbag_wait", "umbrella_rain_pause")),
    (("新中式", "茶室", "旗袍", "宋韵", "唐风", "水墨", "江南", "敦煌", "明制", "书院"), _pose_bundles("new_chinese_folded_hands", "window_curtain_quiet", "chair_elbow_thoughtful")),
]


def _theme_directed_pose_bundles(theme: str) -> list[Mapping[str, str]]:
    for keywords, bundles in THEME_POSE_KEYWORD_BUNDLES:
        if any(keyword in theme for keyword in keywords):
            return bundles
    return []


def _scene_bundles(*bundle_ids: str) -> list[Mapping[str, str]]:
    return [SCENE_BUNDLE_BY_ID[bundle_id] for bundle_id in bundle_ids]


PROFILE_SCENE_BUNDLES = {
    "日系草地单车夏日柔光写真": _scene_bundles(
        "summer_forest_garden", "forest_path_morning", "flower_shop_morning",
        "enclosed_balcony_scene"
    ),
    "日系咖啡馆暖调近景人像": _scene_bundles(
        "warm_cafe_booth", "cafe_window_day", "wood_cafe_scene",
        "bookstore_scene"
    ),
    "夜间室内轻奢硬闪时尚写真": _scene_bundles(
        "doorway_hard_flash", "hotel_corridor_night", "hotel_room_scene",
        "cocktail_bar_scene", "backstage_scene"
    ),
    "都市职场轻奢坐姿写真": _scene_bundles(
        "workplace_lounge", "glass_lobby_day", "executive_office_scene",
        "meeting_room_scene", "fashion_atelier_scene"
    ),
    "古风汉服园林柔光写真": _scene_bundles(
        "new_chinese_tearoom", "tearoom_scene", "traditional_study_scene",
        "bamboo_grove_fog"
    ),
    "海边夏日泳装写真": _scene_bundles(
        "seaside_dusk", "sandy_beach_afternoon", "lighthouse_dawn",
        "hotel_balcony_golden_hour", "wharf_dusk"
    ),
    "赛博都市夜景写真": _scene_bundles(
        "cyber_street_concept", "rainy_city_street", "city_rooftop_blue_hour",
        "subway_platform_scene", "warehouse_scene", "steampunk_room_concept"
    ),
}

PROFILE_SCENE_BUNDLES.update({
    "日系草地单车夏日柔光写真": _scene_bundles("campus_playground_afternoon", "flower_shop_morning", "lakeside_dusk"),
    "日系咖啡馆暖调近景人像": _scene_bundles("cafe_window_day", "wood_cafe_scene", "warm_cafe_booth"),
    "夜间室内轻奢硬闪时尚写真": _scene_bundles("cocktail_bar_scene", "hotel_lounge_scene", "hotel_room_scene"),
    "都市职场轻奢坐姿写真": _scene_bundles("executive_office_scene", "glass_lobby_day", "workplace_lounge"),
    "古风汉服园林柔光写真": _scene_bundles("bamboo_grove_fog", "new_chinese_tearoom", "traditional_study_scene"),
    "海边夏日泳装写真": _scene_bundles("sandy_beach_afternoon", "seaside_dusk", "lighthouse_dawn"),
    "赛博都市夜景写真": _scene_bundles("warehouse_scene", "subway_platform_scene", "cyber_street_concept"),
    "影棚水光妆美容特写": _scene_bundles("photo_studio_scene", "gray_photo_studio"),
    "落地窗瑜伽塑形写真": _scene_bundles("sunlit_living_room_scene", "yoga_scene", "fitness_studio_day"),
    "旅馆窗边电影静帧": _scene_bundles("hotel_room_scene", "cream_apartment_window", "cream_bedroom_scene"),
})

THEME_CATEGORY_SCENE_CATEGORIES = {
    "日常生活": {"居住空间", "餐饮与酒店", "商业零售", "文化艺术"},
    "时尚编辑": {"专业特色", "商业零售", "餐饮与酒店", "都市户外"},
    "商业广告": {"办公工作", "商业零售", "专业特色", "餐饮与酒店"},
    "美妆美容": {"专业特色", "商业零售", "居住空间"},
    "都市叙事": {"都市户外", "交通空间", "餐饮与酒店", "工业功能"},
    "自然户外": {"自然户外"},
    "旅行度假": {"自然户外", "餐饮与酒店", "交通空间"},
    "运动健康": {"运动康体", "自然户外"},
    "中式美学": {"东方传统", "文化艺术", "自然户外"},
    "复古年代": {"餐饮与酒店", "商业零售", "交通空间", "居住空间"},
    "电影叙事": {"居住空间", "餐饮与酒店", "交通空间", "工业功能", "都市户外"},
    "幻想概念": {"专业特色", "工业功能", "自然户外", "都市户外"},
}
THEME_CATEGORY_SCENE_BUNDLES = {
    category: [
        bundle for bundle in SCENE_BUNDLES
        if bundle["场景大类"] in scene_categories
    ]
    for category, scene_categories in THEME_CATEGORY_SCENE_CATEGORIES.items()
}

THEME_SCENE_KEYWORD_BUNDLES = [
    (("月夜森林",), _scene_bundles("moon_forest_concept")),
    (("哥特古堡",), _scene_bundles("gothic_castle_concept")),
    (("未来都市赛博",), _scene_bundles("cyber_street_concept")),
    (("蒸汽机械",), _scene_bundles("steampunk_room_concept")),
    (("梦境花园",), _scene_bundles("dream_garden_concept")),
    (("星云神殿",), _scene_bundles("nebula_temple_concept")),
    (("水下幻境",), _scene_bundles("underwater_realm_concept")),
    (("冰雪宫殿",), _scene_bundles("ice_palace_concept")),
    (("云雾仙境",), _scene_bundles("cloud_realm_concept")),
    (("花瓣风暴",), _scene_bundles("petal_storm_concept")),
    (("咖啡", "餐厅"), _scene_bundles("warm_cafe_booth", "cafe_window_day", "wood_cafe_scene")),
    (("酒店", "旅馆"), _scene_bundles("hotel_corridor_night", "hotel_balcony_golden_hour", "hotel_room_scene", "hotel_lounge_scene")),
    (("职场", "商务", "办公室", "会议"), _scene_bundles("workplace_lounge", "glass_lobby_day", "executive_office_scene", "meeting_room_scene")),
    (("书店", "阅读", "书院", "书斋"), _scene_bundles("quiet_bookstore", "bookstore_scene", "library_scene", "traditional_study_scene")),
    (("花店", "花艺"), _scene_bundles("flower_shop_morning", "flower_shop_scene")),
    (("网球", "健身", "瑜伽", "普拉提", "泳池", "舞蹈"), _scene_bundles("tennis_court_sun", "fitness_studio_day", "fitness_scene", "yoga_scene", "indoor_pool_scene", "dance_room_scene")),
    (("地铁", "车站", "火车", "机场"), _scene_bundles("station_hall_scene", "subway_platform_scene", "airport_lounge_scene")),
    (("茶室", "新中式", "中式室内", "传统书院"), _scene_bundles("new_chinese_tearoom", "tearoom_scene", "traditional_study_scene")),
    (("海边", "海岸"), _scene_bundles("seaside_dusk", "hotel_balcony_golden_hour")),
    (("森系", "树林", "枫林", "竹林"), _scene_bundles("summer_forest_garden", "forest_path_morning")),
    (("天台", "蓝调城市"), _scene_bundles("city_rooftop_blue_hour")),
    (("雨夜", "霓虹"), _scene_bundles("rainy_city_street", "cocktail_bar_scene")),
    (("美术馆", "画室", "艺术"), _scene_bundles("minimal_gallery", "gallery_scene", "fashion_atelier_scene")),
    (("棚拍", "影棚", "美妆"), _scene_bundles("gray_photo_studio", "photo_studio_scene", "backstage_scene")),
]


def _theme_directed_scene_bundles(theme: str) -> list[Mapping[str, str]]:
    for keywords, bundles in THEME_SCENE_KEYWORD_BUNDLES:
        if any(keyword in theme for keyword in keywords):
            return bundles
    return []


SCENE_BUNDLE_LIGHT_OPTIONS = {
    "summer_forest_garden": ("树叶斑驳逆光", "户外晴朗自然光", "清晨低角度暖光"),
    "forest_path_morning": ("清晨低角度暖光", "阴天漫射柔光", "树叶斑驳逆光"),
    "warm_cafe_booth": ("暖色顶光正面环境光", "窗边自然侧光"),
    "cafe_window_day": ("窗边自然侧光", "阴天漫射柔光"),
    "cream_apartment_window": ("窗边自然侧光", "阴天漫射柔光"),
    "workplace_lounge": ("正面柔和散射光", "窗边自然侧光"),
    "hotel_corridor_night": ("暖色顶光正面环境光", "镜头方向直接硬闪", "高反差戏剧侧光"),
    "doorway_hard_flash": ("镜头方向直接硬闪", "暖色顶光正面环境光"),
    "gray_photo_studio": ("摄影棚柔光", "镜头方向直接硬闪"),
    "new_chinese_tearoom": ("新中式竹影柔光", "窗边自然侧光"),
    "retro_hongkong_diner": ("暖色顶光正面环境光", "镜头方向直接硬闪"),
    "rainy_city_street": ("城市霓虹侧光", "赛博霓虹混合光"),
    "glass_lobby_day": ("窗边自然侧光", "正面柔和散射光"),
    "hotel_balcony_golden_hour": ("日落金色侧逆光", "海边通透侧逆光"),
    "city_rooftop_blue_hour": ("城市霓虹侧光", "高反差戏剧侧光"),
    "seaside_dusk": ("海边通透侧逆光", "日落金色侧逆光"),
    "quiet_bookstore": ("窗边自然侧光", "暖色顶光正面环境光"),
    "minimal_gallery": ("摄影棚柔光", "窗边自然侧光"),
    "flower_shop_morning": ("清晨低角度暖光", "窗边自然侧光"),
    "tennis_court_sun": ("运动场清晰日光", "户外晴朗自然光"),
    "fitness_studio_day": ("正面柔和散射光", "摄影棚柔光"),
    "moon_forest_concept": ("月光轮廓光", "梦境柔光"),
    "gothic_castle_concept": ("高反差戏剧侧光", "月光轮廓光"),
    "cyber_street_concept": ("赛博霓虹混合光", "城市霓虹侧光"),
    "steampunk_room_concept": ("暖色顶光正面环境光", "高反差戏剧侧光"),
    "dream_garden_concept": ("梦境柔光", "日落金色侧逆光"),
    "nebula_temple_concept": ("梦境柔光", "月光轮廓光"),
    "underwater_realm_concept": ("水下蓝色折射光",),
    "ice_palace_concept": ("雪地冷调漫射光", "梦境柔光"),
    "cloud_realm_concept": ("梦境柔光", "清晨低角度暖光"),
    "petal_storm_concept": ("摄影棚柔光", "梦境柔光"),
}
SCENE_CATEGORY_LIGHT_OPTIONS = {
    "居住空间": ("窗边自然侧光", "正面柔和散射光", "暖色顶光正面环境光"),
    "餐饮与酒店": ("暖色顶光正面环境光", "窗边自然侧光", "镜头方向直接硬闪"),
    "商业零售": ("窗边自然侧光", "正面柔和散射光", "摄影棚柔光"),
    "文化艺术": ("窗边自然侧光", "摄影棚柔光", "高反差戏剧侧光"),
    "办公工作": ("正面柔和散射光", "窗边自然侧光", "摄影棚柔光"),
    "交通空间": ("正面柔和散射光", "城市霓虹侧光", "高反差戏剧侧光"),
    "运动康体": ("运动场清晰日光", "正面柔和散射光", "摄影棚柔光"),
    "东方传统": ("新中式竹影柔光", "窗边自然侧光", "壁画暖色侧光"),
    "工业功能": ("高反差戏剧侧光", "镜头方向直接硬闪", "城市霓虹侧光"),
    "专业特色": ("摄影棚柔光", "镜头方向直接硬闪", "高反差戏剧侧光"),
    "自然户外": ("户外晴朗自然光", "阴天漫射柔光", "清晨低角度暖光", "日落金色侧逆光"),
    "都市户外": ("城市霓虹侧光", "阴天漫射柔光", "日落金色侧逆光", "高反差戏剧侧光"),
}

THEME_CATEGORY_CAMERA_BUNDLES = {
    "日常生活": _camera_bundles("headshot_85", "forest_chest_85", "cafe_chest_50", "classic_waist_85", "phone_waist", "sofa_seated_85", "travel_environment_35", "hands_prop_85"),
    "时尚编辑": _camera_bundles("beauty_face_105", "headshot_85", "fashion_three_quarter_70", "doorway_three_quarter_65", "studio_full_70", "flash_full_65", "street_full_50", "garment_detail_105", "symmetry_gallery_40"),
    "商业广告": _camera_bundles("beauty_face_105", "headshot_85", "classic_waist_85", "phone_waist", "office_seated_70", "fashion_three_quarter_70", "studio_full_70", "garment_detail_105", "symmetry_gallery_40"),
    "美妆美容": _camera_bundles("beauty_face_105", "headshot_85", "forest_chest_85", "cafe_chest_50", "classic_waist_85", "phone_waist", "hands_prop_85"),
    "都市叙事": _camera_bundles("phone_waist", "office_seated_70", "doorway_three_quarter_65", "street_full_50", "travel_environment_35", "interior_environment_28", "landscape_gaze_space_50", "telephoto_environment_135"),
    "自然户外": _camera_bundles("forest_chest_85", "classic_waist_85", "street_full_50", "sport_dynamic_50", "travel_environment_35", "landscape_gaze_space_50", "telephoto_environment_135"),
    "旅行度假": _camera_bundles("phone_waist", "street_full_50", "sport_dynamic_50", "travel_environment_35", "landscape_gaze_space_50", "telephoto_environment_135", "symmetry_gallery_40"),
    "运动健康": _camera_bundles("street_full_50", "sport_dynamic_50", "low_angle_dynamic_35", "travel_environment_35", "telephoto_environment_135"),
    "中式美学": _camera_bundles("classic_waist_85", "fashion_three_quarter_70", "doorway_three_quarter_65", "travel_environment_35", "interior_environment_28", "landscape_gaze_space_50", "symmetry_gallery_40"),
    "复古年代": _camera_bundles("headshot_85", "cafe_chest_50", "classic_waist_85", "phone_waist", "sofa_seated_85", "doorway_three_quarter_65", "street_full_50", "landscape_gaze_space_50"),
    "电影叙事": _camera_bundles("fashion_three_quarter_70", "doorway_three_quarter_65", "flash_full_65", "street_full_50", "sport_dynamic_50", "travel_environment_35", "interior_environment_28", "landscape_gaze_space_50", "telephoto_environment_135", "symmetry_gallery_40"),
    "幻想概念": _camera_bundles("beauty_face_105", "fashion_three_quarter_70", "doorway_three_quarter_65", "studio_full_70", "sport_dynamic_50", "low_angle_dynamic_35", "travel_environment_35", "interior_environment_28", "landscape_gaze_space_50", "telephoto_environment_135", "symmetry_gallery_40"),
}

SEATED_POSES = {
    "椅子前缘坐姿",
    "沙发前倾坐姿",
    "沙发放松坐姿",
    "卡座放松坐姿",
    "高脚椅坐姿",
}


def _pose_compatible_camera_bundles(
    base_pose: str, bundles: Iterable[Mapping[str, str]]
) -> list[Mapping[str, str]]:
    bundles = list(bundles)
    if base_pose in ("", EMPTY_CHOICE, FOLLOW_PRESET):
        return bundles
    if base_pose in SEATED_POSES:
        seated_or_close = [
            bundle
            for bundle in bundles
            if bundle["景别"] not in {
                "全身构图", "带环境全身", "动态全身"
            }
        ]
        return seated_or_close or bundles
    standing = [bundle for bundle in bundles if bundle["景别"] != "坐姿半身"]
    return standing or bundles

THEME_CATEGORY_FIELD_POOLS = {
    "日常生活": {
        "成像媒介": ["全画幅微单摄影", "半画幅微单摄影", "手机计算摄影", "便携数码相机摄影", "35毫米胶片摄影"],
        "前景框景": ["失焦嫩绿枫叶框景", "浅木色桌沿前景", "虚化咖啡杯与桌角", "窗框留白框景", "无明显前景"],
        "背景环境": ["暖木咖啡馆卡座", "米杏沙发浅灰紫墙面", "奶油色窗边室内", "独立书店书架", "家庭烘焙厨房", "复古唱片店", "自然采光画室", "周末市集摊位"],
        "光线方案": ["树叶斑驳逆光", "暖色顶光正面环境光", "正面柔和散射光", "窗边自然侧光"],
        "色彩方案": ["嫩绿与白色高明度", "暖棕奶白肤色", "奶油暖白低饱和"],
        "成像质感": ["日系胶片柔焦", "便携数码相机直出", "真实手机摄影质感"],
    },
    "时尚编辑": {
        "成像媒介": ["专业数码相机摄影", "全画幅微单摄影", "中画幅数码摄影", "35毫米胶片摄影"],
        "前景框景": ["灰色门框纵向框景", "窗框留白框景", "无明显前景"],
        "背景环境": ["暖色走廊灰色门板", "玻璃幕墙都市夜景", "高级灰摄影棚", "彩色几何摄影棚", "花艺装置摄影棚"],
        "光线方案": ["镜头方向直接硬闪", "城市霓虹侧光", "摄影棚柔光"],
        "色彩方案": ["黑红金暖灰", "青橙都市夜色", "高级灰黑白配色"],
        "成像质感": ["直接闪光商业写真", "都市胶片颗粒", "影棚杂志精修"],
    },
    "商业广告": {
        "成像媒介": ["专业数码相机摄影", "全画幅微单摄影", "中画幅数码摄影"],
        "前景框景": ["深灰文件夹前景", "窗框留白框景", "无明显前景"],
        "背景环境": ["米杏沙发浅灰紫墙面", "玻璃幕墙都市夜景", "高级灰摄影棚", "木质新中式室内", "玻璃建筑大堂", "婚纱礼服陈列厅"],
        "光线方案": ["正面柔和散射光", "窗边自然侧光", "摄影棚柔光"],
        "色彩方案": ["职场暖灰酒红点缀", "奶油暖白低饱和", "高级灰黑白配色", "木色墨黑米白"],
        "成像质感": ["细腻商业精修柔焦", "影棚杂志精修"],
    },
    "美妆美容": {
        "成像媒介": ["专业数码相机摄影", "全画幅微单摄影", "中画幅数码摄影", "手机计算摄影"],
        "前景框景": ["窗框留白框景", "无明显前景"],
        "背景环境": ["奶油色窗边室内", "高级灰摄影棚"],
        "光线方案": ["正面柔和散射光", "窗边自然侧光", "摄影棚柔光"],
        "色彩方案": ["奶油暖白低饱和", "高级灰黑白配色", "暖棕奶白肤色"],
        "成像质感": ["细腻商业精修柔焦", "真实手机摄影质感", "影棚杂志精修"],
    },
    "都市叙事": {
        "成像媒介": ["全画幅微单摄影", "手机计算摄影", "便携数码相机摄影", "35毫米胶片摄影"],
        "前景框景": ["浅木色桌沿前景", "灰色门框纵向框景", "窗框留白框景", "无明显前景"],
        "背景环境": ["暖木咖啡馆卡座", "暖色走廊灰色门板", "玻璃幕墙都市夜景", "夜间便利店", "地下停车场", "繁忙街道路口", "城市人行天桥"],
        "光线方案": ["暖色顶光正面环境光", "镜头方向直接硬闪", "城市霓虹侧光"],
        "色彩方案": ["暖棕奶白肤色", "黑红金暖灰", "青橙都市夜色"],
        "成像质感": ["便携数码相机直出", "真实手机摄影质感", "都市胶片颗粒"],
    },
    "自然户外": {
        "成像媒介": ["全画幅微单摄影", "半画幅微单摄影", "手机计算摄影", "便携数码相机摄影", "35毫米胶片摄影"],
        "前景框景": ["失焦嫩绿枫叶框景", "窗框留白框景", "无明显前景"],
        "背景环境": ["高亮夏日树林庭院", "春日花海", "静谧湖畔", "开阔草原", "秋日枫林", "冬日雪林", "清幽竹林", "海岸悬崖", "沙漠旷野", "乡间小路"],
        "光线方案": ["树叶斑驳逆光", "户外晴朗自然光", "海边通透侧逆光", "清晨低角度暖光", "阴天漫射柔光", "日落金色侧逆光", "雪地冷调漫射光"],
        "色彩方案": ["嫩绿与白色高明度", "奶油暖白低饱和", "暖棕奶白肤色"],
        "成像质感": ["日系胶片柔焦", "真实手机摄影质感", "便携数码相机直出", "都市胶片颗粒"],
    },
    "旅行度假": {
        "成像媒介": ["全画幅微单摄影", "半画幅微单摄影", "手机计算摄影", "便携数码相机摄影", "35毫米胶片摄影", "一次性胶片相机摄影"],
        "前景框景": ["失焦嫩绿枫叶框景", "窗框留白框景", "无明显前景"],
        "背景环境": ["海边地平线", "酒店阳台开阔景观", "林间小径树干纵深", "海岛小镇街巷", "山间露营地", "葡萄园庄园", "火车站候车厅"],
        "光线方案": ["树叶斑驳逆光", "窗边自然侧光", "户外晴朗自然光", "海边通透侧逆光", "清晨低角度暖光", "日落金色侧逆光"],
        "色彩方案": ["嫩绿与白色高明度", "奶油暖白低饱和", "青橙都市夜色"],
        "成像质感": ["日系胶片柔焦", "便携数码相机直出", "真实手机摄影质感", "都市胶片颗粒"],
    },
    "运动健康": {
        "成像媒介": ["专业数码相机摄影", "全画幅微单摄影", "半画幅微单摄影", "手机计算摄影"],
        "前景框景": ["失焦嫩绿枫叶框景", "无明显前景"],
        "背景环境": ["室外网球场", "明亮健身训练室", "拳击训练馆", "户外骑行道路", "室内羽毛球馆", "室内攀岩馆"],
        "光线方案": ["运动场清晰日光", "正面柔和散射光", "摄影棚柔光", "舞台彩色灯光"],
        "色彩方案": ["嫩绿与白色高明度", "青橙都市夜色", "高级灰黑白配色"],
        "成像质感": ["真实手机摄影质感", "都市胶片颗粒", "影棚杂志精修"],
    },
    "中式美学": {
        "成像媒介": ["专业数码相机摄影", "全画幅微单摄影", "中画幅数码摄影", "35毫米胶片摄影"],
        "前景框景": ["失焦嫩绿枫叶框景", "灰色门框纵向框景", "窗框留白框景", "无明显前景"],
        "背景环境": ["木质新中式室内", "江南园林", "敦煌壁画空间", "明制中式庭院", "传统书院"],
        "光线方案": ["树叶斑驳逆光", "窗边自然侧光", "新中式竹影柔光", "阴天漫射柔光", "壁画暖色侧光"],
        "色彩方案": ["嫩绿与白色高明度", "木色墨黑米白", "黑红金暖灰"],
        "成像质感": ["日系胶片柔焦", "细腻商业精修柔焦", "新中式柔和电影感"],
    },
    "复古年代": {
        "成像媒介": ["早期CCD数码摄影", "35毫米胶片摄影", "中画幅胶片摄影", "即时成像相纸摄影", "一次性胶片相机摄影"],
        "前景框景": ["浅木色桌沿前景", "灰色门框纵向框景", "虚化咖啡杯与桌角", "窗框留白框景"],
        "背景环境": ["复古茶餐厅", "奶油公寓客厅", "暖色酒店走廊", "七十年代客厅", "复古迪斯科舞厅", "经典火车站月台", "美式公路餐厅"],
        "光线方案": ["暖色顶光正面环境光", "镜头方向直接硬闪", "窗边自然侧光", "舞台彩色灯光"],
        "色彩方案": ["暖棕奶白肤色", "黑红金暖灰", "木色墨黑米白"],
        "成像质感": ["日系胶片柔焦", "便携数码相机直出", "直接闪光商业写真", "都市胶片颗粒"],
    },
    "电影叙事": {
        "成像媒介": ["专业数码相机摄影", "全画幅微单摄影", "中画幅数码摄影", "35毫米胶片摄影", "中画幅胶片摄影"],
        "前景框景": ["灰色门框纵向框景", "窗框留白框景", "无明显前景"],
        "背景环境": ["暖色走廊灰色门板", "玻璃幕墙都市夜景", "暖色酒店走廊", "奶油公寓客厅", "城市天台天际线", "经典火车站月台"],
        "光线方案": ["镜头方向直接硬闪", "窗边自然侧光", "城市霓虹侧光", "新中式竹影柔光"],
        "色彩方案": ["黑红金暖灰", "青橙都市夜色", "木色墨黑米白"],
        "成像质感": ["都市胶片颗粒", "新中式柔和电影感", "直接闪光商业写真"],
    },
    "幻想概念": {
        "成像媒介": ["专业数码相机摄影", "全画幅微单摄影", "中画幅数码摄影", "35毫米胶片摄影"],
        "前景框景": ["失焦嫩绿枫叶框景", "灰色门框纵向框景", "窗框留白框景", "无明显前景"],
        "背景环境": ["月夜森林", "哥特古堡厅堂", "未来赛博街区", "蒸汽机械空间", "超现实梦境花园", "星云神殿", "水下幻境", "冰雪宫殿", "云海仙境", "花瓣风暴装置空间"],
        "光线方案": ["月光轮廓光", "高反差戏剧侧光", "赛博霓虹混合光", "暖色顶光正面环境光", "梦境柔光", "水下蓝色折射光", "雪地冷调漫射光", "摄影棚柔光"],
        "色彩方案": ["黑红金暖灰", "青橙都市夜色", "木色墨黑米白", "高级灰黑白配色"],
        "成像质感": ["影棚杂志精修", "新中式柔和电影感", "都市胶片颗粒", "直接闪光商业写真"],
    },
}

THEME_SUBJECT_FIELD_POOLS = {
    "日系森系夏日写真": {"背景环境": ["高亮夏日树林庭院", "林间小径树干纵深"], "光线方案": ["树叶斑驳逆光"]},
    "日系咖啡馆生活写真": {"背景环境": ["暖木咖啡馆卡座", "临街咖啡馆窗景"], "光线方案": ["暖色顶光正面环境光", "窗边自然侧光"]},
    "窗边奶油暖调生活写真": {"背景环境": ["奶油色窗边室内", "奶油公寓客厅"], "光线方案": ["窗边自然侧光"]},
    "居家晨光松弛写真": {"背景环境": ["奶油公寓客厅"], "光线方案": ["清晨低角度暖光", "窗边自然侧光"]},
    "花店日常清新写真": {"背景环境": ["临街花店陈列"], "光线方案": ["窗边自然侧光", "阴天漫射柔光"]},
    "雨天室内安静写真": {"背景环境": ["奶油色窗边室内", "临街咖啡馆窗景"], "光线方案": ["阴天漫射柔光"]},
    "夜间室内轻奢时尚写真": {"背景环境": ["暖色走廊灰色门板", "暖色酒店走廊"], "光线方案": ["镜头方向直接硬闪"]},
    "高级杂志棚拍写真": {"背景环境": ["高级灰摄影棚"], "光线方案": ["摄影棚柔光"]},
    "极简黑白时尚写真": {"背景环境": ["高级灰摄影棚", "当代美术馆白墙"], "光线方案": ["摄影棚柔光", "正面柔和散射光"]},
    "都市街头穿搭写真": {"背景环境": ["都市商业街"], "光线方案": ["户外晴朗自然光", "城市霓虹侧光"]},
    "金属未来感时尚写真": {"背景环境": ["玻璃建筑大堂", "高级灰摄影棚"], "光线方案": ["摄影棚柔光", "城市霓虹侧光"]},
    "红毯礼服时尚写真": {"背景环境": ["暖色酒店走廊", "玻璃建筑大堂"], "光线方案": ["镜头方向直接硬闪", "摄影棚柔光"]},
    "都市职场轻奢写真": {"背景环境": ["现代办公休息区", "玻璃建筑大堂"], "光线方案": ["正面柔和散射光", "窗边自然侧光"]},
    "专业商务头像写真": {"背景环境": ["高级灰摄影棚", "现代办公休息区"], "光线方案": ["摄影棚柔光", "正面柔和散射光"]},
    "服装电商模特写真": {"背景环境": ["高级灰摄影棚"], "光线方案": ["摄影棚柔光"]},
    "珠宝首饰广告写真": {"背景环境": ["高级灰摄影棚", "玻璃建筑大堂"], "光线方案": ["摄影棚柔光"]},
    "香水商业广告写真": {"背景环境": ["高级灰摄影棚", "当代美术馆白墙"], "光线方案": ["摄影棚柔光", "正面柔和散射光"]},
    "高级酒店品牌写真": {"背景环境": ["酒店阳台开阔景观", "暖色酒店走廊", "玻璃建筑大堂"], "光线方案": ["清晨低角度暖光", "窗边自然侧光", "摄影棚柔光"]},
    "影棚水光妆美容特写": {"背景环境": ["高级灰摄影棚"], "光线方案": ["摄影棚柔光"]},
    "自然真实肤质特写": {"背景环境": ["奶油色窗边室内", "高级灰摄影棚"], "光线方案": ["窗边自然侧光", "正面柔和散射光"]},
    "清透裸妆美容写真": {"背景环境": ["奶油色窗边室内", "高级灰摄影棚"], "光线方案": ["正面柔和散射光", "摄影棚柔光"]},
    "浓郁红唇妆面特写": {"背景环境": ["高级灰摄影棚"], "光线方案": ["摄影棚柔光"]},
    "彩色眼妆创意特写": {"背景环境": ["高级灰摄影棚"], "光线方案": ["摄影棚柔光", "城市霓虹侧光"]},
    "护肤品清洁美容广告": {"背景环境": ["高级灰摄影棚", "奶油色窗边室内"], "光线方案": ["正面柔和散射光", "摄影棚柔光"]},
    "都市夜行叙事写真": {"背景环境": ["玻璃幕墙都市夜景", "城市天台天际线"], "光线方案": ["城市霓虹侧光"]},
    "玻璃幕墙通勤写真": {"背景环境": ["玻璃建筑大堂", "都市商业街"], "光线方案": ["窗边自然侧光", "户外晴朗自然光"]},
    "地铁站台都市写真": {"背景环境": ["玻璃建筑大堂"], "光线方案": ["正面柔和散射光", "城市霓虹侧光"]},
    "雨夜街头霓虹写真": {"背景环境": ["都市商业街", "玻璃幕墙都市夜景"], "光线方案": ["城市霓虹侧光"]},
    "天台蓝调时刻写真": {"背景环境": ["城市天台天际线"], "光线方案": ["城市霓虹侧光", "阴天漫射柔光"]},
    "旧城区巷道纪实写真": {"背景环境": ["都市商业街", "复古茶餐厅"], "光线方案": ["阴天漫射柔光", "暖色顶光正面环境光"]},
    "海边夏日度假写真": {"背景环境": ["海边地平线"], "光线方案": ["海边通透侧逆光", "户外晴朗自然光"]},
    "酒店阳台度假写真": {"背景环境": ["酒店阳台开阔景观"], "光线方案": ["清晨低角度暖光"]},
    "山野徒步旅行写真": {"背景环境": ["林间小径树干纵深"], "光线方案": ["户外晴朗自然光", "树叶斑驳逆光"]},
    "古镇漫步旅行写真": {"背景环境": ["木质新中式室内", "都市商业街"], "光线方案": ["清晨低角度暖光", "阴天漫射柔光"]},
    "热带泳池假日写真": {"背景环境": ["酒店阳台开阔景观", "高亮夏日树林庭院"], "光线方案": ["户外晴朗自然光", "海边通透侧逆光"]},
    "公路旅行随行写真": {"背景环境": ["都市商业街", "城市天台天际线"], "光线方案": ["清晨低角度暖光", "户外晴朗自然光"]},
    "网球场阳光运动写真": {"背景环境": ["室外网球场"], "光线方案": ["运动场清晰日光"]},
    "健身房力量训练写真": {"背景环境": ["明亮健身训练室"], "光线方案": ["正面柔和散射光", "摄影棚柔光"]},
    "瑜伽普拉提生活写真": {"背景环境": ["明亮健身训练室", "奶油公寓客厅"], "光线方案": ["窗边自然侧光", "正面柔和散射光"]},
    "城市慢跑活力写真": {"背景环境": ["都市商业街", "城市天台天际线"], "光线方案": ["运动场清晰日光", "清晨低角度暖光"]},
    "室内泳池运动写真": {"背景环境": ["酒店阳台开阔景观", "玻璃建筑大堂"], "光线方案": ["窗边自然侧光", "正面柔和散射光"]},
    "舞蹈排练动态写真": {"背景环境": ["明亮健身训练室", "高级灰摄影棚"], "光线方案": ["摄影棚柔光"]},
    "新中式室内写真": {"背景环境": ["木质新中式室内"], "光线方案": ["新中式竹影柔光"]},
    "茶室竹影中式写真": {"背景环境": ["木质新中式室内"], "光线方案": ["新中式竹影柔光"]},
    "旗袍民国雅致写真": {"背景环境": ["木质新中式室内", "复古茶餐厅"], "光线方案": ["窗边自然侧光", "新中式竹影柔光"]},
    "宋韵素雅庭院写真": {"背景环境": ["高亮夏日树林庭院", "木质新中式室内"], "光线方案": ["树叶斑驳逆光", "新中式竹影柔光"]},
    "唐风华贵宫廷写真": {"背景环境": ["木质新中式室内", "暖色酒店走廊"], "光线方案": ["暖色顶光正面环境光", "新中式竹影柔光"]},
    "水墨留白中式写真": {"背景环境": ["当代美术馆白墙", "木质新中式室内"], "光线方案": ["正面柔和散射光", "新中式竹影柔光"]},
    "复古港风夜景写真": {"背景环境": ["复古茶餐厅", "玻璃幕墙都市夜景"], "光线方案": ["镜头方向直接硬闪", "城市霓虹侧光"]},
    "九十年代家居写真": {"背景环境": ["奶油公寓客厅"], "光线方案": ["暖色顶光正面环境光", "窗边自然侧光"]},
    "千禧复古派对写真": {"背景环境": ["暖色走廊灰色门板", "复古茶餐厅"], "光线方案": ["镜头方向直接硬闪"]},
    "美式复古汽车旅馆写真": {"背景环境": ["暖色酒店走廊", "都市商业街"], "光线方案": ["镜头方向直接硬闪", "暖色顶光正面环境光"]},
    "法式旧公寓复古写真": {"背景环境": ["奶油公寓客厅", "奶油色窗边室内"], "光线方案": ["窗边自然侧光"]},
    "八十年代影楼复古写真": {"背景环境": ["高级灰摄影棚"], "光线方案": ["摄影棚柔光", "镜头方向直接硬闪"]},
    "室内克制情绪电影写真": {"背景环境": ["暖色走廊灰色门板", "木质新中式室内"], "光线方案": ["窗边自然侧光", "新中式竹影柔光"]},
    "暖调室内电影叙事写真": {"背景环境": ["暖色酒店走廊", "复古茶餐厅"], "光线方案": ["暖色顶光正面环境光"]},
    "蓝调城市电影静帧": {"背景环境": ["玻璃幕墙都市夜景", "城市天台天际线"], "光线方案": ["城市霓虹侧光"]},
    "悬疑走廊叙事写真": {"背景环境": ["暖色走廊灰色门板", "暖色酒店走廊"], "光线方案": ["镜头方向直接硬闪", "城市霓虹侧光"]},
    "明亮梦境电影写真": {"背景环境": ["奶油色窗边室内", "当代美术馆白墙"], "光线方案": ["窗边自然侧光", "正面柔和散射光"]},
    "黑白电影肖像": {"背景环境": ["高级灰摄影棚", "当代美术馆白墙"], "光线方案": ["摄影棚柔光", "正面柔和散射光"]},
}

THEME_SUBJECT_FIELD_POOLS.update({
    "书店周末阅读写真": {"背景环境": ["独立书店书架"], "光线方案": ["窗边自然侧光", "暖色顶光正面环境光"]},
    "厨房烘焙日常写真": {"背景环境": ["家庭烘焙厨房"], "光线方案": ["窗边自然侧光", "正面柔和散射光"]},
    "唱片店闲逛写真": {"背景环境": ["复古唱片店"], "光线方案": ["暖色顶光正面环境光", "镜头方向直接硬闪"]},
    "画室创作日常写真": {"背景环境": ["自然采光画室"], "光线方案": ["窗边自然侧光", "阴天漫射柔光"]},
    "周末市集漫步写真": {"背景环境": ["周末市集摊位"], "光线方案": ["户外晴朗自然光", "阴天漫射柔光"]},
    "彩色几何棚拍写真": {"背景环境": ["彩色几何摄影棚"], "光线方案": ["摄影棚柔光", "镜头方向直接硬闪"]},
    "极简西装廓形写真": {"背景环境": ["高级灰摄影棚", "当代美术馆白墙"], "光线方案": ["摄影棚柔光"]},
    "柔软针织质感写真": {"背景环境": ["奶油色窗边室内", "高级灰摄影棚"], "光线方案": ["窗边自然侧光", "摄影棚柔光"]},
    "实验花艺时尚写真": {"背景环境": ["花艺装置摄影棚"], "光线方案": ["摄影棚柔光", "高反差戏剧侧光"]},
    "腕表商业广告写真": {"背景环境": ["高级灰摄影棚", "玻璃建筑大堂"], "光线方案": ["摄影棚柔光"]},
    "眼镜商业广告写真": {"背景环境": ["高级灰摄影棚", "现代办公休息区"], "光线方案": ["摄影棚柔光", "正面柔和散射光"]},
    "手袋商业广告写真": {"背景环境": ["高级灰摄影棚", "玻璃建筑大堂"], "光线方案": ["摄影棚柔光"]},
    "婚纱礼服品牌写真": {"背景环境": ["婚纱礼服陈列厅", "暖色酒店走廊"], "光线方案": ["窗边自然侧光", "摄影棚柔光"]},
    "柔雾哑光妆面特写": {"背景环境": ["高级灰摄影棚"], "光线方案": ["摄影棚柔光"]},
    "珠光眼妆创意特写": {"背景环境": ["高级灰摄影棚"], "光线方案": ["摄影棚柔光", "城市霓虹侧光"]},
    "清透腮红妆面写真": {"背景环境": ["奶油色窗边室内", "高级灰摄影棚"], "光线方案": ["正面柔和散射光", "摄影棚柔光"]},
    "护发造型美容广告": {"背景环境": ["高级灰摄影棚"], "光线方案": ["摄影棚柔光", "高反差戏剧侧光"]},
    "便利店夜间叙事写真": {"背景环境": ["夜间便利店"], "光线方案": ["暖色顶光正面环境光", "镜头方向直接硬闪"]},
    "停车场冷调都市写真": {"背景环境": ["地下停车场"], "光线方案": ["城市霓虹侧光", "镜头方向直接硬闪"]},
    "街道路口纪实写真": {"背景环境": ["繁忙街道路口"], "光线方案": ["户外晴朗自然光", "阴天漫射柔光"]},
    "城市天桥通勤写真": {"背景环境": ["城市人行天桥"], "光线方案": ["户外晴朗自然光", "清晨低角度暖光"]},
    "春日花海清新写真": {"背景环境": ["春日花海"], "光线方案": ["户外晴朗自然光", "日落金色侧逆光"]},
    "湖畔清风自然写真": {"背景环境": ["静谧湖畔"], "光线方案": ["清晨低角度暖光", "阴天漫射柔光"]},
    "草原旷野环境写真": {"背景环境": ["开阔草原"], "光线方案": ["户外晴朗自然光", "日落金色侧逆光"]},
    "秋日枫林氛围写真": {"背景环境": ["秋日枫林"], "光线方案": ["树叶斑驳逆光", "日落金色侧逆光"]},
    "冬日雪林清冷写真": {"背景环境": ["冬日雪林"], "光线方案": ["雪地冷调漫射光"]},
    "竹林清幽自然写真": {"背景环境": ["清幽竹林"], "光线方案": ["树叶斑驳逆光", "新中式竹影柔光"]},
    "海岸悬崖环境写真": {"背景环境": ["海岸悬崖"], "光线方案": ["海边通透侧逆光", "阴天漫射柔光"]},
    "沙漠落日旷野写真": {"背景环境": ["沙漠旷野"], "光线方案": ["日落金色侧逆光"]},
    "乡间小路生活写真": {"背景环境": ["乡间小路"], "光线方案": ["清晨低角度暖光", "阴天漫射柔光"]},
    "海岛小镇漫步写真": {"背景环境": ["海岛小镇街巷"], "光线方案": ["海边通透侧逆光", "户外晴朗自然光"]},
    "山间露营旅行写真": {"背景环境": ["山间露营地"], "光线方案": ["清晨低角度暖光", "日落金色侧逆光"]},
    "葡萄园庄园旅行写真": {"背景环境": ["葡萄园庄园"], "光线方案": ["户外晴朗自然光", "日落金色侧逆光"]},
    "火车站候车旅行写真": {"背景环境": ["火车站候车厅", "经典火车站月台"], "光线方案": ["窗边自然侧光", "阴天漫射柔光"]},
    "拳击训练力量写真": {"背景环境": ["拳击训练馆"], "光线方案": ["高反差戏剧侧光", "摄影棚柔光"]},
    "户外骑行活力写真": {"背景环境": ["户外骑行道路"], "光线方案": ["运动场清晰日光", "清晨低角度暖光"]},
    "羽毛球训练写真": {"背景环境": ["室内羽毛球馆"], "光线方案": ["正面柔和散射光", "摄影棚柔光"]},
    "室内攀岩运动写真": {"背景环境": ["室内攀岩馆"], "光线方案": ["正面柔和散射光", "高反差戏剧侧光"]},
    "江南园林雨景写真": {"背景环境": ["江南园林"], "光线方案": ["阴天漫射柔光"]},
    "敦煌壁画灵感写真": {"背景环境": ["敦煌壁画空间"], "光线方案": ["壁画暖色侧光"]},
    "明制雅致庭院写真": {"背景环境": ["明制中式庭院"], "光线方案": ["新中式竹影柔光", "清晨低角度暖光"]},
    "传统书院文雅写真": {"背景环境": ["传统书院"], "光线方案": ["窗边自然侧光", "新中式竹影柔光"]},
    "七十年代暖调客厅写真": {"背景环境": ["七十年代客厅"], "光线方案": ["暖色顶光正面环境光", "窗边自然侧光"]},
    "复古迪斯科舞厅写真": {"背景环境": ["复古迪斯科舞厅"], "光线方案": ["舞台彩色灯光", "镜头方向直接硬闪"]},
    "经典火车站旅人写真": {"背景环境": ["经典火车站月台"], "光线方案": ["阴天漫射柔光", "清晨低角度暖光"]},
    "美式公路餐厅复古写真": {"背景环境": ["美式公路餐厅"], "光线方案": ["暖色顶光正面环境光", "镜头方向直接硬闪"]},
    "雨夜独行电影静帧": {"背景环境": ["繁忙街道路口", "玻璃幕墙都市夜景"], "光线方案": ["城市霓虹侧光", "赛博霓虹混合光"]},
    "公寓独处剧情写真": {"背景环境": ["奶油公寓客厅", "奶油色窗边室内"], "光线方案": ["窗边自然侧光", "高反差戏剧侧光"]},
    "旅馆窗边电影静帧": {"背景环境": ["暖色酒店走廊", "奶油色窗边室内"], "光线方案": ["窗边自然侧光", "暖色顶光正面环境光"]},
    "公路停靠电影叙事": {"背景环境": ["美式公路餐厅", "乡间小路"], "光线方案": ["日落金色侧逆光", "清晨低角度暖光"]},
    "月夜森林精灵概念写真": {"背景环境": ["月夜森林"], "光线方案": ["月光轮廓光", "梦境柔光"]},
    "哥特古堡暗黑写真": {"背景环境": ["哥特古堡厅堂"], "光线方案": ["高反差戏剧侧光"]},
    "未来都市赛博写真": {"背景环境": ["未来赛博街区"], "光线方案": ["赛博霓虹混合光"]},
    "蒸汽机械复古幻想写真": {"背景环境": ["蒸汽机械空间"], "光线方案": ["暖色顶光正面环境光", "高反差戏剧侧光"]},
    "梦境花园超现实写真": {"背景环境": ["超现实梦境花园"], "光线方案": ["梦境柔光"]},
    "星云神殿概念写真": {"背景环境": ["星云神殿"], "光线方案": ["月光轮廓光", "梦境柔光"]},
    "水下幻境概念写真": {"背景环境": ["水下幻境"], "光线方案": ["水下蓝色折射光"]},
    "冰雪宫殿幻想写真": {"背景环境": ["冰雪宫殿"], "光线方案": ["雪地冷调漫射光", "梦境柔光"]},
    "云雾仙境幻想写真": {"背景环境": ["云海仙境"], "光线方案": ["梦境柔光", "清晨低角度暖光"]},
    "花瓣风暴概念写真": {"背景环境": ["花瓣风暴装置空间"], "光线方案": ["摄影棚柔光", "高反差戏剧侧光"]},
    "阳台绿植晨间写真": {"背景环境": ["阳台开阔景观"]},
    "深夜书房独处写真": {"背景环境": ["整齐书架"]},
    "汽车商业广告写真": {"背景环境": ["都市商业街", "玻璃建筑大堂"]},
    "美甲特写美容写真": {"背景环境": ["高级灰摄影棚"]},
    "夜市烟火叙事写真": {"背景环境": ["夜市灯火"]},
    "瀑布溪流清新写真": {"背景环境": ["瀑布溪流"]},
    "高原湖泊纯净写真": {"背景环境": ["湖面倒影", "雪山"]},
    "和服京都之旅写真": {"背景环境": ["和风木造庭院"]},
    "温泉度假休闲写真": {"背景环境": ["温泉汤池"]},
    "滑雪运动写真": {"背景环境": ["雪山"]},
    "冲浪运动写真": {"背景环境": ["海面与地平线"]},
    "少数民族风情写真": {"背景环境": ["少数民族集市"]},
    "昭和和风复古写真": {"背景环境": ["昭和和风房间"]},
    "上海滩十里洋场写真": {"背景环境": ["上海滩街景"]},
    "剧院舞台电影静帧": {"背景环境": ["剧院舞台"]},
    "海港码头电影静帧": {"背景环境": ["海港码头"]},
    "人鱼海岸概念写真": {"背景环境": ["水下幻境"]},
    "天使羽翼概念写真": {"背景环境": ["天使羽翼殿堂"]},
})

# 新增主题优先继承所属大类的可拍摄场景与光线；已人工定义的主题保留更窄的定向池。
for _pools in PROFILE_POOLS.values():
    for _legacy_field in ("光线方案", "色彩方案", "成像质感"):
        _pools.pop(_legacy_field, None)
for _pools in THEME_CATEGORY_FIELD_POOLS.values():
    for _legacy_field in ("光线方案", "色彩方案", "成像质感"):
        _pools.pop(_legacy_field, None)
for _pools in THEME_SUBJECT_FIELD_POOLS.values():
    _pools.pop("光线方案", None)

_theme_category_lookup = {
    theme: category
    for category, themes in THEME_OPTIONS_BY_CATEGORY.items()
    for theme in themes
}
THEME_SUBJECT_FIELD_POOLS = {
    theme: pools
    for theme, pools in THEME_SUBJECT_FIELD_POOLS.items()
    if theme in _theme_category_lookup
}
for _theme, _category in _theme_category_lookup.items():
    _category_pools = THEME_CATEGORY_FIELD_POOLS[_category]
    THEME_SUBJECT_FIELD_POOLS.setdefault(
        _theme,
        {
            "背景环境": list(_category_pools["背景环境"]),
        },
    )

# A one-item background pool is the existing metadata declaration that a
# theme names an exact place rather than a broad scene direction. Keep the
# derived set public so contract tests can detect newly added themes that have
# not reached the runtime router.
LOCATION_SPECIFIC_THEMES = frozenset(
    theme
    for theme, pools in THEME_SUBJECT_FIELD_POOLS.items()
    if len(pools["背景环境"]) == 1
)

_THEME_CATEGORY_DEFAULT_SCENE_CATEGORY = {
    "日常生活": "居住空间",
    "时尚编辑": "专业特色",
    "商业广告": "专业特色",
    "美妆美容": "专业特色",
    "都市叙事": "都市户外",
    "自然户外": "自然户外",
    "旅行度假": "自然户外",
    "运动健康": "运动康体",
    "中式美学": "东方传统",
    "复古年代": "居住空间",
    "电影叙事": "居住空间",
    "幻想概念": "专业特色",
}

_LOCATION_THEME_FIELD_VARIANTS: Mapping[
    str, Mapping[str, tuple[str, ...]]
] = {
    "江南园林雨景写真": {
        "时间切片": ("阴天下午",),
        "天气状态": ("阴天", "细雨", "雨后"),
    },
    "网球场阳光运动写真": {
        "背景环境": ("网球场围网", "室外网球场"),
        "时间切片": ("上午晚些时候", "夏日午后"),
        "天气状态": ("晴朗日照", "薄云天气"),
    },
    "哥特古堡暗黑写真": {
        "时间切片": ("夜间", "深夜"),
    },
}


def _location_scene_category(theme: str, background: str) -> str:
    if any(
        token in background
        for token in ("网球", "健身", "拳击", "羽毛球", "攀岩", "骑行")
    ):
        return "运动康体"
    if any(token in background for token in ("街", "天桥", "停车场", "便利店")):
        return "都市户外"
    if any(token in background for token in ("花店", "书店", "唱片店", "市集")):
        return "商业零售"
    if any(token in background for token in ("画室", "壁画", "舞厅")):
        return "文化艺术"
    if any(token in background for token in ("火车站", "月台")):
        return "交通空间"
    if any(
        token in background
        for token in (
            "园林", "花海", "湖畔", "草原", "枫林", "雪林", "竹林",
            "悬崖", "沙漠", "乡间", "海岛", "露营", "葡萄园",
        )
    ):
        return "自然户外"
    return _THEME_CATEGORY_DEFAULT_SCENE_CATEGORY[
        _theme_category_lookup[theme]
    ]


def _neutral_location_theme_bundle(
    theme: str, background: str
) -> Dict[str, str]:
    category = _location_scene_category(theme, background)
    outdoor = category in {"自然户外", "都市户外"}
    time = "上午晚些时候" if outdoor else "正午"
    weather = "薄云天气" if outdoor else EMPTY_CHOICE
    if "雨" in theme:
        time, weather = "阴天下午", "细雨"
    elif "雪" in theme or "冬日" in theme:
        time, weather = "阴天下午", "小雪"
    elif "日落" in theme or "落日" in theme:
        time, weather = "日落前金色时刻", "晴朗日照"
    elif "夜" in theme or "月夜" in theme:
        time, weather = "夜间", EMPTY_CHOICE
    elif "晨" in theme:
        time, weather = "晴朗清晨", "薄云天气" if outdoor else EMPTY_CHOICE
    elif "阳光" in theme:
        time, weather = "上午晚些时候", "晴朗日照"
    return {
        "场景大类": category,
        "场景地点": background,
        "时间切片": time,
        "天气状态": weather,
        "前景框景": EMPTY_CHOICE,
        "背景环境": background,
        "环境细节": EMPTY_CHOICE,
        "空间材质": EMPTY_CHOICE,
        "空间层次": "开阔户外纵深" if outdoor else "前中后三层",
        "id": "",
        "label": theme,
        "tags": ("位置型主题", category),
    }


def _build_location_theme_scene_bundles(
    theme: str,
) -> tuple[Mapping[str, str], ...]:
    background = THEME_SUBJECT_FIELD_POOLS[theme]["背景环境"][0]
    exact_bases = [
        dict(bundle)
        for bundle in SCENE_BUNDLES
        if bundle["场景地点"] == background
    ]
    bases = exact_bases or [_neutral_location_theme_bundle(theme, background)]
    for base_index, base in enumerate(bases):
        base["背景环境"] = background

    variant_fields = _LOCATION_THEME_FIELD_VARIANTS.get(theme, {})
    if not variant_fields:
        variant_fields = {"背景环境": (background,)}
    field_names = tuple(variant_fields)
    bundles = []
    for base in bases:
        combinations = product(*(
            variant_fields[name] for name in field_names
        ))
        for variant_index, values in enumerate(combinations):
            bundle = dict(base)
            bundle.update(dict(zip(field_names, values)))
            bundle["id"] = (
                f"theme_scene:{theme}:{base_index}:{variant_index}"
            )
            bundle["label"] = theme
            bundles.append(bundle)
    return tuple(bundles)


THEME_SCENE_BUNDLES_BY_THEME = {
    theme: _build_location_theme_scene_bundles(theme)
    for theme in sorted(LOCATION_SPECIFIC_THEMES)
}
ALL_LOCATION_THEME_SCENE_BUNDLES = tuple(
    bundle
    for bundles in THEME_SCENE_BUNDLES_BY_THEME.values()
    for bundle in bundles
)


def theme_scene_bundles(theme_label: str) -> tuple[Mapping[str, str], ...]:
    """Return complete, internally compatible scene bundles for a theme."""

    return tuple(
        dict(bundle)
        for bundle in THEME_SCENE_BUNDLES_BY_THEME.get(theme_label, ())
    )


def theme_scene_constraints(
    theme_label: str,
) -> Mapping[str, Sequence[str]]:
    """Return field pools derived from complete theme scene bundles."""

    bundles = THEME_SCENE_BUNDLES_BY_THEME.get(theme_label, ())
    if not bundles:
        return {}
    return {
        field_name: tuple(dict.fromkeys(
            bundle[field_name] for bundle in bundles
        ))
        for field_name in SCENE_GROUP_FIELDS
    }


def _neutral_scene_bundle_for_explicit_locks(
    theme: str, explicit_locks: Mapping[str, str]
) -> Dict[str, str]:
    """Build a prop-free scene only when no complete bundle satisfies locks."""

    anchor = (
        explicit_locks.get("场景地点")
        or explicit_locks.get("背景环境")
        or THEME_SUBJECT_FIELD_POOLS.get(theme, {}).get(
            "背景环境", ["高级灰摄影棚"]
        )[0]
    )
    bundle = _neutral_location_theme_bundle(theme, anchor)
    bundle.update(explicit_locks)
    bundle["id"] = f"explicit_scene:{anchor}"
    bundle["label"] = "显式场景锁定"
    return bundle

PROFILE_LIGHTING_PLANS = {
    preset: _lighting_plans(lighting_id)
    for preset, (lighting_id, _) in _PRESET_VISUAL_BUNDLES.items()
}
PROFILE_VISUAL_PROFILES = {
    preset: _visual_profiles(visual_id)
    for preset, (_, visual_id) in _PRESET_VISUAL_BUNDLES.items()
}

_THEME_CATEGORY_IDS = {
    "lifestyle": "日常生活",
    "fashion_editorial": "时尚编辑",
    "commercial": "商业广告",
    "beauty": "美妆美容",
    "urban": "都市叙事",
    "nature_outdoor": "自然户外",
    "travel": "旅行度假",
    "sport": "运动健康",
    "oriental": "中式美学",
    "retro": "复古年代",
    "cinematic": "电影叙事",
    "fantasy_concept": "幻想概念",
}
THEME_CATEGORY_LIGHTING_PLANS: dict[str, list[Mapping[str, str]]] = {}
THEME_CATEGORY_VISUAL_PROFILES: dict[str, list[Mapping[str, str]]] = {}
CAPTURE_MEDIUM_LIGHTING_PLANS_BY_ID: dict[str, tuple[Mapping[str, str], ...]] = {}
CAPTURE_MEDIUM_VISUAL_PROFILES_BY_ID: dict[str, tuple[str, ...]] = {}
for _rule in _COMPATIBILITY_LIBRARY["compatibility_rules"]:
    _field_id = _rule.get("when", {}).get("field")
    _preferred = _rule.get("prefer_bundles", {})
    if _field_id == "theme.category":
        for _value_id in _rule["when"].get("values", ()): 
            _category_label = _THEME_CATEGORY_IDS.get(_value_id)
            if not _category_label:
                continue
            if _preferred.get("lighting_plans"):
                THEME_CATEGORY_LIGHTING_PLANS[_category_label] = _lighting_plans(
                    *_preferred["lighting_plans"]
                )
            if _preferred.get("visual_profiles"):
                THEME_CATEGORY_VISUAL_PROFILES[_category_label] = _visual_profiles(
                    *_preferred["visual_profiles"]
                )
    elif _field_id == "capture.medium":
        for _value_id in _rule["when"].get("values", ()): 
            if _value_id not in CAPTURE_MEDIUM_ID_TO_LABEL:
                continue
            if _preferred.get("lighting_plans"):
                CAPTURE_MEDIUM_LIGHTING_PLANS_BY_ID[_value_id] = tuple(
                    _lighting_plans(*_preferred["lighting_plans"])
                )
            if _preferred.get("visual_profiles"):
                CAPTURE_MEDIUM_VISUAL_PROFILES_BY_ID[_value_id] = tuple(
                    _preferred["visual_profiles"]
                )

_NEUTRAL_GENERIC_PHOTOGRAPHY_PROFILE_IDS = (
    "clean_beauty_editorial",
    "night_flash_fashion",
    "ecommerce_accurate",
    "urban_neon_cinema",
    "low_key_warm_black",
)


def _visual_profile_candidates_for_medium_id(
    medium_id: str,
) -> tuple[Mapping[str, str], ...]:
    """Return a physical-medium-safe pool keyed only by stable IDs."""

    profile_ids = CAPTURE_MEDIUM_VISUAL_PROFILES_BY_ID.get(
        medium_id, _NEUTRAL_GENERIC_PHOTOGRAPHY_PROFILE_IDS
    )
    return tuple(_visual_profiles(*profile_ids))

_LEGACY_LIGHTING_PLAN_IDS = {
    "树叶斑驳逆光": ("forest_dappled_backlight",),
    "暖色顶光正面环境光": ("cafe_warm_ambient",),
    "镜头方向直接硬闪": ("camera_hard_flash", "doorway_ceiling_flash"),
    "正面柔和散射光": ("bounce_front_fill", "studio_large_softbox"),
    "窗边自然侧光": ("window_soft_side",),
    "城市霓虹侧光": ("neon_mixed_side", "storefront_night"),
    "摄影棚柔光": ("studio_large_softbox", "beauty_clamshell"),
    "新中式竹影柔光": ("window_pattern_light", "window_soft_side"),
    "户外晴朗自然光": ("direct_sun_side", "overcast_even"),
    "海边通透侧逆光": ("golden_backlight",),
    "清晨低角度暖光": ("golden_backlight", "window_soft_side"),
    "阴天漫射柔光": ("overcast_even",),
    "运动场清晰日光": ("direct_sun_side", "overcast_even"),
    "日落金色侧逆光": ("golden_backlight",),
    "雪地冷调漫射光": ("overcast_even",),
    "舞台彩色灯光": ("neon_mixed_side", "rim_light_separation"),
    "壁画暖色侧光": ("tungsten_practical_side", "window_pattern_light"),
    "月光轮廓光": ("rim_light_separation",),
    "赛博霓虹混合光": ("neon_mixed_side",),
    "水下蓝色折射光": ("window_pattern_light", "neon_mixed_side"),
    "高反差戏剧侧光": ("low_key_side_panel", "rim_light_separation"),
    "梦境柔光": ("ring_light_beauty", "studio_large_softbox"),
}


def _scene_compatible_lighting_plans(scene_bundle: Mapping | None) -> list[Mapping[str, str]]:
    if not scene_bundle:
        return []
    legacy_options = SCENE_BUNDLE_LIGHT_OPTIONS.get(
        scene_bundle["id"],
        SCENE_CATEGORY_LIGHT_OPTIONS.get(scene_bundle["场景大类"], ()),
    )
    plan_ids = []
    for option in legacy_options:
        plan_ids.extend(_LEGACY_LIGHTING_PLAN_IDS.get(option, ()))
    return _lighting_plans(*dict.fromkeys(plan_ids)) if plan_ids else []

GROUP_BUNDLES = [
    (POSE_OUTPUT_FIELDS, POSE_BUNDLES, PROFILE_POSE_BUNDLES),
    (SCENE_GROUP_FIELDS, SCENE_BUNDLES, PROFILE_SCENE_BUNDLES),
    (LIGHTING_OUTPUT_FIELDS, LIGHTING_PLANS, PROFILE_LIGHTING_PLANS),
    ((*COLOR_OUTPUT_FIELDS, *FINISH_OUTPUT_FIELDS), VISUAL_PROFILES, PROFILE_VISUAL_PROFILES),
    (CAMERA_OUTPUT_FIELDS, CAMERA_BUNDLES, PROFILE_CAMERA_BUNDLES),
    (HAIR_STRUCTURE_FIELDS, HAIR_STRUCTURE_BUNDLES, PROFILE_HAIR_BUNDLES),
]

BRIEF_FIELD_TEXT: Dict[str, Dict[str, str]] = {
    "前景框景": {
        "失焦嫩绿枫叶框景": "失焦嫩绿枫叶",
        "浅木色桌沿前景": "浅木色桌沿",
        "灰色门框纵向框景": "灰色门框",
        "深灰文件夹前景": "与手部互动的深灰文件夹",
        "虚化咖啡杯与桌角": "轻度虚化的咖啡杯与桌角",
        "窗框留白框景": "一侧窗框与适量留白",
        "无明显前景": "干净通透的前景",
    },
    "色彩方案": {
        "嫩绿与白色高明度": "高明度嫩绿与白色配色",
        "暖棕奶白肤色": "暖棕、奶白与自然肤色",
        "黑红金暖灰": "黑色、暖灰与酒红金色点缀",
        "职场暖灰酒红点缀": "暖灰主调与酒红金色点缀",
        "奶油暖白低饱和": "低饱和奶油暖白与浅咖色",
        "青橙都市夜色": "低饱和青灰夜色与橙色点缀",
        "高级灰黑白配色": "高级灰、黑色与柔白色",
        "木色墨黑米白": "低饱和木色、墨黑与米白色",
    },
}

_PERSON_STANDARD_PREFIXES = {
    "脸型": "脸型为", "轮廓细节": "轮廓为",
    "眼型": "眼型为", "瞳色": "瞳色为", "眼睑特征": "眼睑为",
    "肤色": "肤色为", "肤质": "肤质为",
    "整体妆容预设": "妆容为",
    "底妆质感": "底妆为", "眼影色系": "眼影为",
    "眼线造型": "眼线为", "唇妆颜色": "唇色为", "唇面质感": "唇面为",
    "基础身形": "身形为", "身量观感": "身量为", "线条重点": "线条重点为",
}
STANDARD_FIELD_TEXT: Dict[str, Dict[str, str]] = {
    field_name: {
        value: f"{prefix}{value}" for value in FIELD_OPTIONS[field_name]
    }
    for field_name, prefix in _PERSON_STANDARD_PREFIXES.items()
}


def _preset_values(preset: str) -> Dict[str, str]:
    preset = LEGACY_PRESET_NAMES.get(preset, preset)
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
        pool = FIELD_OPTIONS[field_name]
    else:
        pool = PROFILE_POOLS.get(preset, {}).get(field_name, FIELD_OPTIONS[field_name])
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
    compatible = compatible or candidates
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


def _clothing_recipe_candidates(
    preset: str,
    random_scope: str,
    resolved: Mapping[str, str],
    random_fields: set[str],
) -> list[Mapping]:
    if random_scope == RANDOM_SCOPES[2]:
        recipes = list(CLOTHING_RECIPES)
    else:
        recipes = [
            CLOTHING_RECIPE_BY_ID[recipe_id]
            for recipe_id in CLOTHING_PROFILE_RECIPE_IDS.get(preset, ())
        ] or list(CLOTHING_RECIPES)

    locked_mode = (
        resolved.get("穿搭结构")
        if "穿搭结构" not in random_fields
        else None
    )
    if locked_mode not in (None, EMPTY_CHOICE):
        mode_id = CLOTHING_LABEL_TO_ID["穿搭结构"].get(locked_mode)
        matching = [
            recipe for recipe in recipes
            if mode_id in recipe.get("field_pool", {}).get("clothing.mode", [])
        ]
        if not matching:
            matching = [
                recipe for recipe in CLOTHING_RECIPES
                if mode_id in recipe.get("field_pool", {}).get("clothing.mode", [])
            ]
        if matching:
            recipes = matching

    # Respect explicit garment locks where a recipe offers the same dimension.
    matched = []
    for recipe in recipes:
        pool = recipe.get("field_pool", {})
        compatible = True
        for field_name, library_field_id in _CLOTHING_RECIPE_FIELD_MAP.items():
            if field_name in random_fields or field_name == "穿搭结构":
                continue
            selected = resolved.get(field_name, EMPTY_CHOICE)
            if selected == EMPTY_CHOICE:
                continue
            if library_field_id not in pool:
                compatible = False
                break
            selected_id = CLOTHING_LABEL_TO_ID[field_name].get(selected)
            if selected_id not in pool[library_field_id]:
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
    if field_name == "服装配件":
        return rng.choice(FIELD_OPTIONS[field_name])
    if field_name == "版型细节":
        return rng.choice(FIELD_OPTIONS[field_name])
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
    return rng.choice(FIELD_OPTIONS[field_name])


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
    if "穿搭结构" in active_random:
        mode_ids = recipe.get("field_pool", {}).get("clothing.mode", [])
        mode_choices = [
            CLOTHING_ID_TO_LABEL["穿搭结构"][option_id]
            for option_id in mode_ids
            if option_id in CLOTHING_ID_TO_LABEL["穿搭结构"]
        ] or FIELD_OPTIONS["穿搭结构"]
        locked_branch_fields = {
            field_name for field_name in CLOTHING_BRANCH_FIELDS
            if field_name not in random_fields
            and resolved.get(field_name, EMPTY_CHOICE) != EMPTY_CHOICE
        }
        if locked_branch_fields:
            compatible_modes = [
                mode_name for mode_name in mode_choices
                if locked_branch_fields.issubset(CLOTHING_MODE_FIELDS[mode_name])
            ]
            if compatible_modes:
                mode_choices = compatible_modes
        resolved["穿搭结构"] = rng.choice(mode_choices)

    mode = resolved.get("穿搭结构", EMPTY_CHOICE)
    visible_fields = set(CLOTHING_MODE_FIELDS.get(mode, ()))
    required_visible = {
        field for field in visible_fields
        if not field.endswith("图案")
    }

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
            resolved[field_name] = _random_clothing_value(
                rng, field_name, recipe
            )

    for field_name in ("版型细节", "袜装", "鞋履", "服装配件"):
        if field_name in active_random:
            resolved[field_name] = _random_clothing_value(
                rng, field_name, recipe
            )
    return active_random


def resolve_fields(
    preset: str,
    random_scope: str,
    seed: int,
    requested: Mapping[str, str],
) -> Dict[str, str]:
    """Resolve presets, explicit locks and deterministic random fields."""

    preset = LEGACY_PRESET_NAMES.get(preset, preset)
    random_scope = LEGACY_RANDOM_SCOPES.get(random_scope, random_scope)
    if random_scope not in RANDOM_SCOPES:
        random_scope = RANDOM_SCOPES[0]

    requested = dict(requested)
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

    rng = random.Random(int(seed) & MAX_SEED)
    resolved = _preset_values(preset)
    random_fields: set[str] = set()

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
                bundles = _pose_compatible_camera_bundles(
                    resolved.get("基础姿态", ""), bundles
                )
            elif group_fields == LIGHTING_OUTPUT_FIELDS:
                bundles = THEME_CATEGORY_LIGHTING_PLANS.get(category, global_bundles)
            elif group_fields == (*COLOR_OUTPUT_FIELDS, *FINISH_OUTPUT_FIELDS):
                bundles = THEME_CATEGORY_VISUAL_PROFILES.get(category, global_bundles)
            else:
                bundles = global_bundles
        else:
            bundles = profile_bundles.get(preset, global_bundles)
            if group_fields == SCENE_GROUP_FIELDS:
                theme = resolved.get("写真主题", "")
                scene_theme_bundles = (
                    theme_scene_bundles(theme)
                    or _theme_directed_scene_bundles(theme)
                )
                category_bundles = THEME_CATEGORY_SCENE_BUNDLES.get(
                    category, global_bundles
                )
                scene_category_or_profile_bundles = (
                    *bundles, *category_bundles
                )
                bundles = (
                    scene_theme_bundles
                    or scene_category_or_profile_bundles
                )

        if group_fields == LIGHTING_OUTPUT_FIELDS:
            scene_bundles = _scene_compatible_lighting_plans(selected_scene_bundle)
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
            if headwear_is_locked:
                allowed_styles = HEADWEAR_STYLE_COMPATIBILITY.get(headwear, set())
                compatible = [
                    bundle for bundle in bundles
                    if bundle["发型造型"] in allowed_styles
                ]
                if compatible:
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
                )

            candidates = [
                bundle for bundle in scene_theme_bundles
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
                candidates = [_neutral_scene_bundle_for_explicit_locks(
                    resolved.get("写真主题", ""), explicit_scene_locks
                )]
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
        selected_bundle = rng.choice(candidates)
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
            if field_name == "写真主题":
                theme_pool = THEME_OPTIONS_BY_CATEGORY.get(
                    resolved.get("写真大类", ""), tuple(THEME_TEXT)
                )
                resolved[field_name] = rng.choice(list(theme_pool))
            elif field_name == "头部配饰":
                base_pool = (
                    FIELD_OPTIONS[field_name]
                    if random_scope == RANDOM_SCOPES[2]
                    else PROFILE_POOLS.get(preset, {}).get(
                        field_name, FIELD_OPTIONS[field_name]
                    )
                )
                compatible_pool = _compatible_headwear_options(
                    resolved.get("发型造型", ""),
                    base_pool,
                    resolved.get("手部动作", ""),
                )
                resolved[field_name] = rng.choice(compatible_pool)
            elif (
                random_scope == RANDOM_SCOPES[2]
                and field_name
                in THEME_SUBJECT_FIELD_POOLS.get(
                    resolved.get("写真主题", ""), {}
                )
            ):
                resolved[field_name] = rng.choice(
                    THEME_SUBJECT_FIELD_POOLS[resolved["写真主题"]][field_name]
                )
            elif field_name == "地域族裔分支":
                branch_pool = ETHNICITY_BRANCHES_BY_CATEGORY.get(
                    resolved.get("族裔大类", ""), tuple(ETHNICITY_BRANCH_TEXT)
                )
                resolved[field_name] = rng.choice(list(branch_pool))
            elif (
                random_scope == RANDOM_SCOPES[2]
                and field_name
                in THEME_CATEGORY_FIELD_POOLS.get(
                    resolved.get("写真大类", ""), {}
                )
            ):
                resolved[field_name] = rng.choice(
                    THEME_CATEGORY_FIELD_POOLS[resolved["写真大类"]][field_name]
                )
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

    # A landscape canvas needs a camera plan with lateral space. Re-select only
    # camera fields the user marked random; explicit locks always remain intact.
    camera_fields = CAMERA_OUTPUT_FIELDS
    active_oriented_camera = random_fields.intersection(camera_fields)
    orientation_bundles = None
    if resolved["画面比例"] in LANDSCAPE_ASPECTS:
        orientation_bundles = LANDSCAPE_CAMERA_BUNDLES
    elif resolved["画面比例"] in PORTRAIT_ASPECTS:
        orientation_bundles = PORTRAIT_CAMERA_BUNDLES
    if orientation_bundles and active_oriented_camera:
        if random_scope == RANDOM_SCOPES[2]:
            camera_pool = THEME_CATEGORY_CAMERA_BUNDLES.get(
                resolved.get("写真大类", ""), CAMERA_BUNDLES
            )
        else:
            camera_pool = PROFILE_CAMERA_BUNDLES.get(preset, CAMERA_BUNDLES)
        compatible_orientation = [
            bundle for bundle in orientation_bundles if bundle in camera_pool
        ]
        if compatible_orientation:
            orientation_bundles = compatible_orientation
        orientation_bundles = _pose_compatible_camera_bundles(
            resolved.get("基础姿态", ""), orientation_bundles
        )
        candidates = _matching_bundles(
            orientation_bundles,
            camera_fields,
            resolved,
            random_fields,
        ) or orientation_bundles
        selected_bundle = rng.choice(candidates)
        for field_name in active_oriented_camera:
            resolved[field_name] = selected_bundle[field_name]

    return resolved


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


def _person_detail_prompt_text(fields: Mapping[str, str], density: str) -> str:
    """Compose face, eyes, skin and exactly one selected makeup branch."""

    active_fields = [
        *PERSON_FACE_FIELDS, *PERSON_EYE_FIELDS, *PERSON_SKIN_FIELDS,
    ]
    makeup_mode = fields.get("妆容模式", EMPTY_CHOICE)
    if makeup_mode == "整体预设":
        active_fields.append("整体妆容预设")
    elif makeup_mode == "分项自定义":
        active_fields.extend(MAKEUP_CUSTOM_FIELDS)
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
    ):
        compact_material = ""
    compact = "".join(
        part for part in (color, compact_material, garment_type) if part
    )
    if not compact:
        compact = pattern

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
    parts = [f"{prefix}{compact}"]
    if density == "标准":
        if pattern:
            parts.append(f"带{pattern}图案")
        return "，".join(parts)

    if garment_type:
        parts.append(_clothing_detail_tail(type_field, garment_type))
    if material:
        parts.append(f"面料{CLOTHING_VALUE_TEXT[material_field][material]}")
    if pattern:
        parts.append(CLOTHING_VALUE_TEXT[pattern_field][pattern])
    return "，".join(parts)


def _clothing_prompt_text(fields: Mapping[str, str], density: str) -> str:
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
            else value
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


def _pose_prompt_text(fields: Mapping[str, str], density: str) -> str:
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
            selected[field_name]
            for field_name in compact_fields
            if field_name in selected
        )
    if density == "标准":
        standard_parts = []
        for field_name in POSE_OUTPUT_FIELDS:
            if field_name not in selected:
                continue
            value = selected[field_name]
            value = _PRESET_POSE_STANDARD_TEXT.get(value, value)
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
        return "，".join(standard_parts)
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
        return value if value.endswith(suffix) else f"{value}{suffix}"

    if density == "精简":
        parts = []
        if location:
            parts.append(location)
        if time_slice:
            parts.append(time_slice)
        if foreground:
            parts.append(with_suffix(foreground, "前景"))
        if background:
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
        if background:
            parts.append(with_suffix(background, "背景"))
        if details:
            parts.append(f"保留{details}")
        return "，".join(parts)

    parts = []
    if location:
        parts.append(FIELD_TEXT["场景地点"][location])
    if time_slice:
        parts.append(FIELD_TEXT["时间切片"][time_slice])
    if weather:
        parts.append(FIELD_TEXT["天气状态"][weather])
    if foreground:
        parts.append(FIELD_TEXT["前景框景"][foreground])
    if background:
        parts.append(FIELD_TEXT["背景环境"][background])
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


_ENGLISH_FIELD_LIBRARY_SOURCES = {
    "成像媒介": (_THEME_MEDIA_LIBRARY, "capture.medium"),
    "写真主题": (_THEME_MEDIA_LIBRARY, "theme.subject"),
    "年龄阶段": (_CORE_LIBRARY, "person.age"),
    "族裔大类": (_CORE_LIBRARY, "person.ethnicity"),
    "地域族裔分支": (_CORE_LIBRARY, "person.ethnicity_branch"),
    **PERSON_FIELD_LIBRARY_IDS,
    **HAIR_LIBRARY_FIELDS,
    **{
        field_name: (_CORE_LIBRARY, field_id)
        for field_name, field_id in CLOTHING_LIBRARY_FIELDS.items()
    },
    **{
        field_name: (_POSE_LIBRARY, field_id)
        for field_name, field_id in POSE_LIBRARY_FIELDS.items()
    },
    **{
        field_name: (_SCENE_LIBRARY, field_id)
        for field_name, field_id in SCENE_LIBRARY_FIELDS.items()
    },
    **{
        field_name: (_CAMERA_VISUAL_LIBRARY, field_id)
        for field_name, field_id in {
            **CAMERA_LIBRARY_FIELDS, **VISUAL_LIBRARY_FIELDS,
        }.items()
    },
}

_ENGLISH_OPTION_ID_MAPS = {
    field_name: _library_label_to_id(library, field_id)
    for field_name, (library, field_id) in _ENGLISH_FIELD_LIBRARY_SOURCES.items()
}
_ENGLISH_OPTION_ID_MAPS["场景地点"].update(
    _library_label_to_id(_ADVANCED_LIBRARY, "scene.indoor_location")
)

_ENGLISH_THEME_OVERRIDES = {
    "阳台绿植晨间写真": "morning balcony portrait among green plants",
    "深夜书房独处写真": "late-night solitary study-room portrait",
    "复古胶片质感时尚写真": "retro film fashion editorial",
    "高定礼服后台写真": "haute couture backstage portrait",
    "汽车商业广告写真": "automotive commercial portrait",
    "食品饮料广告写真": "food and beverage commercial photography",
    "美甲特写美容写真": "nail-art beauty close-up",
    "香氛喷雾美容广告": "fragrance mist beauty campaign",
    "夜市烟火叙事写真": "night-market documentary portrait",
    "雨伞街头剪影写真": "street portrait with an umbrella silhouette",
    "瀑布溪流清新写真": "fresh waterfall and stream portrait",
    "高原湖泊纯净写真": "clean highland lake portrait",
    "和服京都之旅写真": "Kyoto travel portrait in kimono",
    "温泉度假休闲写真": "relaxed hot-spring resort portrait",
    "滑雪运动写真": "skiing sports portrait",
    "冲浪运动写真": "surfing sports portrait",
    "汉服襦裙写真": "traditional Hanfu ruqun portrait",
    "少数民族风情写真": "ethnic folk-style portrait",
    "昭和和风复古写真": "retro Showa-era Japanese portrait",
    "上海滩十里洋场写真": "vintage cosmopolitan Shanghai portrait",
    "剧院舞台电影静帧": "cinematic theater-stage still",
    "海港码头电影静帧": "cinematic harbor-pier still",
    "人鱼海岸概念写真": "mermaid coast concept portrait",
    "天使羽翼概念写真": "angel-wings concept portrait",
}

_ENGLISH_VALUE_OVERRIDES = {
    ("发色", "银白色"): "silver-white hair",
    ("发型造型", "双环发髻"): "ornate double-loop buns",
    ("连体服类型", "无袖瑜伽连体衣"): "a fitted sleeveless yoga bodysuit",
    ("上装类型", "简洁短袖T恤"): "a clean short-sleeve T-shirt",
    ("上装类型", "亮片吊带上衣"): "a fitted sequined camisole",
    ("上装类型", "挂脖比基尼上装"): "a halter bikini top",
    ("下装类型", "高开衩缎面长裙"): "a high-slit satin maxi skirt",
    ("下装类型", "系带比基尼泳裤"): "side-tie bikini bottoms",
    ("上装颜色", "珊瑚红"): "coral red",
    ("下装颜色", "珊瑚红"): "coral red",
    ("上装材质", "亮片面料"): "fine sequined fabric",
    ("上装材质", "泳装弹力面料"): "stretch swimwear fabric",
    ("下装材质", "泳装弹力面料"): "stretch swimwear fabric",
    ("服装配件", "浅粉色修身长袖内搭"): "a fitted pale-pink long-sleeve underlayer",
    ("画面瞬间", "夜间会所短暂停留"): "a brief pause in a nightclub",
    ("画面瞬间", "沙滩上短暂停留"): "a brief pause on the beach",
    ("画面瞬间", "瑜伽体式停留"): "holding a yoga pose",
    ("画面瞬间", "窗边安静独处"): "a quiet moment alone by the window",
    ("基础姿态", "单车侧坐"): "sitting sideways on a vintage bicycle saddle",
    ("基础姿态", "复古扶手椅坐姿"): "seated in an ornate vintage armchair",
    ("基础姿态", "沙滩侧卧"): "reclining sideways on a bright beach with the upper body slightly raised",
    ("基础姿态", "地面侧坐"): "seated sideways on the floor",
    ("基础姿态", "低位鸽子式"): "a low pigeon-pose variation on a yoga mat",
    ("基础姿态", "窗边座椅坐姿"): "seated sideways on a chair by the window",
    ("手部动作", "举白玫瑰并扶大腿"): "one hand holding white roses beside the face, the other resting on the thigh",
    ("手部动作", "双手放在脑后"): "both hands placed behind the head, elbows open",
    ("手部动作", "一手扶膝一手搭扶手"): "one hand on the knee and the other on the armrest",
    ("手部动作", "双手持刺绣团扇"): "holding an embroidered round fan with both hands",
    ("手部动作", "侧卧双手支撑"): "one forearm supporting the body and the other hand resting on the sand",
    ("手部动作", "双手交叠搭膝"): "forearms and hands crossed loosely over the raised knee",
    ("手部动作", "瑜伽手部支撑"): "one hand on the front thigh and the other relaxed near the hip",
    ("手部动作", "双手捧白色瓷杯"): "holding a white porcelain cup gently with both hands",
    ("腿部动作", "扶手椅曲腿伸展"): "one knee raised while the other leg extends downward",
    ("腿部动作", "侧卧屈伸腿"): "one leg extended and the other bent to create clear layering",
    ("腿部动作", "地面屈膝伸腿"): "one knee raised and the other leg extended along the floor",
    ("腿部动作", "鸽子式腿部伸展"): "front leg folded, rear leg extended straight back with the instep on the floor",
    ("场景地点", "公园草地"): "a sunlit park lawn",
    ("场景地点", "复古会所"): "a dimly lit vintage club interior",
    ("场景地点", "工业地下通道"): "an underground industrial passage",
    ("背景环境", "阳光公园草坪"): "a sunlit park lawn with softly blurred trees",
    ("背景环境", "复古会所雕花座椅"): "a dark ornate armchair and an East Asian decorative screen",
    ("背景环境", "工业通道铁丝网"): "chain-link fencing, concrete flooring, and a dark industrial passage",
    ("背景环境", "珊瑚粉薄荷绿渐变背景"): "a soft coral-pink and mint-green gradient backdrop",
    ("背景环境", "明亮落地窗客厅"): "a bright living room with a gray sofa, floor-to-ceiling windows, and indoor plants",
    ("背景环境", "旧式旅馆房间"): "an old hotel room with a window, bed, worn wooden furniture, and a warm table lamp",
    ("环境细节", "复古自行车与白玫瑰"): "a vintage bicycle, white roses, and a bright lawn",
    ("环境细节", "仙鹤屏风与深色家具"): "a crane-decorated screen and dark wooden furniture",
    ("主配色", "珊瑚粉与薄荷绿"): "coral pink and mint green",
    ("主配色", "银白与霓虹蓝紫"): "silver white with neon blue and violet",
    ("主配色", "奶油白与暖木色"): "cream white and warm wood tones",
    ("主配色", "浅灰与柔和肤色"): "light gray and soft skin tones",
}

_ENGLISH_VALUE_OVERRIDES.update({
    ("前景框景", "失焦嫩绿枫叶框景"): "large out-of-focus tender green maple leaves creating natural foreground framing",
    ("前景框景", "浅木色桌沿前景"): "a pale wooden table edge defining the lower foreground",
    ("前景框景", "灰色门框纵向框景"): "gray door panels and a doorframe creating vertical framing",
    ("前景框景", "深灰文件夹前景"): "a dark gray folder held upright in the foreground",
    ("前景框景", "虚化咖啡杯与桌角"): "a softly blurred coffee cup and table corner in the foreground",
    ("前景框景", "窗框留白框景"): "a window frame creating clean vertical framing and negative space",
    ("前景框景", "无明显前景"): "a clean unobstructed foreground",
    ("场景地点", "高亮庭院绿景"): "a bright green garden courtyard",
    ("场景地点", "林间纵深"): "a deep forest setting with receding tree trunks",
    ("场景地点", "窗外街景"): "a window-side setting overlooking a city street",
    ("场景地点", "奶油色客厅"): "an airy cream-toned living room",
    ("场景地点", "办公沙发与墙面"): "a modern office lounge with a sofa and clean walls",
    ("场景地点", "暖色酒店走廊"): "a warm modern hotel corridor",
    ("场景地点", "灰色门板与走廊"): "a corridor framed by gray wooden doors",
    ("场景地点", "高级灰渐变背景"): "a refined gray gradient studio",
    ("场景地点", "木质新中式空间"): "a restrained new-Chinese interior with warm wood",
    ("场景地点", "复古茶餐厅内景"): "a retro Hong Kong-style diner interior",
    ("场景地点", "都市玻璃建筑"): "a modern urban glass building",
    ("场景地点", "大堂玻璃反射"): "a glass-walled lobby with layered reflections",
    ("场景地点", "城市天际线"): "a rooftop overlooking the city skyline",
    ("场景地点", "白墙展厅"): "a white-walled contemporary gallery",
    ("场景地点", "鲜花陈列"): "a street-facing flower shop filled with floral displays",
    ("场景地点", "网球场围网"): "an outdoor tennis court beside a metal fence",
    ("场景地点", "健身房镜面"): "a bright mirrored fitness studio",
    ("场景地点", "校园教学楼"): "a campus academic building",
    ("场景地点", "密林暗影"): "a shadowed dense forest",
    ("场景地点", "沙漠沙丘"): "open desert dunes",
    ("场景地点", "湖面倒影"): "a quiet lakeside with natural reflections",
    ("场景地点", "高亮夏日树林庭院"): "a bright summer garden surrounded by dense foliage",
    ("场景地点", "暖木咖啡馆卡座"): "a warm wood cafe with a dark leather booth",
    ("场景地点", "临街咖啡馆窗景"): "a window seat in a street-facing cafe",
    ("场景地点", "暖色走廊灰色门板"): "a warm corridor framed by gray door panels",
    ("场景地点", "米杏沙发浅灰紫墙面"): "a simple office lounge with a beige sofa and pale gray-lilac wall",
    ("场景地点", "奶油色窗边室内"): "a cream-toned interior beside a softly lit window",
    ("场景地点", "现代办公休息区"): "a clean modern office lounge",
    ("场景地点", "玻璃幕墙都市夜景"): "a modern glass-walled interior overlooking city lights at night",
    ("场景地点", "当代美术馆白墙"): "a spacious contemporary gallery with white walls",
    ("场景地点", "婚纱礼服陈列厅"): "a bright elegant bridal gown showroom",
    ("场景地点", "火车站候车厅"): "a railway-station waiting hall",
    ("背景环境", "高亮夏日树林庭院"): "a bright softly blurred summer garden with dense green foliage",
    ("背景环境", "暖木咖啡馆卡座"): "warm wood walls, a dark leather booth, tables, and a softly blurred menu board",
    ("背景环境", "临街咖啡馆窗景"): "a street-facing cafe window with a softly blurred urban view",
    ("背景环境", "暖色走廊灰色门板"): "a warm corridor with pale walls, floor tiles, and textured gray door panels",
    ("背景环境", "米杏沙发浅灰紫墙面"): "a beige sofa, pale gray-lilac wall, and a softly blurred green plant",
    ("背景环境", "奶油色窗边室内"): "a cream-toned window interior with a pale tabletop and soft curtains",
    ("背景环境", "现代办公休息区"): "a tidy modern office lounge with a beige sofa, pale gray walls, and green plants",
    ("背景环境", "玻璃幕墙都市夜景"): "softly blurred glass walls and city lights at night",
    ("背景环境", "当代美术馆白墙"): "spacious white contemporary-gallery walls with a few large artworks",
    ("背景环境", "复古茶餐厅"): "retro booth seating, patterned wall tiles, and warm pendant lights",
    ("背景环境", "婚纱礼服陈列厅"): "a bright elegant bridal showroom with simple drapery and mirrors",
    ("背景环境", "火车站候车厅"): "station benches, a timetable display, and a platform entrance receding into the distance",
    ("环境细节", "铁丝网与工业地面"): "chain-link fencing and a textured industrial floor",
    ("环境细节", "美容反光板"): "a restrained beauty reflector near the frame edge",
    ("环境细节", "沙发落地窗与绿植"): "a pale gray sofa, floor-to-ceiling windows, and indoor plants",
    ("环境细节", "旧木家具与暖黄台灯"): "worn wooden furniture and a warm amber table lamp",
    ("环境细节", "漂浮气泡、水生植物、折射光纹"): (
        "environment details: floating bubbles, aquatic plants, and refracted light patterns"
    ),
    ("主配色", "浅灰与暖白"): "light gray and warm white",
    ("主配色", "珊瑚粉、薄荷绿与肤色"): "coral pink, mint green, and natural skin tones",
    ("主配色", "暖棕与暖黄"): "warm brown and amber",
    ("主配色", "香槟粉与深棕黑"): "champagne pink and deep brown-black",
    ("主配色", "冷蓝与暖黄"): "cool blue and warm amber",
})

_ENGLISH_VALUE_OVERRIDES.update({
    ("背景环境", "林间小径树干纵深"): "a forest path receding between tall tree trunks and layered foliage",
    ("背景环境", "奶油公寓客厅"): "an airy cream-toned apartment with a pale sofa and soft curtains",
    ("背景环境", "都市商业街"): "a modern shopping street with glass facades and softly blurred pedestrians",
    ("背景环境", "玻璃建筑大堂"): "a modern glass-walled lobby with stone flooring and layered reflections",
    ("背景环境", "酒店阳台开阔景观"): "a hotel balcony overlooking an open city or coastal view",
    ("背景环境", "城市天台天际线"): "a rooftop with layered building silhouettes and a distant city skyline",
    ("背景环境", "海边地平线"): "a sandy shore, open sea, and a clear horizon",
    ("背景环境", "独立书店书架"): "orderly wooden bookshelves filled with visible book spines",
    ("背景环境", "临街花店陈列"): "layered displays of flowers, green leaves, and wrapping paper in a street-facing flower shop",
    ("背景环境", "室外网球场"): "a green outdoor tennis court with crisp white lines and a distant metal fence",
    ("背景环境", "明亮健身训练室"): "a bright fitness studio with mirrors, training equipment, and pale flooring",
    ("背景环境", "高级灰摄影棚"): "a restrained gray studio with a smooth tonal gradient and minimal props",
    ("背景环境", "木质新中式室内"): "a restrained new-Chinese wood interior with a screen, table, and bamboo shadows",
    ("背景环境", "家庭烘焙厨房"): "a bright tidy home kitchen with a wooden worktop, oven, and a few baking tools",
    ("背景环境", "复古唱片店"): "a retro record store with wooden racks, album-cover displays, and warm wall lights",
    ("背景环境", "自然采光画室"): "a naturally lit art studio with an easel, canvases, and neatly arranged painting tools",
    ("背景环境", "周末市集摊位"): "an outdoor weekend market with awnings, flowers, and craft stalls receding along the street",
    ("背景环境", "彩色几何摄影棚"): "a studio built from clean colorful geometric planes with minimal props",
    ("背景环境", "花艺装置摄影棚"): "a floral installation studio with large branches and generous negative space",
    ("背景环境", "夜间便利店"): "bright convenience-store shelves, glass doors, and street lights at night",
    ("背景环境", "地下停车场"): "a cool gray underground parking garage with columns, ceiling lights, and receding bay lines",
    ("背景环境", "繁忙街道路口"): "an urban intersection with a crosswalk, traffic lights, and softly blurred pedestrians",
    ("背景环境", "城市人行天桥"): "a modern pedestrian overpass with railing lines and strong architectural perspective",
    ("背景环境", "春日花海"): "a broad field of spring flowers opening toward soft distant greenery",
    ("背景环境", "静谧湖畔"): "a calm lake, near-shore grass, and a distant tree line with natural reflections",
    ("背景环境", "开阔草原"): "open grassland beneath a broad sky and a low distant horizon",
    ("背景环境", "秋日枫林"): "layered red-orange maple foliage and a leaf-covered path",
    ("背景环境", "冬日雪林"): "a quiet snowy forest with pale ground and dark tree trunks",
    ("背景环境", "清幽竹林"): "a tranquil bamboo grove with vertical depth and a narrow stone path",
    ("背景环境", "海岸悬崖"): "a coastal cliff above rolling sea and open sky",
    ("背景环境", "沙漠旷野"): "rolling desert dunes with clear wind patterns and an open horizon",
    ("背景环境", "乡间小路"): "a country lane winding through fields and hedges into the distance",
    ("背景环境", "海岛小镇街巷"): "pale lanes and low buildings in an island town with the sea beyond",
    ("背景环境", "山间露营地"): "a restrained mountain campsite with grass, a simple tent, and layered ridgelines",
    ("背景环境", "葡萄园庄园"): "ordered vineyard rows, a pale manor building, and gently sloping terrain",
    ("背景环境", "拳击训练馆"): "a boxing gym with a ring, heavy bags, and dark training equipment",
    ("背景环境", "户外骑行道路"): "an open cycling road with continuous guardrails and distant natural scenery",
    ("背景环境", "室内羽毛球馆"): "a bright indoor badminton court with a visible net, boundary lines, and high roof structure",
    ("背景环境", "室内攀岩馆"): "a deep indoor climbing space with colorful holds and high wall structures",
    ("背景环境", "江南园林"): "a Jiangnan garden with white walls, dark roof tiles, winding corridors, and damp stone paths",
    ("背景环境", "敦煌壁画空间"): "an ochre interior inspired by Dunhuang murals with flying-apsara motifs and restrained gold details",
    ("背景环境", "明制中式庭院"): "an orderly Ming-style courtyard with timber doors, windows, and gray brick paving",
    ("背景环境", "传统书院"): "a traditional academy with wooden shelves, a long table, and courtyard light entering the room",
    ("背景环境", "七十年代客厅"): "a warm 1970s living room with wooden furniture, patterned textiles, and a vintage lamp",
    ("背景环境", "复古迪斯科舞厅"): "a retro disco with a mirror ball, colored light strips, and a dark dance floor",
    ("背景环境", "经典火车站月台"): "a classic railway platform with an old station sign and tracks receding into the distance",
    ("背景环境", "美式公路餐厅"): "an American roadside diner with red booths, metal-edged tables, and neon signage",
    ("背景环境", "月夜森林"): "a dark moonlit forest with thin mist and a few glowing plants",
    ("背景环境", "哥特古堡厅堂"): "a restrained Gothic castle hall with pointed arches, stone columns, and tall windows",
    ("背景环境", "未来赛博街区"): "a futuristic city district with neon signs, wet pavement, and high-rise buildings",
    ("背景环境", "蒸汽机械空间"): "a steampunk mechanical interior of copper pipes, gears, and pressure gauges",
    ("背景环境", "超现实梦境花园"): "a surreal garden of oversized flowers, pale mist, and a curving path",
    ("背景环境", "星云神殿"): "a fantasy temple with tall stone columns, a nebula sky, and faint luminous patterns",
    ("背景环境", "水下幻境"): "a clear underwater dreamscape with floating bubbles and gently moving aquatic plants",
    ("背景环境", "冰雪宫殿"): "a cool ice palace of translucent columns, crystal arches, and snow-covered ground",
    ("背景环境", "云海仙境"): "layered clouds, distant mountains, and faint pale classical architecture",
    ("背景环境", "花瓣风暴装置空间"): "a minimal studio transformed by a dynamic installation of suspended petals",
    ("背景环境", "温泉汤池"): "a steaming hot-spring pool against warm stone walls with soft ripples on the water",
    ("背景环境", "和风木造庭院"): "a Japanese timber courtyard with a dry garden, shoji doors, and translucent light",
    ("背景环境", "瀑布溪流"): "a waterfall and clear stream with misty spray and wet rock walls",
    ("背景环境", "剧院舞台"): "a dim theater stage with deep red curtains and a single overhead beam",
    ("背景环境", "海港码头"): "a pier extending into the sea with bollards and moored boats",
    ("背景环境", "天使羽翼殿堂"): "a pure white hall filled with soft luminous mist and descending light columns",
    ("背景环境", "少数民族集市"): "a richly colored folk market with hanging brocade and silver ornaments",
    ("背景环境", "昭和和风房间"): "a Showa-era Japanese room with shoji doors, a low table, and an old warm lamp",
    ("背景环境", "上海滩街景"): "a vintage Shanghai street with neon signs, shikumen buildings, and rickshaw silhouettes",
})

_ENGLISH_SCENE_DETAIL_LABEL_IDS = {
    option["label"]: option["id"]
    for option in _SCENE_LIBRARY["fields"]["scene.detail"]["options"]
}

_ENGLISH_SCENE_THEME_MAPS = {
    field_name: {} for field_name in SCENE_OUTPUT_FIELDS
}
for _theme_label, _theme_bundles in THEME_SCENE_BUNDLES_BY_THEME.items():
    for _bundle in _theme_bundles:
        for _field_name in SCENE_OUTPUT_FIELDS:
            _selected_value = _bundle.get(_field_name)
            if _selected_value not in (None, EMPTY_CHOICE):
                _ENGLISH_SCENE_THEME_MAPS[_field_name].setdefault(
                    _selected_value, _theme_label
                )

_ENGLISH_SCENE_BUNDLE_MAPS = {
    field_name: {} for field_name in SCENE_OUTPUT_FIELDS
}
for _bundle in SCENE_BUNDLES:
    _bundle_id = _bundle.get("id", "")
    if not re.fullmatch(r"[A-Za-z0-9_:-]+", _bundle_id):
        continue
    for _field_name in SCENE_OUTPUT_FIELDS:
        _selected_value = _bundle.get(_field_name)
        if _selected_value not in (None, EMPTY_CHOICE):
            _ENGLISH_SCENE_BUNDLE_MAPS[_field_name].setdefault(
                _selected_value, _bundle_id
            )

_ENGLISH_FIELD_PREFIXES = {
    "发色": ("color_",),
    "发色色调": ("undertone_",),
    "染色方式": ("dye_",),
    "头发长度": ("length_",),
    "发质与卷度": ("texture_",),
    "发型造型": ("style_",),
    "刘海": ("bangs_",),
    "头部配饰": ("headwear_",),
    "连衣裙类型": ("dress_",),
    "连体服类型": ("jumpsuit_",),
    "上装类型": ("top_",),
    "下装类型": ("bottom_",),
    "连衣裙颜色": ("color_",),
    "连体服颜色": ("color_",),
    "上装颜色": ("color_",),
    "下装颜色": ("color_",),
    "连衣裙材质": ("material_",),
    "连体服材质": ("material_",),
    "上装材质": ("material_",),
    "下装材质": ("material_",),
    "连衣裙图案": ("pattern_",),
    "连体服图案": ("pattern_",),
    "上装图案": ("pattern_",),
    "下装图案": ("pattern_",),
    "版型细节": ("fit_",),
    "袜装": ("legwear_",),
    "鞋履": ("shoes_",),
    "服装配件": ("accessory_",),
    "画面瞬间": ("event_",),
    "基础姿态": ("base_", "pose_"),
    "身体方向": ("body_direction_", "direction_"),
    "身体重心": ("weight_",),
    "肩颈状态": ("shoulders_",),
    "手部动作": ("hand_action_", "hands_", "hand_"),
    "腿部动作": ("leg_action_", "legs_", "leg_"),
    "头部方向": ("head_direction_", "head_"),
    "视线": ("gaze_",),
    "表情": ("expression_",),
    "场景地点": ("location_",),
    "时间切片": ("time_",),
    "天气状态": ("weather_",),
    "前景框景": ("foreground_",),
    "背景环境": ("background_",),
    "环境细节": ("detail_",),
    "空间材质": ("surface_",),
    "空间层次": ("spatial_",),
    "景别": ("shot_",),
    "画面布局": ("composition_",),
    "等效焦段": ("lens_",),
    "拍摄距离": ("distance_",),
    "机位": ("angle_",),
    "景深": ("depth_",),
    "对焦位置": ("focus_",),
    "主光来源": ("source_",),
    "光线方向": ("direction_",),
    "光线质地": ("quality_",),
    "照明落点": ("target_",),
    "阴影表现": ("shadow_",),
    "主配色": ("palette_",),
    "色温倾向": ("temperature_",),
    "画面对比": ("contrast_",),
    "影像风格": ("capture_",),
    "细节质地": ("texture_",),
    "高光处理": ("highlight_",),
    "颗粒质感": ("grain_",),
}

_ENGLISH_FIELD_TEMPLATES = {
    "脸型": "{value} face shape",
    "轮廓细节": "{value} facial contours",
    "眼型": "{value} eyes",
    "瞳色": "{value} irises",
    "眼睑特征": "{value} eyelids",
    "肤色": "{value} skin tone",
    "肤质": "{value} skin texture",
    "整体妆容预设": "{value} makeup",
    "底妆质感": "{value} base makeup",
    "眼影色系": "{value} eyeshadow",
    "眼线造型": "{value} eyeliner",
    "唇妆颜色": "{value} lip color",
    "唇面质感": "{value} lip finish",
    "基础身形": "{value} build",
    "身量观感": "{value} stature",
    "线条重点": "{value} body-line emphasis",
    "发色": "{value} hair",
    "发色色调": "{value} hair undertone",
    "染色方式": "{value} hair coloring",
    "头发长度": "{value} hair length",
    "发质与卷度": "{value} hair texture",
    "发型造型": "{value} hairstyle",
    "刘海": "{value} bangs",
    "头部配饰": "{value} hair accessory",
    "版型细节": "{value} fit details",
    "袜装": "{value}",
    "鞋履": "{value}",
    "服装配件": "{value}",
    "画面瞬间": "{value}",
    "基础姿态": "{value} pose",
    "身体方向": "body turned {value}",
    "身体重心": "weight {value}",
    "肩颈状态": "{value} shoulders and neck",
    "手部动作": "hands {value}",
    "腿部动作": "legs {value}",
    "头部方向": "head {value}",
    "视线": "gaze {value}",
    "表情": "{value} expression",
    "场景地点": "a {value} setting",
    "时间切片": "during {value}",
    "天气状态": "{value} conditions",
    "前景框景": "{value} in the foreground",
    "背景环境": "{value} in the background",
    "环境细节": "environment details: {value}",
    "空间材质": "{value} surfaces",
    "空间层次": "{value} spatial depth",
    "景别": "{value} framing",
    "画面布局": "with a {value} composition",
    "等效焦段": "shot at {value} full-frame-equivalent",
    "拍摄距离": "camera distance {value}",
    "机位": "from a {value} camera angle",
    "景深": "with {value} depth of field",
    "对焦位置": "focused on {value}",
    "主光来源": "lit by {value}",
    "光线方向": "with light coming from the {value}",
    "光线质地": "with {value} lighting",
    "照明落点": "illuminating {value}",
    "阴影表现": "with {value} shadows",
    "主配色": "with a {value} color palette",
    "色温倾向": "with a {value} color temperature",
    "画面对比": "with {value} contrast",
    "影像风格": "captured in a {value} style",
    "细节质地": "with {value} detail rendering",
    "高光处理": "with {value} highlights",
    "颗粒质感": "with {value} grain",
}

_ENGLISH_NATURAL_ID_PHRASES = {
    "肤质": {
        "real_texture": "realistic skin texture",
        "naturally_refined": "naturally refined skin texture",
        "soft_dewy": "soft, dewy skin texture",
        "soft_matte": "soft, matte skin texture",
    },
    "画面瞬间": {
        "adjust_hat": "caught while adjusting the hat",
        "answering_phone": "caught while answering a phone call",
        "blowing_bubbles": "caught while blowing soap bubbles",
        "cuddling_pet": "sharing a quiet moment with a small pet",
        "cycling_bike": "caught while riding a bicycle",
        "dance_spin": "caught mid-spin",
        "hair_toss": "caught in a natural hair toss",
        "holding_sword": "pausing with a sword in hand",
        "horseback_riding": "caught while riding horseback",
        "jumping": "caught mid-jump",
        "laugh_head_back": "laughing with the head tipped back",
        "lift_coffee": "lifting a coffee cup",
        "look_back_smile": "glancing back with a smile",
        "painting_canvas": "painting at a canvas",
        "pause_at_door": "pausing in a doorway",
        "pause_in_thought": "pausing in thought",
        "pause_on_balcony": "pausing on a balcony",
        "pause_under_branches": "pausing beneath leafy branches",
        "reading_book": "quietly reading a book",
        "rest_at_cafe": "resting at a cafe table",
        "rest_on_sofa": "resting comfortably on a sofa",
        "review_folder": "reviewing a folder",
        "shelter_under_umbrella": "sheltering beneath an umbrella",
        "studio_pose_reset": "a brief pause between studio poses",
        "tie_shoelace": "tying a shoelace",
        "touch_curtain": "pausing to touch a curtain",
        "turn_during_walk": "turning naturally mid-walk",
        "wait_by_wall": "waiting beside a wall",
        "wait_for_elevator": "waiting for an elevator",
    },
    "线条重点": {
        "shoulder_neck": "with a clean shoulder-and-neck line",
        "waistline": "with a naturally defined waistline",
        "soft_waist_hip": "with soft waist-and-hip curves",
        "long_legs": "with long, balanced leg lines",
        "strong_shoulder_back": "with a strong shoulder-and-back line",
    },
    "基础姿态": {
        "standing_relaxed": "standing naturally",
        "standing_three_quarter": "standing in a three-quarter pose",
        "standing_doorway": "standing in a doorway",
        "leaning_wall": "leaning lightly against a wall",
        "walking_pause": "pausing mid-step",
        "sitting_chair_edge": "sitting near the edge of a chair",
        "sitting_sofa_forward": "sitting forward on a sofa",
        "sitting_sofa_relaxed": "sitting comfortably on a sofa",
        "sitting_booth_relaxed": "sitting comfortably in a booth",
        "sitting_stool": "sitting on a stool",
        "crouching_sport": "holding a low athletic crouch",
        "squat": "squatting naturally",
        "kneel_sit": "sitting back on the heels",
        "cross_legged": "sitting cross-legged",
        "hand_on_hip": "standing with one hand on the hip",
        "standing_with_sword": "standing with a sword",
        "horseback_sitting": "sitting upright on horseback",
        "cycling_posture": "riding a bicycle",
    },
    "身体方向": {
        "front": "facing the camera",
        "left_quarter": "turned slightly to the left",
        "right_quarter": "turned slightly to the right",
        "left_profile": "shown in left profile",
        "right_profile": "shown in right profile",
        "back_turn_left": "turned away and looking back over the left shoulder",
        "back_turn_right": "turned away and looking back over the right shoulder",
        "diagonal_forward": "angled diagonally toward the camera",
        "three_quarter_back": "shown from a three-quarter back view",
    },
    "身体重心": {
        "balanced_both_feet": "with weight balanced across both feet",
        "left_leg": "with weight resting on the left leg",
        "right_leg": "with weight resting on the right leg",
        "forward": "with the body weight shifted slightly forward",
        "back": "with the body weight shifted slightly back",
        "left_hip": "with weight resting on the left hip",
        "right_hip": "with weight resting on the right hip",
        "centered_seated": "with the seated weight centered",
    },
    "肩颈状态": {
        "relaxed_level": "with relaxed, level shoulders",
        "relaxed_inward": "with the shoulders drawn gently inward",
        "one_shoulder_forward": "with one shoulder angled toward the camera",
        "one_shoulder_lower": "with one shoulder lowered naturally",
        "open_chest": "with an open chest and elongated neck",
        "forward_relaxed": "with the shoulders leaning forward naturally",
        "shrug": "with a subtle shoulder lift",
        "shoulders_back": "with the shoulders drawn back",
    },
    "手部动作": {
        "arms_relaxed_sides": "with both arms relaxed at the sides",
        "hands_folded_front": "with both hands folded naturally in front",
        "one_hand_waist": "with one hand resting on the waist",
        "one_hand_pocket": "with one hand tucked into a pocket",
        "adjust_collar": "gently adjusting the collar",
        "adjust_glasses": "gently adjusting the glasses",
        "glasses_and_folder": "adjusting the glasses while holding a folder",
        "touch_hair": "gently touching the hair",
        "hold_hat_brim": "lightly holding the brim of the hat",
        "bouquet_and_hat": "holding a bouquet while touching the hat brim",
        "hold_coffee_cup": "holding a coffee cup with both hands",
        "cup_and_table": "holding a cup with one hand and resting the other on the table",
        "hold_folder": "holding a folder close to the body",
        "pen_and_folder": "holding a pen and an upright folder",
        "door_handle_and_fan": "holding the door handle with one hand and a folding fan with the other",
        "hold_handbag": "holding a handbag naturally",
        "touch_railing": "resting one hand lightly on the railing",
        "touch_curtain": "gently touching the curtain",
        "hold_umbrella": "holding an umbrella naturally",
        "hands_on_thighs": "with both hands resting on the thighs",
        "elbow_on_knee": "with one elbow resting on a knee",
        "adjust_shoelace": "adjusting a shoelace with both hands",
        "arms_crossed": "with both arms crossed",
        "hand_on_chin": "resting the chin lightly on one hand",
        "peace_sign": "making a relaxed peace sign",
        "point_distance": "pointing toward the distance",
        "tuck_hair": "tucking a loose strand of hair behind one ear",
        "holding_book": "holding an open book",
        "holding_paintbrush": "holding a paintbrush near the canvas",
        "cradling_pet": "cradling a small pet gently",
        "holding_bubble_wand": "holding a bubble wand near the lips",
        "gripping_sword": "holding the sword securely",
        "holding_reins": "holding the reins with both hands",
        "gripping_handlebar": "holding the bicycle handlebars naturally",
        "phone_to_ear": "holding a phone to one ear",
    },
    "腿部动作": {
        "feet_parallel": "with both feet parallel",
        "one_foot_forward": "with one foot placed slightly forward",
        "ankles_crossed": "with the ankles crossed",
        "one_knee_bent": "with one knee bent",
        "raised_crossed_leg": "with one leg raised and crossed over the other",
        "walking_step": "with one leg moving through a natural walking step",
        "knees_together": "with the knees together",
        "knees_side": "with both knees angled to one side",
        "one_leg_extended": "with one leg extended",
        "legs_crossed_knee": "with the legs crossed at the knee",
        "stool_foot_rest": "with one foot resting on the stool support",
        "sport_crouch": "with both knees bent in an athletic crouch",
        "cross_legged_sit": "with the legs folded cross-legged",
        "one_leg_raised": "with one leg raised",
        "knee_up": "with one knee raised",
        "feet_in_stirrups": "with both feet placed in the stirrups",
        "pedaling": "with the legs positioned naturally on the pedals",
    },
    "头部方向": {
        "front": "head facing forward",
        "turn_left": "head turned to the left",
        "turn_right": "head turned to the right",
        "look_back_left": "head turned back over the left shoulder",
        "look_back_right": "head turned back over the right shoulder",
        "slight_tilt_left": "head tilted slightly to the left",
        "slight_tilt_right": "head tilted slightly to the right",
        "slight_lower": "chin lowered slightly",
        "head_tilt_up": "chin lifted slightly",
    },
    "视线": {
        "camera_direct": "looking directly into the camera",
        "camera_soft": "looking softly toward the camera",
        "left_near": "looking toward a nearby point on the left",
        "right_near": "looking toward a nearby point on the right",
        "left_distance": "looking into the distance on the left",
        "right_distance": "looking into the distance on the right",
        "down_prop": "looking down at the object in hand",
        "window": "looking out of the window",
        "slightly_above": "looking slightly above the camera",
        "side_camera": "glancing sideways toward the camera",
        "eyes_closed": "eyes gently closed",
        "look_up": "looking upward",
        "look_down": "looking downward",
    },
    "主光来源": {
        "beauty_dish": "lit by a beauty dish",
        "campfire": "lit by a campfire",
        "candlelight": "lit by candlelight",
        "car_headlight": "lit by car headlights",
        "ceiling_ambient": "lit by soft ambient ceiling light",
        "continuous_panel": "lit by a continuous LED panel",
        "direct_sun": "lit by direct sunlight",
        "hard_flash": "lit by hard on-camera flash",
        "large_softbox": "lit by a large softbox",
        "leaf_filtered_sun": "lit by sunlight filtered through leaves",
        "neon_signs": "lit by neon signage",
        "overcast_skylight": "lit by soft overcast skylight",
        "phone_screen": "lit by a phone screen",
        "projector": "lit by projected light",
        "reflected_bounce": "lit by reflected bounce light",
        "ring_fill": "lit by ring-light fill",
        "soft_flash": "lit by soft flash",
        "storefront_light": "lit by storefront light",
        "sunset_sun": "lit by warm sunset light",
        "tungsten_practical": "lit by tungsten practical lamps",
        "window_daylight": "lit by window daylight",
    },
    "光线质地": {
        "butterfly": "with classic butterfly lighting",
        "crisp_hard": "with crisp, hard lighting",
        "dappled": "with dappled lighting",
        "even_flat": "with soft, even lighting",
        "glowing_backlight": "with luminous backlighting",
        "low_key": "with low-key lighting",
        "mixed_color": "with mixed-color lighting",
        "rembrandt": "with Rembrandt lighting",
        "silhouette_backlight": "with silhouette backlighting",
        "soft_diffused": "with soft, diffused lighting",
        "soft_directional": "with soft directional lighting",
        "specular": "with specular lighting",
        "very_soft": "with very soft lighting",
    },
    "细节质地": {
        "atmospheric_haze": "with gently atmospheric haze",
        "ccd_direct": "with direct early-digital detail",
        "clean_crisp": "with clean, crisp detail",
        "delicate_retouch": "with delicate professional retouching",
        "documentary_real": "with realistic documentary detail",
        "dreamy_soft": "with dreamy soft detail",
        "film_softness": "with gentle film softness",
        "glossy_fashion": "with glossy fashion-editorial detail",
        "matte": "with a restrained matte finish",
        "matte_grain": "with matte, grain-rich detail",
        "natural_detail": "with natural detail",
        "oil_painting": "with oil-painting texture",
        "slightly_soft": "with slightly softened detail",
        "watercolor": "with watercolor texture",
    },
    "机位": {
        "eye_level": "at eye level",
        "chest_level": "from chest height",
        "waist_level": "from waist height",
        "slightly_high": "from a slightly elevated angle",
        "slightly_low": "from a slightly low angle",
        "high_angle": "from a high angle",
        "low_angle": "from a low angle",
        "ground_level": "from ground level",
        "overhead": "from directly overhead",
        "dutch_angle": "with a Dutch angle",
        "profile_view": "from a profile viewpoint",
        "three_quarter_view": "from a three-quarter viewpoint",
    },
    "对焦位置": {
        "both_eyes": "focused precisely on both eyes",
        "near_eye": "focused precisely on the nearer eye",
        "face": "focused on the face",
        "face_environment": "focused on the face while retaining environmental context",
        "full_figure": "focused on the full figure",
        "upper_body": "focused on the upper body",
        "hands_prop": "focused on the hands and prop",
        "garment_detail": "focused on garment details",
        "moving_subject": "tracking focus on the moving subject",
    },
    "表情": {
        "gentle_smile": "with a gentle smile",
        "sweet_smile": "with a sweet smile",
        "bright_smile": "with a bright smile",
        "relaxed_smile": "with a relaxed smile",
        "calm": "with a calm expression",
        "calm_confident": "with a calm, confident expression",
        "bright_confident": "with a bright, confident expression",
        "cool": "with a cool, composed expression",
        "focused": "with a focused expression",
        "thoughtful": "with a thoughtful expression",
        "restrained": "with a restrained expression",
        "soft_serious": "with a softly serious expression",
        "shy": "with a shy expression",
        "lazy": "with a languid expression",
        "surprised": "with a surprised expression",
        "playful_wink": "with a playful wink",
        "bright_laugh": "laughing brightly",
    },
}

_ENGLISH_FIT_PHRASES = {
    "fitted": "with a fitted silhouette",
    "relaxed": "with a relaxed drape",
    "defined_waist": "with a clearly defined waist",
    "high_waist": "with a high-waisted cut",
    "deep_v": "with a deep V neckline",
    "square_neck": "with a square neckline",
    "boat_neck": "with a boat neckline",
    "high_neck": "with a high neckline",
    "slit": "with a side slit",
    "pleated": "with structured pleats",
    "draped": "with natural draping",
    "layered": "with layered construction",
    "backless": "with an open back",
    "puff_sleeve": "with puff sleeves",
    "ruffle": "with ruffled trim",
    "tie_waist": "with a tied waist",
    "lantern_sleeve": "with lantern sleeves",
    "crop": "with a cropped cut",
    "strapless": "with a strapless neckline",
}


_ENGLISH_MODULE_ORDER = (
    "画面基础", "人物", "发型", "服装", "姿态动作", "场景", "摄影", "视觉表现",
)


def _humanize_english_id(field_name: str, option_id: str) -> str:
    value = option_id
    for prefix in _ENGLISH_FIELD_PREFIXES.get(field_name, ()):
        if value.startswith(prefix):
            value = value[len(prefix):]
            break
    value = value.replace("_plus_", " and ").replace("_and_", " and ")
    value = value.replace("_", " ")
    value = re.sub(r"\s+", " ", value).strip()
    exact_replacements = {
        "black white": "black-and-white",
        "t shirt": "T-shirt",
        "a line": "A-line",
        "east asian": "East Asian",
        "southeast asian": "Southeast Asian",
        "south asian": "South Asian",
        "central asian": "Central Asian",
        "west asian middle eastern": "West Asian or Middle Eastern",
        "latin american": "Latin American",
    }
    value = exact_replacements.get(value, value)
    for source, replacement in (
        ("full frame", "full-frame"),
        ("medium format", "medium-format"),
        ("close up", "close-up"),
        ("three quarter", "three-quarter"),
        ("dark brown black", "dark brown-black"),
        ("half up", "half-up"),
        ("soft rolloff", "soft roll-off"),
        ("center left", "center-left"),
        ("center right", "center-right"),
    ):
        value = value.replace(source, replacement)
    return value


def _english_option_id(field_name: str, value: str) -> str:
    return _ENGLISH_OPTION_ID_MAPS.get(field_name, {}).get(value, "")


def _english_atomic_value(field_name: str, value: str) -> str:
    if value in (None, EMPTY_CHOICE) or value in DEPENDENCY_PLACEHOLDER_VALUES.get(
        field_name, ()
    ):
        return ""
    override = _ENGLISH_VALUE_OVERRIDES.get((field_name, value))
    if override:
        if field_name == "主配色" and not override.endswith("color palette"):
            return f"with a {override} color palette"
        return override
    if field_name == "场景地点":
        background_override = _ENGLISH_VALUE_OVERRIDES.get(("背景环境", value))
        if background_override:
            return f"set in {background_override}"
    if field_name == "画面比例":
        width, height = ASPECT_RESOLUTIONS.get(value, (0, 0))
        ratio = value.split("竖构图", 1)[0].split("横构图", 1)[0].split("方形构图", 1)[0]
        orientation = "square" if width == height else ("landscape" if width > height else "portrait")
        return f"{ratio} {orientation} composition"
    if field_name == "写真主题" and value in _ENGLISH_THEME_OVERRIDES:
        return f"photorealistic {_ENGLISH_THEME_OVERRIDES[value]}"
    if field_name == "拍摄距离":
        return f"camera distance {str(value).removesuffix('米')} m"
    option_id = _english_option_id(field_name, value)
    if not option_id and field_name == "环境细节":
        detail_labels = re.split(r"[、，]", value)
        if detail_labels and all(
            label in _ENGLISH_SCENE_DETAIL_LABEL_IDS for label in detail_labels
        ):
            details = [
                _humanize_english_id(
                    field_name, _ENGLISH_SCENE_DETAIL_LABEL_IDS[label]
                )
                for label in detail_labels
            ]
            return f"environment details: {', '.join(details)}"
    if not option_id and field_name in SCENE_OUTPUT_FIELDS:
        theme_label = _ENGLISH_SCENE_THEME_MAPS[field_name].get(value, "")
        bundle_id = _ENGLISH_SCENE_BUNDLE_MAPS[field_name].get(value, "")
        if theme_label:
            theme_core = _ENGLISH_THEME_OVERRIDES.get(theme_label, "")
            if not theme_core:
                theme_id = _english_option_id("写真主题", theme_label)
                theme_core = _humanize_english_id("写真主题", theme_id)
            scene_fallbacks = {
                "场景地点": f"a setting designed for {theme_core}",
                "前景框景": f"foreground framing suited to {theme_core}",
                "背景环境": f"a softly detailed {theme_core} background",
                "环境细节": f"environment details consistent with {theme_core}",
            }
            if field_name in scene_fallbacks:
                return scene_fallbacks[field_name]
        if bundle_id:
            bundle_core = _humanize_english_id(field_name, bundle_id)
            bundle_fallbacks = {
                "场景地点": f"a {bundle_core} setting",
                "前景框景": f"{bundle_core} foreground framing",
                "背景环境": f"a {bundle_core} background",
                "环境细节": f"{bundle_core} environmental details",
            }
            if field_name in bundle_fallbacks:
                return bundle_fallbacks[field_name]
    if not option_id:
        return ""
    if field_name == "年龄阶段":
        return {
            "age_20s": "around 20 years old",
            "age_30s": "around 30 years old",
            "age_40s": "around 40 years old",
            "age_50s": "around 50 years old",
            "age_60s": "around 60 years old",
        }.get(option_id, _humanize_english_id(field_name, option_id))
    natural_phrase = _ENGLISH_NATURAL_ID_PHRASES.get(field_name, {}).get(option_id)
    if natural_phrase:
        return natural_phrase
    if field_name == "版型细节" and option_id in _ENGLISH_FIT_PHRASES:
        return _ENGLISH_FIT_PHRASES[option_id]
    humanized = _humanize_english_id(field_name, option_id)
    if field_name == "主配色":
        article = "an" if humanized[:1].lower() in "aeiou" else "a"
        return f"with {article} {humanized} color palette"
    if field_name == "成像媒介":
        return f"{humanized} photography"
    if field_name == "写真主题":
        return f"photorealistic {humanized} portrait photography"
    if field_name == "场景地点":
        article = "an" if humanized[:1].lower() in "aeiou" else "a"
        return f"{article} {humanized} setting"
    if field_name == "脸型" and humanized.endswith(" face"):
        return humanized
    if field_name == "头发长度":
        length_terms = {
            "chin": "chin-length hair",
            "collarbone": "collarbone-length hair",
            "shoulder": "shoulder-length hair",
            "chest": "chest-length hair",
            "waist": "waist-length hair",
        }
        return length_terms.get(humanized, f"{humanized} hair length")
    if field_name == "刘海":
        return humanized if humanized.endswith(("bangs", "fringe")) else f"{humanized} bangs"
    if field_name == "细节质地" and humanized.endswith(" detail"):
        return f"{humanized} rendering"
    if field_name == "颗粒质感" and humanized.endswith(("grain", "noise", "surface")):
        return f"with {humanized}"
    template = _ENGLISH_FIELD_TEMPLATES.get(field_name, "{value}")
    return template.format(value=humanized)


def _english_person_identity_text(fields: Mapping[str, str]) -> str:
    age = _english_atomic_value("年龄阶段", fields.get("年龄阶段", EMPTY_CHOICE))
    branch = fields.get("地域族裔分支", EMPTY_CHOICE)
    ethnicity_field = "地域族裔分支"
    if branch in (EMPTY_CHOICE, ETHNICITY_BRANCH_GENERIC):
        branch = fields.get("族裔大类", EMPTY_CHOICE)
        ethnicity_field = "族裔大类"
    ethnicity = _english_atomic_value(ethnicity_field, branch)
    if ethnicity:
        ethnicity = ethnicity.replace(" descent", "")
    if age and ethnicity:
        return f"an {ethnicity} woman {age}"
    if ethnicity:
        return f"an adult {ethnicity} woman"
    if age:
        return f"an adult woman {age}"
    return ""


def _join_english_list(items: Sequence[str]) -> str:
    cleaned = [item for item in items if item]
    if len(cleaned) < 2:
        return cleaned[0] if cleaned else ""
    if len(cleaned) == 2:
        return f"{cleaned[0]} and {cleaned[1]}"
    return f"{', '.join(cleaned[:-1])}, and {cleaned[-1]}"


def _english_garment_phrase(
    fields: Mapping[str, str],
    prefix: str,
    density: str,
) -> str:
    type_field = f"{prefix}类型"
    garment_type = _english_atomic_value(type_field, fields.get(type_field, EMPTY_CHOICE))
    if not garment_type:
        return ""
    garment_type = re.sub(r"^(?:a|an)\s+", "", garment_type, flags=re.IGNORECASE)

    color_field = f"{prefix}颜色"
    material_field = f"{prefix}材质"
    pattern_field = f"{prefix}图案"
    color = _english_atomic_value(color_field, fields.get(color_field, EMPTY_CHOICE))
    material = ""
    pattern = ""
    if density != "精简":
        material = _english_atomic_value(
            material_field, fields.get(material_field, EMPTY_CHOICE)
        )
        pattern = _english_atomic_value(
            pattern_field, fields.get(pattern_field, EMPTY_CHOICE)
        )
        if _english_option_id(
            pattern_field, fields.get(pattern_field, EMPTY_CHOICE)
        ) == "solid":
            pattern = ""

    plural_endings = (
        "jeans", "trousers", "pants", "shorts", "leggings", "bottoms", "culottes",
    )
    article = "" if garment_type.lower().endswith(plural_endings) else (
        "an" if garment_type[:1].lower() in "aeiou" else "a"
    )
    phrase = f"{article} {garment_type}".strip()
    fabric_description = " ".join(part for part in (color, material) if part)
    if fabric_description:
        phrase = f"{phrase} in {fabric_description}"
    if pattern:
        phrase = f"{phrase} with {pattern}"
    return phrase


_ENGLISH_LEGWEAR_PHRASES = {
    "black_sheer_tights": "black sheer tights",
    "dark_gray_sheer_tights": "dark-gray sheer tights",
    "black_thigh_high": "black thigh-high stockings",
    "lace_top_thigh_high": "lace-top thigh-high stockings",
    "cream_ankle_socks": "cream ankle socks",
    "ribbed_knee_socks": "ribbed knee-high socks",
    "sports_socks": "white sports socks",
    "lace_ankle_socks": "lace ankle socks",
    "fishnet": "fishnet tights",
    "thigh_high_socks": "thigh-high socks",
    "ankle_socks": "ankle socks",
    "black_sheer": "black sheer stockings",
}

_ENGLISH_SHOE_PHRASES = {
    "pointed_stiletto": "pointed-toe stiletto heels",
    "patent_pumps": "patent-leather pumps",
    "slingback_heels": "slingback heels",
    "block_heels": "block-heel pumps",
    "loafers": "leather loafers",
    "mary_jane": "Mary Jane shoes",
    "ankle_boots": "pointed-toe ankle boots",
    "knee_boots": "knee-high boots",
    "white_sneakers": "white sneakers",
    "retro_sneakers": "retro sneakers",
    "flat_sandals": "flat strappy sandals",
    "mules": "pointed-toe mules",
    "over_knee_boots": "over-the-knee boots",
    "canvas_sneakers": "canvas sneakers",
    "ballet_flats": "ballet flats",
    "martin_boots": "lace-up combat boots",
    "heeled_sandals": "heeled sandals",
}

_ENGLISH_ACCESSORY_PHRASES = {
    "pearl_studs": "pearl stud earrings",
    "pearl_drop": "pearl drop earrings",
    "metal_tassel": "metal tassel earrings",
    "gold_hoops": "gold hoop earrings",
    "geometric_earrings": "geometric earrings",
    "fine_necklace": "a fine necklace",
    "pearl_necklace": "a pearl necklace",
    "rectangle_glasses": "slim rectangular glasses",
    "round_glasses": "slim round glasses",
    "leather_belt": "a slim leather belt",
    "structured_handbag": "a structured handbag",
    "shoulder_bag": "a small shoulder bag",
    "silk_scarf": "a narrow silk scarf",
    "wristwatch": "a wristwatch",
    "sunglasses": "sunglasses",
    "hair_clip": "a hair clip",
    "choker": "a leather choker",
    "brooch": "a brooch",
    "bracelet": "a bracelet",
    "hair_band": "a headband",
    "shawl": "a shawl",
}


def _english_clothing_prompt_text(
    fields: Mapping[str, str],
    density: str,
) -> str:
    mode = fields.get("穿搭结构", EMPTY_CHOICE)
    garment_prefixes = {
        "连衣裙": ("连衣裙",),
        "连体服": ("连体服",),
        "上装＋下装": ("上装", "下装"),
        "西装套装": ("上装", "下装"),
        "叠穿造型": ("上装", "下装"),
    }.get(mode, ())
    garments = [
        _english_garment_phrase(fields, prefix, density)
        for prefix in garment_prefixes
    ]
    garments = [garment for garment in garments if garment]
    if not garments:
        return ""
    if len(garments) == 2:
        outfit = f"{garments[0]} paired with {garments[1]}"
    else:
        outfit = _join_english_list(garments)
    parts = [f"wearing {outfit}"]

    if density != "精简":
        fit = _english_atomic_value("版型细节", fields.get("版型细节", EMPTY_CHOICE))
        if fit:
            parts.append(fit)

        legwear_value = fields.get("袜装", EMPTY_CHOICE)
        legwear_id = _english_option_id("袜装", legwear_value)
        legwear = _ENGLISH_LEGWEAR_PHRASES.get(
            legwear_id, _english_atomic_value("袜装", legwear_value)
        )
        shoes_value = fields.get("鞋履", EMPTY_CHOICE)
        shoes_id = _english_option_id("鞋履", shoes_value)
        shoes = _ENGLISH_SHOE_PHRASES.get(
            shoes_id, _english_atomic_value("鞋履", shoes_value)
        )
        if legwear or shoes:
            parts.append(f"styled with {_join_english_list([legwear, shoes])}")

        accessory_value = fields.get("服装配件", EMPTY_CHOICE)
        accessory_id = _english_option_id("服装配件", accessory_value)
        accessory = _ENGLISH_ACCESSORY_PHRASES.get(
            accessory_id, _english_atomic_value("服装配件", accessory_value)
        )
        if accessory:
            parts.append(f"accessorized with {accessory}")

    return ", ".join(parts)


def _english_module_fields(module_name: str, fields: Mapping[str, str], density: str) -> tuple[str, ...]:
    if module_name == "画面基础":
        return ("画面比例", "成像媒介", "写真主题")
    if module_name == "人物":
        makeup_fields = ()
        if fields.get("妆容模式") == "整体预设":
            makeup_fields = ("整体妆容预设",)
        elif fields.get("妆容模式") == "分项自定义":
            makeup_fields = MAKEUP_CUSTOM_FIELDS
        detail_fields = (
            *PERSON_FACE_FIELDS, *PERSON_EYE_FIELDS, *PERSON_SKIN_FIELDS,
            *makeup_fields, *BODY_OUTPUT_FIELDS,
        )
        if density == "精简":
            return ("脸型", "眼型", "肤色", *makeup_fields[:1], "基础身形")
        return detail_fields
    if module_name == "发型":
        if density == "精简":
            return ("发色", "头发长度", "发型造型", "刘海")
        return HAIR_OUTPUT_FIELDS
    if module_name == "服装":
        active = tuple(CLOTHING_MODE_FIELDS.get(fields.get("穿搭结构"), ()))
        fields_to_render = (*active, "版型细节", "袜装", "鞋履", "服装配件")
        if density == "精简":
            fields_to_render = tuple(
                field_name for field_name in fields_to_render
                if field_name.endswith("类型") or field_name.endswith("颜色") or field_name in ("鞋履",)
            )
        return fields_to_render
    if module_name == "姿态动作":
        if density == "精简":
            return ("基础姿态", "手部动作", "视线", "表情")
        return POSE_OUTPUT_FIELDS
    if module_name == "场景":
        if density == "精简":
            return ("场景地点", "时间切片", "前景框景", "背景环境")
        if density == "标准":
            return ("场景地点", "时间切片", "天气状态", "前景框景", "背景环境", "环境细节")
        return SCENE_OUTPUT_FIELDS
    if module_name == "摄影":
        if density == "精简":
            return ("景别", "等效焦段", "机位", "对焦位置")
        if density == "标准":
            return tuple(field_name for field_name in CAMERA_OUTPUT_FIELDS if field_name != "拍摄距离")
        return CAMERA_OUTPUT_FIELDS
    if module_name == "视觉表现":
        if density == "精简":
            return ("主光来源", "光线方向", "光线质地", "主配色", "影像风格")
        return VISUAL_OUTPUT_FIELDS
    return ()


def render_english_module_fragment(
    module_name: str,
    fields: Mapping[str, str],
    density: str = "标准",
) -> str:
    """Render one built-in structured module as an English positive prompt."""

    if density not in PROMPT_DENSITIES:
        density = "标准"
    if module_name == "服装":
        clothing = _english_clothing_prompt_text(fields, density)
        return f"{clothing}." if clothing else ""
    parts = []
    if module_name == "人物":
        identity = _english_person_identity_text(fields)
        if identity:
            parts.append(identity)
    for field_name in _english_module_fields(module_name, fields, density):
        value = fields.get(field_name, EMPTY_CHOICE)
        rendered = _english_atomic_value(field_name, value)
        if rendered:
            parts.append(rendered)
    if not parts:
        return ""
    return f"{', '.join(parts)}."


def compose_english_prompt_text(
    fields: Mapping[str, str],
    density: str = "标准",
    excluded_modules: Iterable[str] = (),
) -> str:
    """Compose offline English from built-in fields only.

    Arbitrary Chinese free text and user TXT fragments are intentionally not
    machine-translated. A user fragment that replaces a module excludes that
    module from this English output instead of silently emitting stale fields.
    """

    excluded = set(excluded_modules)
    fragments = [
        render_english_module_fragment(module_name, fields, density).rstrip(". ")
        for module_name in _ENGLISH_MODULE_ORDER
        if module_name not in excluded
    ]
    body = ". ".join(fragment for fragment in fragments if fragment)
    return f"{body}." if body else ""


def join_english_prompt_text(first: str, second: str) -> str:
    """Join two English prompt fragments with stable sentence punctuation."""

    first_text = "" if first is None else str(first).strip()
    second_text = "" if second is None else str(second).strip()
    if not first_text:
        return second_text
    if not second_text:
        return first_text
    separator = " " if first_text.endswith((".", "!", "?", ";", ":", ",")) else ". "
    return f"{first_text}{separator}{second_text}"

def _normalize_user_module_fragment(value: str) -> str:
    """Trim only outer separators so imported Chinese prose joins cleanly."""

    if not isinstance(value, str):
        return ""
    return value.strip().strip("，；。,. ;\t\r\n")


def compose_prompt_text(
    fields: Mapping[str, str],
    density: str = "标准",
    user_person_fragment: str = "",
    user_pose_fragment: str = "",
    user_module_fragments: Mapping[str, str] | None = None,
) -> str:
    """Compose a positive prompt at the requested information density."""

    if density not in PROMPT_DENSITIES:
        density = "标准"

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
    person_core_text = user_person_text or f"{identity}，{person_detail_text}，{body_text}"
    pose_core_text = user_pose_text or _pose_prompt_text(fields, density)
    standard_pose_core_text = user_pose_text or f"人物{pose_core_text}"

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
            if field in base_output_fields and user_base_text:
                if not base_added:
                    parts.append(user_base_text)
                    base_added = True
                continue
            if field in IDENTITY_FIELDS:
                if not identity_added:
                    if user_person_text:
                        parts.append(user_person_text)
                    else:
                        identity_text = group_text_or_atomic_fallback(
                            identity, IDENTITY_FIELDS
                        )
                        if identity_text:
                            parts.append(identity_text)
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
                        parts.append(rendered)
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
                        parts.append(rendered)
                    body_added = True
                continue
            if field in POSE_OUTPUT_FIELDS:
                if not pose_added:
                    if user_pose_text:
                        parts.append(user_pose_text)
                    else:
                        rendered = group_text_or_atomic_fallback(
                            pose_core_text, POSE_OUTPUT_FIELDS
                        )
                        if rendered:
                            parts.append(rendered)
                    pose_added = True
                continue
            if field in SCENE_OUTPUT_FIELDS:
                if not scene_added:
                    scene_text = user_scene_text or _scene_prompt_text(fields, density)
                    rendered = group_text_or_atomic_fallback(
                        scene_text, SCENE_OUTPUT_FIELDS
                    )
                    if rendered:
                        parts.append(rendered)
                    scene_added = True
                continue
            if field in CAMERA_OUTPUT_FIELDS:
                if not camera_added:
                    camera_text = user_camera_text or _camera_prompt_text(fields, density)
                    rendered = group_text_or_atomic_fallback(
                        camera_text, CAMERA_OUTPUT_FIELDS
                    )
                    if rendered:
                        parts.append(rendered)
                    camera_added = True
                continue
            if field in VISUAL_OUTPUT_FIELDS:
                if not visual_added:
                    visual_text = user_visual_text or _visual_prompt_text(fields, density)
                    rendered = group_text_or_atomic_fallback(
                        visual_text, VISUAL_OUTPUT_FIELDS
                    )
                    if rendered:
                        parts.append(rendered)
                    visual_added = True
                continue
            if field in CLOTHING_OUTPUT_FIELDS:
                if not clothing_added:
                    clothing_text = user_clothing_text or _clothing_prompt_text(fields, density)
                    rendered = group_text_or_atomic_fallback(
                        clothing_text, CLOTHING_OUTPUT_FIELDS
                    )
                    if rendered:
                        parts.append(rendered)
                    clothing_added = True
                continue
            if field in HAIR_OUTPUT_FIELDS:
                if not hair_added:
                    hair_text = user_hair_text or _hair_prompt_text(fields, density)
                    rendered = group_text_or_atomic_fallback(
                        hair_text, HAIR_OUTPUT_FIELDS
                    )
                    if rendered:
                        parts.append(rendered)
                    hair_added = True
                continue
            if fields.get(field) != EMPTY_CHOICE:
                parts.append(formatter(field).rstrip("，；。 "))
        if user_custom_text:
            parts.append(user_custom_text)
        prompt_body = "；".join(part for part in parts if part)
        return f"{prompt_body}。" if prompt_body else ""

    if density == "精简":
        base_text = user_base_text or f"{brief('画面比例')}，{brief('成像媒介')}，{brief('写真主题')}"
        hair_text = user_hair_text or _hair_prompt_text(fields, density)
        clothing_text = user_clothing_text or _clothing_prompt_text(fields, density)
        scene_text = user_scene_text or _scene_prompt_text(fields, density)
        camera_text = user_camera_text or _camera_prompt_text(fields, density)
        visual_text = user_visual_text or _visual_prompt_text(fields, density)
        segments = [
            f"{base_text}；",
            f"{person_core_text}，{hair_text}，{clothing_text}；",
            f"{pose_core_text}；",
            f"{scene_text}；",
            f"{visual_text}；",
            f"{camera_text}。",
        ]
        if user_custom_text:
            segments.append(f"{user_custom_text}。")
        return "".join(segments)

    if density == "标准":
        base_text = user_base_text or f"{brief('画面比例')}，{brief('成像媒介')}，{brief('写真主题')}"
        hair_text = user_hair_text or _hair_prompt_text(fields, density)
        clothing_text = user_clothing_text or _clothing_prompt_text(fields, density)
        scene_text = user_scene_text or _scene_prompt_text(fields, density)
        camera_text = user_camera_text or _camera_prompt_text(fields, density)
        visual_text = user_visual_text or _visual_prompt_text(fields, density)
        segments = [
            f"{base_text}。{person_core_text}；",
            f"{hair_text}；{clothing_text}。",
            f"{standard_pose_core_text}。",
            f"{scene_text}。",
            f"{visual_text}。",
            f"{camera_text}。",
        ]
        if user_custom_text:
            segments.append(f"{user_custom_text}。")
        return "".join(segments)

    base_text = user_base_text or f"{full('画面比例')}，{full('成像媒介')}，{full('写真主题')}"
    hair_text = user_hair_text or _hair_prompt_text(fields, density)
    clothing_text = user_clothing_text or _clothing_prompt_text(fields, density)
    scene_text = user_scene_text or _scene_prompt_text(fields, density)
    camera_text = user_camera_text or _camera_prompt_text(fields, density)
    visual_text = user_visual_text or _visual_prompt_text(fields, density)
    segments = [
        f"{base_text}，{person_core_text}；",
        f"{hair_text}；{clothing_text}；",
        f"{standard_pose_core_text}；",
        f"{scene_text}；",
        f"{visual_text}；",
        f"{camera_text}。",
    ]
    if user_custom_text:
        segments.append(f"{user_custom_text}。")
    return "".join(segments)


def join_prompt_text(
    free_prompt: str,
    structured_prompt: str,
    position: str,
) -> str:
    """Join free text and structured text without rewriting either body."""

    free_text = "" if free_prompt is None else free_prompt
    structured_text = "" if structured_prompt is None else structured_prompt
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


def build_prompt_text(
    preset: str,
    random_scope: str,
    seed: int,
    requested: Mapping[str, str],
    density: str = "标准",
    free_prompt: str = "",
    join_position: str = "自由提示词在前",
    user_person_fragment: str = "",
    user_pose_fragment: str = "",
    user_module_fragments: Mapping[str, str] | None = None,
) -> str:
    """Resolve fields and compose one Chinese natural-language positive prompt."""

    fields = resolve_fields(preset, random_scope, seed, requested)
    structured_prompt = compose_prompt_text(
        fields,
        density,
        user_person_fragment,
        user_pose_fragment,
        user_module_fragments,
    )
    return join_prompt_text(free_prompt, structured_prompt, join_position)


class ZImageChinesePromptBuilder:
    """Build a structured Chinese positive prompt for adult portrait photography."""

    CATEGORY = "VividMuse/Z-Image"
    FUNCTION = "build_prompt"
    RETURN_TYPES = ("STRING", "INT", "INT", "STRING")
    RETURN_NAMES = ("中文提示词", "推荐宽度", "推荐高度", "英文提示词")
    OUTPUT_NODE = False
    DESCRIPTION = (
        "通过写真预设、下拉字段和确定性随机种子，生成中英文自然语言正向提示词。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "预设": (PRESET_OPTIONS,),
            "提示词密度": (
                PROMPT_DENSITIES,
                {
                    "default": "标准",
                    "tooltip": "精简压缩描述，标准保留主要摄影信息，详细保留全部字段细节。",
                },
            ),
            "随机范围": (
                RANDOM_SCOPES,
                {
                    "tooltip": "局部微调只动少量细节；同主题重拍保留主题和人物；跨风格混搭允许全部字段变化。",
                },
            ),
            "随机种子": (
                "INT",
                {
                    "default": 0,
                    "min": 0,
                    "max": MAX_SEED,
                    "control_after_generate": True,
                    "tooltip": "相同选项和相同种子会生成相同提示词。",
                },
            ),
        }
        for field_name in FIELD_ORDER:
            inputs[field_name] = (
                [FOLLOW_PRESET, RANDOM_CHOICE, EMPTY_CHOICE, *FIELD_OPTIONS[field_name]],
            )
        optional = {
            "自由提示词": (
                "STRING",
                {
                    "default": "",
                    "multiline": True,
                    "dynamicPrompts": False,
                    "tooltip": "输入自己编写的正向提示词；中英文输出都会原样保留，并按拼接位置组合。",
                },
            ),
            "拼接位置": (
                PROMPT_JOIN_POSITIONS,
                {
                    "default": "自由提示词在前",
                    "tooltip": "决定自由提示词与结构化模块的先后顺序。",
                },
            ),
            "用户人物片段": (
                "STRING",
                {
                    "default": "",
                    "multiline": True,
                    "dynamicPrompts": False,
                    "tooltip": "由TXT模块词库写入的用户人物描述。",
                },
            ),
            "用户姿态动作片段": (
                "STRING",
                {
                    "default": "",
                    "multiline": True,
                    "dynamicPrompts": False,
                    "tooltip": "由TXT模块词库写入的用户姿态动作描述。",
                },
            ),
            "用户画面基础片段": (
                "STRING",
                {"default": "", "multiline": True, "dynamicPrompts": False,
                 "tooltip": "由TXT模块词库写入的用户画面基础描述。"},
            ),
            "用户发型片段": (
                "STRING",
                {"default": "", "multiline": True, "dynamicPrompts": False,
                 "tooltip": "由TXT模块词库写入的用户发型描述。"},
            ),
            "用户服装片段": (
                "STRING",
                {"default": "", "multiline": True, "dynamicPrompts": False,
                 "tooltip": "由TXT模块词库写入的用户服装描述。"},
            ),
            "用户场景片段": (
                "STRING",
                {"default": "", "multiline": True, "dynamicPrompts": False,
                 "tooltip": "由TXT模块词库写入的用户场景描述。"},
            ),
            "用户摄影片段": (
                "STRING",
                {"default": "", "multiline": True, "dynamicPrompts": False,
                 "tooltip": "由TXT模块词库写入的用户摄影描述。"},
            ),
            "用户视觉表现片段": (
                "STRING",
                {"default": "", "multiline": True, "dynamicPrompts": False,
                 "tooltip": "由TXT模块词库写入的用户视觉表现描述。"},
            ),
            "用户自定义片段": (
                "STRING",
                {"default": "", "multiline": True, "dynamicPrompts": False,
                 "tooltip": "由TXT模块词库启用的独立自定义描述，拼接在八个标准模块之后。"},
            ),
        }
        return {"required": inputs, "optional": optional}

    def build_prompt(self, **kwargs):
        preset = kwargs.pop("预设", PRESET_OPTIONS[0])
        density = kwargs.pop("提示词密度", "标准")
        free_prompt = kwargs.pop("自由提示词", "")
        join_position = kwargs.pop("拼接位置", PROMPT_JOIN_POSITIONS[0])
        user_module_fragments = {
            module_name: kwargs.pop(input_name, "")
            for module_name, input_name in USER_MODULE_INPUTS.items()
        }
        random_scope = kwargs.pop("随机范围", RANDOM_SCOPES[0])
        seed = kwargs.pop("随机种子", 0)
        fields = resolve_fields(preset, random_scope, seed, kwargs)
        structured_prompt = compose_prompt_text(
            fields, density, user_module_fragments=user_module_fragments
        )
        prompt = join_prompt_text(free_prompt, structured_prompt, join_position)
        replaced_modules = {
            module_name
            for module_name, fragment in user_module_fragments.items()
            if str(fragment).strip()
        }
        english_structured_prompt = compose_english_prompt_text(
            fields, density, excluded_modules=replaced_modules
        )
        if join_position == "结构化模块在前":
            english_prompt = join_english_prompt_text(
                english_structured_prompt, free_prompt
            )
        else:
            english_prompt = join_english_prompt_text(
                free_prompt, english_structured_prompt
            )
        aspect = fields["画面比例"]
        if aspect not in ASPECT_RESOLUTIONS:
            aspect = _preset_values(preset)["画面比例"]
        width, height = ASPECT_RESOLUTIONS[aspect]
        return prompt, width, height, english_prompt


NODE_CLASS_MAPPINGS = {
    "VividMuse_ZImageChinesePromptBuilder": ZImageChinesePromptBuilder,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VividMuse_ZImageChinesePromptBuilder": "Z-Image 中文提示词生成器",
}
