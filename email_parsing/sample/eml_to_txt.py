"""
Convert .eml files to .txt (Markdown) for use as test fixtures.

Uses MarkItDown for structure-preserving conversion — headings, bullet lists,
and tables in HTML emails are kept as Markdown so test fixtures closely match
what the live pipeline feeds to the LLM.

Usage (run from anywhere):
    python eml_to_txt.py emails/          # convert all .eml in a folder
    python eml_to_txt.py file.eml         # convert a single file
    python eml_to_txt.py *.eml            # glob pattern
    python eml_to_txt.py file.eml --out out/   # write to a different folder
"""

import argparse
import sys
from pathlib import Path

from markitdown import MarkItDown


def eml_to_markdown(eml_path: Path) -> str:
    """Convert a single .eml file to Markdown text via MarkItDown."""
    md = MarkItDown()
    result = md.convert(str(eml_path))
    return result.text_content


def convert(sources: list[str], output_dir: str | None = None) -> None:
    out_dir = Path(output_dir) if output_dir else None

    eml_files: list[Path] = []
    for src in sources:
        p = Path(src)
        if p.is_dir():
            eml_files.extend(sorted(p.rglob("*.eml")))
        elif p.is_file() and p.suffix.lower() == ".eml":
            eml_files.append(p)
        else:
            matched = sorted(Path(".").glob(str(src)))
            eml_files.extend(f for f in matched if f.suffix.lower() == ".eml")

    if not eml_files:
        print("No .eml files found.")
        return

    for eml_path in eml_files:
        try:
            text = eml_to_markdown(eml_path)
            if out_dir:
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = out_dir / eml_path.with_suffix(".txt").name
            else:
                out_path = eml_path.with_suffix(".txt")
            out_path.write_text(text, encoding="utf-8")
            print(f"✓ {eml_path}  →  {out_path}")
        except Exception as exc:
            print(f"✗ {eml_path}: {exc}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert .eml files to Markdown text.")
    parser.add_argument("sources", nargs="+", help=".eml file(s), folder, or glob pattern")
    parser.add_argument("--out", dest="output_dir", default=None, help="Output directory")
    args = parser.parse_args()
    convert(args.sources, args.output_dir)
