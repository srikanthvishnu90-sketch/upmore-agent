#!/usr/bin/env python3
"""Replace every secret value with *** in every file under a directory (the deploy workflow's artifacts).

The values come from the environment variables MASK_1, MASK_2, ... (empty ones are skipped); a postgres:// URL's
password is masked on its own too. Nothing is printed but counts: never a value.
  MASK_1=... python3 scripts/launch/mask-artifacts.py <dir>
"""
import os
import re
import sys


def secrets_from_env(env):
    values = []
    for key, value in env.items():
        if not re.fullmatch(r"MASK_[0-9]+", key) or not value:
            continue
        values.append(value)
        m = re.match(r"^[a-z]+://[^:/@]+:([^@]+)@", value)
        if m:
            values.append(m.group(1))
    # Longest first, so a value that contains another is masked whole; under 4 characters is never a secret worth a match.
    return sorted({v for v in values if len(v) >= 4}, key=len, reverse=True)


def mask_dir(root, values):
    files = changed = 0
    for base, _dirs, names in os.walk(root):
        for name in names:
            path = os.path.join(base, name)
            if os.path.islink(path):
                continue
            files += 1
            with open(path, "rb") as fh:
                data = fh.read()
            new = data
            for v in values:
                new = new.replace(v.encode(), b"***")
            if new != data:
                changed += 1
                with open(path, "wb") as fh:
                    fh.write(new)
    return files, changed


def main(argv):
    if len(argv) != 2 or not os.path.isdir(argv[1]):
        print("usage: mask-artifacts.py <dir>")
        return 64
    files, changed = mask_dir(argv[1], secrets_from_env(os.environ))
    print(f"masked: {files} files checked, {changed} had a secret value replaced by ***")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
