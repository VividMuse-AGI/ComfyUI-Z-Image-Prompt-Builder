"""Opt-in CPU-only text/cache integration against a local ComfyUI checkout.

Run with that installation's Python. No server, queue requests, models, or install writes.
"""
import argparse
import asyncio
import copy
import importlib.util
import inspect
import json
from pathlib import Path
import sys
from types import SimpleNamespace


def create_executor(execution, server):
    """Use only constructor options supported by the isolated host version."""
    options = {"cache_type": execution.CacheType.CLASSIC,
               "cache_args": {"ram": 0, "ram_inactive": 0}}
    if "asset_manager" in inspect.signature(execution.PromptExecutor).parameters:
        options["asset_manager"] = SimpleNamespace(enabled=False)
    return execution.PromptExecutor(server, **options)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--comfy-root", type=Path, required=True)
    args = parser.parse_args()
    root = args.comfy_root.resolve()
    if not (root / "execution.py").is_file():
        raise ValueError("Expected a ComfyUI checkout")
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root))
    sys.argv = [sys.argv[0], "--cpu"]
    import comfy.options
    comfy.options.enable_args_parsing()
    import nodes as host_nodes
    import execution
    repo = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location("vividmuse_text_acceptance", repo / "__init__.py",
                                               submodule_search_locations=[str(repo)])
    package = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = package
    spec.loader.exec_module(package)
    host_nodes.NODE_CLASS_MAPPINGS.update(package.NODE_CLASS_MAPPINGS)

    class TextSink:
        @classmethod
        def INPUT_TYPES(cls):
            return {"required": {"text": ("STRING", {"forceInput": True})}}
        RETURN_TYPES = ()
        FUNCTION = "show"
        OUTPUT_NODE = True
        def show(self, text):
            return {"ui": {"text": [str(text)]}, "result": ()}

    host_nodes.NODE_CLASS_MAPPINGS["VividMuseTestTextSink"] = TextSink
    events = []
    server = SimpleNamespace(client_id=None, last_node_id=None,
                             send_sync=lambda event, data, *rest: events.append((event, data)))
    executor = create_executor(execution, server)

    def run(inputs, kind="prompt"):
        graph = {"1": {"class_type": "VividMuse_ZImageTxtPromptLibrary" if kind == "prompt"
                       else "VividMuse_ZImageTxtModuleLibrary", "inputs": copy.deepcopy(inputs)},
                 "2": {"class_type": "VividMuseTestTextSink", "inputs": {"text": ["1", 0]}}}
        events.clear()
        validation = asyncio.run(execution.validate_prompt("txt-only-acceptance", graph, None))
        assert validation[0], validation
        executor.execute(graph, "txt-only-acceptance", {"client_id": "isolated-test"}, ["2"])
        assert executor.success, executor.status_messages
        output = copy.deepcopy(executor.history_result["outputs"])
        replay = [(e, copy.deepcopy(d)) for e, d in events]
        return output, replay

    def library(text, kind="prompt", module=None):
        item = {"title": "title", "prompt": text, "tags": []}
        if module:
            item["module"] = module
        return json.dumps({"version": 1, "kind": kind, "entries": [item]})

    inputs = {"自由提示词": "manual", "拼接位置": "前置提示词在前", "选择模式": "随机抽取",
              "随机种子": 9, "词库数据": library("one"), "前置提示词": "prefix", "输出排版": "按模块分段"}
    first, _ = run(inputs)
    cached, events_copy = run(inputs)
    assert cached == first
    assert any(e == "execution_cached" and "1" in d["nodes"] for e, d in events_copy)
    assert any(e == "executed" and d.get("node") == "1" for e, d in events_copy), "Missing cached TXT UI replay"
    inputs["随机种子"] = 10
    changed, _ = run(inputs)
    assert changed["1"]["vividmuse_txt_selection"][0]["seed"] == "10"
    inputs["词库数据"] = library("two")
    changed, _ = run(inputs)
    assert "two" in changed["2"]["text"][0]
    inputs["词库数据"] = ""
    empty, _ = run(inputs)
    assert empty["2"]["text"] == ["prefix"]
    inputs["选择模式"] = "手动选择"
    manual, _ = run(inputs)
    assert "manual" in manual["2"]["text"][0]
    inputs = {"模块类型": "人物", "模块提示词": "manual", "拼接位置": "前置提示词在前",
              "选择模式": "随机抽取", "词库数据": library("person", "module", "人物"), "随机种子": 0}
    person, _ = run(inputs, "module")
    assert "person" in person["2"]["text"][0]
    module_cached, _ = run(inputs, "module")
    assert module_cached == person
    inputs["模块类型"] = "摄影"
    missing, _ = run(inputs, "module")
    assert missing["2"]["text"] == [""]
    print("PASS: 9 CPU-only ComfyUI executions; cache UI replay, seed/library/mode/module invalidation, empty scope.")


if __name__ == "__main__":
    main()
