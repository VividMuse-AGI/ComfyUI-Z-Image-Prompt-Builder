"""Generate categorized location choices without dropping legacy workflow values."""

from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import nodes  # noqa: E402

TARGET = ROOT / "web" / "js" / "preset_sync.js"


def render_catalog() -> str:
    return (
        "const SCENE_LOCATIONS_BY_CATEGORY = "
        + json.dumps(nodes.SCENE_LOCATIONS_BY_CATEGORY, ensure_ascii=False, indent=2)
        + ";\n\nconst SCENE_LOCATION_VALUES = "
        + json.dumps(nodes.FIELD_OPTIONS["场景地点"], ensure_ascii=False, indent=2)
        + ";\n\n"
    )


def main() -> None:
    source = TARGET.read_text(encoding="utf-8")
    start = source.index("const SCENE_LOCATIONS_BY_CATEGORY = ")
    end = source.index("const PRESETS = ", start)
    TARGET.write_text(source[:start] + render_catalog() + source[end:],
                      encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
