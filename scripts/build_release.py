"""Build a fixed-root installation ZIP from the exact tested Git tag (stdlib only)."""

import argparse
import hashlib
import io
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile


PACKAGE = "ComfyUI-Z-Image-Prompt-Builder"
REQUIRED = {
    "__init__.py", "nodes.py", "modular_nodes.py", "resolution.py",
    "pyproject.toml", "LICENSE", "README.md", "README.en.md",
    "phrase_library/core_v1.json", "web/js/preset_sync.js",
    "web/js/i18n_catalog.js", "web/js/resolution_catalog.js",
}


def tag_version(tag):
    if not re.fullmatch(r"v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", tag):
        raise ValueError("Expected a stable version tag such as v0.5.0")
    return tag[1:]


def validate_archive(data, tag):
    version = tag_version(tag)
    prefix = PACKAGE + "/"
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Archive contains duplicate paths")
        for name in names:
            parts = PurePosixPath(name).parts
            if (not name.startswith(prefix) or "\\" in name or ".." in parts
                    or ".git" in parts or "__pycache__" in parts):
                raise ValueError("Unexpected archive path: " + name)
        required = REQUIRED | {f"docs/releases/{tag}.md"}
        missing = {prefix + name for name in required} - set(names)
        if missing:
            raise ValueError("Missing release files: " + ", ".join(sorted(missing)))
        metadata = archive.read(prefix + "pyproject.toml").decode("utf-8")
        project = re.search(r"(?ms)^\[project\]\s*\n(.*?)(?=^\[|\Z)", metadata)
        found = re.search(r'^version\s*=\s*"([^"]+)"\s*$', project[1], re.M) if project else None
        if not found or found[1] != version:
            raise ValueError("Tag does not match the archived project version")
        if archive.testzip() is not None:
            raise ValueError("Archive CRC verification failed")
    return len(names)


def build_release(repo, tag, output_dir):
    tag_version(tag)

    def git(*args):
        return subprocess.check_output(["git", *args], cwd=repo)

    # A tag must already exist and point to the checked-out, tested commit.
    commit = git("rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}").strip()
    if commit != git("rev-parse", "HEAD").strip():
        raise ValueError("Release tag must point to HEAD")
    data = git("archive", "--format=zip", f"--prefix={PACKAGE}/", commit.decode("ascii"))
    entries = validate_archive(data, tag)
    output_dir = Path(output_dir)
    zip_path = output_dir / f"{PACKAGE}-{tag}.zip"
    checksum_path = output_dir / "SHA256SUMS.txt"
    if zip_path.exists() or checksum_path.exists():
        raise FileExistsError("Use a fresh output directory; existing artifacts are not overwritten")
    output_dir.mkdir(parents=True, exist_ok=True)
    with zip_path.open("xb") as stream:
        stream.write(data)
    checksum = hashlib.sha256(data).hexdigest()
    with checksum_path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(f"{checksum}  {zip_path.name}\n")
    print(f"Verified {entries} archive entries: {zip_path}")
    print(f"SHA256: {checksum}")
    return zip_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag")
    parser.add_argument("--output-dir", default="dist")
    args = parser.parse_args()
    build_release(Path(__file__).resolve().parents[1], args.tag, args.output_dir)
