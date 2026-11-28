"""Dropdown-driven Chinese portrait prompt builder for Z-Image."""

from __future__ import annotations

import logging
import random
import re
import sys
from pathlib import Path
from typing import Dict, Iterable, Mapping, Sequence

try:
    from .resolution import ASPECT_RESOLUTIONS, RESOLUTION_INPUTS, resolution_from_options
    from .framing import FRAMING_INPUT, FRAMING_MODES, framing_view
    from .prompt_diagnostics import SamplingTrace, execution_result, module_groups
    from .combination_coherence import (
        CoherencePass,
        INPUT as COHERENCE_INPUT,
        MODES as COHERENCE_MODES,
        explanation as coherence_explanation,
    )
    from .prompt_catalog import *  # noqa: F403
    from .prompt_resolver import *  # noqa: F403
    from .prompt_render_zh import *  # noqa: F403
    from .prompt_render_en import *  # noqa: F403
    from .prompt_resolver import set_resolver_core
    from .prompt_render_zh import set_zh_core
except ImportError:
    from resolution import ASPECT_RESOLUTIONS, RESOLUTION_INPUTS, resolution_from_options
    from framing import FRAMING_INPUT, FRAMING_MODES, framing_view
    from prompt_diagnostics import SamplingTrace, execution_result, module_groups
    from combination_coherence import (
        CoherencePass,
        INPUT as COHERENCE_INPUT,
        MODES as COHERENCE_MODES,
        explanation as coherence_explanation,
    )
    from prompt_catalog import *  # noqa: F403
    from prompt_resolver import *  # noqa: F403
    from prompt_render_zh import *  # noqa: F403
    from prompt_render_en import *  # noqa: F403
    from prompt_resolver import set_resolver_core
    from prompt_render_zh import set_zh_core

