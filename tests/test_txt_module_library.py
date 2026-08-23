import unittest

import nodes


class TxtModuleLibraryBackendTests(unittest.TestCase):
    def test_all_user_modules_are_inserted_in_output_order(self):
        requested = {field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER}
        fragments = {
            module_name: f"自定义{module_name}模块"
            for module_name in nodes.USER_MODULE_INPUTS
        }
        prompt = nodes.build_prompt_text(
            nodes.PRESET_OPTIONS[0], nodes.RANDOM_SCOPES[0], 0, requested,
            density="标准", user_module_fragments=fragments,
        )
        output_order = [
            "画面基础", "人物", "发型", "服装", "姿态动作", "场景", "视觉表现", "摄影", "自定义",
        ]
        positions = [prompt.index(f"自定义{name}模块") for name in output_order]
        self.assertEqual(positions, sorted(positions))

    def test_all_user_modules_work_on_blank_canvas(self):
        requested = {field: nodes.EMPTY_CHOICE for field in nodes.FIELD_ORDER}
        fragments = {
            module_name: f"仅{module_name}自定义"
            for module_name in nodes.USER_MODULE_INPUTS
        }
        prompt = nodes.build_prompt_text(
            nodes.CUSTOM_PRESET, nodes.RANDOM_SCOPES[0], 0, requested,
            user_module_fragments=fragments,
        )
        for fragment in fragments.values():
            self.assertIn(fragment, prompt)

    def test_person_pose_compatibility_parameters_still_work(self):
        requested = {field: nodes.EMPTY_CHOICE for field in nodes.FIELD_ORDER}
        prompt = nodes.build_prompt_text(
            nodes.CUSTOM_PRESET, nodes.RANDOM_SCOPES[0], 0, requested,
            user_person_fragment="兼容人物", user_pose_fragment="兼容动作",
        )
        self.assertEqual(prompt, "兼容人物；兼容动作。")

    def test_optional_inputs_include_all_module_slots(self):
        optional = nodes.ZImageChinesePromptBuilder.INPUT_TYPES()["optional"]
        module_input_names = list(nodes.USER_MODULE_INPUTS.values())
        self.assertTrue(set(module_input_names).issubset(optional))
        self.assertLess(
            list(optional).index("用户人物片段"),
            list(optional).index("用户画面基础片段"),
        )
        kwargs = {field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER}
        kwargs.update({name: f"槽位{name}" for name in module_input_names})
        prompt, _, _ = nodes.ZImageChinesePromptBuilder().build_prompt(
            预设=nodes.PRESET_OPTIONS[0], 提示词密度="标准",
            随机范围=nodes.RANDOM_SCOPES[0], 随机种子=0, **kwargs,
        )
        for input_name in module_input_names:
            self.assertIn(f"槽位{input_name}", prompt)


if __name__ == "__main__":
    unittest.main()
