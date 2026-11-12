from __future__ import annotations

import json
import re

from email_parsing import chunking, llm


def _norm(text: str) -> str:
    return re.sub(r"[\s|]+", "", text)


def test_shorten_and_restore_links_round_trip():
    long_url = "https://r1.example.org/c/" + "A" * 100
    text = f"[One]({long_url}) and [Two]({long_url}) and [Short](https://a.org/x)"
    short, links = chunking.shorten_links(text)
    assert short == "[One](<L1>) and [Two](<L1>) and [Short](https://a.org/x)"
    assert links == {1: long_url}
    assert chunking.restore_links(short, links) == text


def test_restore_links_removes_made_up_placeholder_and_handles_nesting():
    links = {1: "https://x.org/" + "a" * 80}
    value = {"website": "<L1>", "notes": ["see <L1>", "see <L9>"], "n": 3}
    assert chunking.restore_links(value, links) == {
        "website": links[1],
        "notes": [f"see {links[1]}", "see "],
        "n": 3,
    }


def test_split_text_short_text_is_one_part():
    assert chunking.split_text("hello | world", 100) == ["hello | world"]


def test_split_text_keeps_all_text_and_cuts_between_cells():
    cells = [f"Cell {i} " + "word " * 40 for i in range(30)]
    text = " | ".join(cells)
    parts = chunking.split_text(text, 1000)
    assert len(parts) > 1
    assert _norm("".join(parts)) == _norm(text)
    assert all(len(p) <= 1200 for p in parts)
    # Every part starts at the start of a cell.
    assert all(p.startswith("Cell ") for p in parts)


def test_split_text_keeps_title_with_its_description():
    items = []
    for i in range(20):
        items.append(f"[Fund {i}](<L{i}>)")
        items.append(f"Description of fund {i}. " + "text " * 50)
    text = " | ".join(items)
    for part in chunking.split_text(text, 1500):
        first = part.split(" | ")[0]
        assert not first.startswith("Description"), "a description lost its title"
        assert not part.rstrip().endswith("(<L%s>)" % re.findall(r"Fund (\d+)\]", part)[-1]), "title left alone"


def test_split_text_cuts_a_very_long_cell():
    text = "Sentence number one. " * 300
    parts = chunking.split_text(text, 1000)
    assert len(parts) > 1
    assert all(len(p) <= 1100 for p in parts)
    assert _norm("".join(parts)) == _norm(text)


def test_split_text_joins_a_tiny_last_part():
    text = " | ".join(["x" * 480] * 4 + ["tail"])
    parts = chunking.split_text(text, 1000)
    assert parts[-1].endswith("tail")
    assert not any(p == "tail" for p in parts)


def _item(name, website=None, **over):
    base = {
        "funder_name": name, "program_name": None, "amount_min": None, "amount_max": 1000,
        "amount_typical": None, "type": "trust_foundation", "deadline": "unknown",
        "location": "Kent", "duration_months": None, "description": "d", "notes": "",
        "website": website, "contact_name": None, "contact_email": None,
    }
    base.update(over)
    return base


def test_parse_email_several_parts_merges_and_restores_links(monkeypatch):
    monkeypatch.setattr(llm.config, "EMAIL_CHUNK_CHARS", 300)
    long_url = "https://r1.example.org/c/" + "B" * 100
    body = " | ".join(f"Para {i} " + "word " * 30 for i in range(8)) + f" | [Apply]({long_url})"
    seen_users: list[str] = []
    answers = iter([
        {"classification": "NEWSLETTER", "confidence": 0.6, "opportunities": []},
        {"classification": "FUNDING_OPPORTUNITY", "confidence": 0.9,
         "opportunities": [_item("Alpha Trust", "<L1>"), _item("Beta Trust", "<L77>")]},
        {"classification": "FUNDING_OPPORTUNITY", "confidence": 0.8,
         "opportunities": [_item("alpha trust "), _item("Gamma Trust")]},
    ])

    def fake_chat(system, user, *, stage, schema):
        seen_users.append(user)
        return json.dumps(next(answers, {"classification": "IRRELEVANT", "confidence": 0.7, "opportunities": []}))

    monkeypatch.setattr(llm, "_chat", fake_chat)
    result = llm.parse_email({"id": "e", "subject": "s", "body": body})

    assert len(seen_users) >= 3
    assert seen_users[0].startswith(f"Part 1 of {len(seen_users)}\n")
    assert long_url not in "".join(seen_users)
    assert result.classification == "FUNDING_OPPORTUNITY"
    assert result.classification_confidence == 0.9
    assert [o.funder_name for o in result.opportunities] == ["Alpha Trust", "Beta Trust", "Gamma Trust"]
    assert [o.id for o in result.opportunities] == ["opp-0", "opp-1", "opp-2"]
    assert str(result.opportunities[0].website) == long_url
    assert result.opportunities[1].website == ""  # made-up placeholder removed


def test_parse_email_several_parts_without_opportunities_is_newsletter(monkeypatch):
    monkeypatch.setattr(llm.config, "EMAIL_CHUNK_CHARS", 300)
    answers = iter([
        {"classification": "IRRELEVANT", "confidence": 0.9, "opportunities": []},
        {"classification": "NEWSLETTER", "confidence": 0.7, "opportunities": []},
    ])
    monkeypatch.setattr(
        llm, "_chat",
        lambda system, user, *, stage, schema: json.dumps(
            next(answers, {"classification": "IRRELEVANT", "confidence": 0.9, "opportunities": []})
        ),
    )
    body = " | ".join("word " * 60 for _ in range(6))
    result = llm.parse_email({"id": "e", "subject": "s", "body": body})
    assert result.classification == "NEWSLETTER"
    assert result.classification_confidence == 0.7
    assert result.opportunities == []


def test_parse_email_limits_number_of_parts(monkeypatch):
    monkeypatch.setattr(llm.config, "EMAIL_CHUNK_CHARS", 300)
    monkeypatch.setattr(llm.config, "EMAIL_MAX_CHUNKS", 2)
    calls = []

    def fake_chat(system, user, *, stage, schema):
        calls.append(user)
        return json.dumps({"classification": "IRRELEVANT", "confidence": 0.5, "opportunities": []})

    monkeypatch.setattr(llm, "_chat", fake_chat)
    llm.parse_email({"id": "e", "subject": "s", "body": " | ".join("word " * 60 for _ in range(10))})
    assert len(calls) == 2
