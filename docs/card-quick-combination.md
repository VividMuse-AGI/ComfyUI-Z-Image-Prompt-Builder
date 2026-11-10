# 卡片快捷组合

从 v0.14.0 起，完整节点支持在一个面板中选择人物卡、穿搭卡和拍摄方案卡，预览后一次应用所选模块。

v0.15.0 增加发型卡、姿态动作卡，下文按五类卡片说明。v0.14.0 仅支持人物、穿搭、拍摄方案三种卡片。

## 中文使用说明

v0.16.0：每个选择器下方显示只读卡片内容，选择“保持当前”时显示该模块不修改。拍摄方案摘要区分包含模块和本次勾选模块；刷新列表会清除选择和旧摘要。内容摘要不会替代“预览组合”的应用差异，也不触发随机或撤销历史。要复用整个节点配置，使用用户预设；本版不新增“保存组合”格式。

v0.16.0: each selector has a read-only contents summary. **Keep Current** means no change. Shoot-plan contents distinguish included modules from those checked for this application; refreshing lists clears selections and stale summaries. Contents do not replace **Preview Combination**, reroll randomness or create undo history. Use User Presets to reuse the complete node configuration; this version does not introduce a saved-combination format.

在完整节点右键打开 **我的预设与卡片 → 组合应用**。独立模块节点不提供这个页签，继续使用各自的卡片操作。

### 选择与应用

1. 在“人物与造型”中分别选择人物卡、发型卡、穿搭卡、姿态动作卡，再按需选择拍摄方案卡；不需要更换的类型保留 **保持当前**。没有卡片时，返回原卡片管理面板保存或导入。
2. 拍摄方案默认勾选其包含的场景、摄影和视觉表现，可取消不需要的模块。人物卡不包含发型；发型和姿态动作仅在明确选择对应卡片时应用。
3. 为参与的模块选择锁定策略：**保留当前锁定**，或 **应用后锁定此模块**。前者不会解锁已有字段，后者在原锁定基础上增加所选模块字段。
4. 点击 **预览组合**，核对来源卡片、应用模块、变化字段和新增锁定。展开 **全部字段（含隐藏分支）** 可查看完整覆盖内容。
5. 点击 **确认应用**，然后保存工作流。选择与预览本身不会改变节点或运行生图；字段和锁都没有变化时无需应用。

**保持当前**表示不写入该类型；卡片字段中的 **不使用** 则会明确清空原字段，包括隐藏分支。不要把两者混淆。

### 保留范围与随机

最多修改参与的人物、发型、服装、姿态动作、场景、摄影、视觉表现七个模块。未选择的模块，以及画面基础、自由提示词、TXT 内容、比例、分辨率、种子、排版和当前编辑模块保持不变；不会操作其他节点。

预览标出隐藏字段，全“不使用”的卡片会提示清空对应模块。动作依赖的座椅、墙面或道具不会自动加入场景，请自行匹配。

显式应用仍可更新已锁定字段。卡片写入具体值，不是随机占位符。需要后续变化时，在右键“随机设置与检查”解锁目标模块，再用“设置随机组合”；仅更改 Run 的种子不保证这些具体字段改变。

### 取消与异常

- 关闭或返回卡片管理会放弃未应用的选择；重开默认保持当前。刷新卡片列表也会重置选择和锁定策略，不自动应用新列表第一项。
- 改变任何组合选择或锁定策略后，需要重新预览。
- 预览后节点或来源卡片变化，确认会停止；重新核对再预览。卡片被重命名、删除或覆盖后，可先刷新卡片列表并重新选择。
- 任一参与模块存在连接输入或 TXT 替代时，整次应用停止，不会先修改其他模块。取消该模块或将对应卡片改为保持当前后，可继续应用剩余模块。
- 本功能复用现有组合检查提示，但不保证所有搭配都合理，也不会自动改写卡片。

卡片仍属于当前节点，格式结构和导入导出入口不变；新增类型不兼容旧版校验器，升级／降级见[内容卡兼容说明](content-cards.md)。没有新的组合卡库或自动保存的组合选择；如需复用整套节点状态，可使用现有用户预设。

## English

Since v0.14.0, the full builder can select Person, Outfit and Shoot Plan Cards in one panel, preview the differences, and apply selected modules in a single transaction.

Version v0.15.0 adds Hair and Pose / Action Cards. The instructions below describe all five types; v0.14.0 supports only Person, Outfit and Shoot Plan Cards.

On the full builder, open **My Presets & Cards → Apply Combination**. Standalone module nodes retain their card controls and do not offer this tab.

### Select and apply

1. Under **Subject and Styling**, independently choose Person, Hair, Outfit and Pose / Action Cards, then optionally a Shoot Plan Card. Leave any unwanted type on **Keep Current**. If a library is empty, return to Cards to save or import cards.
2. A shoot plan initially checks all modules it contains. Uncheck any Scene, Camera or Visual modules you do not want to apply. Person cards exclude hair; Hair and Pose only change when their cards are explicitly selected.
3. For each participating module, choose **Preserve Current Locks** or **Lock Module After Applying**. Preserving does not unlock anything; locking adds fields without removing existing locks.
4. Use **Preview Combination** to review source cards, module coverage, changed fields and added locks. Expand **All Fields (Including Hidden Branches)** for complete values.
5. Use **Confirm Apply**, then save the workflow. Selecting and previewing do not modify the node or generate images. If fields and locks are unchanged, there is nothing to apply.

**Keep Current** skips the card type. An **Unused** field inside a selected card explicitly clears its current value, including hidden branches. These actions are different.

### Preserved settings and randomness

Only selected modules change, up to seven: Person, Hair, Clothing, Pose / Action, Scene, Camera and Visual. Unselected modules, Canvas, free text, TXT content, ratio, resolution, seed, output layout, current editor and other nodes remain unchanged.

Previews label hidden fields and warn if an all-Unused card will clear a module. Seating, walls or props required by a pose are not automatically added to the scene; match them yourself.

Explicit application can update locked fields. Cards write concrete options, not random markers. To vary them later, unlock modules in **Random Settings & Checks**, then use **Set Up Random Combination**. Merely changing the execution seed does not guarantee changes to concrete options.

### Cancel and recover

- Closing or returning to Cards discards unapplied choices. Reopening or **Refresh Card Lists** resets choices to Keep Current and lock policies to Preserve Current Locks; the first card is not applied automatically.
- Changing any selection or lock policy requires a fresh preview.
- If node settings or source cards change after preview, confirmation stops. Preview again; after a rename, deletion or replacement, refresh the card lists and explicitly reselect.
- A connected input or TXT replacement in any participating module stops the entire application. Uncheck that module or set its card type to Keep Current before applying the remainder. Other selected modules are not partially applied.
- Existing combination checks provide warnings, not comprehensive styling guarantees or automatic card corrections.

Card ownership, format structure and import/export entries are unchanged, but older versions do not support the new types. See [content-card compatibility](content-cards.md#english) before upgrading or downgrading. There is no new combination library or persistent selection state. Existing user presets remain available for reusing the entire node configuration.
