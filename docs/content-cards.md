# 人物／发型／穿搭／姿态动作卡与模块锁定

版本说明：v0.15.0 新增发型卡、姿态动作卡；v0.14.0 仅支持人物／穿搭内容卡及拍摄方案卡。

从 v0.10.0 起提供。节点总数仍为 11 个，无新增依赖或在线服务。

v0.12.0 另提供[拍摄方案卡](shoot-plan-cards.md)，用于场景／摄影／视觉表现组合；它与人物／穿搭卡分开计数、分开导入，旧卡片格式不变。

从 v0.14.0 起提供[卡片快捷组合](card-quick-combination.md)，v0.15.0 扩展为人物、发型、穿搭、姿态动作和拍摄方案五类卡片；可按模块选择保留当前内容和锁定策略，一次撤销或重做整次应用。

## 使用方法

当前结果入口为“查看结果 → 保存为卡片”（展开）；卡片管理中的导入、导出、重命名、删除位于“管理…”。模块卡片、整套预设和组合应用在同一管理弹窗的页签中切换。

Current result entry: **View Results → Save as Card** (expand). Card imports, exports, rename and delete are under **Manage…**. Module cards, whole presets and combination application use tabs in the same manager.

### v0.16.0：导入指引与内容摘要

选择卡片后，选择器下方显示只读“卡片内容”：最多五项主要有效字段，清空值和隐藏分支另行提示。即使当前字段与卡片一致，摘要仍显示卡片内容。摘要不是完整字段列表，也不是“应用差异”；省略不表示保持原值，请在应用前查看全部字段。

导入时会区分入口选错、JSON 损坏、超过 1 MiB、版本不支持和结构校验失败。已知错误类型只提示正确入口，不跳转、不转换、不自动应用。用户预设无专用 `kind`，只能初步识别，仍须通过原校验。素材收藏应在“素材搜索与收藏 → 导入收藏”，TXT 应在对应 TXT 词库入口；结果记录不能直接还原导入成卡片。取消、面板关闭、切换工作流和过期文件读取不会写入数据。

### v0.16.0: import guidance and card contents

Selecting a card shows a read-only **Card contents** summary below the selector: up to five effective fields, plus explicit-clear and hidden-field notices. Contents remain visible when the card matches current settings. This is not the full field list or the application diff: omitted fields are still part of the snapshot. Review **All fields** before applying.

Imports distinguish the wrong entry, invalid JSON, files over 1 MiB, unsupported versions and schema errors. Guidance never redirects, converts or applies data. User presets have no dedicated `kind`; tentative recognition still requires the original validator. Import material favorites through **Search & Favorites → Import Favorites**, and TXT files through their TXT library entry. Result records are not directly restorable card imports. Cancellation, panel closure, workflow changes and obsolete reads do not write data.

1. 在完整节点或对应独立模块节点上右键，选择 **我的预设与卡片 → 模块卡片**。画面基础节点只提供整套预设，不提供模块卡片。
2. 选择人物、发型、服装或姿态动作，输入名称，点击 **保存当前模块**。卡片是具体字段的快照；“跟随预设”自动转换为当前预设值，“不使用”保留。包含“随机抽取”时需先改成具体选项，或执行后从结果面板保存。
3. 选择已保存卡片，点击 **应用卡片**，只替换该模块；也可选择 **应用并锁定**，之后随机按钮会跳过这些字段。
4. 人物卡包含年龄、族裔、五官、肤色、身形和妆容的 20 个字段，不包含发型。发型卡含发色模式、发色、发色色调、染色方式、头发长度、发质与卷度、发型造型、刘海和头部配饰，共 9 字段。穿搭卡含服装、鞋袜、配件的 21 字段。姿态动作卡含画面瞬间、基础姿态、身体方向、身体重心、肩颈状态、手部动作、腿部动作、头部方向、视线、表情，共 10 字段。
5. 保存 ComfyUI 工作流，卡片和锁定状态一并保留。跨工作流复用可导出卡片 JSON，再到完整节点或对应独立模块导入；导入后需主动点击应用。

