# ComfyUI-Z-Image-Prompt-Builder

A Chinese portrait prompt builder node for ComfyUI by VividMuse. Generate natural-language Chinese positive prompts for Z-Image and Z-Image-Turbo through portrait presets, structured dropdown fields, and reproducible random combinations.

> English docs | [中文文档](README.md)

## Features

- Outputs **Chinese positive prompts only**; no negative prompts are generated.
- Follows Z-Image's natural-language style — no traditional weight tags or "8K / masterpiece" quality meta-tags.
- Three prompt densities: **concise / standard / detailed** (standard is the default).
- **92 structured fields** across 8 modules — Canvas, Person, Hair, Clothing, Pose & Action, Scene, Photography, and Visual. Each field can be set to "Follow preset", "Random", "Disabled", or a specific value; dependent fields collapse according to the current mode.
- Person is split into atomic fields (age, ethnicity, face shape, contour, eye shape, iris color, eyelid, skin tone, skin texture, makeup, and body shape); makeup supports two mutually exclusive branches: overall preset vs. per-item customization.
- Capture medium is independent of subject and ships 12 digital, phone, film, and instant-photography media.
- Photo themes use a two-level structure: **12 theme categories × 144 specific themes**.
- Hair is split into color, length, texture, style, bangs, and headwear, plus optional hair-tone and dye-pattern fields; random generation prefers 37 compatible hair structures.
- Clothing is split into a structure field plus 20 sub-fields covering dresses, jumpsuits, tops, bottoms, colors, materials, patterns, fit, legwear, shoes, and accessories; mutually exclusive structure branches, with colors and materials scoped to specific garments.
- Pose & action covers 10 dimensions (moment, base pose, body direction, weight, shoulders, hands, legs, head, gaze, expression); random picks from 32 complete action chains.
- Scene covers category, location, time, weather, foreground, background, environment detail, surface material, and spatial depth; 12 space categories filter 102 unique locations; random picks from 71 complete scene compositions; indoor scenes automatically omit weather.
- Photography covers 7 fields (shot size, composition, focal length, distance, angle, depth of field, focus); random picks from 30 complete camera setups.
- Visual covers 12 fields (key light, direction, quality, target, shadow, palette, temperature, contrast, capture style, texture, highlight, grain); random draws from 29 lighting plans and 30 visual profiles.
- Random results are **seed-controlled and reproducible**; manually locked values always take priority.
- Camera setups are filtered by aspect ratio, theme category, and seated/standing pose to avoid conflicting lens, distance, shot-size, and focus combinations.
- Outputs recommended **width and height** for setting the latent size.
- Frontend provides a "🎲 Generate random combination" button.
- A "current editing module" switcher shows one module at a time without changing any field values.
- A TXT user library can import complete Chinese prompts and add them before or after the free-prompt text, or replace it.
- Structured TXT module libraries can replace any of the eight standard modules or enable one independent **Custom** fragment appended after them.
- Both local TXT libraries are stored with the node in the workflow and accept up to 500 entries from a file no larger than 1MB.
- **No third-party Python dependencies, no model loading, no VRAM usage.**

## Built-in Presets

- Japanese forest-summer soft-light portrait (日系森系夏日柔光写真)
- Japanese café warm-tone close-up portrait (日系咖啡馆暖调近景人像)
- Nighttime indoor luxury hard-flash fashion portrait (夜间室内轻奢硬闪时尚写真)
- Urban workplace light-luxury seated portrait (都市职场轻奢坐姿写真)
- Historical Hanfu portrait (古风汉服写真)
- Seaside vacation portrait (海边假日度假写真)
- Cyberpunk city night portrait (赛博都市夜景写真)
- Custom combination (自定义组合)

Seven portrait presets are decomposed into editable person, styling, action, environment, lighting, composition, and imaging fields. Custom combination provides a minimal neutral starting point.

## Installation

### Git

In ComfyUI's `custom_nodes` directory:

```bash
git clone https://github.com/VividMuse-AGI/ComfyUI-Z-Image-Prompt-Builder.git
```

Restart ComfyUI and force-refresh the browser. The node is under:

```text
VividMuse → Z-Image → Z-Image 中文提示词生成器
```

### Manual

Copy the whole project folder into:

```text
ComfyUI/custom_nodes/ComfyUI-Z-Image-Prompt-Builder
```

Then restart ComfyUI. The project has no extra dependencies, so no `pip install` is needed.

