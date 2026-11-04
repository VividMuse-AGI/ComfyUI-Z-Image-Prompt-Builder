# 卡片快捷组合

从 v0.14.0 起，完整节点支持在一个面板中选择人物卡、穿搭卡和拍摄方案卡，预览后一次应用所选模块。

## 中文使用说明

在完整节点右键打开 **卡片管理 / 模块锁定**，点击 **卡片快捷组合**。独立模块节点不提供这个入口，继续使用各自的卡片操作。

### 选择与应用

1. 分别选择一张人物卡、穿搭卡和拍摄方案卡；不需要更换的类型保留 **保持当前**。没有卡片时，返回原卡片管理面板保存或导入。
2. 拍摄方案默认勾选其包含的场景、摄影和视觉表现，可取消不需要的模块。人物卡不包含发型，动作也不在本次应用范围内。
3. 为参与的模块选择锁定策略：**保留当前锁定**，或 **应用后锁定此模块**。前者不会解锁已有字段，后者在原锁定基础上增加所选模块字段。
4. 点击 **预览组合**，核对来源卡片、应用模块、变化字段和新增锁定。展开 **全部字段（含隐藏分支）** 可查看完整覆盖内容。
5. 点击 **确认应用**，然后保存工作流。选择与预览本身不会改变节点或运行生图；字段和锁都没有变化时无需应用。

**保持当前**表示不写入该类型；卡片字段中的 **不使用** 则会明确清空原字段，包括隐藏分支。不要把两者混淆。

### 保留范围与随机

只修改参与的人物、服装、场景、摄影、视觉表现模块。画面基础、发型、姿态动作、自由提示词、TXT 内容、比例、分辨率、种子、排版和当前编辑模块保持不变；不会操作其他节点。

显式应用仍可更新已锁定字段。卡片写入具体值，不是随机占位符。需要后续变化时，在原卡片管理面板解锁目标模块，再使用随机组合按钮；仅更改 Run 的种子不保证这些具体字段改变。

### 取消与异常

- 关闭或返回卡片管理会放弃未应用的选择；重开默认保持当前。刷新卡片列表也会重置选择和锁定策略，不自动应用新列表第一项。
- 改变任何组合选择或锁定策略后，需要重新预览。
- 预览后节点或来源卡片变化，确认会停止；重新核对再预览。卡片被重命名、删除或覆盖后，可先刷新卡片列表并重新选择。
- 任一参与模块存在连接输入或 TXT 替代时，整次应用停止，不会先修改其他模块。取消该模块或将对应卡片改为保持当前后，可继续应用剩余模块。
- 本功能复用现有组合检查提示，但不保证所有搭配都合理，也不会自动改写卡片。

卡片仍属于当前节点，协议与导入导出方式不变。没有新的组合卡库或自动保存的组合选择；如需复用整套节点状态，可使用现有用户预设。

## English

Since v0.14.0, the full builder can select Person, Outfit and Shoot Plan Cards in one panel, preview the differences, and apply selected modules in a single transaction.

On the full builder, open the context menu → **Cards / Module Locks** → **Quick Card Combination**. Standalone module nodes retain their existing card controls and do not offer this entry.

### Select and apply

1. Choose a Person Card, Outfit Card and Shoot Plan Card independently. Leave any unwanted type on **Keep Current**. If a library is empty, return to Cards to save or import cards.
2. A shoot plan initially checks all modules it contains. Uncheck any Scene, Camera or Visual modules you do not want to apply. Person cards exclude hair; pose is also outside this operation.
3. For each participating module, choose **Preserve Current Locks** or **Lock Module After Applying**. Preserving does not unlock anything; locking adds fields without removing existing locks.
4. Use **Preview Combination** to review source cards, module coverage, changed fields and added locks. Expand **All Fields (Including Hidden Branches)** for complete values.
5. Use **Confirm Apply**, then save the workflow. Selecting and previewing do not modify the node or generate images. If fields and locks are unchanged, there is nothing to apply.

**Keep Current** skips the card type. An **Unused** field inside a selected card explicitly clears its current value, including hidden branches. These actions are different.

### Preserved settings and randomness

Only the selected Person, Clothing, Scene, Camera and Visual modules change. Canvas, Hair, Pose, free text, TXT content, ratio, resolution, seed, output layout, current editor and other nodes remain unchanged.

Explicit application can update locked fields. Cards write concrete options, not random markers. To vary them later, unlock the modules in Cards / Module Locks and use the random combination button. Merely changing the execution seed does not guarantee changes to concrete options.

### Cancel and recover

- Closing or returning to Cards discards unapplied choices. Reopening or **Refresh Card Lists** resets choices to Keep Current and lock policies to Preserve Current Locks; the first card is not applied automatically.
- Changing any selection or lock policy requires a fresh preview.
- If node settings or source cards change after preview, confirmation stops. Preview again; after a rename, deletion or replacement, refresh the card lists and explicitly reselect.
- A connected input or TXT replacement in any participating module stops the entire application. Uncheck that module or set its card type to Keep Current before applying the remainder. Other selected modules are not partially applied.
- Existing combination checks provide warnings, not comprehensive styling guarantees or automatic card corrections.

Card ownership and portable formats are unchanged. There is no new combination library or persistent selection state. Existing user presets remain available for reusing the entire node configuration.
