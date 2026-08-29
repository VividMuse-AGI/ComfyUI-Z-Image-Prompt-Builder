# ComfyUI-Z-Image-Prompt-Builder

A portrait prompt builder node for ComfyUI by VividMuse. Generate natural-language Chinese and English positive prompts through portrait presets, structured dropdown fields, and reproducible random combinations.

> English docs | [中文文档](README.md)

## Features

- Outputs both **Chinese and English positive prompts**; no negative prompts are generated. English is rendered deterministically from built-in structured fields without an online translation service.
- The complete frontend supports **Auto / 中文 / English**. Auto follows ComfyUI's language while saved field identifiers and combo values remain Chinese for backward compatibility.
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
- Outputs recommended **width and height** for setting the latent size. The English prompt is appended as a new final output, leaving the existing Chinese, width, and height output positions unchanged.
- Frontend provides a "🎲 Generate random combination" button.
- A "current editing module" switcher shows one module at a time without changing any field values.
- In addition to the full builder, eight chainable module nodes expose only their own fields and combine text through a `previous prompt → combined prompt` interface. Any unwanted module can be bypassed with `Ctrl+B`.
- Two standalone TXT nodes provide reusable full-prompt and structured-module libraries without duplicating library controls across all eight module nodes.
- A TXT user library can import complete Chinese prompts and add them before or after the free-prompt text, or replace it.
- Structured TXT module libraries can replace any of the eight standard modules or enable one independent **Custom** fragment appended after them.
- Both local TXT libraries are stored with the node in the workflow and accept up to 500 entries from a file no larger than 1MB.
- **No third-party Python dependencies, no model loading, no VRAM usage.**

## Built-in Presets

- Japanese summer bicycle portrait on grass (日系草地单车夏日柔光写真)
- Japanese café warm-tone close-up portrait (日系咖啡馆暖调近景人像)
- Nighttime indoor luxury hard-flash fashion portrait (夜间室内轻奢硬闪时尚写真)
- Urban workplace light-luxury seated portrait (都市职场轻奢坐姿写真)
- Soft-light Hanfu garden portrait (古风汉服园林柔光写真)
- Summer beach swimwear portrait (海边夏日泳装写真)
- Cyberpunk city night portrait (赛博都市夜景写真)
- Studio dewy-makeup beauty close-up (影棚水光妆美容特写)
- Window-light yoga shaping portrait (落地窗瑜伽塑形写真)
- Hotel-window cinematic still (旅馆窗边电影静帧)
- Custom combination (自定义组合)

Ten portrait presets are decomposed into editable person, styling, action, environment, lighting, composition, and imaging fields. Custom combination provides a minimal neutral starting point.

## Installation

### Git

In ComfyUI's `custom_nodes` directory:

```bash
git clone https://github.com/VividMuse-AGI/ComfyUI-Z-Image-Prompt-Builder.git
```

Restart ComfyUI and force-refresh the browser. The node is under:

```text
VividMuse → Z-Image → Z-Image 中文提示词生成器
VividMuse → Z-Image → 模块 → 8 standalone module nodes
VividMuse → Z-Image → TXT词库 → 2 standalone TXT nodes
```

### Manual

Copy the whole project folder into:

```text
ComfyUI/custom_nodes/ComfyUI-Z-Image-Prompt-Builder
```

Then restart ComfyUI. The project has no extra dependencies, so no `pip install` is needed.

