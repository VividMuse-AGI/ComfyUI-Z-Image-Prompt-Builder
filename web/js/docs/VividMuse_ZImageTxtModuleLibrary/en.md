# Z-Image TXT Module Library

Imports one structured module fragment at a time. It can occupy the place of a built-in module in a modular chain, or add an independent Custom fragment.

## Required format

```text
## Soft window lighting
Module: Visual Style
Tags: soft light, low contrast
Soft window light, a low-contrast palette, and fine film grain.
---
```

Accepted English module names are Canvas, Person, Hair, Clothing, Pose & Action, Scene, Photography, Visual Style, and Custom. `Tags:` or `Tag:` is optional. Chinese keywords and module names remain supported.

The file limit is 1 MB, with up to 500 entries and 20,000 characters per entry. See `examples/TXT-module-library-example.en.txt` in the node package.
