# 拍摄方案卡 / Shoot Plan Cards

从 v0.12.0 起提供。保留 11 个节点，不增加依赖或在线服务。更新安装后请重启 ComfyUI，并刷新或重新打开页面。

## 中文使用说明

拍摄方案卡用于保存和复用“场景、摄影、视觉表现”中的一个或多个模块。它不是整个节点的用户预设，也不会保证生成完全一致的图片。

### 入口

在完整节点，或场景、摄影、视觉表现独立节点上，打开右键菜单 **卡片管理 / 模块锁定**，然后点击 **拍摄方案卡（场景 / 摄影 / 视觉表现）**。

不新增节点或常驻控件。人物卡、穿搭卡和原模块锁定功能仍保留在原面板中。

### 保存

1. 在节点中配置好要保存的模块。
2. 在拍摄方案卡面板填写名称，勾选可保存模块；可展开查看待保存字段。
3. 点击“保存为拍摄方案卡”，然后保存工作流。

“跟随预设”会保存为当前预设对应的具体值。随机字段需要先手动选择具体选项，或执行后从结果保存。全部为“不使用”、被 TXT 替换或有已连接输入的模块，会显示不可保存原因。

保存只增加卡片，不会应用或锁定。卡片属于当前节点，随工作流保存，不是浏览器全局共享库。最多保存 100 张拍摄方案卡，与原人物／穿搭卡的额度分别计数。

### 从指定执行结果保存

运行节点后，点击“随机状态与执行结果”入口，在实际执行结果面板选择所需记录，勾选可保存的场景／摄影／视觉表现，点击“保存为拍摄方案卡”，核对字段并命名，最后确认保存。

- 保存的是选中那次执行的实际字段，不是当前控件；种子改了也不会替换历史记录。
- 面板保留打开时的记录快照；查看后来执行的记录需要重新打开面板。
- 当前控件已连接或被 TXT 覆盖，不妨碍保存历史内置结果；但之后应用仍检查当前连接和替换状态。
- TXT 替代、无输出、缺字段或场景分类与地点不一致的模块不可保存，并显示原因；其他有效模块仍可勾选。
- 老记录没有拍摄方案候选数据时需要重新执行，不会用当前控件补填。
- 字段可能包含因景别而未写入正文的内容；卡片保存完整字段，不保证换景别后正文不变。

### JSON 单卡与卡片包

在拍摄方案卡面板中使用“导出选中卡片”“导出卡片包”或“导入卡片或卡片包”。

- 单文件上限 **1 MiB（1,048,576 字节）**；卡片包包含 1—100 张卡片。
- 导入先校验整个文件，再显示新增、覆盖、跳过同名和不适用数量。默认跳过同名；覆盖需明确确认。
- 文件中任何卡片无效都会拒绝整个文件，包括在当前节点不适用的卡片，不会留下部分导入结果。
- 独立模块节点接收至少包含自身模块的卡片，并保留其中其他模块；导出不会把组合卡裁剪成单模块。
- 导入只加入卡片库，不应用字段、不新增锁定；导入后请保存工作流。
- 卡片库在预览之后变化，需要重新预览确认。导出包可勾选卡片，不一定要导出全部。
- 拍摄方案卡与原人物／穿搭卡协议分开，不能混装。结果面板的“导出此结果”是只读结果快照，不是可导入的卡片或工作流。

单卡结构示例（字段与选项必须使用规范中文名，英文界面也一样）：

```json
{
  "kind": "vividmuse-shoot-plan-card",
  "version": 1,
  "name": "85mm 人像机位",
  "modules": {
    "摄影": {
      "景别": "三分之二身",
      "画面布局": "中央偏左",
      "等效焦段": "85mm",
      "拍摄距离": "2米",
      "机位": "平视",
      "景深": "浅景深",
      "对焦位置": "双眼与面部"
    }
  }
}
```

卡片包使用 `kind: vividmuse-shoot-plan-card-pack`、`version: 1`、`cards: [单卡对象…]`。建议通过节点导出生成，不手写遗漏字段的对象。

### 应用

选择已保存卡片，勾选需要应用的模块，核对差异后选择：

- **应用所选模块**：覆盖这些模块的全部字段，已有随机锁定不变。
- **应用并锁定**：覆盖这些模块，并将其全部字段加入随机锁定，其他锁定不变。

字段“不使用”会明确清空原字段；未勾选模块保持不变。已有锁定不会阻止手动应用卡片，但会继续阻止随机按钮修改这些字段。

任一所选模块有连接或 TXT 替换时，整次应用都会停止；可取消勾选该模块后重试。预览后如果配置或卡片发生变化，需要重新核对预览并再次确认。

