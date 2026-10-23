# TXT 随机抽取结果复制与导出

从 v0.11.0 起提供。适用于 **TXT 提示词库** 和 **TXT 模块词库** 两个独立节点，不改变随机算法或输出端口。

## 使用

1. 导入词库，选择“随机抽取”，运行一次。
2. 点击节点原有的“上次随机结果（点击查看）”。
3. “复制抽中正文”只复制抽中的条目正文，保留换行；不附加标题、种子或前置提示词。
4. “导出抽取记录”下载 `vividmuse-txt-selection-result.json`，包含正文、标题、实际执行种子、模块和候选信息。

这是**历史随机抽取记录**，不是当前手动草稿，也不是上游拼接后的最终提示词。打开时冻结内容；有新结果时关闭重开才能查看最新记录。更改种子不保证抽中不同条目。

- 没有执行记录，或无法确认结果属于当前节点：不允许复制／导出，请在当前工作流重新执行。
- 当前范围没有候选：复制不可用，但可以导出空结果诊断。
- 复制失败：选中面板正文手动复制。下载提示仅表示已请求浏览器下载。
- 记录只保留在当前会话，不存入工作流；刷新或重新加载后需要再次执行。词库和手动草稿仍随工作流保存。

JSON 的种子是字符串，避免大整数精度损失；`index` 是原词库从 0 开始的位置，可能大于当前模块的候选数量。文件不包含完整词库、上游工作流、手动草稿、卡片或锁定状态，不能作为工作流或卡片导入。

## English

Available since v0.11.0 on the standalone **TXT Prompt Library** and **TXT Module Library** nodes.

Import a library, select **Random Selection**, run it, then click **Last Random Result (Click to View)**. **Copy Selected Text** copies only the selected entry, preserving its line breaks. **Export Selection Record** downloads `vividmuse-txt-selection-result.json` with the actual execution seed and selection metadata.

The panel shows a **historical random selection**, not the current manual draft or combined upstream output. Its content is frozen when opened; close and reopen it for a newer result. Different seeds can select the same entry.

No record or an unconfirmed source disables copying and export. An empty candidate scope disables copying but allows an empty diagnostic export. If copying fails, select and copy the text manually. A download message confirms a browser download request, not where the file was saved.

Session records are not saved in workflows; run again after reload. Libraries and manual drafts remain workflow data. Seeds are decimal strings, and `index` is the zero-based position in the original library, not the filtered candidate list. The JSON contains neither the full library nor preceding prompts, workflows, cards, locks or manual drafts. It is not an importable workflow or content card.
