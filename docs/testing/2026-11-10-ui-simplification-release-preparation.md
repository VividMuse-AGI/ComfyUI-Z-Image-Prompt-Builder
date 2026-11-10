# 界面精简发布准备

日期：2026-11-10。状态：界面验收和候选干净副本检查完成，用户已确认按 v0.20.0 提交、推送并创建 Release，进入正式发布流程。

## 已关闭的验收

用户在独立 8203 环境确认“复制和取消都没有问题”。[合并界面验收](2026-11-08-ui-simplification-combined-ui.md)最后两项人工检查关闭。本轮没有重新生图，也没有改动生产 ComfyUI 安装。

## 建议发布范围

用户已确认将以下已验收改动合并为 v0.20.0，元数据和正式双语发布说明已更新。下方干净副本统计仍保留检查当时的 0.19.0 元数据说明，不改写历史证据。

- 结果正文及复制前置，低频操作折叠；保留手动复制兜底与历史记录边界。
- 统一预设、模块卡片和组合应用入口，随机锁定／检查单独归类。
- 随机按钮文案、清空范围确认和 TXT 文本／词库操作区分。
- 两个精确手动动作：一手轻扶翻领、一手轻扶领口边缘；不扩充现有随机池或修改旧衣领动作。
- 中英文快速上手、详细手册、示例工作流说明与实机截图。
- 上述功能的回归测试和本轮设计／验收记录。

不纳入历史未跟踪审计资料、外部数据集候选、测试服务用户目录、临时日志或运行环境。不得使用 `git add .` 将这些内容混入提交。

## 发布前发现并修正的测试问题

`frontend_clear_actions.mjs` 原先通过 `git show HEAD` 读取随机准备基线。提交后 HEAD 会移动，测试可能退化为新实现与自身比较；源代码副本没有 Git 历史时也无法运行。

现从 v0.19.0 的确切提交 `90108ae414731b1c4f4d24e7d1df9ae047471ef1` 生成三种随机范围的字段／属性快照，记录来源 SHA256、受控随机值与锁定条件，保存到 `tests/fixtures/random_preparation_v019.json`。测试直接断言当前结果与冻结快照一致，不改产品代码、不重新定义旧动作或随机池。

## 干净副本结果

成功证据位于工作区 `audits/ui-release-candidate-20261110-f5875b9f/`，包含 `manifest.json`、`scope.json`、`summary.json` 和各项日志。只复制 Git 已跟踪文件及显式列出的 17 个新增文件，共 215 个文件；不复制 Git 元数据，并限制 Git 搜索祖先目录。

| 检查 | 结果 |
| --- | --- |
| 公开 Python 测试 | 303 项通过 |
| 公开前端测试 | 37 个脚本通过 |
| 前端语法 | 25 个脚本通过 |
| 三个生成目录文件 | 重新生成后校验值不变 |
| README／详细手册相对文件链接 | 59 个存在；不等同于全部锚点渲染检查 |
| 安装包结构 | 215 个条目，固定根目录、必需文件、当前版本匹配及 CRC 校验通过 |
| 文件一致性 | 测试结束时源码及副本与清单一致 |
| `git diff --check` | 通过，仅有既有 LF／CRLF 提示 |

开发目录此前 321 项 Python／38 个前端脚本的统计包含私有外部数据集测试。本次遵循 `.gitignore` 排除两个 Python 测试文件（18 项）和一个前端脚本，不把私有依赖缺失当作测试失败，也不声称它们包含在公开副本内。

安装包检查使用当前 0.19.0 元数据，只验证结构，没有生成或冒充 v0.20.0 正式安装包。正式版本须在元数据、发布说明和提交确定后，按对应 Git tag 重新构建。

初次审计脚本在 Windows 默认编码及 URL 编码链接解析处中断，已显式使用 UTF-8 并解码相对链接；上表仅引用最终完整成功运行，未将审计脚本问题作为节点故障。

本记录在上述快照完成后新增；最终提交还需包含本记录及验收状态的文档更新。产品运行文件未在测试后修改。

## 发布说明草案

中文：本版集中简化提示词的查看、复用和清空操作。结果正文与复制按钮前置，预设与卡片管理统一入口，随机设置和执行含义更清晰。同时新增翻领、领口边缘两种精确手动动作，不改变现有随机候选。保留 11 个节点、端口和现有数据格式，无新增在线服务或依赖。

English: This release simplifies viewing, reusing and clearing prompts. Result text and copy actions come first, presets and cards share one manager, and random setup is distinguished from execution. Two precise manual hand actions target a fold-over collar or neckline edge without changing existing random pools. All 11 nodes, ports and existing data formats remain available, with no new online service or dependency.

## 下一步

按显式文件清单提交，推送 GitHub 并核对 CI，再打 tag、通过仓库发布流水线生成固定根目录安装包及 SHA256、创建 Release。正式说明见 [v0.20.0](../releases/v0.20.0.md)。生产节点同步另按用户指令进行，不在本轮提前安装。
