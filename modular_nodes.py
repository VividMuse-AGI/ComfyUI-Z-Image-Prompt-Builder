"""Chainable module and TXT nodes for the Z-Image prompt builder.

The original all-in-one node remains the preset-driven workflow. These nodes
reuse its resolver and renderers, but expose one prompt module at a time with a
single STRING pass-through so ComfyUI bypass can skip an unwanted module.
"""

from __future__ import annotations

from typing import Mapping

try:  # Package import inside ComfyUI.
    from . import nodes as core
except ImportError:  # Direct import used by the repository tests.
    import nodes as core


MODULE_FIELD_GROUPS: Mapping[str, tuple[str, ...]] = {
    "画面基础": ("画面比例", "成像媒介", "写真大类", "写真主题"),
    "人物": tuple(core.PERSON_OUTPUT_FIELDS),
    "发型": ("发色模式", *core.HAIR_OUTPUT_FIELDS),
    "服装": tuple(core.CLOTHING_OUTPUT_FIELDS),
    "姿态动作": tuple(core.POSE_OUTPUT_FIELDS),
    "场景": ("场景大类", *core.SCENE_OUTPUT_FIELDS),
    "摄影": tuple(core.CAMERA_OUTPUT_FIELDS),
    "视觉表现": tuple(core.VISUAL_OUTPUT_FIELDS),
}

_grouped_fields = [
    field_name
    for module_fields in MODULE_FIELD_GROUPS.values()
    for field_name in module_fields
]
if set(_grouped_fields) != set(core.FIELD_ORDER) or len(_grouped_fields) != len(
    core.FIELD_ORDER
):
    raise RuntimeError("Modular node field groups must cover every structured field once.")


DEFAULT_MODULE_PRESET = core.PRESET_OPTIONS[0]
TXT_MODULE_TYPES = (*MODULE_FIELD_GROUPS, "自定义")
CHAIN_JOIN_POSITIONS = ("前置提示词在前", "当前节点内容在前")


class PromptChainText(str):
    """String output that also carries resolved module fields at runtime."""

    def __new__(cls, value="", resolved_fields=None, opaque_modules=None):
        instance = super().__new__(cls, value)
        instance.zimage_resolved_fields = dict(resolved_fields or {})
        instance.zimage_opaque_modules = frozenset(opaque_modules or ())
        return instance


def _finish_fragment(text: str) -> str:
    normalized = (text or "").strip().strip("，；。,. ;\t\r\n")
    return f"{normalized}。" if normalized else ""


def join_chain_text(prefix: str, current: str, position: str) -> str:
    """Join one chainable node body without rewriting either fragment."""

    resolved_fields = getattr(prefix, "zimage_resolved_fields", None)
    opaque_modules = getattr(prefix, "zimage_opaque_modules", None)
    prefix_text = "" if prefix is None else str(prefix)
    current_text = "" if current is None else str(current)
    if position == "当前节点内容在前":
        joined = core.join_prompt_text(
            current_text,
            prefix_text,
            "自由提示词在前",
        )
    else:
        joined = core.join_prompt_text(
            prefix_text,
            current_text,
            "自由提示词在前",
        )
    if resolved_fields is not None or opaque_modules is not None:
        return PromptChainText(joined, resolved_fields, opaque_modules)
    return joined


def render_module_fragment(
    module_name: str,
    fields: Mapping[str, str],
    density: str,
) -> str:
    """Render exactly one module from an already resolved field mapping."""

    if density not in core.PROMPT_DENSITIES:
        density = "标准"

    if module_name == "画面基础":
        base_fields = ("画面比例", "成像媒介", "写真主题")
        if density == "详细":
            parts = [
                core.FIELD_TEXT[field_name][fields[field_name]]
                for field_name in base_fields
                if fields.get(field_name, core.EMPTY_CHOICE) != core.EMPTY_CHOICE
            ]
        else:
            parts = [
                core._brief_text(fields, field_name)
                for field_name in base_fields
                if fields.get(field_name, core.EMPTY_CHOICE) != core.EMPTY_CHOICE
            ]
        return _finish_fragment("，".join(parts))

    if module_name == "人物":
        parts = (
            core._person_identity_text(fields),
            core._person_detail_prompt_text(fields, density),
            core._body_prompt_text(fields, density),
        )
        return _finish_fragment("，".join(part for part in parts if part))

    renderers = {
        "发型": core._hair_prompt_text,
        "服装": core._clothing_prompt_text,
        "姿态动作": core._pose_prompt_text,
        "场景": core._scene_prompt_text,
        "摄影": core._camera_prompt_text,
        "视觉表现": core._visual_prompt_text,
    }
    rendered = renderers[module_name](fields, density)
    if module_name == "姿态动作" and rendered and not rendered.startswith("人物"):
        rendered = f"人物{rendered}"
    return _finish_fragment(rendered)


