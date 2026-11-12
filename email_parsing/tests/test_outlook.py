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


def test_clean_markdown_removes_noise_but_keeps_information():
    text = (
        "​‌͏​  \n"
        "![Big Give logo](https://img.example/logo.png)\n"
        "![](https://img.example/pixel.gif)\n"
        "[![](https://img.example/banner.png)](https://track.example/click/abc)\n"
        "Kent  Community   Fund: grants of  £5,000 until 30 November 2026.\n"
        "[Apply here](https://kent.example/apply?round=3&utm_source=news&utm_medium=email&fbclid=zz)\n"
        "[https://kent.example/guide](https://kent.example/guide)\n"
        "---\n"
        "View in browser\n"
        "View in browser\n"
        "Contact: grants@kent.example\n"
    )
    out = outlook._clean_markdown(text)
    # Noise is gone.
    assert "​" not in out and "pixel.gif" not in out and "banner.png" not in out
    assert "utm_" not in out and "fbclid" not in out and "---" not in out
    assert out.count("View in browser") == 1
    assert "Kent Community Fund" in out  # repeated spaces collapsed
    # Information is kept.
    assert "Big Give logo" in out  # image alt text
    assert "£5,000 until 30 November 2026" in out
    assert "[Apply here](https://kent.example/apply?round=3)" in out  # real param kept
    assert "\n[https://" not in out and "https://kent.example/guide" in out
    assert "grants@kent.example" in out


def test_strip_tracking_leaves_clean_urls_untouched():
    url = "https://example.org/a?x=1&y=%20two"
    assert outlook._strip_tracking(url) == url
    assert outlook._strip_tracking("https://example.org/?utm_source=a") == "https://example.org/"
