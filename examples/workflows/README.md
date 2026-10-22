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

## 查找条目并应用 / Find and apply an entry

v0.9.0 示例：完整节点切换到“姿态动作”，打开“素材搜索与收藏”，输入“剪刀手”。选择“手部动作 · 比耶手势”查看预览，再点击“应用所选条目”。别名只帮助检索，保存的仍是原选项；切换到没有条目的 TXT 模块时显示空列表，不会改用其他模块。

v0.9.0 example: select **Pose & Action** in the full builder, open **Search & Favorites**, and search for **victory sign**. Select the matching hand gesture, review its preview, then choose **Apply Selected Entry**. Aliases never replace canonical option values. A TXT module without entries stays empty instead of showing another module's content.

## 保存一次实际结果 / Save an actual result

当前开发版：将需要变化的字段设为“随机抽取”，运行两次纯文本工作流。打开“随机状态与执行结果”，在“选择执行记录”中切换两次结果，检查正文及实际种子；可复制中英文或“导出此结果”。即使当前种子已自动变化，导出仍对应所选执行。面板打开后再次运行，需要关闭重开以刷新。

Development version: set the desired fields to **Random**, then run a text-only workflow twice. Open the execution-result panel, switch records with **Select Execution Record**, and check their actual text and seeds. Copy either language or choose **Export This Result**. Export uses the selected execution even if the editor has advanced to its next seed. Close and reopen the panel after another run.

| 保存方式 / Save action | 保存什么 / Contents | 不是 / Does not contain |
| --- | --- | --- |
| 导出收藏 / Export Favorites | 条目引用 / Entry references | TXT 正文 / TXT bodies |
| 导出此结果 / Export This Result | 本次实际正文、种子和解析信息 / Actual text, seed and resolved data | 可执行工作流、上游图 / Executable or upstream workflow |
| 保存用户预设 / Save User Preset | 控件设置，随机字段仍为随机 / Widget settings, including Random selections | 已抽取结果的自动固定 / Automatically frozen random draws |