class ZImageModuleNodeBase:
    """Shared implementation for one chainable structured prompt module."""

    MODULE_NAME = ""
    CATEGORY = "VividMuse/Z-Image/模块"
    FUNCTION = "build_module"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("组合提示词", "英文提示词")
    OUTPUT_NODE = False
    DESCRIPTION = "生成一个可串联、可旁路的中英文结构化提示词模块。"

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "预设": (
                core.PRESET_OPTIONS,
                {
                    "default": DEFAULT_MODULE_PRESET,
                    "tooltip": "只为当前模块提供预设值和随机兼容池，不会修改其他节点。",
                },
            ),
            "提示词密度": (
                core.PROMPT_DENSITIES,
                {
                    "default": "标准",
                    "tooltip": "控制当前模块输出的描述密度。",
                },
            ),
            "随机种子": (
                "INT",
                {
                    "default": 0,
                    "min": 0,
                    "max": core.MAX_SEED,
                    "control_after_generate": True,
                    "tooltip": "相同模块选项和种子会得到相同结果。",
                },
            ),
        }

        for field_name in MODULE_FIELD_GROUPS[cls.MODULE_NAME]:
            choices = [
                core.FOLLOW_PRESET,
                core.RANDOM_CHOICE,
                core.EMPTY_CHOICE,
                *core.FIELD_OPTIONS[field_name],
            ]
            inputs[field_name] = (choices, {"default": core.FOLLOW_PRESET})
        return {
            "required": inputs,
            "optional": {
                "前置提示词": (
                    "STRING",
                    {
                        "forceInput": True,
                        "tooltip": (
                            "连接上一个模块的中文输出；旁路当前节点时可直接传递。"
                        ),
                    },
                ),
                "前置英文提示词": (
                    "STRING",
                    {
                        "forceInput": True,
                        "tooltip": (
                            "连接上一个模块的英文输出，形成独立的英文提示词链。"
                        ),
                    },
                ),
            },
        }

    def _result(
        self,
        prompt: str,
        english_prompt: str,
        fields: Mapping[str, str],
        context_fields: Mapping[str, str],
        opaque_modules=(),
    ):
        return (
            PromptChainText(prompt, context_fields, opaque_modules),
            PromptChainText(english_prompt, context_fields, opaque_modules),
        )

    def build_module(self, **kwargs):
        preset = kwargs.pop("预设", DEFAULT_MODULE_PRESET)
        density = kwargs.pop("提示词密度", "标准")
        seed = kwargs.pop("随机种子", 0)
        prefix = kwargs.pop("前置提示词", "")
        english_prefix = kwargs.pop("前置英文提示词", "")
        context_source = prefix
        if not hasattr(context_source, "zimage_resolved_fields"):
            context_source = english_prefix
        upstream_context = dict(
            getattr(context_source, "zimage_resolved_fields", {}) or {}
        )
        upstream_opaque_modules = set(
            getattr(context_source, "zimage_opaque_modules", ()) or ()
        )
        requested = {
            field_name: core.FOLLOW_PRESET for field_name in core.FIELD_ORDER
        }
        for field_name in core.FIELD_ORDER:
            if field_name in upstream_context:
                requested[field_name] = upstream_context[field_name]
        for module_name in upstream_opaque_modules:
            for field_name in MODULE_FIELD_GROUPS.get(module_name, ()):
                requested[field_name] = core.EMPTY_CHOICE
        for field_name in MODULE_FIELD_GROUPS[self.MODULE_NAME]:
            requested[field_name] = kwargs.get(
                field_name,
                core.FOLLOW_PRESET,
            )
        fields = core.resolve_fields(
            preset,
            core.RANDOM_SCOPES[1],
            seed,
            requested,
        )
        context_fields = dict(upstream_context)
        for module_name in upstream_opaque_modules:
            for field_name in MODULE_FIELD_GROUPS.get(module_name, ()):
                context_fields.pop(field_name, None)
        context_fields.update(
            {
                field_name: fields[field_name]
                for field_name in MODULE_FIELD_GROUPS[self.MODULE_NAME]
            }
        )
        upstream_opaque_modules.discard(self.MODULE_NAME)
        fragment = render_module_fragment(self.MODULE_NAME, fields, density)
        english_fragment = core.render_english_module_fragment(
            self.MODULE_NAME, fields, density
        )
        prompt = join_chain_text(prefix, fragment, CHAIN_JOIN_POSITIONS[0])
        english_prompt = core.join_english_prompt_text(
            english_prefix, english_fragment
        )
        return self._result(
            prompt,
            english_prompt,
            fields,
            context_fields,
            upstream_opaque_modules,
        )