For the recommended manual install, open the [`v0.3.0` Release](https://github.com/VividMuse-AGI/ComfyUI-Z-Image-Prompt-Builder/releases/tag/v0.3.0), download `ComfyUI-Z-Image-Prompt-Builder-v0.3.0.zip`, and extract it directly into `custom_nodes`. Its internal root folder is already named `ComfyUI-Z-Image-Prompt-Builder`.

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

Set **Z-Image Prompt Builder: Interface language / 界面语言** in ComfyUI Settings to Auto, 中文, or English. The language can be changed without converting saved workflow values.

1. Add the "Z-Image 中文提示词生成器" node.
2. Pick a portrait preset and a prompt density.
3. Leave fields as "Follow preset", or set specific values anywhere.
4. Set fields you want varied to "Random", then set a random scope and seed.
5. Alternatively click the "🎲 Generate random combination" button.
6. Use "Current editing module" to edit one category at a time; switching modules only changes the display and preserves every field value. Use "Enable current module only" to change enabled state, "Clear structured modules" to keep free text, or "Clear all" to wipe both.
7. Connect "中文提示词" (Chinese prompt) to a Z-Image text-encoding node, or use the final "英文提示词" output for a workflow that expects English natural language.
8. Connect "推荐宽度" (recommended width) and "推荐高度" (recommended height) to compatible latent width/height inputs, or type the same values manually.

### Standalone Module Nodes

Use these when you want the prompt structure to remain visible on the canvas and individual sections to be bypassable. The original full builder remains available; both workflows are supported.

Recommended order:

```text
Canvas → Person → Hair → Clothing → Pose & Action → Scene → Photography → Visual
```

- Every node provides two independent chains: `前置提示词 → 组合提示词` for Chinese and `前置英文提示词 → 英文提示词` for English. Either chain may start with its first input unconnected.
- The Canvas node preserves the original `combined prompt, width, height` order and appends the English prompt as its final output.
- Every module has its own preset, density, and seed, plus buttons to randomize the module, restore preset-following values, or clear the module.
- Bypass a module with `Ctrl+B` to pass its incoming string directly to the next node.
- Standalone nodes do not share editable widget state. In a direct chain, however, the combined string carries resolved upstream fields at runtime, so downstream random photography can remain compatible with the actual pose, scene, and other completed modules. The TXT prompt-library node preserves this context. When a TXT module fragment replaces a standard module, that module's stale structured fields are removed so downstream nodes do not keep filtering against an obsolete pose or scene. Arbitrary TXT fragments cannot be reliably parsed back into every widget field, so the replacement is treated as opaque user content.
- A third-party text node that creates a new plain string may discard that runtime context. Use the full builder when one preset should centrally control all 92 fields.
- `Z-Image TXT提示词库` inserts reusable full prompts; `Z-Image TXT模块词库` inserts a fragment typed as Canvas, Person, Hair, Clothing, Pose & Action, Scene, Photography, Visual, or Custom. To replace a standalone structured module, put the TXT module node in that module's position or bypass the original module with `Ctrl+B`; the TXT node does not remove module text that is already present in its incoming string.
- The English interface renders built-in dropdown fields only. It does not silently translate arbitrary Chinese free text or Chinese TXT bodies. If a user TXT fragment replaces a standard module, that module is omitted from the English output so stale built-in fields are not emitted. Prepare English TXT/free text and join it downstream when custom content must also reach an English-language model.

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
Tags: portrait, café, warm tone
3:4竖构图，真实写实暖调咖啡馆近景人像，一位25岁左右的东亚成年女性……
---

## Rainy city night
Tags: portrait, night, cinematic
3:2横构图，真实写实城市雨夜环境人像……
```

Format rules:

- `## Title` identifies an entry. Duplicate titles receive an automatic numeric suffix.
- `Tags:` or `Tag:` is optional and accepts Chinese or English commas. Chinese `标签：` remains supported. Tags are never added to the prompt and are currently stored as metadata rather than exposed as a filter.
- Everything after the title and optional tags is the prompt body; it may span multiple lines.
- A line containing only `---` is the recommended separator. A new `## Title` also closes the previous entry.
- Put explanatory comments before the first entry and start them with `#`.

If the whole file contains no `## Title`, simple mode treats each non-empty, non-comment line as one prompt. Simple mode does not support multi-line entries.

| Join mode | Result |
| --- | --- |
| 添加到后面 | Keep the current free prompt and append the selected entry |
| 添加到前面 | Put the selected entry before the current free prompt |
| 替换自由提示词 | Replace the free prompt with the selected entry |

See [`examples/TXT-prompt-library-example.en.txt`](examples/TXT-prompt-library-example.en.txt) for a complete English guide and [`examples/TXT词库示例.txt`](examples/TXT词库示例.txt) for the Chinese example.

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
Module: Person
Tags: East Asian, twenties, clean makeup
一位25岁左右的东亚成年女性，小巧鹅蛋脸，深棕色杏仁眼，暖白自然肤质，清透裸粉妆。
---

## Product-layout whitespace
Module: Custom
Tags: product, layout, whitespace
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

English files may use `Module:` with Canvas, Person, Hair, Clothing, Pose & Action, Scene, Photography, Visual Style, or Custom. `Tags:` and `Tag:` are also accepted; all Chinese keywords and module names remain compatible.

### Standard Modules vs. Custom

- A non-empty user fragment applied to one of the eight standard modules replaces that entire built-in module in the final output, preventing duplicate descriptions.
- `自定义` does not replace a standard module. It is appended after the eight structured modules and is suitable for props, layout whitespace, text placement, or extra narrative constraints.
- `拼接位置` controls whether the free prompt appears before or after the complete structured result. The Custom fragment remains part of the structured result.
- Preset changes and random generation keep applied user-module fragments. `仅启用当前模块` clears user fragments from the other modules.

See [`examples/TXT-module-library-example.en.txt`](examples/TXT-module-library-example.en.txt) for the English format guide and [`examples/TXT模块词库示例.txt`](examples/TXT模块词库示例.txt) for the Chinese library.

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
| 英文提示词 | `STRING` | Connect to a text encoder that expects English natural language, such as a Krea 2 workflow |

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

- Current version: `0.3.0`
- GitHub: [VividMuse-AGI/ComfyUI-Z-Image-Prompt-Builder](https://github.com/VividMuse-AGI/ComfyUI-Z-Image-Prompt-Builder)
- Releases: [GitHub Releases](https://github.com/VividMuse-AGI/ComfyUI-Z-Image-Prompt-Builder/releases)
- Comfy Registry Publisher ID: `VividMuse-AGI`
- Required host: ComfyUI `0.31.1` or newer
- License: MIT

The Registry package uses `.comfyignore` to exclude tests, browser prototypes, examples, and internal planning files while retaining the runtime node, frontend scripts, and JSON phrase libraries.

## License

[MIT License](LICENSE)
