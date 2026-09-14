"""Generate portable text-only ComfyUI examples from the current node schemas."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import nodes
import modular_nodes

CLASSES = {**nodes.NODE_CLASS_MAPPINGS, **modular_nodes.NODE_CLASS_MAPPINGS}
OUT = ROOT / "examples" / "workflows"


def new_graph():
    return {"last_node_id": 0, "last_link_id": 0, "nodes": [], "links": [],
            "groups": [], "config": {}, "extra": {}, "version": 0.4}


def add(graph, kind, overrides=None, title=None):
    overrides = overrides or {}
    idx = len(graph["nodes"]) + 1
    item = {"id": idx, "type": kind, "pos": [(idx-1)*440, 80], "size": [400, 600],
            "flags": {}, "order": idx-1, "mode": 0, "inputs": [], "outputs": [],
            "properties": {"Node name for S&R": kind}, "widgets_values": []}
    if title:
        item["title"] = title
    if kind == "PreviewAny":
        item["inputs"] = [{"name": "source", "type": "*", "link": None}]
    else:
        cls = CLASSES[kind]
        schema = cls.INPUT_TYPES()
        for spec in ("required", "optional"):
            for name, definition in schema.get(spec, {}).items():
                typ = definition[0]
                opts = definition[1] if len(definition) > 1 else {}
                if opts.get("forceInput"):
                    item["inputs"].append({"name": name, "type": typ, "link": None})
                    continue
                default = opts.get("default", typ[0] if isinstance(typ, (list, tuple)) else "")
                item["widgets_values"].append(overrides.get(name, default))
                if opts.get("control_after_generate"):
                    item["widgets_values"].append("fixed")
        item["outputs"] = [{"name": name, "type": typ, "links": [], "slot_index": i}
                           for i, (name, typ) in enumerate(zip(cls.RETURN_NAMES, cls.RETURN_TYPES))]
    graph["nodes"].append(item)
    graph["last_node_id"] = idx
    return item


def connect(graph, source, slot, target, input_name):
    target_slot = next(i for i, x in enumerate(target["inputs"]) if x["name"] == input_name)
    link_id = len(graph["links"]) + 1
    graph["links"].append([link_id, source["id"], slot, target["id"], target_slot,
                           source["outputs"][slot]["type"]])
    source["outputs"][slot]["links"].append(link_id)
    target["inputs"][target_slot]["link"] = link_id
    graph["last_link_id"] = link_id


def write(name, graph):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")


def main():
    graph = new_graph()
    builder = add(graph, "VividMuse_ZImageChinesePromptBuilder",
                  {"自由提示词": "人物手持一杯热茶"}, "Full Builder: Chinese + Free Text")
    connect(graph, builder, 0, add(graph, "PreviewAny"), "source")
    write("01-full-builder.json", graph)

    graph = new_graph()
    previous = None
    for module in ("Canvas", "Person", "Hair", "Clothing", "Pose", "Scene", "Camera", "Visual"):
        current = add(graph, f"VividMuse_ZImage{module}Module")
        if previous:
            connect(graph, previous, 0, current, "前置提示词")
        previous = current
    connect(graph, previous, 0, add(graph, "PreviewAny"), "source")
    write("02-module-chain.json", graph)

    graph = new_graph()
    builder = add(graph, "VividMuse_ZImageChinesePromptBuilder",
                  {"自由提示词": "holding a cup of tea", "拼接位置": "结构化模块在前"},
                  "English Output + English Free Text")
    connect(graph, builder, 3, add(graph, "PreviewAny"), "source")
    write("03-english-free-prompt.json", graph)

    graph = new_graph()
    canvas = add(graph, "VividMuse_ZImageCanvasModule")
    person = add(graph, "VividMuse_ZImageTxtModuleLibrary",
                 {"模块类型": "人物", "模块提示词": "一位30岁左右的东亚成年女性，短发，自然肤质"},
                 "TXT Person: replaces the Person node")
    connect(graph, canvas, 0, person, "前置提示词")
    camera = add(graph, "VividMuse_ZImageCameraModule")
    connect(graph, person, 0, camera, "前置提示词")
    connect(graph, camera, 0, add(graph, "PreviewAny"), "source")
    write("04-txt-module-replacement.json", graph)


if __name__ == "__main__":
    main()