For the recommended manual install, open the [`v0.2.0` Release](https://github.com/VividMuse-AGI/ComfyUI-Z-Image-Prompt-Builder/releases/tag/v0.2.0), download `ComfyUI-Z-Image-Prompt-Builder-v0.2.0.zip`, and extract it directly into `custom_nodes`. Its internal root folder is already named `ComfyUI-Z-Image-Prompt-Builder`.

GitHub's automatically generated `Source code (zip)` and `Source code (tar.gz)` archives append the version to the extracted folder name. That is normal, but they are not the recommended installation download. If you use one, rename the extracted folder to `ComfyUI-Z-Image-Prompt-Builder` and make sure no other version remains in `custom_nodes`.

### Updating an Existing Installation

For a Git installation, run this inside the node folder:

```bash
git pull
```

For a manual installation, back up your own TXT libraries and replace the old project files with the new version. Then:

1. Restart ComfyUI.
2. Force-refresh the browser with `Ctrl+F5` so it does not reuse old frontend scripts.
3. Add a fresh node and confirm that the new controls and compact layout are loaded; existing workflows can still be used after that check.

Do not keep two copies of the node under different folders, because ComfyUI may load the old copy or register duplicates.

## Quick Start

1. Add the "Z-Image 中文提示词生成器" node.
2. Pick a portrait preset and a prompt density.
3. Leave fields as "Follow preset", or set specific values anywhere.
4. Set fields you want varied to "Random", then set a random scope and seed.
5. Alternatively click the "🎲 Generate random combination" button.
6. Use "Current editing module" to edit one category at a time; switching modules only changes the display and preserves every field value. Use "Enable current module only" to change enabled state, "Clear structured modules" to keep free text, or "Clear all" to wipe both.
7. Connect "中文提示词" (Chinese prompt) to a text-encoding node.
8. Connect "推荐宽度" (recommended width) and "推荐高度" (recommended height) to compatible latent width/height inputs, or type the same values manually.

## TXT Libraries

The node provides two local TXT-library systems with different purposes:

- **TXT user library**: complete prompts that are written into the free-prompt field.
- **TXT module library**: reusable fragments for one structured module, or one additional Custom fragment.

Both panels are collapsed by default. Their node order is structured actions → TXT module library → TXT user library → free prompt. Collapsing a panel only hides its controls; it does not remove imported or applied content.

### TXT User Library

Use this library for complete prompts that can stand on their own.

1. Expand `📚 TXT用户词库`.
2. Click `导入TXT词库` and choose a local `.txt` file.
3. Select a title from `词库条目`.
4. Choose `添加到后面` (append), `添加到前面` (prepend), or `替换自由提示词` (replace).
5. Click `添加到自由提示词`.

Recommended block format:

```text
## Japanese café close-up
标签：portrait, café, warm tone
3:4竖构图，真实写实暖调咖啡馆近景人像，一位25岁左右的东亚成年女性……
---

## Rainy city night
标签：portrait, night, cinematic
3:2横构图，真实写实城市雨夜环境人像……
```

Format rules:

- `## Title` identifies an entry. Duplicate titles receive an automatic numeric suffix.
- `标签：` is optional and accepts Chinese or English commas. Tags are never added to the prompt. In `v0.2.0` they are stored as metadata but are not yet exposed as a filter.
- Everything after the title and optional tags is the prompt body; it may span multiple lines.
- A line containing only `---` is the recommended separator. A new `## Title` also closes the previous entry.
- Put explanatory comments before the first entry and start them with `#`.

If the whole file contains no `## Title`, simple mode treats each non-empty, non-comment line as one prompt. Simple mode does not support multi-line entries.

| Join mode | Result |
| --- | --- |
| 添加到后面 | Keep the current free prompt and append the selected entry |
| 添加到前面 | Put the selected entry before the current free prompt |
| 替换自由提示词 | Replace the free prompt with the selected entry |

See [`examples/TXT词库示例.txt`](examples/TXT词库示例.txt) for a complete Chinese example library.

### Structured TXT Module Library

Use this library for reusable person, hair, clothing, action, scene, camera, or visual fragments. Each entry should describe only one module rather than a complete prompt.

1. Expand `🧩 TXT模块词库（全模块）`.
2. Click `导入结构化模块TXT词库`.
3. Select a module in `词库模块`.
4. Select one matching entry in `模块词库条目`.
5. Click the `应用到……模块` button. For Custom entries, the button reads `启用自定义模块`.

Every entry must use block format and include a `模块：` line:

```text
## Clear Japanese-style person
模块：人物
标签：East Asian, twenties, clean makeup
一位25岁左右的东亚成年女性，小巧鹅蛋脸，深棕色杏仁眼，暖白自然肤质，清透裸粉妆。
---

## Product-layout whitespace
模块：自定义
标签：product, layout, whitespace
人物右侧保留大面积干净留白，前景加入一只透明香水瓶作为视觉锚点。
```

Supported standard module names:

| Chinese module | Content |
| --- | --- |
| 画面基础 | Aspect ratio, capture medium, and portrait theme |
| 人物 | Age, ethnicity, facial traits, skin, makeup, and body shape |
| 发型 | Hair color, length, texture, style, bangs, and headwear |
| 服装 | Garment structure, color, material, pattern, shoes, and accessories |
| 姿态动作 | Pose, balance, limbs, gaze, and expression |
| 场景 | Location, time, weather, foreground, background, and environment |
| 摄影 | Shot size, composition, focal length, distance, angle, depth, and focus |
| 视觉表现 | Light, shadow, color, contrast, texture, highlights, and grain |

Recognized aliases include `基础画面`, `人物设定`, `角色`, `头发`, `穿搭`, `姿态`, `动作`, `环境`, `镜头`, `视觉`, and `光影色彩`. The UI normalizes aliases to the standard names after import.

### Standard Modules vs. Custom

- A non-empty user fragment applied to one of the eight standard modules replaces that entire built-in module in the final output, preventing duplicate descriptions.
- `自定义` does not replace a standard module. It is appended after the eight structured modules and is suitable for props, layout whitespace, text placement, or extra narrative constraints.
- `拼接位置` controls whether the free prompt appears before or after the complete structured result. The Custom fragment remains part of the structured result.
- Preset changes and random generation keep applied user-module fragments. `仅启用当前模块` clears user fragments from the other modules.

See [`examples/TXT模块词库示例.txt`](examples/TXT模块词库示例.txt) for entries covering every standard module and Custom.

### Clear and Remove Actions

| UI action | Clears | Keeps |
| --- | --- | --- |
| 清空自由提示词 | Free-prompt text | Imported TXT user library, structured fields, user modules |
| 清除已导入词库 | TXT user-library entry list | Text already written into the free prompt |
| 清空当前用户模块 | Applied text for the selected library module | Library entries, other user modules, built-in fields |
| 清除模块词库 | TXT module-library entry list | Text already applied to modules |
| 清空结构化模块 | All 92 built-in fields and all applied user modules | Free prompt and both imported libraries |
| 全部清空 | Free prompt, structured fields, and all applied user modules | Both imported libraries for reuse |
| 仅启用当前模块 | Other standard fields and other user-module fragments | Current standard module, free prompt, and imported libraries |

In short, a **clear** action usually removes content currently participating in output, while a **remove library** action unloads the selectable source entries without deleting text already applied.

### Limits, Storage, and Privacy

| Limit | Value |
| --- | ---: |
| File type | Plain-text `.txt` |
| File size | Up to 1MB |
| Entries per library | Up to 500 |
| Prompt body per entry | Up to 20,000 characters |

The limits protect frontend responsiveness, node serialization, and workflow-save performance. Files are read locally in the browser and are not uploaded by this node. Imported entries are stored in the node properties inside the workflow, so sharing a workflow may also share the imported library text.

UTF-8 is recommended. Write concise, affirmative Chinese natural language that can be joined directly; omit absent details instead of adding negative phrases such as “not wearing headwear.”

## Prompt Density

- **Concise (精简)** — subject, core appearance, main action, scene anchor, and key camera info.
- **Standard (标准)** — common clothing, action, scene, key light, and lens intent, omitting repeated controls like camera distance and precise subject ratio.
- **Detailed (详细)** — all field details, expanded with exact shooting distance and full photography description.

Density controls the information level, not an official token limit.

## Random Scopes

- **Local tweak (局部微调)** — keeps the main person, clothing, scene, and composition; only varies action chains and visual details (color, contrast, texture, highlight, grain).
- **Same-theme reshoot (同主题重拍)** — keeps aspect ratio, theme, age stage, and ethnicity; varies the remaining fields.
- **Cross-style mix (跨风格混搭)** — all fields enter the global pool for the widest combinations.

## Outputs

| Output | Type | Purpose |
| --- | --- | --- |
| 中文提示词 | `STRING` | Connect to a Z-Image text-encoding node |
| 推荐宽度 | `INT` | Set the latent width |
| 推荐高度 | `INT` | Set the latent height |

## Compatibility

- Development target: ComfyUI 0.31.1+
- Known test environment: Aki (秋叶) bundle, PyTorch 2.9.1+cu130
- Supports both the classic ComfyUI node UI and Node 2.0; hidden Node 2.0 fields do not keep consuming node height.
- After updating, restart ComfyUI and force-refresh the browser to load the new frontend extensions.
- The node only handles strings and integers, so it is unaffected by CUDA, GPU, or model-version differences.

## Development Checks

The runtime requires Python 3.10+ and has no third-party dependencies. Before release, run:

```bash
python -m py_compile nodes.py __init__.py
node --check web/js/preset_sync.js
node --check web/js/txt_library.js
node --check web/js/txt_module_library.js
python -m unittest discover -s tests -p "test_*.py" -v
python -c "import json,pathlib; [json.loads(p.read_text(encoding='utf-8')) for p in pathlib.Path('phrase_library').glob('*.json')]"
```

Run every frontend regression script with:

```bash
for test in tests/frontend_*.mjs; do node "$test"; done
```

GitHub Actions runs the configured checks automatically on pushes and pull requests.

## Release Information

- Current version: `0.2.0`
- GitHub: [VividMuse-AGI/ComfyUI-Z-Image-Prompt-Builder](https://github.com/VividMuse-AGI/ComfyUI-Z-Image-Prompt-Builder)
- Releases: [GitHub Releases](https://github.com/VividMuse-AGI/ComfyUI-Z-Image-Prompt-Builder/releases)
- Comfy Registry Publisher ID: `VividMuse-AGI`
- Required host: ComfyUI `0.31.1` or newer
- License: MIT

The Registry package uses `.comfyignore` to exclude tests, browser prototypes, examples, and internal planning files while retaining the runtime node, frontend scripts, and JSON phrase libraries.

## License

[MIT License](LICENSE)