class ZImageCanvasModule(ZImageModuleNodeBase):
    MODULE_NAME = "画面基础"
    RETURN_TYPES = ("STRING", "INT", "INT", "STRING")
    RETURN_NAMES = ("组合提示词", "推荐宽度", "推荐高度", "英文提示词")
    DESCRIPTION = "生成中英文画面基础提示词，并输出推荐画布尺寸。"

    def _result(
        self,
        prompt: str,
        english_prompt: str,
        fields: Mapping[str, str],
        context_fields: Mapping[str, str],
        opaque_modules=(),
    ):
        aspect = fields.get("画面比例", core.EMPTY_CHOICE)
        if aspect not in core.ASPECT_RESOLUTIONS:
            aspect = core.PRESETS[DEFAULT_MODULE_PRESET]["画面比例"]
        width, height = core.ASPECT_RESOLUTIONS[aspect]
        return (
            PromptChainText(prompt, context_fields, opaque_modules),
            width,
            height,
            PromptChainText(english_prompt, context_fields, opaque_modules),
        )

class ZImagePersonModule(ZImageModuleNodeBase):
    MODULE_NAME = "人物"
    DESCRIPTION = "生成年龄、族裔、面部、肤质、妆容和身形描述。"


class ZImageHairModule(ZImageModuleNodeBase):
    MODULE_NAME = "发型"
    DESCRIPTION = "生成发色、长度、卷度、造型、刘海和头部配饰描述。"


class ZImageClothingModule(ZImageModuleNodeBase):
    MODULE_NAME = "服装"
    DESCRIPTION = "生成服装结构、颜色、材质、图案、鞋袜和配饰描述。"


class ZImagePoseModule(ZImageModuleNodeBase):
    MODULE_NAME = "姿态动作"
    DESCRIPTION = "生成身体方向、重心、手腿动作、视线和表情描述。"


class ZImageSceneModule(ZImageModuleNodeBase):
    MODULE_NAME = "场景"
    DESCRIPTION = "生成地点、时间、天气、前景、背景和空间层次描述。"


class ZImageCameraModule(ZImageModuleNodeBase):
    MODULE_NAME = "摄影"
    DESCRIPTION = "生成景别、构图、焦段、距离、机位、景深和对焦描述。"


class ZImageVisualModule(ZImageModuleNodeBase):
    MODULE_NAME = "视觉表现"
    DESCRIPTION = "生成布光、配色、对比、影像风格和质感描述。"


class ZImageTxtPromptLibrary:
    CATEGORY = "VividMuse/Z-Image/TXT词库"
    FUNCTION = "build_prompt"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("组合提示词",)
    OUTPUT_NODE = False
    DESCRIPTION = "导入并选择完整 TXT 提示词，可接入模块化文本链。"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "自由提示词": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "dynamicPrompts": False,
                        "tooltip": "由 TXT 词库写入，也可以直接手动编辑。",
                    },
                ),
                "拼接位置": (
                    CHAIN_JOIN_POSITIONS,
                    {"default": CHAIN_JOIN_POSITIONS[0]},
                ),
            },
            "optional": {
                "前置提示词": ("STRING", {"forceInput": True}),
            },
        }

    def build_prompt(self, **kwargs):
        return (
            join_chain_text(
                kwargs.get("前置提示词", ""),
                kwargs.get("自由提示词", ""),
                kwargs.get("拼接位置", CHAIN_JOIN_POSITIONS[0]),
            ),
        )


