"""Prepare long email text for the LLM: short link placeholders and splitting.

Both steps keep all the information:
- `shorten_links()` replaces each long URL with a placeholder such as `<L12>`.
  The URL is random text and uses many tokens. `restore_links()` puts it back.
- `split_text()` cuts the text into parts that fit in one LLM request. It cuts
  only between table cells and lines, never in a sentence, and it does not leave
  a short heading alone at the end of a part.
"""

from __future__ import annotations

import re
from typing import Any

# A URL ends at a space or at one of these characters.
_URL = re.compile(r"https?://[^\s)\]>\"']+")
_PLACEHOLDER = re.compile(r"<L(\d+)>")
# Table cells and lines are the units of the split.
_SEPARATOR = re.compile(r"( \| |\n)")
# A unit shorter than this is probably a heading or a title.
_SHORT_UNIT = 120
_MAX_MOVED_UNITS = 3


def shorten_links(text: str, min_length: int = 60) -> tuple[str, dict[int, str]]:
    """Replace each URL longer than *min_length* with `<L{n}>`. Same URL, same number."""
    links: dict[int, str] = {}
    numbers: dict[str, int] = {}

    def replace(match: re.Match[str]) -> str:
        url = match.group(0)
        if len(url) <= min_length:
            return url
        if url not in numbers:
            numbers[url] = len(numbers) + 1
            links[numbers[url]] = url
        return f"<L{numbers[url]}>"

    return _URL.sub(replace, text), links


def restore_links(value: Any, links: dict[int, str]) -> Any:
    """Put the original URLs back into all the strings in *value* (dict, list or str).

    A placeholder that is not in *links* (the model made it up) is removed.
    """
    if isinstance(value, str):
        return _PLACEHOLDER.sub(lambda m: links.get(int(m.group(1)), ""), value)
    if isinstance(value, list):
        return [restore_links(v, links) for v in value]
    if isinstance(value, dict):
        return {k: restore_links(v, links) for k, v in value.items()}
    return value


def _units(text: str) -> list[str]:
    """Split *text* at table cells and lines. Joining the units gives back *text*."""
    parts = _SEPARATOR.split(text)
    return [a + b for a, b in zip(parts[0::2], parts[1::2] + [""])]


def _break_long(unit: str, limit: int) -> list[str]:
    """Cut one unit that is longer than *limit*, at sentence ends if possible."""
    pieces: list[str] = []
    current = ""
    for sentence in re.split(r"(?<=[.!?]) ", unit):
        sentence += " "
        while len(sentence) > limit:  # a sentence with no break: hard cut
            if current:
                pieces.append(current)
                current = ""
            pieces.append(sentence[:limit])
            sentence = sentence[limit:]
        if len(current) + len(sentence) > limit:
            pieces.append(current)
            current = ""
        current += sentence
    if current:
        pieces.append(current)
    return pieces


def split_text(text: str, limit: int) -> list[str]:
    """Split *text* into parts of about *limit* characters. No text is lost."""
    if len(text) <= limit:
        return [text]

    units: list[str] = []
    for unit in _units(text):
        units.extend(_break_long(unit, limit) if len(unit) > limit else [unit])

    parts: list[str] = []
    current: list[str] = []
    size = 0
    for unit in units:
        if current and size + len(unit) > limit:
            # Move short headings at the end of this part to the next part, so a
            # title stays with its description.
            moved: list[str] = []
            while (
                len(current) > 1
                and len(moved) < _MAX_MOVED_UNITS
                and len(current[-1].strip()) < _SHORT_UNIT
            ):
                moved.insert(0, current.pop())
            parts.append("".join(current))
            current = moved
            size = sum(len(u) for u in current)
        current.append(unit)
        size += len(unit)
    if current:
        parts.append("".join(current))
    parts = [p.strip() for p in parts if p.strip()]
    # A very short last part costs a whole request: join it to the part before.
    if len(parts) > 1 and len(parts[-1]) < limit * 0.15 and len(parts[-2]) + len(parts[-1]) <= limit * 1.15:
        parts[-2:] = [parts[-2] + "\n" + parts[-1]]
    return parts
