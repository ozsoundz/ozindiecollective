#!/usr/bin/env python3
"""
sync-asset-versions.py

Problem this solves: every page loads the site's shared JS/CSS files with a
manual cache-busting query string, e.g. <script src="assets/js/main.js?v=12">.
Whenever main.js, nav-inject.js, supabase.js or style.css is edited, that
version number has to be bumped by hand on every single page (and inside any
dynamic import() calls) or browsers that already cached the old file under
the old URL will keep serving stale code/content indefinitely. This has
already caused two live bugs (stale footer links, a stale supabase.js
missing new exports) because a number was forgotten somewhere.

This script removes the "remember to bump a number" step entirely. It hashes
the actual current content of each shared asset and rewrites every reference
to it (in every .html and .js file, including inside dynamic import() calls)
to a `?v=<hash>` that matches. If the file's content hasn't changed, the hash
doesn't change, and nothing is rewritten. If it has changed, every reference
everywhere is updated together — there is no longer a place for a stale
version number to hide.

Run this after editing any of the tracked assets, before committing:

    python3 scripts/sync-asset-versions.py

It's safe to run any time, including when nothing changed (no-op).
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Shared assets loaded site-wide via a cache-busting query string. Add new
# entries here if another shared file gets this same treatment.
TRACKED_ASSETS = [
    "assets/js/nav-inject.js",
    "assets/js/main.js",
    "assets/js/supabase.js",
    "assets/css/style.css",
]

# File types that might reference a tracked asset (page markup, or JS that
# dynamically import()s another asset, e.g. nav-inject.js importing supabase.js).
SCAN_GLOBS = ["**/*.html", "**/*.js"]


def content_hash(path: Path, length: int = 8) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:length]


def main():
    hashes = {}
    for rel in TRACKED_ASSETS:
        path = ROOT / rel
        if not path.exists():
            print(f"  ! skipping {rel} — file not found")
            continue
        basename = path.name
        hashes[basename] = content_hash(path)

    changed_files = []
    scanned = 0
    for pattern in SCAN_GLOBS:
        for file in ROOT.glob(pattern):
            if "scripts/" in str(file.relative_to(ROOT)):
                continue
            scanned += 1
            text = file.read_text(encoding="utf-8")
            original = text
            for basename, h in hashes.items():
                escaped = re.escape(basename)
                # Matches basename?v=ANYTHING (query value = anything but a quote/paren/whitespace)
                text = re.sub(
                    rf"{escaped}\?v=[^\"'\s)]+",
                    f"{basename}?v={h}",
                    text,
                )
            if text != original:
                file.write_text(text, encoding="utf-8")
                changed_files.append(str(file.relative_to(ROOT)))

    print(f"Scanned {scanned} files.")
    print("Current asset versions:")
    for basename, h in hashes.items():
        print(f"  {basename} -> v={h}")
    if changed_files:
        print(f"\nUpdated {len(changed_files)} file(s):")
        for f in changed_files:
            print(f"  {f}")
    else:
        print("\nNo references needed updating — everything already matches current content.")


if __name__ == "__main__":
    main()
