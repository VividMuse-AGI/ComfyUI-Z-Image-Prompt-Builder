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

## English

### Person / Outfit Cards and Module Locks

Available since v0.10.0. The package still contains 11 nodes, with no new dependencies or online services.

Right-click the full builder or a standard module and select **Person / Outfit Cards / Module Locks**. Choose **Person** or **Clothing**, enter a name, and use **Save Module**. **Follow Preset** becomes the current concrete preset value; **None** is preserved. Choose concrete options for unresolved **Random** fields before saving or locking.

**Apply Card** changes only its module. **Apply & Lock** also protects those fields from random buttons. Person cards contain 20 person fields, including physique and makeup, but not hair; outfit cards contain 21 clothing/accessory fields. Hair remains independent and can be locked separately. Fixed descriptions do not guarantee face identity.

Save the workflow to persist cards and locks. Export/import JSON to reuse a card in another full builder or its corresponding standalone module. Importing does not automatically apply the card. Each node can store 100 cards; names are limited to 80 characters and imported files to 1 MB. Replacing a card with the same type and name requires confirmation. Deleting a card does not clear current options.

The full builder supports whole-module locks for all eight standard modules; standalone nodes lock their own module. Existing field-level controls remain under **User Presets / Random Locks / Checks**. Locking resolves preset references to concrete values, so changing the execution seed does not reroll those fields. Manual edits, preset changes and explicit clearing remain available. Unlocking leaves current values unchanged; use a random button to enable random choices again.

Applying cards preserves the preset selector, current editing module, seed, resolution, output layout, framing mode, other modules and free text. Linked target inputs or a TXT replacement block capture/application/new locks rather than silently editing inactive controls. Unlocking remains available. Card JSON is not a workflow, identity model, reference image, or result-panel snapshot; these formats are not interchangeable.
