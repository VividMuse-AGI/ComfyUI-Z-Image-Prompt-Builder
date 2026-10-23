# 人物卡／穿搭卡与模块锁定

从 v0.10.0 起提供。节点总数仍为 11 个，无新增依赖或在线服务。

## 使用方法

1. 在完整节点或八个标准模块节点上右键，选择 **人物卡 / 穿搭卡 / 模块锁定**。
2. 选择人物或服装，输入名称，点击 **保存当前模块**。卡片是具体字段的快照；“跟随预设”自动转换为当前预设值，“不使用”保留。包含“随机抽取”时需先改成具体选项。
3. 选择已保存卡片，点击 **应用卡片**，只替换该模块；也可选择 **应用并锁定**，之后随机按钮会跳过这些字段。
4. 人物卡包含年龄、族裔、五官、肤色、身形和妆容的 20 个字段。穿搭卡包含服装、鞋袜和配件的 21 个字段。发型仍独立，可单独锁定发型模块。
5. 保存 ComfyUI 工作流，卡片和锁定状态一并保留。跨工作流复用可导出卡片 JSON，再到完整节点或对应独立模块导入；导入后需主动点击应用。

每个节点最多保存 100 张卡片，名称最多 80 字符，导入文件不超过 1 MB。同类型同名卡片覆盖前需要确认。删除卡片不会清空当前人物或服装。

## 锁定的含义

- 完整节点支持八个标准模块整组锁定；独立模块只能锁定自身。原“用户预设 / 随机锁定 / 组合检查”面板仍提供字段级锁定。
- 锁定将预设引用落实为具体值；Run 更改种子不会重新抽取这些具体字段，随机按钮也跳过它们。
- 锁定不是禁止编辑。手动改值、切换整套预设、清空仍然有效。解锁只解除随机保护，不会立即随机或恢复预设引用。
- 卡片应用不会更改当前编辑模块、预设选择、种子、分辨率、排版、构图适配、其他模块或自由提示词。
- 如果目标字段已连接输入，或对应用户模块片段被 TXT 替换，请先处理这些输入来源，再捕获、应用或新增锁定。不会静默改写被覆盖的内置字段。解锁不受这一限制。
- 固定描述不保证生成同一张脸；卡片不包含身份模型、参考图或生图工作流。它与结果面板导出的内容快照是不同格式，不能混用。

## v0.11.0：结果复用与卡片管理增强

以下功能从 v0.11.0 起提供：

- 在完整节点或对应独立模块的“实际执行结果”面板中选择一次记录，再点“保存为人物卡”或“保存为穿搭卡”。保存的是这次执行已经解析的规范字段，不是当前编辑器的新值，也不会再次随机；构图适配省略的画外字段仍保留在卡片候选中。保存不自动应用或锁定，需要保存工作流才能持久保留。
- TXT／用户片段替代、空模块、字段缺失或不支持的旧记录不能转成结构化卡片；界面会给出原因，不从文本猜测字段。同类型同名仍需覆盖确认。

- 用模块下拉框筛选人物／服装，再按名称搜索；英文搜索不区分大小写，卡片身份仍按“模块＋原名称”区分。
- 选中卡片，在“卡片名称”输入新名称后点“重命名”。同模块同名需要确认；确认后以原卡内容替换目标，不修改当前模块字段。
- 应用前默认显示变化字段，隐藏分支可展开“全部字段”查看。“跟随预设”“随机抽取”不会在预览时被随机解析。当前设置变化后，需核对刷新后的差异再应用。
- “导出卡片包”默认勾选本节点支持的全部卡片，不受搜索影响，可取消部分勾选。零勾选不能导出。
- “导入卡片包”先完整验证，再预览新增、同名、覆盖、跳过和不适用项。默认跳过同名，覆盖需要确认；任何非法卡片使整包拒绝，不做部分导入。独立模块跳过合法但不适用的另一类卡片。
- 导入只更新卡片库，不自动应用或锁定。最终容量仍为 100 张；覆盖不占新名额。单文件最多 1,048,576 字节，名称最多 80 个 JavaScript UTF-16 单位（多数常用汉字计 1，常见 emoji 计 2）。

