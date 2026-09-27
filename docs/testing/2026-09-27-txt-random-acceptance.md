# Candidate acceptance / 候选版本验收（历史记录）

Date: 2026-09-27. This is the pre-release acceptance snapshot, recorded while the candidate metadata was still 0.5.1; it does not describe the existing v0.5.1 tag. The accepted features are included in [v0.6.0](../releases/v0.6.0.md). File counts below refer to the 110-file candidate before adding the release notes. Statements about pending publication describe that earlier test stage.

## Included scope / 本次范围

- 69 new constrained phrases: 40 pose/action, 14 clothing, 6 headwear/accessories and 9 scene entries, with bilingual output and UI mappings.
- Manual/seeded random selection in the two standalone TXT library nodes, preserving manual drafts and existing ports.
- Stable widget names for Nodes 2.0 dynamic labels and disabled states.
- Related compatibility corrections, documentation, examples and regression tests.

The six external-dataset candidates, their fixtures and evaluation tools are not included. Reference photographs, private libraries, machine-specific logs and browser tooling are not distributed. The full builder's embedded TXT panels do not gain random selection in this change.

## Real UI acceptance / 实机验收

Both standalone TXT nodes were tested in Chinese and English using classic and Nodes 2.0 layouts in a local ComfyUI installation.

| Check | Result |
|---|---|
| Import, apply, clear draft/library, random mode, collapse and dynamic labels | Passed across the four UI combinations |
| Fixed seed, post-execution increment and historical execution seed | Passed; the result shows the executed seed, not the next seed |
| Save, close and reopen workflow | Libraries, drafts, seeds, control modes and links preserved |
| Old widget layout import | Manual mode and old text preserved; text execution passed |
| Copy both nodes in classic layout | Library, mode and seed preserved; historical result not copied |
| Empty library/module scope | No cross-module fallback; upstream text preserved |
| Long result dialog | 120 lines scrollable; literal HTML-like tags render as text, with no image or script elements |
| Resize and collapse | Nodes 2.0 controls remained visible; no exposed payload JSON or abnormal blank height in the inspected states |
| UI API export and headless replay | Passed with matching seed, candidate count and full text output |

The two final browser rounds executed 6 and 5 text-only workflows respectively, followed by one exported-API replay. No model or image-generation nodes were used. The user's original workflow and interface settings were restored.

## Automated checks / 自动化检查

Before excluding unrelated external-candidate research, the full development workspace passed 175 Python tests, 20 frontend suites and 9 isolated ComfyUI CPU text executions. Those counts include candidate-research tests and must not be presented as the counts of the smaller publication snapshot.

The publication snapshot contains 110 files, copied from tracked files plus non-ignored new files into a fresh directory without the source checkout's Git metadata, caches or research fixtures. All source files were SHA-256 checked before and after testing. The test environment removed inherited PYTHONPATH and used an explicit Python executable.

| Clean-snapshot check | Result |
|---|---|
| Python unittest discovery | 159 tests passed |
| Included frontend suites | 19 suites passed |
| Browser JavaScript syntax | 11 files passed |
| Regenerate translation and resolution catalogs | Byte-identical to the supplied catalogs |
| Package import | All 11 nodes registered |
| Archive structure, runtime dependencies and phrase JSON | Passed; 110 files, fixed root, version metadata consistent |
| Isolated ComfyUI CPU text/cache executor | 9 executions passed |

The smaller counts exclude 16 Python tests and one frontend suite belonging to the unrelated external-candidate research. No product regressions were removed. Archive validation used an in-memory candidate archive; it did not create a tag, overwrite the existing v0.5.1 release or publish an installation ZIP. These checks ran locally on Windows (Python 3.12 for regressions, the ComfyUI installation's Python 3.11 for integration, and Node.js 24); hosted Ubuntu/Python 3.10/Node.js 22 CI remains to run after pushing.

Reproduce the standard checks from the repository root:

```sh
python -m unittest discover -s tests -p "test_*.py" -v
python scripts/generate_frontend_i18n.py
python scripts/generate_resolution_catalog.py
git diff --exit-code -- web/js/i18n_catalog.js web/js/resolution_catalog.js
```

Run every `tests/frontend_*.mjs` file with Node.js and `node --check` on every `web/js/*.js` file, as in `.github/workflows/ci.yml`. Where `python` is not on PATH, set `PYTHON` to its executable before frontend testing. For optional isolated integration, use the ComfyUI environment's Python to run `scripts/validate_txt_execution.py --comfy-root <ComfyUI-directory>`; it does not submit to a running queue or load image models.

## Limits / 验收边界

These are local compatibility and text-behavior checks, not proof that every ComfyUI version or third-party extension combination works. Copy verification does not claim a separate real-UI independent-mutation test; shared-state protections also have automated coverage. Photographic quality and exact model adherence are not acceptance criteria here. A GitHub-hosted CI result is only available after pushing; no push or release has been performed during this preparation.

中文摘要：本机功能与界面验收已完成。公开范围仅含 69 条短语、两个独立 TXT 节点随机功能及相关修复；外部候选和本机原始记录留在本地。110 个文件的干净副本通过 159 项 Python、19 组前端和 9 次隔离文本执行；11 个节点、生成目录和安装包内容检查通过。尚未提交、推送或正式发布，GitHub 托管 CI 仍需在推送后运行。
