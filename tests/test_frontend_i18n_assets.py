import unittest
from pathlib import Path

import modular_nodes
import nodes


ROOT = Path(__file__).resolve().parents[1]


class FrontendI18nAssetTests(unittest.TestCase):
    def test_every_public_node_has_english_help(self):
        node_keys = set(nodes.NODE_CLASS_MAPPINGS) | set(modular_nodes.NODE_CLASS_MAPPINGS)
        self.assertEqual(11, len(node_keys))

        missing = []
        empty = []
        for node_key in sorted(node_keys):
            help_path = ROOT / "web" / "js" / "docs" / node_key / "en.md"
            if not help_path.is_file():
                missing.append(str(help_path.relative_to(ROOT)))
            elif not help_path.read_text(encoding="utf-8").strip():
                empty.append(str(help_path.relative_to(ROOT)))

        self.assertEqual([], missing, f"Missing English help documents: {missing}")
        self.assertEqual([], empty, f"Empty English help documents: {empty}")

    def test_generated_catalog_and_english_examples_exist(self):
        required = (
            ROOT / "web" / "js" / "i18n_catalog.js",
            ROOT / "examples" / "TXT-prompt-library-example.en.txt",
            ROOT / "examples" / "TXT-module-library-example.en.txt",
        )
        for path in required:
            self.assertTrue(path.is_file(), str(path.relative_to(ROOT)))
            self.assertTrue(path.read_text(encoding="utf-8").strip(), str(path.relative_to(ROOT)))


if __name__ == "__main__":
    unittest.main()
