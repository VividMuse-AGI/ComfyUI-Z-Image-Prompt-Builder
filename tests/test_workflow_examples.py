"""Validate saved widget order, links and text execution without a ComfyUI server."""
import json
import unittest
from pathlib import Path

import nodes
import modular_nodes

CLASSES = {**nodes.NODE_CLASS_MAPPINGS, **modular_nodes.NODE_CLASS_MAPPINGS}
ROOT = Path(__file__).resolve().parents[1]


class WorkflowExamplesTests(unittest.TestCase):
    def test_examples_execute(self):
        paths = sorted((ROOT / "examples/workflows").glob("*.json"))
        self.assertEqual(len(paths), 4)
        for path in paths:
            with self.subTest(workflow=path.name):
                graph = json.loads(path.read_text(encoding="utf-8"))
                links = {link[0]: link for link in graph["links"]}
                items = {item["id"]: item for item in graph["nodes"]}
                results = {}
                preview = ""
                for item in graph["nodes"]:
                    kwargs = {}
                    for port_index, port in enumerate(item["inputs"]):
                        if port["link"] is not None:
                            link = links[port["link"]]
                            self.assertEqual(link[3:5], [item["id"], port_index])
                            self.assertIn(link[0], items[link[1]]["outputs"][link[2]]["links"])
                            kwargs[port["name"]] = results[link[1]][link[2]]
                    if item["type"] == "PreviewAny":
                        preview = kwargs["source"]
                        continue
                    cls = CLASSES[item["type"]]
                    values = iter(item["widgets_values"])
                    schema = cls.INPUT_TYPES()
                    for section in ("required", "optional"):
                        for name, definition in schema.get(section, {}).items():
                            typ = definition[0]
                            opts = definition[1] if len(definition) > 1 else {}
                            if opts.get("forceInput"):
                                continue
                            value = next(values)
                            if isinstance(typ, (list, tuple)):
                                self.assertIn(value, typ, name)
                            kwargs[name] = value
                            if opts.get("control_after_generate"):
                                self.assertEqual(next(values), "fixed")
                    self.assertEqual(list(values), [])
                    results[item["id"]] = getattr(cls(), cls.FUNCTION)(**kwargs)
                self.assertTrue(preview.strip())
                if path.name.startswith("01"):
                    self.assertIn("人物手持一杯热茶", preview)
                if path.name.startswith("03"):
                    self.assertIn("holding a cup of tea", preview)
                if path.name.startswith("04"):
                    self.assertEqual(preview.count("一位30岁左右的东亚成年女性，短发，自然肤质"), 1)


if __name__ == "__main__":
    unittest.main()
