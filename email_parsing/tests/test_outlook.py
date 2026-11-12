from email_parsing import config, outlook


def test_delegated_uses_me(monkeypatch):
    monkeypatch.setattr(config, "MSAL_CLIENT_SECRET", "")
    assert outlook._mailbox_base().endswith("/me")


def test_app_only_uses_mailbox_user(monkeypatch):
    monkeypatch.setattr(config, "MSAL_CLIENT_SECRET", "s")
    monkeypatch.setattr(config, "MAILBOX_USER", "fundingopps@music4wellbeing.org.uk")
    assert outlook._mailbox_base().endswith("/users/fundingopps@music4wellbeing.org.uk")


def test_authority_uses_tenant(monkeypatch):
    monkeypatch.setattr(config, "MSAL_TENANT_ID", "music4wellbeing.org.uk")
    assert outlook._authority() == "https://login.microsoftonline.com/music4wellbeing.org.uk"


def test_clean_markdown_removes_empty_table_scaffolding():
    empty = "|  " * 200 + "|"
    sep = "| --- " * 200 + "|"
    text = f"> Begin forwarded message:\n>\n> {empty}\n> {sep}\n> | |  |  | Kent Fund | up to £5,000 |\n\nReal paragraph."
    out = outlook._clean_markdown(text)
    assert "---" not in out
    assert "| Kent Fund | up to £5,000 |" in out
    assert "Real paragraph." in out
    assert len(out) < 120


def test_clean_markdown_keeps_normal_text():
    assert outlook._clean_markdown("Hello\n\n\n\nWorld") == "Hello\n\nWorld"