四类内容卡每个节点合计最多 100 张，不是每类 100 张；拍摄方案卡仍单独计数。名称最多 80 个 JavaScript UTF-16 单位，文件上限 1 MiB。同类型同名覆盖需确认，不同类型允许同名。删除卡片不会清空当前模块。

### v0.15.0：发型与姿态动作卡

卡片包请从 **右键节点 → 我的预设与卡片 → 模块卡片 → 管理… → 导入卡片包** 导入；不要使用“素材搜索与收藏 → 导入收藏”。卡片包保存模块配置，素材收藏文件保存条目标识，两者不是同一种 JSON 格式。

- 完整节点可管理四类内容卡；发型／姿态动作独立节点仅操作各自模块。保存、应用、收藏、重命名及卡片包沿用现有入口。
- 在“实际执行结果”中选择记录，再点 **保存为发型卡** 或 **保存为姿态动作卡**。保存的是该记录的解析值，不读取当前编辑器新值，也不会应用或锁定。完整节点提供四种保存按钮，独立节点只提供自身类型。
- 当前设置卡保留隐藏分支原值；结果卡保存实际解析值。例如基础发色模式会把未启用的进阶染发选项解析为“不使用”，两种来源的快照因此可能不同。结果候选仍保留构图适配前的字段。
- 动作卡不会自动添加座椅、墙面或手持道具，请自行匹配场景；不保证人物身份或动作骨架完全一致。
- 预览标识隐藏字段；全“不使用”的卡片会明确提示清空模块。应用可更新已锁定字段，“保留锁定”不等于禁止手动替换。
- [快捷组合](card-quick-combination.md)新增两类选择，默认保持当前；只应用明确选择的模块。

### 格式兼容与降级

内容卡及包仍为 v1 格式，但新增模块类型至少需要 v0.15.0。v0.15 可读取既有人物／穿搭卡、拍摄方案及工作流；**旧版不支持含发型／姿态动作的单卡或混合包**。旧执行记录缺少新候选时，原结果可查看，但需重新执行才能保存新类型卡片。

升级前保存独立工作流备份。需要降级时优先恢复备份；也可在 v0.15 导出仅含人物／穿搭的兼容包供旧版导入。导出兼容包不会将整个工作流变成旧版兼容。不要用旧版直接编辑包含新类型的工作流，并期待所有卡片／收藏仍能正常工作。

## 锁定的含义

- 右键“随机设置与检查”提供模块及字段级锁定。完整节点支持八个标准模块；独立模块只能锁定自身。
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

## v0.13.0 卡片整理

从 v0.13.0 起，人物／穿搭卡和拍摄方案卡提供相同的整理操作，不增加画布节点高度。

- 选中卡片后点击“收藏卡片”；下拉列表中的 `★` 仅为标记，不修改名称。收藏随工作流保存，不改变提示词字段、种子或随机锁定。
- “仅收藏”与原搜索取交集；排序提供默认顺序、名称排序和收藏优先。排序不改变实际保存次序。关闭重开面板后，搜索、筛选和排序恢复默认。
- 当前卡片被筛选隐藏时清空选择并禁用应用，不自动换成其他卡片。点击“重置筛选”可恢复列表，随后主动选择卡片。在仅收藏列表中取消收藏，只会隐藏该项，不删除卡片。
- 重命名同步迁移收藏；覆盖同名重命名以来源卡片的收藏状态为准。删除同步清理收藏。导入覆盖同一身份卡片保留收藏，新增卡片默认未收藏。
- 导出包默认仍勾选全部候选卡片。导出区域的搜索、仅看收藏不会取消隐藏项的勾选；总数和“将导出的全部卡片”包含隐藏的已选项。只想导出筛选结果时，先“清空勾选”，再“选择筛选结果”。零勾选时确认按钮禁用。
- 单卡／卡片包 JSON 保持 v1 格式，导出配置、不包含收藏状态。收藏是本节点工作流信息，不随卡片跨工作流传递。
- 异常或未知版本的收藏数据按无收藏只读显示，卡片仍可使用。只有确认“重置收藏数据”后才会替换异常数据；不会自动修复或删除卡片。如果另一类卡片库异常，当前有效卡片仍可使用，收藏暂不可编辑。

