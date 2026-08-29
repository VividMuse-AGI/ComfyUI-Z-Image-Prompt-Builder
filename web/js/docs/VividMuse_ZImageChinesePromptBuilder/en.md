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

The English output covers built-in structured fields. Arbitrary Chinese Free Prompt or TXT content is not machine-translated.
