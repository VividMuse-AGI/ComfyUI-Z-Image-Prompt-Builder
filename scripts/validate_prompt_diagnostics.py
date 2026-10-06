"""CPU-only structured-prompt/UI-cache acceptance using a local ComfyUI checkout.

No server, queue requests, models, install writes or image generation.
"""
import argparse
import asyncio
import copy
import importlib.util
import inspect
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
    root = parser.parse_args().comfy_root.resolve()
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
    spec = importlib.util.spec_from_file_location("vividmuse_diagnostics_acceptance", repo / "__init__.py",
                                               submodule_search_locations=[str(repo)])
    package = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = package
    spec.loader.exec_module(package)
    host_nodes.NODE_CLASS_MAPPINGS.update(package.NODE_CLASS_MAPPINGS)

    class TextSink:
        @classmethod
        def INPUT_TYPES(cls):
            return {"required": {"zh": ("STRING", {"forceInput": True}),
                                 "en": ("STRING", {"forceInput": True})}}
        RETURN_TYPES = ()
        FUNCTION = "show"
        OUTPUT_NODE = True
        def show(self, zh, en):
            return {"ui": {"zh": [str(zh)], "en": [str(en)]}, "result": ()}

    host_nodes.NODE_CLASS_MAPPINGS["VividMuseDiagnosticsSink"] = TextSink
    events = []
    server = SimpleNamespace(client_id=None, last_node_id=None,
                             send_sync=lambda event, data, *rest: events.append((event, data)))
    executor = create_executor(execution, server)
    runs = 0

    def run(node_key, inputs):
        nonlocal runs
        runs += 1
        cls = package.NODE_CLASS_MAPPINGS[node_key]
        graph = {"1": {"class_type": node_key, "inputs": copy.deepcopy(inputs)},
                 "2": {"class_type": "VividMuseDiagnosticsSink", "inputs": {
                     "zh": ["1", 0], "en": ["1", len(cls.RETURN_TYPES) - 1]}}}
        prompt_id = f"diagnostics-text-{runs}"
        validation = asyncio.run(execution.validate_prompt(prompt_id, graph, None))
        assert validation[0], validation
        events.clear()
        executor.execute(graph, prompt_id, {"client_id": "isolated-test"}, ["2"])
        assert executor.success, executor.status_messages
        output = copy.deepcopy(executor.history_result["outputs"])
        data = output["1"]["vividmuse_prompt_diagnostics"][0]
        assert output["2"]["zh"] == [data["zh"]]
        assert output["2"]["en"] == [data["en"]]
        assert data["seed"] == str(inputs["随机种子"])
        assert "unique_id" not in data["settings"]
        actual = [detail for event, detail in events if event == "executed" and detail.get("node") == "1"]
        assert actual and actual[-1]["prompt_id"] == prompt_id
        return data, copy.deepcopy(events)

    full = "VividMuse_ZImageChinesePromptBuilder"
    core = sys.modules[spec.name + ".nodes"]
    modules = sys.modules[spec.name + ".modular_nodes"]
    for key, cls in package.NODE_CLASS_MAPPINGS.items():
        if key != full and not issubclass(cls, modules.ZImageModuleNodeBase):
            continue
        required = cls.INPUT_TYPES()["required"]
        inputs = {name: schema[1].get("default", schema[0][0]) if len(schema) > 1 else schema[0][0]
                  for name, schema in required.items() if schema[0] != "INT"}
        inputs["随机种子"] = 123
        inputs["输出排版"] = "按模块分段"
        group = core.FIELD_ORDER if key == full else modules.MODULE_FIELD_GROUPS[cls.MODULE_NAME]
        inputs.update(dict.fromkeys(group, core.RANDOM_CHOICE))
        first, _ = run(key, inputs)
        cached, replay = run(key, inputs)
        assert first == cached
        assert any(event == "execution_cached" and "1" in detail["nodes"] for event, detail in replay)
        inputs["随机种子"] = 124
        changed, _ = run(key, inputs)
        assert changed["seed"] == "124"

    fixed_inputs = {name: schema[1].get("default", schema[0][0]) if len(schema) > 1 else schema[0][0]
                    for name, schema in core.ZImageChinesePromptBuilder.INPUT_TYPES()["required"].items()
                    if schema[0] != "INT"}
    fixed_inputs.update({"随机种子": 9, "自由提示词": "custom\ntext"})
    first, _ = run(full, fixed_inputs)
    fixed_inputs["随机种子"] = 10
    second, _ = run(full, fixed_inputs)
    assert not first["random_fields"] and first["zh"] == second["zh"]
    fixed_inputs.update({"发色": core.RANDOM_CHOICE, "用户发型片段": "用户头发"})
    replaced, _ = run(full, fixed_inputs)
    assert replaced["random_fields"][0]["status"] == "user_replaced"
    assert "用户头发" in replaced["zh"] and "custom\ntext" in replaced["zh"]
    print(f"PASS: {runs} CPU-only ComfyUI executions; 9 structured nodes, hidden ID, exact UI/output parity, "
          "actual seed, cache replay, random off, free text and user replacement.")


if __name__ == "__main__":
    main()