class ZImageTxtModuleLibrary:
    CATEGORY = "VividMuse/Z-Image/TXT词库"
    FUNCTION = "build_prompt"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("组合提示词",)
    OUTPUT_NODE = False
    DESCRIPTION = (
        "导入并选择一个结构化 TXT 模块片段；要替代某个独立模块，"
        "请在链中使用本节点代替该模块，或将同类型模块旁路。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "模块类型": (
                    TXT_MODULE_TYPES,
                    {
                        "default": TXT_MODULE_TYPES[0],
                        "tooltip": (
                            "声明当前片段所属模块。若链中已有同类型模块，"
                            "请将其旁路，避免两段描述同时进入提示词。"
                        ),
                    },
                ),
                "模块提示词": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "dynamicPrompts": False,
                        "tooltip": (
                            "由 TXT 模块词库写入，也可以直接手动编辑；"
                            "本节点不会删除已经位于上游字符串中的同类型描述。"
                        ),
                    },
                ),
                "拼接位置": (
                    CHAIN_JOIN_POSITIONS,
                    {"default": CHAIN_JOIN_POSITIONS[0]},
                ),
            },
            "optional": {
                "前置提示词": ("STRING", {"forceInput": True}),
            },
        }

    def build_prompt(self, **kwargs):
        prefix = kwargs.get("前置提示词", "")
        module_text = kwargs.get("模块提示词", "")
        prompt = join_chain_text(
            prefix,
            module_text,
            kwargs.get("拼接位置", CHAIN_JOIN_POSITIONS[0]),
        )
        module_name = kwargs.get("模块类型", TXT_MODULE_TYPES[0])
        if module_name not in MODULE_FIELD_GROUPS or not str(module_text).strip():
            return (prompt,)

        context_fields = dict(
            getattr(prefix, "zimage_resolved_fields", {}) or {}
        )
        for field_name in MODULE_FIELD_GROUPS[module_name]:
            context_fields.pop(field_name, None)
        opaque_modules = set(
            getattr(prefix, "zimage_opaque_modules", ()) or ()
        )
        opaque_modules.add(module_name)
        return (PromptChainText(prompt, context_fields, opaque_modules),)


NODE_CLASS_MAPPINGS = {
    "VividMuse_ZImageCanvasModule": ZImageCanvasModule,
    "VividMuse_ZImagePersonModule": ZImagePersonModule,
    "VividMuse_ZImageHairModule": ZImageHairModule,
    "VividMuse_ZImageClothingModule": ZImageClothingModule,
    "VividMuse_ZImagePoseModule": ZImagePoseModule,
    "VividMuse_ZImageSceneModule": ZImageSceneModule,
    "VividMuse_ZImageCameraModule": ZImageCameraModule,
    "VividMuse_ZImageVisualModule": ZImageVisualModule,
    "VividMuse_ZImageTxtPromptLibrary": ZImageTxtPromptLibrary,
    "VividMuse_ZImageTxtModuleLibrary": ZImageTxtModuleLibrary,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VividMuse_ZImageCanvasModule": "Z-Image 画面基础",
    "VividMuse_ZImagePersonModule": "Z-Image 人物",
    "VividMuse_ZImageHairModule": "Z-Image 发型",
    "VividMuse_ZImageClothingModule": "Z-Image 服装",
    "VividMuse_ZImagePoseModule": "Z-Image 姿态动作",
    "VividMuse_ZImageSceneModule": "Z-Image 场景",
    "VividMuse_ZImageCameraModule": "Z-Image 摄影",
    "VividMuse_ZImageVisualModule": "Z-Image 视觉表现",
    "VividMuse_ZImageTxtPromptLibrary": "Z-Image TXT提示词库",
    "VividMuse_ZImageTxtModuleLibrary": "Z-Image TXT模块词库",
}
