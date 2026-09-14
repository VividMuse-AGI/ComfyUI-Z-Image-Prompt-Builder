import io
from pathlib import Path
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

    def test_version_mismatch(self):
        with self.assertRaisesRegex(ValueError, "project version"):
            validate_archive(self.archive(version="0.4.2"), "v0.5.0")

    def test_required_runtime_and_release_files(self):
        for name in REQUIRED | {"docs/releases/v0.5.0.md"}:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Missing"):
                validate_archive(self.archive(omit=name), "v0.5.0")

    def test_unsafe_or_unwanted_paths(self):
        for name in ["other/file", f"{PACKAGE}/../escape", f"{PACKAGE}/.git/config",
                     f"{PACKAGE}/__pycache__/nodes.pyc", f"{PACKAGE}/..\\escape"]:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Unexpected"):
                validate_archive(self.archive(extra=name), "v0.5.0")

    def test_duplicate_paths(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_archive(self.archive(extra=f"{PACKAGE}/nodes.py"), "v0.5.0")


if __name__ == "__main__":
    unittest.main()
