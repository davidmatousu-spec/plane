"""
Data migration: Auto-detect "zaplaceno" in dealer field and set dealer_paid=True.
Also normalizes the dealer name to the canonical value.
"""
from django.db import migrations


# Dealer alias mapping (same as frontend dealer-config.ts)
DEALER_ALIASES = {
    # Adam Bosák
    "adam": "Adam Bosák",
    "bosák": "Adam Bosák",
    "bosak": "Adam Bosák",
    "adam bosák": "Adam Bosák",
    "adam bosak": "Adam Bosák",
    # Josef Sankot
    "josef": "Josef Sankot",
    "sankot": "Josef Sankot",
    "šankot": "Josef Sankot",
    "josef sankot": "Josef Sankot",
    "josef šankot": "Josef Sankot",
    # Jan Pertl
    "jan": "Jan Pertl",
    "pertl": "Jan Pertl",
    "jan pertl": "Jan Pertl",
    "honza": "Jan Pertl",
}

CANONICAL_NAMES = ["Adam Bosák", "Josef Sankot", "Jan Pertl"]


def normalize_dealer(raw):
    """Normalize a dealer string to a canonical name."""
    if not raw or not raw.strip():
        return ""
    trimmed = raw.strip()

    # Exact match
    for name in CANONICAL_NAMES:
        if name.lower() == trimmed.lower():
            return name

    # Alias lookup
    key = trimmed.lower()
    if key in DEALER_ALIASES:
        return DEALER_ALIASES[key]

    # Fuzzy: check if any alias is contained in the input
    for alias, full_name in DEALER_ALIASES.items():
        if alias in key or key in alias:
            return full_name

    return trimmed


def auto_set_dealer_paid(apps, schema_editor):
    """
    Find issues where dealer field contains 'zaplaceno' (case-insensitive).
    Set dealer_paid=True and normalize the dealer name.
    """
    Issue = apps.get_model("db", "Issue")

    # Find all issues with "zaplaceno" in dealer field
    issues_with_zaplaceno = Issue.objects.filter(
        dealer__icontains="zaplaceno"
    )

    count = 0
    for issue in issues_with_zaplaceno:
        # Extract the dealer name by removing "zaplaceno" and common separators
        raw = issue.dealer
        # Remove "zaplaceno" and common patterns
        cleaned = raw.lower()
        for pattern in ["- zaplaceno", "zaplaceno -", "zaplaceno", "- zaplac", "zaplac"]:
            cleaned = cleaned.replace(pattern, "")
        cleaned = cleaned.strip(" -.,;:/")

        # Normalize the cleaned name
        if cleaned:
            normalized = normalize_dealer(cleaned)
        else:
            # If nothing left after removing "zaplaceno", try normalizing original
            normalized = normalize_dealer(raw)

        # Update the issue
        issue.dealer = normalized if normalized else issue.dealer
        issue.dealer_paid = True
        issue.save(update_fields=["dealer", "dealer_paid"])
        count += 1

    if count:
        print(f"\n  → Set dealer_paid=True for {count} issues with 'zaplaceno' in dealer field")

    # Also normalize all other dealer values (without setting paid)
    all_with_dealer = Issue.objects.filter(dealer__isnull=False).exclude(dealer="")
    norm_count = 0
    for issue in all_with_dealer:
        normalized = normalize_dealer(issue.dealer)
        if normalized != issue.dealer:
            issue.dealer = normalized
            issue.save(update_fields=["dealer"])
            norm_count += 1

    if norm_count:
        print(f"  → Normalized {norm_count} dealer names to canonical form")


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
