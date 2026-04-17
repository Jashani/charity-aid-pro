from datetime import date, datetime


def score_funding_value(amount: float, amount_max: float | None) -> tuple[int, float]:
    """Returns (score, amount_used)."""
    value = amount_max if amount_max is not None else amount
    if value >= 30_000:
        score = 10
    elif value >= 15_000:
        score = 9
    elif value >= 5_000:
        score = 7
    elif value >= 2_000:
        score = 5
    else:
        score = 3
    return score, value


def score_timing(deadline: str) -> tuple[int | None, int | None]:
    """Returns (score, days_to_deadline). None if unknown or expired."""
    if deadline == "unknown":
        return None, None
    try:
        deadline_date = datetime.fromisoformat(deadline).date()
    except ValueError:
        return None, None
    days = (deadline_date - date.today()).days
    if days < 0:
        return None, days
    if days < 7:
        score = 10
    elif days < 30:
        score = 8
    elif days < 90:
        score = 6
    elif days < 180:
        score = 4
    else:
        score = 2
    return score, days


def get_geography_modifier(specificity: str | None) -> float:
    modifiers = {
        "kent_only": 1.10,
        "uk_regional": 1.05,
        "uk_wide": 1.00,
        "unknown": 1.00,
    }
    return modifiers.get(specificity or "unknown", 1.00)
