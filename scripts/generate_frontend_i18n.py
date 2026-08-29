"""Generate the browser-side English display catalog from the Python data.

The node keeps Chinese identifiers and combo values for workflow compatibility.
This script only generates display labels consumed by ``web/js/i18n.js``.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "web" / "js" / "i18n_catalog.js"
sys.path.insert(0, str(ROOT))

import modular_nodes  # noqa: E402
import nodes  # noqa: E402


FIELD_LABELS_EN = {
    "画面比例": "Aspect Ratio",
    "成像媒介": "Capture Medium",
    "写真大类": "Photography Category",
    "写真主题": "Photography Theme",
    "年龄阶段": "Age Range",
    "族裔大类": "Ethnicity Group",
    "地域族裔分支": "Regional Appearance",
    "脸型": "Face Shape",
    "轮廓细节": "Facial Contours",
    "眼型": "Eye Shape",
    "瞳色": "Eye Color",
    "眼睑特征": "Eyelids",
    "肤色": "Skin Tone",
    "肤质": "Skin Texture",
    "妆容模式": "Makeup Mode",
    "整体妆容预设": "Makeup Preset",
    "底妆质感": "Base Makeup",
    "眼影色系": "Eyeshadow",
    "眼线造型": "Eyeliner",
    "唇妆颜色": "Lip Color",
    "唇面质感": "Lip Finish",
    "基础身形": "Body Build",
    "身量观感": "Stature",
    "线条重点": "Body-line Emphasis",
    "发色模式": "Hair Color Mode",
    "发色": "Hair Color",
    "发色色调": "Hair Undertone",
    "染色方式": "Coloring Technique",
    "头发长度": "Hair Length",
    "发质与卷度": "Hair Texture & Curl",
    "发型造型": "Hairstyle",
    "刘海": "Bangs",
    "头部配饰": "Headwear & Hair Accessories",
    "穿搭结构": "Outfit Structure",
    "连衣裙类型": "Dress Type",
    "连衣裙颜色": "Dress Color",
    "连衣裙材质": "Dress Material",
    "连衣裙图案": "Dress Pattern",
    "连体服类型": "Jumpsuit Type",
    "连体服颜色": "Jumpsuit Color",
    "连体服材质": "Jumpsuit Material",
    "连体服图案": "Jumpsuit Pattern",
    "上装类型": "Top Type",
    "上装颜色": "Top Color",
    "上装材质": "Top Material",
    "上装图案": "Top Pattern",
    "下装类型": "Bottom Type",
    "下装颜色": "Bottom Color",
    "下装材质": "Bottom Material",
    "下装图案": "Bottom Pattern",
    "版型细节": "Fit Details",
    "袜装": "Legwear",
    "鞋履": "Footwear",
    "服装配件": "Accessories",
    "画面瞬间": "Captured Moment",
    "基础姿态": "Base Pose",
    "身体方向": "Body Orientation",
    "身体重心": "Weight Distribution",
    "肩颈状态": "Shoulders & Neck",
    "手部动作": "Hand & Arm Action",
    "腿部动作": "Leg Action",
    "头部方向": "Head Direction",
    "视线": "Gaze",
    "表情": "Expression",
    "场景大类": "Scene Category",
    "场景地点": "Location",
    "时间切片": "Time of Day",
    "天气状态": "Weather",
    "前景框景": "Foreground Framing",
    "背景环境": "Background",
    "环境细节": "Environmental Details",
    "空间材质": "Surface Materials",
    "空间层次": "Spatial Depth",
    "主光来源": "Key Light Source",
    "光线方向": "Light Direction",
    "光线质地": "Light Quality",
    "照明落点": "Light Placement",
    "阴影表现": "Shadow Rendering",
    "主配色": "Color Palette",
    "色温倾向": "Color Temperature",
    "画面对比": "Contrast",
    "景别": "Shot Size",
    "画面布局": "Composition",
    "等效焦段": "Equivalent Focal Length",
    "拍摄距离": "Camera Distance",
    "机位": "Camera Angle",
    "景深": "Depth of Field",
    "对焦位置": "Focus Point",
    "影像风格": "Image Style",
    "细节质地": "Detail Rendering",
    "高光处理": "Highlight Handling",
    "颗粒质感": "Grain",
}


NODE_TITLES_EN = {
    "VividMuse_ZImageChinesePromptBuilder": "Z-Image Prompt Builder",
    "VividMuse_ZImageCanvasModule": "Z-Image Canvas",
    "VividMuse_ZImagePersonModule": "Z-Image Person",
    "VividMuse_ZImageHairModule": "Z-Image Hair",
    "VividMuse_ZImageClothingModule": "Z-Image Clothing",
    "VividMuse_ZImagePoseModule": "Z-Image Pose & Action",
    "VividMuse_ZImageSceneModule": "Z-Image Scene",
    "VividMuse_ZImageCameraModule": "Z-Image Photography",
    "VividMuse_ZImageVisualModule": "Z-Image Visual Style",
    "VividMuse_ZImageTxtPromptLibrary": "Z-Image TXT Prompt Library",
    "VividMuse_ZImageTxtModuleLibrary": "Z-Image TXT Module Library",
}


NODE_DESCRIPTIONS_EN = {
    "VividMuse_ZImageChinesePromptBuilder": (
        "Build deterministic Chinese and English natural-language positive prompts "
        "from presets, structured fields, and a random seed."
    ),
    "VividMuse_ZImageCanvasModule": (
        "Build the bilingual canvas module and output recommended dimensions."
    ),
    "VividMuse_ZImagePersonModule": (
        "Build age, ethnicity, face, skin, makeup, and body descriptions."
    ),
    "VividMuse_ZImageHairModule": (
        "Build hair color, length, texture, style, bangs, and accessory descriptions."
    ),
    "VividMuse_ZImageClothingModule": (
        "Build garment structure, color, material, pattern, legwear, footwear, and accessories."
    ),
    "VividMuse_ZImagePoseModule": (
        "Build body orientation, weight, hand and leg action, gaze, and expression descriptions."
    ),
    "VividMuse_ZImageSceneModule": (
        "Build location, time, weather, foreground, background, and spatial-depth descriptions."
    ),
    "VividMuse_ZImageCameraModule": (
        "Build shot size, composition, focal length, distance, angle, depth of field, and focus."
    ),
    "VividMuse_ZImageVisualModule": (
        "Build lighting, palette, contrast, image style, texture, highlights, and grain."
    ),
    "VividMuse_ZImageTxtPromptLibrary": (
        "Import and select complete TXT prompts for use in a modular text chain."
    ),
    "VividMuse_ZImageTxtModuleLibrary": (
        "Import and select one structured TXT module fragment for a modular text chain."
    ),
}


MODULE_LABELS_EN = {
    "画面基础": "Canvas",
    "人物": "Person",
    "发型": "Hair",
    "服装": "Clothing",
    "姿态动作": "Pose & Action",
    "场景": "Scene",
    "摄影": "Photography",
    "视觉表现": "Visual Style",
    "自定义": "Custom",
}


WIDGET_LABELS_EN = {
    **FIELD_LABELS_EN,
    "预设": "Preset",
    "提示词密度": "Prompt Density",
    "随机范围": "Randomization Scope",
    "随机种子": "Random Seed",
    "control after generate": "Control After Generate",
    "control_after_generate": "Control After Generate",
    "当前编辑模块": "Module to Edit",
    "自由提示词": "Free Prompt",
    "拼接位置": "Join Position",
    "前置提示词": "Previous Prompt",
    "前置英文提示词": "Previous English Prompt",
    "模块类型": "Module Type",
    "模块提示词": "Module Prompt",
    "词库条目": "Library Entry",
    "词库加入方式": "Insert Mode",
    "词库模块": "Library Module",
    "模块词库条目": "Module Library Entry",
    "用户画面基础片段": "User Canvas Fragment",
    "用户人物片段": "User Person Fragment",
    "用户发型片段": "User Hair Fragment",
    "用户服装片段": "User Clothing Fragment",
    "用户姿态动作片段": "User Pose & Action Fragment",
    "用户场景片段": "User Scene Fragment",
    "用户摄影片段": "User Photography Fragment",
    "用户视觉表现片段": "User Visual Style Fragment",
    "用户自定义片段": "User Custom Fragment",
}


OUTPUT_LABELS_EN = {
    "中文提示词": "Chinese Prompt",
    "组合提示词": "Combined Prompt",
    "推荐宽度": "Recommended Width",
    "推荐高度": "Recommended Height",
    "英文提示词": "English Prompt",
}


UI_LABELS_EN = {
    "仅启用当前模块": "Enable Only This Module",
    "🎲 生成随机组合": "🎲 Generate Random Combination",
    "清空结构化模块": "Clear Structured Modules",
    "全部清空": "Clear Everything",
    "🎲 生成本模块随机组合": "🎲 Randomize This Module",
    "全部跟随模块预设": "Follow Module Preset for All",
    "清空本模块": "Clear This Module",
    "📚 TXT用户词库": "📚 TXT Prompt Library",
    "导入TXT词库": "Import TXT Library",
    "添加到自由提示词": "Add to Free Prompt",
    "清空自由提示词": "Clear Free Prompt",
    "清除已导入词库": "Remove Imported Library",
    "🧩 TXT模块词库（全模块）": "🧩 TXT Module Library (All Modules)",
    "导入结构化模块TXT词库": "Import Structured TXT Library",
    "清空当前用户模块": "Clear Current User Module",
    "清除模块词库": "Remove Module Library",
}


TOOLTIPS_EN = {
    "预设": "Provides compatible preset values and randomization pools.",
    "提示词密度": "Concise keeps essentials, Standard keeps primary photography details, and Detailed keeps all fields.",
    "随机范围": "Fine Tune changes a few details; Same Theme Reshoot keeps theme and person; Cross-style Mix can change every field.",
    "随机种子": "The same selections and seed produce the same prompt.",
    "自由提示词": "Write your own positive prompt and join it with any structured modules.",
    "拼接位置": "Controls the order of the free/current prompt and the connected structured text.",
    "前置提示词": "Connect the previous Chinese module output to continue the prompt chain.",
    "前置英文提示词": "Connect the previous English module output to continue the English chain.",
    "模块类型": "Declares which structured module this TXT fragment represents.",
    "模块提示词": "Filled by the TXT module library or edited manually.",
}
for _module_name, _input_name in nodes.USER_MODULE_INPUTS.items():
    _module_label = MODULE_LABELS_EN[_module_name]
    if _module_name == "自定义":
        TOOLTIPS_EN[_input_name] = (
            "Filled by the TXT module library; adds an independent Custom fragment "
            "after the eight standard modules."
        )
    else:
        TOOLTIPS_EN[_input_name] = (
            f"Filled by the TXT module library; replaces the built-in {_module_label} "
            "module when non-empty."
        )


PRESET_LABELS_EN = {
    "日系草地单车夏日柔光写真": "Japanese Summer Bicycle Soft-light Portrait",
    "日系咖啡馆暖调近景人像": "Warm Japanese Cafe Close Portrait",
    "夜间室内轻奢硬闪时尚写真": "Night Luxury Direct-flash Fashion Portrait",
    "都市职场轻奢坐姿写真": "Urban Office Luxury Seated Portrait",
    "古风汉服园林柔光写真": "Hanfu Garden Soft-light Portrait",
    "海边夏日泳装写真": "Summer Beach Swimwear Portrait",
    "赛博都市夜景写真": "Cyberpunk City Night Portrait",
    "影棚水光妆美容特写": "Studio Dewy Makeup Beauty Close-up",
    "落地窗瑜伽塑形写真": "Window-light Yoga Fitness Portrait",
    "旅馆窗边电影静帧": "Hotel Window Cinematic Still",
    "自定义组合": "Custom Combination",
}


OPTION_OVERRIDES = {
    "写真大类": {
        "日常生活": "Daily Life",
        "时尚编辑": "Fashion Editorial",
        "商业广告": "Commercial Advertising",
        "美妆美容": "Beauty",
        "都市叙事": "Urban Narrative",
        "自然户外": "Nature & Outdoors",
        "旅行度假": "Travel & Vacation",
        "运动健康": "Sports & Wellness",
        "中式美学": "Chinese Aesthetics",
        "复古年代": "Period & Retro",
        "电影叙事": "Cinematic Narrative",
        "幻想概念": "Fantasy Concept",
    },
    "地域族裔分支": {"大类通用外观": "General Group Appearance"},
    "妆容模式": {
        "整体预设": "Complete Preset",
        "分项自定义": "Customize Individual Features",
    },
    "发色模式": {
        "基础发色": "Basic Hair Color",
        "进阶染发": "Advanced Hair Coloring",
    },
    "场景大类": {
        "居住空间": "Residential",
        "餐饮与酒店": "Dining & Hospitality",
        "商业零售": "Retail",
        "文化艺术": "Culture & Arts",
        "办公工作": "Office & Work",
        "交通空间": "Transportation",
        "运动康体": "Sports & Wellness",
        "东方传统": "East Asian Traditional",
        "工业功能": "Industrial & Functional",
        "专业特色": "Specialized Locations",
        "自然户外": "Nature & Outdoors",
        "都市户外": "Urban Outdoors",
    },
}


CONTROL_OPTIONS_EN = {
    "预设": PRESET_LABELS_EN,
    "提示词密度": {
        "精简": "Concise",
        "标准": "Standard",
        "详细": "Detailed",
    },
    "随机范围": {
        "局部微调（动作、表情、色彩、质感）": "Fine Tune (pose, expression, color, texture)",
        "同主题重拍（保留主题和人物）": "Same Theme Reshoot (keep theme and person)",
        "跨风格混搭（全部字段）": "Cross-style Mix (all fields)",
    },
    "拼接位置": {
        "自由提示词在前": "Free Prompt First",
        "结构化模块在前": "Structured Modules First",
        "前置提示词在前": "Previous Prompt First",
        "当前节点内容在前": "Current Node First",
    },
    "当前编辑模块": MODULE_LABELS_EN,
    "模块类型": MODULE_LABELS_EN,
    "词库模块": MODULE_LABELS_EN,
    "词库加入方式": {
        "添加到后面": "Append",
        "添加到前面": "Prepend",
        "替换自由提示词": "Replace Free Prompt",
    },
    "control after generate": {
        "fixed": "Fixed",
        "increment": "Increment",
        "decrement": "Decrement",
        "randomize": "Randomize",
    },
    "control_after_generate": {
        "fixed": "Fixed",
        "increment": "Increment",
        "decrement": "Decrement",
        "randomize": "Randomize",
    },
}


def _option_catalog() -> dict[str, dict[str, str]]:
    catalog: dict[str, dict[str, str]] = {}
    special = {
        nodes.FOLLOW_PRESET: "Follow Preset",
        nodes.RANDOM_CHOICE: "Random",
        nodes.EMPTY_CHOICE: "None",
    }
    for field_name in nodes.FIELD_ORDER:
        translations = dict(special)
        for value in nodes.FIELD_OPTIONS[field_name]:
            rendered = nodes._english_atomic_value(field_name, value)
            rendered = OPTION_OVERRIDES.get(field_name, {}).get(value, rendered)
            if not rendered:
                raise RuntimeError(f"Missing frontend translation: {field_name} -> {value}")
            translations[value] = rendered[:1].upper() + rendered[1:]
        catalog[field_name] = translations
    catalog.update(CONTROL_OPTIONS_EN)
    catalog["词库条目"] = {"请先导入TXT词库": "Import a TXT library first"}
    catalog["模块词库条目"] = {
        "当前模块没有词库条目": "No entries for the current module"
    }
    return catalog


def main() -> None:
    if set(FIELD_LABELS_EN) != set(nodes.FIELD_ORDER):
        missing = sorted(set(nodes.FIELD_ORDER) - set(FIELD_LABELS_EN))
        extra = sorted(set(FIELD_LABELS_EN) - set(nodes.FIELD_ORDER))
        raise RuntimeError(f"Field label mismatch; missing={missing}, extra={extra}")
    if set(NODE_TITLES_EN) != set(nodes.NODE_CLASS_MAPPINGS) | set(
        modular_nodes.NODE_CLASS_MAPPINGS
    ):
        raise RuntimeError("Node title catalog does not cover every public node.")

    payload = {
        "nodeTitles": NODE_TITLES_EN,
        "nodeDescriptions": NODE_DESCRIPTIONS_EN,
        "widgetLabels": WIDGET_LABELS_EN,
        "outputLabels": OUTPUT_LABELS_EN,
        "uiLabels": UI_LABELS_EN,
        "tooltips": TOOLTIPS_EN,
        "moduleLabels": MODULE_LABELS_EN,
        "optionLabels": _option_catalog(),
        "categoryLabels": {
            "VividMuse/Z-Image": "VividMuse/Z-Image",
            "VividMuse/Z-Image/模块": "VividMuse/Z-Image/Modules",
            "VividMuse/Z-Image/TXT词库": "VividMuse/Z-Image/TXT Libraries",
        },
    }
    encoded = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    OUTPUT.write_text(
        "// Generated by scripts/generate_frontend_i18n.py; do not edit manually.\n"
        f"export const EN_CATALOG = {encoded};\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
