# Z-Image Canvas

Builds the canvas portion of a modular prompt chain: aspect ratio, capture medium, photography category, and theme.

Connect **Combined Prompt** to the next module's **Previous Prompt**. For a separate English chain, connect **English Prompt** to **Previous English Prompt**. The node also outputs recommended width and height.

Use `Ctrl+B` to bypass this module without rebuilding the chain.

## Resolution settings

In Canvas, choose **Aspect Ratio**, **Megapixels (MP)** and **Divisible By**. New nodes default to **1.00 MP** (1 million pixels); enter **2 / 3** for about 2 / 3 million, or a fraction such as 0.5. Both dimensions are divisible by the chosen number (default 8; supports multiples of 4 from 8 to 128). The ratio stays exact. The preview shows the actual size and MP: 4:5 at 2 MP, divisible by 8, gives 1280 x 1600, or 2.048 MP.

MP and Divisible By are always visible in Canvas. Click the preview row to choose **Preserve Aspect Ratio (Recommended)** or **Calculate from Pixels**. The latter uses **Pixel Calculation Value** (each unit is 1024 x 1024 pixels) and rounds width and height separately. Editing the always-visible MP control activates Preserve Aspect Ratio. Existing workflows retain their saved fixed dimensions until you choose a calculation method or edit MP / Divisible By; saved fixed dimensions are not offered as a menu choice. Stored budgets in ten-thousand-pixel units display as MP automatically (300 becomes 3 MP) without changing the saved size.

Connect **Recommended Width / Recommended Height** to the actual latent inputs. Random or connected ratios show a pending preview. Free Prompt and TXT ratios are not parsed. Clearing prompts keeps these size settings; older workflows retain their original sizes.
