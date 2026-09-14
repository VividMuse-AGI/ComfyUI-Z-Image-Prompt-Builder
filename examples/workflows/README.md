# 提示词工作流 / Prompt workflows

将 JSON 拖入 ComfyUI 后点击运行。需要本节点 v0.5.0 或更新版本以及 ComfyUI 内置 PreviewAny（预览任意）节点；不需要模型、采样器或 GPU 生图。

Drag a JSON file into ComfyUI and run it. These examples require v0.5.0 or later of this node pack and ComfyUI's built-in PreviewAny node. No generation model is required.

| 文件 / File | 用途 / Purpose |
| --- | --- |
| [01-full-builder.json](01-full-builder.json) | 完整预设与中文自由提示词 / Full builder with Chinese free text |
| [02-module-chain.json](02-module-chain.json) | 八个模块依次串联；Ctrl+B 可旁路 / Eight modules; Ctrl+B bypass |
| [03-english-free-prompt.json](03-english-free-prompt.json) | 第四输出口，英文自由文本放在末尾 / Fourth output, English free text appended |
| [04-txt-module-replacement.json](04-txt-module-replacement.json) | TXT 人物节点占据人物模块位置 / TXT node in place of the Person module |

第四套已预填人物片段，直接运行可观察替换结果。展开 TXT 模块词库可导入自己的文件；不要在上游再放一个启用的人物节点，否则两段人物描述都会保留。

The fourth example includes a person fragment. Expand its TXT module library to import your own file. Do not place another enabled Person node upstream, since both descriptions would be retained.

右键完整或标准模块节点可打开用户预设、随机锁定和组合检查面板。保存工作流才能持久保存命名预设；导出 JSON 可用于另一工作流。预设不保存外部连接或导入词库列表。

Right-click a full builder or standard module to open User Presets, Random Locks and Checks. Save the workflow to persist named presets; export JSON for another workflow. Presets exclude external connections and imported library lists.

示例只验证文本组合。生图时将预览前的字符串接入文本编码器，推荐宽高可接入对应尺寸输入。

For image generation, connect the prompt string to your text encoder and use the recommended dimensions where applicable.