只应用本节点拥有的模块。独立节点不会改动其他节点；如果工作流中的卡片包含其他模块，仍保留完整卡片数据，但不能在该节点应用这些模块。

### 不受影响的内容

人物、发型、服装、姿态动作、自由提示词、TXT 内容、画面基础（含媒介和主题）、比例、分辨率、种子、随机范围和输出排版不会被拍摄方案卡覆盖。

灯光属于“视觉表现”，不是“摄影”。需要保存灯光时，请同时勾选视觉表现。

“仅启用当前模块”是通过清空其他模块实现的。显式应用另一个模块后，节点会增加有效内容，后续随机范围可能不再局限于原先的模块；面板会提示这种变化。

当前不提供批量生图、图片封面或云同步；已有的人物卡／穿搭卡导入导出不受影响。

## English

Available since v0.12.0. The package retains 11 nodes with no new dependencies or online services. After updating, restart ComfyUI and refresh or reopen the page.

Shoot plan cards reuse one or more complete **Scene, Camera and Visual** modules. They are not whole-node presets and do not guarantee identical generated images.

### Open and save

On the full builder or the Scene, Camera or Visual module node, open the context menu **Cards / Module Locks**, then choose **Shoot Plan Cards (Scene / Camera / Visual)**.

Enter a name, check saveable modules, review the optional field summary, and save the card. Save the workflow to retain it. Cards are stored in this node, not in a browser-wide shared library. The limit is 100 shoot plan cards, separate from the existing person/outfit card allowance.

Follow Preset is captured as concrete values. Choose concrete values before saving unresolved Random fields. Entirely unused modules, linked inputs and TXT replacements show a reason instead of silently capturing unused controls. Saving does not apply or lock the card.

### Save a selected execution result

After running the node, open its random status / actual execution result panel. Select a record, check saveable Scene, Camera and Visual modules, then use **Save as Shoot Plan Card**, review the fields, enter a name and confirm.

The card uses the selected execution, never current editor values. The panel is an opening-time snapshot; reopen it for later runs. Current links or TXT replacements do not prevent saving a historical built-in result, but applying the card still checks the current target.

TXT-replaced modules, empty output, incomplete fields and incompatible scene category/location pairs show explicit reasons and cannot be saved. Other valid modules remain selectable. Older records without candidate metadata require another execution. Complete captured fields may include values omitted from the rendered text by framing.

### JSON cards and packs

Use **Export Selected Card**, **Export Card Pack**, or **Import Card or Pack** in the shoot plan panel.

- Maximum file size: **1 MiB (1,048,576 bytes)**. A pack contains 1–100 cards.
- Import validates the entire file, then previews new, replaced, skipped and inapplicable cards. Same-name conflicts default to Skip; replacement requires confirmation.
- A malformed card rejects the entire file, even if that card is inapplicable to this node. No partial import is performed.
- Standalone nodes accept cards containing their own module, retain all modules, and export the complete card without projection or data loss.
- Import only adds cards; it does not apply fields or locks. Save the workflow afterward. If the collection changes after preview, review and confirm again.
- Pack export allows card selection. Shoot plan cards cannot be mixed with old person/outfit cards. **Export This Result** produces a read-only result snapshot, not an importable card or workflow.

The portable single-card protocol uses `kind: vividmuse-shoot-plan-card`, `version: 1`, `name`, and `modules` containing complete canonical module field maps. Packs use `kind: vividmuse-shoot-plan-card-pack`, `version: 1`, and `cards`. Canonical keys and values remain Chinese regardless of display language. Prefer exporting from the node instead of hand-authoring incomplete field maps.

### Apply

Select a card, check the modules to apply and review the differences:

- **Apply Selected Modules** replaces complete selected modules without changing existing locks.
- **Apply & Lock** also adds those fields to random locks, preserving other locks.

Unused values explicitly clear their fields. Unselected modules remain unchanged. Locks prevent random-button changes, not explicit card application.

Any blocked selected module prevents the entire application. Uncheck it to proceed with other modules. If settings or the card change after preview, review the refreshed differences and confirm again.

Standalone nodes apply only their own module. Other modules inside a card are preserved but are not applied by that node. No other graph nodes are changed.

Person, hair, clothing, pose, free text, TXT content, canvas settings (including medium/theme), ratio, resolution, seed, random scope and output layout remain unchanged. Lighting belongs to **Visual**, not Camera.

Applying content to an additional module can change the effective scope after using “Only Enable Current Module”. The preview warns about this; card application does not clear other modules.

Existing person/outfit card import/export remains available. No batch image generation, image covers or cloud sync is added.
