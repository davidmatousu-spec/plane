"""
Data migration: Auto-detect "zaplaceno" in dealer field and set dealer_paid=True.
Also normalizes dealer names to canonical values.
Uses raw SQL to avoid model manager issues.
"""
from django.db import migrations, connection


# Dealer alias mapping
DEALER_ALIASES = {
    "adam": "Adam Bosák",
    "bosák": "Adam Bosák",
    "bosak": "Adam Bosák",
    "adam bosák": "Adam Bosák",
    "adam bosak": "Adam Bosák",
    "josef": "Josef Sankot",
    "sankot": "Josef Sankot",
    "šankot": "Josef Sankot",
    "josef sankot": "Josef Sankot",
    "josef šankot": "Josef Sankot",
    "jan": "Jan Pertl",
    "pertl": "Jan Pertl",
    "jan pertl": "Jan Pertl",
    "honza": "Jan Pertl",
}

CANONICAL_NAMES = ["Adam Bosák", "Josef Sankot", "Jan Pertl"]


def normalize_dealer(raw):
    if not raw or not raw.strip():
        return ""
    trimmed = raw.strip()
    for name in CANONICAL_NAMES:
        if name.lower() == trimmed.lower():
            return name
    key = trimmed.lower()
    if key in DEALER_ALIASES:
        return DEALER_ALIASES[key]
    for alias, full_name in DEALER_ALIASES.items():
        if alias in key or key in alias:
            return full_name
    return trimmed


def auto_set_dealer_paid(apps, schema_editor):
    with connection.cursor() as cursor:
        # Step 1: Find issues with "zaplaceno" in dealer field
        cursor.execute(
            "SELECT id, dealer FROM issues WHERE LOWER(dealer) LIKE %s",
            ["%zaplaceno%"],
        )
        rows = cursor.fetchall()
        paid_count = 0

        for issue_id, raw_dealer in rows:
            cleaned = raw_dealer.lower()
            for pattern in ["- zaplaceno", "zaplaceno -", "zaplaceno", "- zaplac", "zaplac"]:
                cleaned = cleaned.replace(pattern, "")
            cleaned = cleaned.strip(" -.,;:/")
            normalized = normalize_dealer(cleaned) if cleaned else normalize_dealer(raw_dealer)

            cursor.execute(
                "UPDATE issues SET dealer = %s, dealer_paid = TRUE WHERE id = %s",
                [normalized if normalized else raw_dealer, issue_id],
            )
            paid_count += 1

        if paid_count:
            print(f"\n  -> Set dealer_paid=True for {paid_count} issues")

        # Step 2: Normalize remaining dealer names
        cursor.execute(
            "SELECT id, dealer FROM issues WHERE dealer IS NOT NULL AND dealer != ''",
        )
        rows = cursor.fetchall()
        norm_count = 0

        for issue_id, raw_dealer in rows:
            normalized = normalize_dealer(raw_dealer)
            if normalized != raw_dealer:
                cursor.execute(
                    "UPDATE issues SET dealer = %s WHERE id = %s",
                    [normalized, issue_id],
                )
                norm_count += 1

        if norm_count:
            print(f"  -> Normalized {norm_count} dealer names")


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0119_issue_dealer_paid_issueversion_dealer_paid"),
    ]

    operations = [
        migrations.RunPython(
            auto_set_dealer_paid,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
