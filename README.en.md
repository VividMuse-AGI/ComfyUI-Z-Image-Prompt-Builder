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
- Structured TXT module libraries can replace any of the eight standard modules or enable one independent **Custom** fragment appended after them.
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

## Quick Start

1. Add the "Z-Image 中文提示词生成器" node.
2. Pick a portrait preset and a prompt density.
3. Leave fields as "Follow preset", or set specific values anywhere.
4. Set fields you want varied to "Random", then set a random scope and seed.
5. Alternatively click the "🎲 Generate random combination" button at the bottom.
6. Use "Current editing module" to edit one category at a time; switching modules only changes the display and preserves every field value. Use "Enable current module only" to change enabled state, "Clear structured modules" to keep free text, or "Clear all" to wipe both.
7. Connect "中文提示词" (Chinese prompt) to a text-encoding node.
8. Connect "推荐宽度" (recommended width) and "推荐高度" (recommended height) to compatible latent width/height inputs, or type the same values manually.

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
- The node only handles strings and integers, so it is unaffected by CUDA, GPU, or model-version differences.

## License

[MIT License](LICENSE)
