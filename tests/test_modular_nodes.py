import importlib.util
import sys
import unittest
from pathlib import Path

import modular_nodes
import nodes


ROOT = Path(__file__).resolve().parents[1]


class ModularNodeTests(unittest.TestCase):
    def test_package_registers_original_plus_ten_new_nodes(self):
        package_name = "zimage_prompt_builder_test_package"
        spec = importlib.util.spec_from_file_location(
            package_name,
            ROOT / "__init__.py",
            submodule_search_locations=[str(ROOT)],
        )
        package = importlib.util.module_from_spec(spec)
        sys.modules[package_name] = package
        try:
            spec.loader.exec_module(package)
            self.assertEqual(len(package.NODE_CLASS_MAPPINGS), 11)
            self.assertIn(
                "VividMuse_ZImageChinesePromptBuilder",
                package.NODE_CLASS_MAPPINGS,
            )
            self.assertEqual(
                set(modular_nodes.NODE_CLASS_MAPPINGS),
                set(package.NODE_CLASS_MAPPINGS) - {
                    "VividMuse_ZImageChinesePromptBuilder"
                },
            )
        finally:
            sys.modules.pop(package_name, None)

    def test_eight_module_groups_cover_every_field_once(self):
        grouped = [
            field_name
            for fields in modular_nodes.MODULE_FIELD_GROUPS.values()
            for field_name in fields
        ]
        self.assertEqual(len(grouped), len(nodes.FIELD_ORDER))
        self.assertEqual(set(grouped), set(nodes.FIELD_ORDER))

    def test_module_nodes_expose_only_their_own_structured_fields(self):
        controls = {"预设", "提示词密度", "随机种子"}
        for node_class in modular_nodes.NODE_CLASS_MAPPINGS.values():
            if not issubclass(node_class, modular_nodes.ZImageModuleNodeBase):
                continue
            input_types = node_class.INPUT_TYPES()
            structured = set(input_types["required"]) - controls
            self.assertEqual(
                structured,
                set(modular_nodes.MODULE_FIELD_GROUPS[node_class.MODULE_NAME]),
            )
            for field_name in modular_nodes.MODULE_FIELD_GROUPS[node_class.MODULE_NAME]:
                self.assertEqual(
                    input_types["required"][field_name][1]["default"],
                    nodes.FOLLOW_PRESET,
                )
            self.assertEqual(
                input_types["optional"]["前置提示词"][1]["forceInput"],
                True,
            )
            self.assertEqual(
                input_types["optional"]["前置英文提示词"][1]["forceInput"],
                True,
            )
            self.assertEqual(node_class.RETURN_NAMES[-1], "英文提示词")

    def test_all_eight_modules_chain_as_plain_strings(self):
        node_classes = (
            modular_nodes.ZImageCanvasModule,
            modular_nodes.ZImagePersonModule,
            modular_nodes.ZImageHairModule,
            modular_nodes.ZImageClothingModule,
            modular_nodes.ZImagePoseModule,
            modular_nodes.ZImageSceneModule,
            modular_nodes.ZImageCameraModule,
            modular_nodes.ZImageVisualModule,
        )
        prompt = ""
        for node_class in node_classes:
            result = node_class().build_module(前置提示词=prompt)
            prompt = result[0]
        self.assertGreaterEqual(prompt.count("。"), 8)
        self.assertIn("一位20岁左右的东亚成年女性", prompt)
        self.assertIn("发型为", prompt)
        self.assertIn("场景位于", prompt)
        self.assertIn("镜头", prompt)

    def test_every_preset_renders_in_every_module_and_density(self):
        node_classes = (
            modular_nodes.ZImageCanvasModule,
            modular_nodes.ZImagePersonModule,
            modular_nodes.ZImageHairModule,
            modular_nodes.ZImageClothingModule,
            modular_nodes.ZImagePoseModule,
            modular_nodes.ZImageSceneModule,
            modular_nodes.ZImageCameraModule,
            modular_nodes.ZImageVisualModule,
        )
        for preset in nodes.PRESET_OPTIONS:
            for density in nodes.PROMPT_DENSITIES:
                for node_class in node_classes:
                    result = node_class().build_module(
                        预设=preset,
                        提示词密度=density,
                    )
                    self.assertIsInstance(result[0], str)

    def test_canvas_module_returns_recommended_dimensions(self):
        prompt, width, height, english_prompt = (
            modular_nodes.ZImageCanvasModule().build_module()
        )
        self.assertTrue(prompt)
        self.assertEqual((width, height), (832, 1248))
        self.assertTrue(english_prompt)

    def test_empty_module_passes_prefix_through_unchanged(self):
        kwargs = {
            field_name: nodes.EMPTY_CHOICE
            for field_name in modular_nodes.MODULE_FIELD_GROUPS["发型"]
        }
        result = modular_nodes.ZImageHairModule().build_module(
            前置提示词="保留上游文本。",
            **kwargs,
        )
        self.assertEqual(result, ("保留上游文本。", ""))

    def test_module_randomization_is_seed_deterministic(self):
        kwargs = {
            field_name: nodes.RANDOM_CHOICE
            for field_name in modular_nodes.MODULE_FIELD_GROUPS["姿态动作"]
        }
        first = modular_nodes.ZImagePoseModule().build_module(
            随机种子=20260828,
            **kwargs,
        )
        second = modular_nodes.ZImagePoseModule().build_module(
            随机种子=20260828,
            **kwargs,
        )
        self.assertEqual(first, second)
        self.assertTrue(first[0].startswith("人物"))

    def test_chain_carries_resolved_fields_into_downstream_randomization(self):
        pose_kwargs = {
            field_name: nodes.RANDOM_CHOICE
            for field_name in modular_nodes.MODULE_FIELD_GROUPS["姿态动作"]
        }
        pose_prompt = modular_nodes.ZImagePoseModule().build_module(
            随机种子=1,
            **pose_kwargs,
        )[0]
        self.assertIsInstance(pose_prompt, str)
        pose_context = pose_prompt.zimage_resolved_fields

        camera_kwargs = {
            field_name: nodes.RANDOM_CHOICE
            for field_name in modular_nodes.MODULE_FIELD_GROUPS["摄影"]
        }
        camera_prompt = modular_nodes.ZImageCameraModule().build_module(
            前置提示词=pose_prompt,
            随机种子=1,
            **camera_kwargs,
        )[0]

        requested = {
            field_name: nodes.FOLLOW_PRESET for field_name in nodes.FIELD_ORDER
        }
        requested.update(pose_context)
        requested.update(camera_kwargs)
        expected = nodes.resolve_fields(
            modular_nodes.DEFAULT_MODULE_PRESET,
            nodes.RANDOM_SCOPES[1],
            1,
            requested,
        )
        camera_context = camera_prompt.zimage_resolved_fields
        for field_name in modular_nodes.MODULE_FIELD_GROUPS["姿态动作"]:
            self.assertEqual(camera_context[field_name], pose_context[field_name])
        for field_name in modular_nodes.MODULE_FIELD_GROUPS["摄影"]:
            self.assertEqual(camera_context[field_name], expected[field_name])

        txt_prompt = modular_nodes.ZImageTxtPromptLibrary().build_prompt(
            前置提示词=camera_prompt,
            自由提示词="补充文本",
            拼接位置="前置提示词在前",
        )[0]
        self.assertEqual(
            txt_prompt.zimage_resolved_fields,
            camera_context,
        )
        self.assertEqual(txt_prompt.zimage_opaque_modules, frozenset())

    def test_txt_module_override_clears_stale_context(self):
        pose_prompt = modular_nodes.ZImagePoseModule().build_module(
            随机种子=1,
            **{
                field_name: nodes.RANDOM_CHOICE
                for field_name in modular_nodes.MODULE_FIELD_GROUPS["姿态动作"]
            },
        )[0]
        txt_prompt = modular_nodes.ZImageTxtModuleLibrary().build_prompt(
            前置提示词=pose_prompt,
            模块类型="姿态动作",
            模块提示词="人物盘腿坐在地面，双手轻搭膝盖。",
            拼接位置="前置提示词在前",
        )[0]

        self.assertEqual(txt_prompt.zimage_opaque_modules, {"姿态动作"})
        for field_name in modular_nodes.MODULE_FIELD_GROUPS["姿态动作"]:
            self.assertNotIn(field_name, txt_prompt.zimage_resolved_fields)

        camera_prompt = modular_nodes.ZImageCameraModule().build_module(
            前置提示词=txt_prompt,
            随机种子=1,
            **{
                field_name: nodes.RANDOM_CHOICE
                for field_name in modular_nodes.MODULE_FIELD_GROUPS["摄影"]
            },
        )[0]
        self.assertEqual(camera_prompt.zimage_opaque_modules, {"姿态动作"})
        for field_name in modular_nodes.MODULE_FIELD_GROUPS["姿态动作"]:
            self.assertNotIn(field_name, camera_prompt.zimage_resolved_fields)

    def test_structured_module_replaces_txt_module_unknown_context(self):
        txt_prompt = modular_nodes.ZImageTxtModuleLibrary().build_prompt(
            模块类型="姿态动作",
            模块提示词="人物盘腿坐在地面。",
        )[0]
        pose_prompt = modular_nodes.ZImagePoseModule().build_module(
            前置提示词=txt_prompt,
        )[0]
        self.assertNotIn("姿态动作", pose_prompt.zimage_opaque_modules)
        for field_name in modular_nodes.MODULE_FIELD_GROUPS["姿态动作"]:
            self.assertIn(field_name, pose_prompt.zimage_resolved_fields)

    def test_custom_or_empty_txt_module_does_not_hide_structured_context(self):
        pose_prompt = modular_nodes.ZImagePoseModule().build_module()[0]
        for module_type, module_text in (("自定义", "附加内容"), ("姿态动作", "")):
            txt_prompt = modular_nodes.ZImageTxtModuleLibrary().build_prompt(
                前置提示词=pose_prompt,
                模块类型=module_type,
                模块提示词=module_text,
            )[0]
            self.assertEqual(
                txt_prompt.zimage_resolved_fields,
                pose_prompt.zimage_resolved_fields,
            )
            self.assertEqual(txt_prompt.zimage_opaque_modules, frozenset())

    def test_txt_nodes_join_or_replace_chain_text(self):
        prompt_node = modular_nodes.ZImageTxtPromptLibrary()
        self.assertEqual(
            prompt_node.build_prompt(
                前置提示词="上游内容",
                自由提示词="TXT内容",
                拼接位置="前置提示词在前",
            ),
            ("上游内容；TXT内容",),
        )
        module_node = modular_nodes.ZImageTxtModuleLibrary()
        self.assertEqual(
            module_node.build_prompt(
                前置提示词="上游内容",
                模块提示词="人物模块内容",
                拼接位置="当前节点内容在前",
            ),
            ("人物模块内容；上游内容",),
        )


if __name__ == "__main__":
    unittest.main()
