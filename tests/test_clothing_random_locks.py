"""Random structures must respect concrete garment selections."""
import unittest
import nodes as n
import modular_nodes as m


def request_for(**locks):
    request = {f: n.EMPTY_CHOICE for f in n.FIELD_ORDER}
    request.update({f: n.RANDOM_CHOICE for f in n.CLOTHING_OUTPUT_FIELDS})
    request.update({"写真主题": "拳击训练力量写真", **locks})
    return request


class ClothingRandomLockTests(unittest.TestCase):
    def test_each_garment_branch_lock_survives_random_structure(self):
        for mode, fields in n.CLOTHING_MODE_FIELDS.items():
            for field in fields:
                value = n.FIELD_OPTIONS[field][0]
                for scope in n.RANDOM_SCOPES:
                    for seed in (0, 7, 42):
                        with self.subTest(field=field, scope=scope, seed=seed):
                            request = request_for(**{field: value})
                            result = n.resolve_fields(n.PRESET_OPTIONS[1], scope, seed, request)
                            self.assertEqual(result[field], value)
                            self.assertIn(field, n.CLOTHING_MODE_FIELDS[result["穿搭结构"]])
                            self.assertEqual(result, n.resolve_fields(n.PRESET_OPTIONS[1], scope, seed, request))

    def test_locked_evening_dress_uses_compatible_recipe(self):
        request = request_for(连衣裙类型="修身晚礼服")
        for scope in n.RANDOM_SCOPES:
            for seed in range(20):
                result = n.resolve_fields(n.PRESET_OPTIONS[1], scope, seed, request)
                self.assertEqual(result["连衣裙类型"], "修身晚礼服")
                self.assertEqual(result["穿搭结构"], "连衣裙")
                self.assertEqual(result["上装类型"], n.EMPTY_CHOICE)
                recipes = [r for r in n.CLOTHING_RECIPES if "修身晚礼服" in
                           (n._clothing_recipe_values(r, "连衣裙类型") or ())]
                allowed = {v for r in recipes for v in
                           (n._clothing_recipe_values(r, "连衣裙材质") or ())}
                self.assertIn(result["连衣裙材质"], allowed)

    def test_incompatible_branch_locks_are_preserved_without_extra_garments(self):
        request = request_for(连衣裙类型="修身晚礼服", 上装类型="垂坠衬衫")
        for scope in n.RANDOM_SCOPES:
            result = n.resolve_fields(n.PRESET_OPTIONS[1], scope, 7, request)
            self.assertEqual(result["穿搭结构"], n.EMPTY_CHOICE)
            for field in n.CLOTHING_BRANCH_FIELDS:
                self.assertEqual(result[field], request[field] if field in
                                 ("连衣裙类型", "上装类型") else n.EMPTY_CHOICE)

    def test_blank_structure_preserves_atomic_fields_when_accessory_random(self):
        request = {f: n.EMPTY_CHOICE for f in n.FIELD_ORDER}
        request.update(连衣裙颜色="玄黑色", 服装配件=n.RANDOM_CHOICE)
        result = n.resolve_fields(n.PRESET_OPTIONS[1], n.RANDOM_SCOPES[1], 7, request)
        self.assertEqual(result["连衣裙颜色"], "玄黑色")
        self.assertEqual(result["穿搭结构"], n.EMPTY_CHOICE)

    def test_specialist_garment_without_core_id_is_not_lost(self):
        request = request_for(连体服类型="无袖瑜伽连体衣")
        for scope in n.RANDOM_SCOPES:
            result = n.resolve_fields(n.PRESET_OPTIONS[1], scope, 7, request)
            self.assertEqual(result["连体服类型"], "无袖瑜伽连体衣")
            self.assertEqual(result["穿搭结构"], "连体服")
            for field in ("连体服材质", "连体服图案", "版型细节", "袜装", "鞋履", "服装配件"):
                self.assertEqual(result[field], n.EMPTY_CHOICE, field)

    def test_full_node_keeps_conflicting_atoms_in_both_outputs(self):
        request = request_for(连衣裙类型="修身晚礼服", 上装类型="垂坠衬衫")
        for density in n.PROMPT_DENSITIES:
            zh, _, _, en = n.ZImageChinesePromptBuilder().build_prompt(
                **request, 提示词密度=density, 随机种子=7)
            self.assertIn("晚礼服", zh)
            self.assertIn("衬衫", zh)
            self.assertRegex(en.lower(), r"evening|gown")
            self.assertRegex(en.lower(), r"shirt|blouse")
            self.assertNotRegex(en, r"[\u3400-\u9fff]")

    def test_single_accessories_and_sets_are_recipe_scoped(self):
        import random
        pools = n._COMBINATION_RULES["accessory_recipe_values"]
        self.assertEqual(set(pools), set(n.CLOTHING_RECIPE_BY_ID))
        for recipe in n.CLOTHING_RECIPES:
            singles = pools[recipe["id"]]
            self.assertEqual(len(singles), len(set(singles)))
            self.assertTrue(set(singles).issubset(n.FIELD_OPTIONS["服装配件"]))
            self.assertFalse(set(singles).intersection(n.ACCESSORY_SET_TEXT))
            allowed = set(singles) | {n.ACCESSORY_SET_LABELS[i] for i in
                                     n.ACCESSORY_SET_RECIPE_IDS[recipe["id"]]}
            seen = {n._random_clothing_value(random.Random(seed), "服装配件", recipe)
                    for seed in range(400)}
            self.assertEqual(seen, allowed, recipe["id"])
        # An unsupported recipe must not fall back to every accessory.
        self.assertEqual(n._random_clothing_value(random.Random(7), "服装配件",
                                                 {"id": "unknown"}), n.EMPTY_CHOICE)

    def test_all_manual_accessories_override_sports_omission(self):
        for accessory in n.FIELD_OPTIONS["服装配件"]:
            request = request_for(服装配件=accessory)
            result = n.resolve_fields(n.PRESET_OPTIONS[1], n.RANDOM_SCOPES[1], 7, request)
            self.assertEqual(result["服装配件"], accessory)

    def test_explicit_structure_still_excludes_inactive_branches(self):
        result = n.resolve_fields(n.PRESET_OPTIONS[1], n.RANDOM_SCOPES[1], 7,
                                  request_for(穿搭结构="上装＋下装", 连衣裙类型="修身晚礼服"))
        self.assertEqual(result["穿搭结构"], "上装＋下装")
        self.assertEqual(result["连衣裙类型"], n.EMPTY_CHOICE)

    def test_independent_clothing_node_preserves_lock_in_both_outputs(self):
        context = m.PromptChainText("", {f: n.EMPTY_CHOICE for f in n.FIELD_ORDER})
        context.zimage_resolved_fields["写真主题"] = "拳击训练力量写真"
        kwargs = {f: n.RANDOM_CHOICE for f in n.CLOTHING_OUTPUT_FIELDS}
        kwargs["连衣裙类型"] = "修身晚礼服"
        for density in n.PROMPT_DENSITIES:
            zh, en = m.ZImageClothingModule().build_module(**kwargs, 提示词密度=density,
                前置提示词=context, 前置英文提示词=context, 随机种子=7)
            self.assertEqual(zh.zimage_resolved_fields["连衣裙类型"], "修身晚礼服")
            self.assertIn("晚礼服", zh)
            self.assertRegex(en.lower(), r"evening|gown")
            self.assertNotRegex(en, r"[\u3400-\u9fff]")


if __name__ == "__main__":
    unittest.main()