包格式为 `{"kind":"vividmuse-content-card-pack","version":1,"cards":[完整的 v1 单卡对象]}`。已有单卡导入导出仍可用；包不能用于旧版的单卡入口，也不是结果快照或工作流。

## English

### Person / Outfit Cards and Module Locks

Available since v0.10.0. The package still contains 11 nodes, with no new dependencies or online services.

Right-click the full builder or a standard module and select **Person / Outfit Cards / Module Locks**. Choose **Person** or **Clothing**, enter a name, and use **Save Module**. **Follow Preset** becomes the current concrete preset value; **None** is preserved. Choose concrete options for unresolved **Random** fields before saving or locking.

**Apply Card** changes only its module. **Apply & Lock** also protects those fields from random buttons. Person cards contain 20 person fields, including physique and makeup, but not hair; outfit cards contain 21 clothing/accessory fields. Hair remains independent and can be locked separately. Fixed descriptions do not guarantee face identity.

Save the workflow to persist cards and locks. Export/import JSON to reuse a card in another full builder or its corresponding standalone module. Importing does not automatically apply the card. Each node can store 100 cards; names are limited to 80 characters and imported files to 1 MB. Replacing a card with the same type and name requires confirmation. Deleting a card does not clear current options.

The full builder supports whole-module locks for all eight standard modules; standalone nodes lock their own module. Existing field-level controls remain under **User Presets / Random Locks / Checks**. Locking resolves preset references to concrete values, so changing the execution seed does not reroll those fields. Manual edits, preset changes and explicit clearing remain available. Unlocking leaves current values unchanged; use a random button to enable random choices again.

Applying cards preserves the preset selector, current editing module, seed, resolution, output layout, framing mode, other modules and free text. Linked target inputs or a TXT replacement block capture/application/new locks rather than silently editing inactive controls. Unlocking remains available. Card JSON is not a workflow, identity model, reference image, or result-panel snapshot; these formats are not interchangeable.

### v0.11.0: result reuse and card management

The following additions are available since v0.11.0.

In **Actual Execution Results**, select a record and choose **Save as Person Card** or **Save as Outfit Card** on the full builder or the corresponding standalone module. Cards capture that execution's resolved canonical fields, not subsequently edited controls, and never reroll randomness. Card candidates retain fields omitted from the rendered prompt by framing adaptation. Saving a card does not apply or lock it; save the workflow to persist it.

TXT/user replacements, empty modules, incomplete fields and unsupported older records cannot become structured cards. The interface explains the reason instead of guessing fields from text. Replacing the same module/name still requires confirmation.

Filter by module and search names (case-insensitive search; exact module/name identity). To rename, select a card, enter its new name in **Card name**, and click **Rename**. Replacing the same module/name requires confirmation and preserves the source card's values, not the overwritten target's values.

Review changes before applying. Expand **All fields** to inspect hidden branches. The preview preserves Follow Preset/Random markers and does not execute randomness. If current settings changed, review the refreshed preview and apply again.

**Export Card Pack** initially selects all supported cards in the node, independent of search; uncheck unwanted cards. **Import Card Pack** validates the entire file and previews additions, conflicts, replacements, skips and inapplicable cards. Skipping existing names is the default; replacing requires confirmation. One invalid card rejects the entire pack, including an invalid card for an unsupported target module. Legal inapplicable cards are skipped in standalone nodes. Importing never applies or locks cards automatically.

The pack format is `{"kind":"vividmuse-content-card-pack","version":1,"cards":[complete v1 card objects]}`. It allows 1–100 cards; the resulting node library cannot exceed 100. Files are limited to 1,048,576 bytes and names to 80 JavaScript UTF-16 code units. Existing single-card imports/exports remain supported; packs are not compatible with the old single-card import entry or result/workflow formats.
