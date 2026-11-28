import io
from pathlib import Path
import subprocess
import sys
import unittest
import warnings
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.build_release import PACKAGE, REQUIRED, tag_version, validate_archive


class ReleasePackageTests(unittest.TestCase):
    def archive(self, *, version="0.5.0", extra=None, omit=None):
        files = {name: "fixture" for name in REQUIRED | {"docs/releases/v0.5.0.md"}}
        files["pyproject.toml"] = f'[project]\nname = "{PACKAGE}"\nversion = "{version}"\n\n[tool.comfy]\n'
        if omit:
            files.pop(omit)
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            for name, value in files.items():
                archive.writestr(f"{PACKAGE}/{name}", value)
            if extra:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    archive.writestr(extra, "unexpected")
        return stream.getvalue()

    def test_stable_tags(self):
        self.assertEqual(tag_version("v0.5.0"), "0.5.0")
        for tag in ["0.5.0", "v01.5.0", "v0.5.0-rc1", "../v0.5.0", "v0.5.0\n"]:
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                tag_version(tag)

    def test_fixed_root_archive(self):
        self.assertEqual(validate_archive(self.archive(), "v0.5.0"), len(REQUIRED) + 1)

    def test_coherence_runtime_is_required(self):
        self.assertIn("combination_coherence.py", REQUIRED)
        with self.assertRaisesRegex(ValueError, "Missing release files"):
            validate_archive(self.archive(omit="combination_coherence.py"), "v0.5.0")

    def test_split_python_modules_are_required(self):
        for name in ("prompt_catalog.py", "prompt_resolver.py", "prompt_render_zh.py", "prompt_render_en.py"):
            with self.subTest(name=name):
                self.assertIn(name, REQUIRED)
                with self.assertRaisesRegex(ValueError, "Missing release files"):
                    validate_archive(self.archive(omit=name), "v0.5.0")

    def test_version_mismatch(self):
        with self.assertRaisesRegex(ValueError, "project version"):
            validate_archive(self.archive(version="0.4.2"), "v0.5.0")

    def test_shoot_plan_runtime_dependencies_are_required(self):
        for name in ("web/js/lib/shoot_plan_core.mjs", "web/js/lib/shoot_plan_cards.mjs"):
            with self.subTest(name=name):
                self.assertIn(name, REQUIRED)
                with self.assertRaisesRegex(ValueError, "Missing release files"):
                    validate_archive(self.archive(omit=name), "v0.5.0")

    def test_required_runtime_and_release_files(self):
        for name in REQUIRED | {"docs/releases/v0.5.0.md"}:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Missing"):
                validate_archive(self.archive(omit=name), "v0.5.0")

    def test_card_organization_runtime_dependencies_are_required(self):
        for name in ("web/js/lib/card_organization.mjs", "web/js/lib/card_organization_ui.mjs"):
            with self.subTest(name=name):
                self.assertIn(name, REQUIRED)
                with self.assertRaisesRegex(ValueError, "Missing release files"):
                    validate_archive(self.archive(omit=name), "v0.5.0")

    def test_card_combination_runtime_dependencies_are_required(self):
        for name in (
            "web/js/lib/card_combination_core.mjs",
            "web/js/lib/card_combination_ui.mjs",
            "web/js/lib/workflow_tools.mjs",
            "web/js/lib/shoot_plan_core.mjs",
        ):
            with self.subTest(name=name):
                self.assertIn(name, REQUIRED)
                with self.assertRaisesRegex(ValueError, "Missing release files"):
                    validate_archive(self.archive(omit=name), "v0.5.0")

    def test_unsafe_or_unwanted_paths(self):
        for name in [
            "other/file",
            f"{PACKAGE}/../escape",
            f"{PACKAGE}/.git/config",
            f"{PACKAGE}/__pycache__/nodes.pyc",
            f"{PACKAGE}/..\\escape",
            f"{PACKAGE}/tests/test_release_package.py",
            f"{PACKAGE}/scripts/build_release.py",
            f"{PACKAGE}/docs/plans/plan.md",
        ]:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Unexpected"):
                validate_archive(self.archive(extra=name), "v0.5.0")

    def test_card_application_transaction_is_required(self):
        name = "web/js/lib/card_apply_transaction.mjs"
        self.assertIn(name, REQUIRED)
        with self.assertRaisesRegex(ValueError, "Missing release files"):
            validate_archive(self.archive(omit=name), "v0.5.0")

    def test_duplicate_paths(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_archive(self.archive(extra=f"{PACKAGE}/nodes.py"), "v0.5.0")

    def test_card_usability_runtime_dependencies_are_required(self):
        for name in (
            "web/js/lib/import_guidance.mjs",
            "web/js/lib/card_summary.mjs",
            "web/js/lib/card_summary_view.mjs",
            "web/js/index.js",
            "web/js/data/i18n_catalog.json",
            "web/js/data/library_catalog.json",
            "web/js/lib/widget_utils.mjs",
            "web/js/lib/submission_observer.mjs",
            "web/js/lib/prompt_schema_catalog.mjs",
        ):
            with self.subTest(name=name):
                self.assertIn(name, REQUIRED)
                with self.assertRaisesRegex(ValueError, "Missing release files"):
                    validate_archive(self.archive(omit=name), "v0.5.0")

    def test_git_archive_excludes_dev_paths_via_gitattributes(self):
        repo = Path(__file__).resolve().parents[1]
        gitattributes = (repo / ".gitattributes").read_text(encoding="utf-8")
        for pattern in ("tests/ export-ignore", "scripts/ export-ignore", ".github/ export-ignore", "docs/plans/ export-ignore"):
            self.assertIn(pattern, gitattributes)
        head_archive = subprocess.check_output(["git", "archive", "--format=zip", f"--prefix={PACKAGE}/", "HEAD"], cwd=repo)
        with zipfile.ZipFile(io.BytesIO(head_archive)) as archive:
            names = set(archive.namelist())
            # Uncommitted changes on HEAD may still sit in index/worktree; check .gitattributes-filtered entries on HEAD if committed.
            self.assertIn(f"{PACKAGE}/pyproject.toml", names)


if __name__ == "__main__":
    unittest.main()
