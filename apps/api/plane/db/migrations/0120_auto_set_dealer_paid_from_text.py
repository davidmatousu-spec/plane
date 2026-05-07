"""
Data migration: Auto-detect "zaplaceno" in dealer field and set dealer_paid=True.
Also normalizes the dealer name to the canonical value.
Uses raw queryset updates to avoid triggering custom model save() logic.
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
    Uses direct QuerySet.update() to avoid custom save() logic.
    """
    Issue = apps.get_model("db", "Issue")

    # Step 1: Set dealer_paid=True for issues containing "zaplaceno"
    issues_with_zaplaceno = Issue.objects.filter(dealer__icontains="zaplaceno")
    paid_count = 0

    for issue in issues_with_zaplaceno.iterator():
        raw = issue.dealer or ""
        # Remove "zaplaceno" patterns to extract the dealer name
        cleaned = raw.lower()
        for pattern in ["- zaplaceno", "zaplaceno -", "zaplaceno", "- zaplac", "zaplac"]:
            cleaned = cleaned.replace(pattern, "")
        cleaned = cleaned.strip(" -.,;:/")

        normalized = normalize_dealer(cleaned) if cleaned else normalize_dealer(raw)

        # Use QuerySet.update() to bypass custom save()
        Issue.objects.filter(pk=issue.pk).update(
            dealer=normalized if normalized else issue.dealer,
            dealer_paid=True,
        )
        paid_count += 1

    if paid_count:
        print(f"\n  -> Set dealer_paid=True for {paid_count} issues")

    # Step 2: Normalize remaining dealer names
    all_with_dealer = (
        Issue.objects.filter(dealer__isnull=False)
        .exclude(dealer="")
        .exclude(dealer__in=CANONICAL_NAMES)
    )
    norm_count = 0

    for issue in all_with_dealer.iterator():
        normalized = normalize_dealer(issue.dealer)
        if normalized != issue.dealer:
            Issue.objects.filter(pk=issue.pk).update(dealer=normalized)
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