set_resolver_core(sys.modules[__name__])
set_zh_core(sys.modules[__name__])

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

    fields = sys.modules[__name__].resolve_fields(preset, random_scope, seed, requested)
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

    HAS_INTERMEDIATE_OUTPUT = True
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
                    "tooltip": "控制生成随机组合按钮启用的字段范围，并影响随机候选池。局部微调只动少量细节，同主题重拍保留主题和人物，跨风格混搭允许全部字段变化。运行只抽取已设为随机抽取的字段，不会自动启用其他字段。",
                },
            ),
            "随机种子": (
                "INT",
                {
                    "default": 0,
                    "min": 0,
                    "max": MAX_SEED,
                    "control_after_generate": True,
                    "tooltip": "相同选项和种子可复现。只有设为随机抽取的字段随种子变化；指定值、跟随预设和不使用保持固定。不同种子也可能抽到相同结果。",
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
        # Append to preserve positional widget values in existing workflows.
        optional["输出排版"] = (
            ["按模块分段", "连续拼接"],
            {"default": "按模块分段", "tooltip": "按模块分段用空行分隔各模块和自由提示词；连续拼接保留原有格式。"},
        )
        optional.update(RESOLUTION_INPUTS)
        optional["构图适配"] = FRAMING_INPUT
        optional["组合协调"] = COHERENCE_INPUT
        return {"required": inputs, "optional": optional, "hidden": {"unique_id": "UNIQUE_ID"}}

    def build_prompt(self, **kwargs):
        unique_id = kwargs.pop("unique_id", None)
        submitted = dict(kwargs)
        preset = kwargs.pop("预设", PRESET_OPTIONS[0])
        density = kwargs.pop("提示词密度", "标准")
        free_prompt = kwargs.pop("自由提示词", "")
        join_position = kwargs.pop("拼接位置", PROMPT_JOIN_POSITIONS[0])
        separate_modules = kwargs.pop("输出排版", "连续拼接") == "按模块分段"
        framing_mode = kwargs.pop("构图适配", FRAMING_MODES[0])
        coherence_mode = kwargs.pop("组合协调", COHERENCE_MODES[0])
        resolution_options = {name: kwargs.pop(name) for name in RESOLUTION_INPUTS if name in kwargs}
        user_module_fragments = {
            module_name: kwargs.pop(input_name, "")
            for module_name, input_name in USER_MODULE_INPUTS.items()
        }
        random_scope = kwargs.pop("随机范围", RANDOM_SCOPES[0])
        seed = kwargs.pop("随机种子", 0)
        request_trace = {}
        import sys
        sampling_trace = SamplingTrace(sys.modules[__name__]) if unique_id is not None else None
        replacements = {name for name, value in user_module_fragments.items()
                        if isinstance(value, str) and value.strip()}
        coordination = None
        if coherence_mode == COHERENCE_MODES[1]:
            try:
                from .prompt_diagnostics import module_groups
            except ImportError:
                from prompt_diagnostics import module_groups
            known = {f for name, fields in module_groups(sys.modules[__name__]).items()
                     if name not in replacements for f in fields}
            coordination = sys.modules[__name__].CoherencePass(known_fields=known, writable_fields=known,
                opaque_text=bool(str(free_prompt).strip() or replacements))
        fields = sys.modules[__name__].resolve_fields(preset, random_scope, seed, kwargs, request_trace=request_trace,
                                sampling_trace=sampling_trace, **({'coherence': coordination} if coordination is not None else {}))
        fields = pose_scene_view(fields, request_trace,
                                 scene_available=not replacements.intersection(("场景", "姿态动作")))

        def effective_view(resolved):
            view, report = framing_view(resolved, framing_mode, shot=resolved.get("景别"),
                                        replacements=replacements, camera_opaque="摄影" in replacements)
            if report["status"] == "opaque_camera":
                # No explicit framing survives the user camera replacement.
                # Avoid falling back to the preset's close-shot density rule.
                view["景别"] = EMPTY_CHOICE
            return view, report

        render_fields, framing_report = effective_view(fields)
        fragments = {} if unique_id is not None else None
        structured_prompt = compose_prompt_text(
            render_fields, density, user_module_fragments=user_module_fragments,
            separate_modules=separate_modules, module_fragments=fragments,
        )
        if separate_modules:
            first, second = (
                (structured_prompt, free_prompt) if join_position == "结构化模块在前"
                else (free_prompt, structured_prompt)
            )
            prompt = join_prompt_paragraphs(first, second)
        else:
            prompt = join_prompt_text(free_prompt, structured_prompt, join_position)
        english_join = join_prompt_paragraphs if separate_modules else join_english_prompt_text
        english_structured_prompt = ""
        english_fragments = {}
        for module_name in (*_ENGLISH_MODULE_ORDER, "自定义"):
            supplied = user_module_fragments.get(module_name, "")
            fragment = supplied if isinstance(supplied, str) and supplied.strip() else (
                render_english_module_fragment(module_name, render_fields, density)
                if module_name != "自定义" else ""
            )
            english_structured_prompt = english_join(english_structured_prompt, fragment)
            english_fragments[module_name] = fragment
        if join_position == "结构化模块在前":
            english_prompt = english_join(english_structured_prompt, free_prompt)
        else:
            english_prompt = english_join(free_prompt, english_structured_prompt)
        aspect = fields["画面比例"]
        if aspect not in ASPECT_RESOLUTIONS:
            aspect = _preset_values(preset)["画面比例"]
        width, height = resolution_from_options(aspect, resolution_options)
        result = (prompt, width, height, english_prompt)
        if unique_id is None:
            return result  # Preserve the direct Python API; ComfyUI supplies UNIQUE_ID.
        try:
            from .prompt_diagnostics import execution_result
        except ImportError:
            from prompt_diagnostics import execution_result

        def render_pair(resolved):
            resolved, _ = effective_view(resolved)
            zh = compose_prompt_text(resolved, density, user_module_fragments=user_module_fragments,
                                     separate_modules=separate_modules)
            en = ""
            for name in (*_ENGLISH_MODULE_ORDER, "自定义"):
                supplied = user_module_fragments.get(name, "")
                part = supplied if isinstance(supplied, str) and supplied.strip() else (
                    render_english_module_fragment(name, resolved, density) if name != "自定义" else "")
                en = english_join(en, part)
            return zh, en

        def render_module_pair(module_name, resolved):
            resolved, _ = effective_view(resolved)
            if module_name == "画面基础":
                zh = _base_prompt_text(resolved, density)
            elif module_name == "人物":
                zh = "，".join(part for part in (
                    _person_identity_text(resolved),
                    _person_detail_prompt_text(resolved, density),
                    _body_prompt_text(resolved, density),
                ) if part)
            elif module_name == "发型":
                zh = _hair_prompt_text(resolved, density)
            elif module_name == "服装":
                zh = _clothing_prompt_text(resolved, density)
            elif module_name == "姿态动作":
                zh = _pose_prompt_text(resolved, density)
                if density != "精简" and zh and not zh.startswith("人物"):
                    zh = f"人物{zh}"
            elif module_name == "场景":
                zh = _scene_prompt_text(resolved, density)
            elif module_name == "摄影":
                zh = _camera_prompt_text(resolved, density)
            elif module_name == "视觉表现":
                zh = _visual_prompt_text(resolved, density)
            else:
                zh = ""
            if not zh and module_name != "自定义":
                zh = module_atomic_fallback(module_name, resolved, density)
            return zh, render_english_module_fragment(module_name, resolved, density)

        # Passing the module object avoids duplicate imports and circular dependencies.
        return execution_result(result, core=sys.modules[__name__], scope="全部模块", seed=seed,
                                settings=submitted, fields=fields, fragments=fragments,
                                english_fragments=english_fragments, render_pair=render_pair,
                                render_module_pair=render_module_pair if separate_modules else None,
                                replacements=user_module_fragments, request_trace=request_trace,
                                framing=framing_report, sampling_trace=sampling_trace,
                                coherence=(coherence_explanation(coherence_mode, coordination, "全部模块")
                                           if "组合协调" in submitted else None))


NODE_CLASS_MAPPINGS = {
    "VividMuse_ZImageChinesePromptBuilder": ZImageChinesePromptBuilder,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VividMuse_ZImageChinesePromptBuilder": "Z-Image 中文提示词生成器",
}

try:
    from .reference_pool import ReferencePool
except ImportError:
    from reference_pool import ReferencePool

REFERENCE_POOL = ReferencePool(globals())

# Manual-only additions are registered after all legacy options and random pools.
# Keep their source of truth here: never add them to pose bundles or fallback pools.
MANUAL_HAND_ACTIONS = (
    {
        "id": "touch_foldover_collar", "label": "一手轻扶翻领",
        "text": "一只手轻扶衣服向外翻折的领片，另一只手自然垂落",
        "english": "one hand lightly touching the folded-over collar of the garment, the other arm resting naturally at the side",
        "english_label": "Hand lightly touching a fold-over collar",
    },
    {
        "id": "touch_neckline_edge", "label": "一手轻扶领口边缘",
        "text": "一只手轻扶衣服领口的布料边缘，另一只手自然垂落",
        "english": "one hand lightly touching the fabric edge of the neckline, the other arm resting naturally at the side",
        "english_label": "Hand lightly touching the neckline edge",
    },
)
for _manual_action in MANUAL_HAND_ACTIONS:
    _manual_label = _manual_action["label"]
    if (_manual_label in FIELD_OPTIONS["手部动作"]
            or _manual_action["id"] in _ENGLISH_OPTION_ID_MAPS["手部动作"].values()):
        raise ValueError(f"Duplicate manual hand action: {_manual_label}")
    FIELD_OPTIONS["手部动作"].append(_manual_label)
    for _manual_table in (FIELD_TEXT, POSE_FIELD_TEXT, POSE_VALUE_TEXT):
        _manual_table["手部动作"][_manual_label] = _manual_action["text"]
    _ENGLISH_OPTION_ID_MAPS["手部动作"][_manual_label] = _manual_action["id"]
    _ENGLISH_NATURAL_ID_PHRASES["手部动作"][_manual_action["id"]] = _manual_action["english"]
    _ENGLISH_VALUE_OVERRIDES["手部动作", _manual_label] = _manual_action["english"]
