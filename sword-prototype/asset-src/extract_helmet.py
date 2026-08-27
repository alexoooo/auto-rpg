"""Extract Quaternius Helmet3 and its material roles from the pinned CC0 archive."""

import argparse
from pathlib import Path
import sys
import zipfile


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def main():
    args = arguments()
    args.output.mkdir(parents=True, exist_ok=True)
    wanted = {
        "Helmet3.obj": "Knight Character by @Quaternius/OBJ/Helmet3.obj",
        "Helmet3.mtl": "Knight Character by @Quaternius/OBJ/Helmet3.mtl",
    }
    with zipfile.ZipFile(args.source) as archive:
        names = set(archive.namelist())
        for output_name, member in wanted.items():
            if member not in names:
                raise RuntimeError(f'helmet archive has no "{member}"')
            target = args.output / output_name
            target.write_bytes(archive.read(member))
            print(f"wrote {target}")


main()
