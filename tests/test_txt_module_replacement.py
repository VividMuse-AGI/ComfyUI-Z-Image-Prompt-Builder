import unittest

import nodes


class TxtModuleReplacementTests(unittest.TestCase):
    def test_custom_person_and_pose_replace_matching_builtin_text(self):
        requested = {field: nodes.FOLLOW_PRESET for field in nodes.FIELD_ORDER}
        fields = nodes.resolve_fields(
            nodes.PRESET_OPTIONS[0],
            nodes.RANDOM_SCOPES[0],
            0,
            requested,
        )
        builtin_person = nodes._person_identity_text(fields)
        builtin_pose = nodes._pose_prompt_text(fields, "标准")
        prompt = nodes.compose_prompt_text(
            fields,
            "标准",
            "完全自定义的人物模块",
            "完全自定义的姿态动作模块",
        )

        self.assertIn("完全自定义的人物模块", prompt)
        self.assertIn("完全自定义的姿态动作模块", prompt)
        self.assertNotIn(builtin_person, prompt)
        self.assertNotIn(builtin_pose, prompt)


if __name__ == "__main__":
    unittest.main()