卡片及收藏修改已接入一次性事务。独立 ComfyUI 已验证收藏、内容卡重命名及删除的真实撤销／重做，具体范围见[验收记录](testing/2026-11-03-v0.13.0-release-acceptance.md)。

## English

Version note: v0.15.0 adds Hair and Pose / Action Cards. v0.14.0 supports only Person / Outfit content cards and separate Shoot Plan Cards.

Introduced in v0.14.0, [Quick Card Combination](card-quick-combination.md#english) expands in v0.15.0 to five selectors: Person, Hair, Outfit, Pose / Action and Shoot Plan. Keep unselected modules, choose module lock policies, and undo or redo the entire application once.

### Content Cards and Module Locks

Available since v0.10.0. The package still contains 11 nodes, with no new dependencies or online services.

Version v0.12.0 also offers separate [Shoot Plan Cards](shoot-plan-cards.md#english) for Scene / Camera / Visual combinations, with a separate quota and import format. Existing person/outfit cards are unchanged.

Right-click the full builder or a corresponding standalone module and select **My Presets & Cards → Module Cards**. Choose **Person**, **Hair**, **Outfit** or **Pose**, enter a name, and use **Save Module**. Canvas offers whole presets only. **Follow Preset** becomes the current concrete preset value; **Unused** is preserved. For unresolved **Random** fields, choose concrete values or run the node and save from its execution result.

**Apply Card** changes only its module. **Apply & Lock** also protects those fields from random buttons. Person cards contain 20 fields, including physique and makeup, but not hair. Hair cards contain 9 fields: color mode, color, color tone, dye technique, length, texture/curl, hairstyle, bangs and head accessories. Outfit cards contain 21 clothing/accessory fields. Pose / Action cards contain 10 fields: moment, base pose, body direction, weight distribution, shoulder/neck posture, hands, legs, head direction, gaze and expression. Fixed descriptions do not guarantee face identity or an exact pose skeleton.

Save the workflow to persist cards and locks. Export/import JSON to reuse a card in another full builder or its corresponding standalone module. Importing does not automatically apply the card. All four content-card types share a 100-card limit per node, separate from Shoot Plan Cards. Names are limited to 80 JavaScript UTF-16 code units and files to 1 MiB. Replacing the same type and name requires confirmation; different types may share a name. Deleting a card does not clear current options.

### v0.15.0 Hair and Pose / Action Cards

Import a card pack through **My Presets & Cards → Module Cards → Manage… → Import Card Pack**, not **Search & Favorites → Import Favorites**. Card packs contain module settings; material favorites files contain item references. These JSON formats are not interchangeable.

In **Actual Execution Results**, choose a record, then **Save as Hair Card** or **Save as Pose / Action Card**. The full builder offers four content-card actions; each corresponding standalone module offers only its own. Saving uses historical resolved values, not later editor values, and neither applies nor locks the card.

Saving current settings preserves hidden editor values. Saving a result preserves execution normalization: for example, Basic hair color mode may resolve inactive advanced dye options to Unused. These snapshots can differ. Result candidates retain pre-framing values, including fields omitted from the rendered text.

Pose cards do not add required seating, walls or handheld props; match the scene yourself. Previews mark hidden fields and explicitly warn when an all-Unused card will clear a module. Explicit application can overwrite locked fields. [Quick Card Combination](card-quick-combination.md#english) adds both new selectors, defaulting to Keep Current.

### Format compatibility and downgrade

Content cards and packs remain v1, but the added module types require v0.15.0 or later. Existing Person / Outfit cards, shoot plans and workflows remain readable by v0.15. Older versions do not support Hair / Pose single cards or mixed packs containing them. Older execution records remain viewable; rerun to obtain the new complete card candidates.

Save a separate workflow backup before upgrading. For downgrade, restore that backup or first export a Person / Outfit-only pack from v0.15 for the older version. Exporting a compatible pack does not convert the whole workflow. Do not expect older versions to correctly edit card/favorite data in workflows containing new types.

Right-click **Random Settings & Checks** for module and field locks. The full builder supports all eight modules; standalone nodes lock their own module. Locking resolves preset references to concrete values, so changing the execution seed does not reroll those fields. Manual edits, preset changes and explicit clearing remain available. Unlocking leaves current values unchanged; use a random setup button to enable random choices again.

Applying cards preserves the preset selector, current editing module, seed, resolution, output layout, framing mode, other modules and free text. Linked target inputs or a TXT replacement block capture/application/new locks rather than silently editing inactive controls. Unlocking remains available. Card JSON is not a workflow, identity model, reference image, or result-panel snapshot; these formats are not interchangeable.

### v0.11.0: result reuse and card management

The following additions are available since v0.11.0.

In **Actual Execution Results**, select a record and choose **Save as Person Card** or **Save as Outfit Card** on the full builder or the corresponding standalone module. Cards capture that execution's resolved canonical fields, not subsequently edited controls, and never reroll randomness. Card candidates retain fields omitted from the rendered prompt by framing adaptation. Saving a card does not apply or lock it; save the workflow to persist it.

TXT/user replacements, empty modules, incomplete fields and unsupported older records cannot become structured cards. The interface explains the reason instead of guessing fields from text. Replacing the same module/name still requires confirmation.

Filter by module and search names (case-insensitive search; exact module/name identity). To rename, select a card, enter its new name in **Card name**, and click **Rename**. Replacing the same module/name requires confirmation and preserves the source card's values, not the overwritten target's values.

Review changes before applying. Expand **All fields** to inspect hidden branches. The preview preserves Follow Preset/Random markers and does not execute randomness. If current settings changed, review the refreshed preview and apply again.

**Export Card Pack** initially selects all supported cards in the node, independent of search; uncheck unwanted cards. **Import Card Pack** validates the entire file and previews additions, conflicts, replacements, skips and inapplicable cards. Skipping existing names is the default; replacing requires confirmation. One invalid card rejects the entire pack, including an invalid card for an unsupported target module. Legal inapplicable cards are skipped in standalone nodes. Importing never applies or locks cards automatically.

The pack format is `{"kind":"vividmuse-content-card-pack","version":1,"cards":[complete v1 card objects]}`. It allows 1–100 cards; the resulting node library cannot exceed 100. Files are limited to 1,048,576 bytes and names to 80 JavaScript UTF-16 code units. Existing single-card imports/exports remain supported; packs are not compatible with the old single-card import entry or result/workflow formats.

### v0.13.0 card organization

Since v0.13.0, both card panels offer the same organization controls without increasing node height.

Choose a card and use **Favorite Card**. The `★` decoration does not rename it. Favorites are saved with the workflow and do not change prompt fields, seeds or random locks. **Favorites only** intersects with search. **Default order**, **Name order** and **Favorites first** sort the view, not the stored library. Search, filtering and sorting reset when the panel is reopened.

If filtering hides the selected card, selection and application preview are cleared; another card is not silently selected. **Reset Filters** restores the list; then choose a card explicitly. Unfavoriting while filtering favorites hides the card without deleting it.

Renaming transfers favorite status; a rename that replaces another card uses the source card's status. Deleting clears the favorite reference. Importing a same-identity replacement preserves local favorites; newly imported cards start unfavorited.

**Export Card Pack** initially checks all candidates. Export search and favorite filtering do not uncheck hidden selections. The total count and full list of export names include hidden selections. To export matches only, use **Clear Selection**, then **Select Matches**. The confirm button is disabled when nothing is checked. Single-card and pack JSON remain v1 and exclude favorites; favorites belong to the node's workflow, not portable card files.

Invalid or future-version favorites are shown as empty and read-only while cards remain usable. **Reset Favorites Data** requires confirmation. A damaged other card library does not block editing the valid library, but favorites remain read-only. Card/favorite mutations use a single transaction. Live ComfyUI undo/redo has been checked for favorites and content-card renaming and deletion; see the [acceptance record](testing/2026-11-03-v0.13.0-release-acceptance.md#english) for the exact scope.
