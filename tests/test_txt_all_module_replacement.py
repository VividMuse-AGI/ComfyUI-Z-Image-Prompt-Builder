import unittest

import nodes


class TxtAllModuleReplacementTests(unittest.TestCase):
    def test_each_custom_module_can_generate_independently(self):
        fields = {field: nodes.EMPTY_CHOICE for field in nodes.FIELD_ORDER}
        for module_name in nodes.USER_MODULE_INPUTS:
            with self.subTest(module_name=module_name):
                fragment = f"独立{module_name}内容"
                prompt = nodes.compose_prompt_text(
                    fields,
                    "标准",
                    user_module_fragments={module_name: fragment},
                )
                self.assertEqual(prompt, f"{fragment}。")

    def test_custom_module_appends_without_replacing_standard_modules(self):
        requested = {field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER}
        fields = nodes.resolve_fields(
            nodes.PRESET_OPTIONS[0], nodes.RANDOM_SCOPES[0], 0, requested
        )
        prompt = nodes.compose_prompt_text(
            fields,
            "标准",
            user_module_fragments={"自定义": "额外品牌要求"},
        )
        self.assertIn(nodes._person_identity_text(fields), prompt)
        self.assertTrue(prompt.endswith("额外品牌要求。"))

    def test_all_custom_modules_replace_all_matching_builtin_groups(self):
        requested = {field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER}
        fields = nodes.resolve_fields(
            nodes.PRESET_OPTIONS[0], nodes.RANDOM_SCOPES[0], 0, requested
        )
        fragments = {
            module_name: f"完全自定义{module_name}"
            for module_name in nodes.USER_MODULE_INPUTS
        }
        prompt = nodes.compose_prompt_text(
            fields, "标准", user_module_fragments=fragments
        )
        builtin_groups = [
            f"{nodes._brief_text(fields, '画面比例')}，"
            f"{nodes._brief_text(fields, '成像媒介')}，"
            f"{nodes._brief_text(fields, '写真主题')}",
            nodes._person_identity_text(fields),
            nodes._hair_prompt_text(fields, "标准"),
            nodes._clothing_prompt_text(fields, "标准"),
            nodes._pose_prompt_text(fields, "标准"),
            nodes._scene_prompt_text(fields, "标准"),
            nodes._camera_prompt_text(fields, "标准"),
            nodes._visual_prompt_text(fields, "标准"),
        ]
        for module_name, fragment in fragments.items():
            with self.subTest(module_name=module_name):
                self.assertIn(fragment, prompt)
        for builtin_group in builtin_groups:
            self.assertNotIn(builtin_group, prompt)


if __name__ == "__main__":
    unittest.main()
