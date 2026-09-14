# Z-Image Prompt Builder

Builds structured natural-language positive prompts for portrait photography. The node outputs both Chinese and deterministic English prompts; it does not call an online translation service.

## Basic workflow

1. Choose a preset, prompt density, and randomization scope.
2. Use **Module to Edit** to switch between Canvas, Person, Hair, Clothing, Pose & Action, Scene, Photography, and Visual Style.
3. For each field, choose **Follow Preset**, **Random**, **None**, or a specific value.
4. Add optional text in **Free Prompt** and choose its join position.
5. Connect either **Chinese Prompt** or **English Prompt** to the appropriate text encoder.

**Generate Random Combination** respects a currently isolated module. **Enable Only This Module** changes module values; merely switching **Module to Edit** only changes what is visible.

## Language

Open ComfyUI Settings and change **Z-Image Prompt Builder: Interface language / 界面语言** to Auto, 中文, or English. Auto follows the ComfyUI language. Display translations do not change saved Chinese field identifiers or values, so existing workflows remain compatible.

The English output renders built-in fields in English and preserves Free Prompt and applied TXT module fragments verbatim. Supply English user text for a fully English result.

Right-click this node and choose **User Presets / Random Locks / Checks** to save or import named presets, protect fields from random buttons, and inspect known conflicts. Presets are stored in the node and persist when the workflow is saved. Export JSON to reuse them elsewhere. Concise and Standard omit built-in shoes and legwear in face, head-and-shoulders and chest-up shots; Detailed retains them.

## Resolution settings

In Canvas, choose **Aspect Ratio**, **Megapixels (MP)** and **Divisible By**. New nodes default to **1.00 MP** (1 million pixels); enter **2 / 3** for about 2 / 3 million, or a fraction such as 0.5. Both dimensions are divisible by the chosen number (default 8; supports multiples of 4 from 8 to 128). The ratio stays exact. The preview shows the actual size and MP: 4:5 at 2 MP, divisible by 8, gives 1280 x 1600, or 2.048 MP.

MP and Divisible By are always visible in Canvas. Click the preview row to choose **Preserve Aspect Ratio (Recommended)** or **Calculate from Pixels**. The latter uses **Pixel Calculation Value** (each unit is 1024 x 1024 pixels) and rounds width and height separately. Editing the always-visible MP control activates Preserve Aspect Ratio. Existing workflows retain their saved fixed dimensions until you choose a calculation method or edit MP / Divisible By; saved fixed dimensions are not offered as a menu choice. Stored budgets in ten-thousand-pixel units display as MP automatically (300 becomes 3 MP) without changing the saved size.

Connect **Recommended Width / Recommended Height** to the actual latent inputs. Random or connected ratios show a pending preview. Free Prompt and TXT ratios are not parsed. Clearing prompts keeps these size settings; older workflows retain their original sizes.
