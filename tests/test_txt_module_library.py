import unittest

import nodes


class TxtModuleLibraryBackendTests(unittest.TestCase):
    def test_user_modules_are_inserted_in_structured_order(self):
        requested = {field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER}
        prompt = nodes.build_prompt_text(
            nodes.PRESET_OPTIONS[0],
            nodes.RANDOM_SCOPES[0],
            0,
            requested,
            density="标准",
            user_person_fragment="用户人物特征测试。",
            user_pose_fragment="用户姿态动作测试；",
        )

        self.assertIn("用户人物特征测试", prompt)
        self.assertIn("用户姿态动作测试", prompt)
        self.assertLess(
            prompt.index("用户人物特征测试"),
            prompt.index("用户姿态动作测试"),
        )
        self.assertNotIn("测试。；", prompt)

    def test_user_modules_work_when_all_builtin_modules_are_empty(self):
        requested = {field: nodes.EMPTY_CHOICE for field in nodes.FIELD_ORDER}
        prompt = nodes.build_prompt_text(
            nodes.CUSTOM_PRESET,
            nodes.RANDOM_SCOPES[0],
            0,
            requested,
            user_person_fragment="仅人物自定义",
            user_pose_fragment="仅动作自定义",
        )

        self.assertEqual(prompt, "仅人物自定义；仅动作自定义。")

    def test_optional_inputs_are_appended_and_consumed(self):
        optional = nodes.ZImageChinesePromptBuilder.INPUT_TYPES()["optional"]
        self.assertEqual(
            list(optional)[-2:],
            ["用户人物片段", "用户姿态动作片段"],
        )
        requested = {field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER}
        prompt, _, _ = nodes.ZImageChinesePromptBuilder().build_prompt(
            预设=nodes.PRESET_OPTIONS[0],
            提示词密度="标准",
            随机范围=nodes.RANDOM_SCOPES[0],
            随机种子=0,
            用户人物片段="后端人物槽位",
            用户姿态动作片段="后端动作槽位",
            **requested,
        )
        self.assertIn("后端人物槽位", prompt)
        self.assertIn("后端动作槽位", prompt)


if __name__ == "__main__":
    unittest.main()
