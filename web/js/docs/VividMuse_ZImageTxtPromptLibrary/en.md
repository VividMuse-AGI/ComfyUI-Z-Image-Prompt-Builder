# Z-Image TXT Prompt Library

Imports complete prompts from a local `.txt` file and inserts the selected entry into a modular text chain.

## Recommended format

```text
## Warm cafe portrait
Tags: portrait, cafe, warm light
A complete natural-language prompt goes here.
---
```

`Tags:` or `Tag:` is optional. Tags help organize entries and are not appended to prompts. If the file contains no `##` headings, every non-empty, non-comment line becomes one prompt.

The file limit is 1 MB, with up to 500 entries and 20,000 characters per entry. See `examples/TXT-prompt-library-example.en.txt` in the node package.
