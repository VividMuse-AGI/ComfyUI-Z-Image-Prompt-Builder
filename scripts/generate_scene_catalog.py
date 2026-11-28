"""Compatibility wrapper delegating scene and prompt schema generation."""

from __future__ import annotations

try:
    from .generate_prompt_schema_catalog import TARGET, main, render_catalog
except ImportError:
    from generate_prompt_schema_catalog import TARGET, main, render_catalog

__all__ = ["TARGET", "main", "render_catalog"]

if __name__ == "__main__":
    main()
