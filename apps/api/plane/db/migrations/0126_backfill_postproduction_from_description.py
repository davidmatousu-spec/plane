"""
Datová migrace: u issues, které mají v tabulce "Časová náročnost" v popisu vyplněné hodiny
postprodukce a PRÁZDNÉ pole Postprodukce, doplní Postprodukce = hodiny × 669 Kč
a přepočítá Náklady celkem (budget_complete) jako součet rozpadu.

- Ručně zadané hodnoty (i 0 Kč) nepřepisuje - jen cost_postproduction IS NULL.
- Smazaná (soft-deleted) issues vynechává.
- Historická částka "Náklady celkem" bez rozpadu se tím přepíše součtem rozpadu
  (stejně jako v 0124); každá přepsaná částka se vypíše do logu migrátoru.
- Parser i sazba jsou tu zkopírované natvrdo (NE import z plane.utils.time_estimate),
  migrace musí zůstat zamrzlá i kdyby se aplikační kód později změnil.
- Raw SQL: v migraci nesmí být Issue.objects ani .save() (viz 0120). Nevratná.
"""
import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db import migrations
from lxml import html as lxml_html

POSTPRODUCTION_HOURLY_RATE = 669
MAX_PHASE_HOURS = Decimal("10000")

# --- zamrzlá kopie striktního parseru z plane/utils/time_estimate.py ---
_PREFIX = r"(?:(?:cca\.?|~)\s*)?"
_HOUR_UNIT = r"(?:h|hod\.?|hodin[ay]?)"
_MIN_UNIT = r"(?:m|min\.?|minut[ay]?)"
_NUM = r"\d+(?:[.,]\d+)?|[.,]\d+"

_DECIMAL_HOURS_RE = re.compile(rf"{_PREFIX}(?P<h>{_NUM})\s*(?:{_HOUR_UNIT})?")
_COLON_RE = re.compile(rf"{_PREFIX}(?P<h>\d+):(?P<m>[0-5]\d)\s*(?:{_HOUR_UNIT})?")
_HOURS_MINUTES_RE = re.compile(rf"{_PREFIX}(?P<h>\d+)\s*{_HOUR_UNIT}\s*(?P<m>\d{{1,2}})\s*(?:{_MIN_UNIT})?")
_MINUTES_RE = re.compile(rf"{_PREFIX}(?P<m>\d+)\s*{_MIN_UNIT}")

_AMBIGUOUS_DOT_RE = re.compile(r"\.\d{2}")

_SIXTY = Decimal(60)

_BLOCK_TAGS = {
    "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol",
    "pre", "blockquote", "table", "tbody", "tr", "td", "th", "hr",
}


def _cell_text(cell):
    for element in cell.iter():
        if element is cell:
            continue
        if element.tag in _BLOCK_TAGS:
            element.text = " " + (element.text or "")
            element.tail = " " + (element.tail or "")
        elif element.tag == "br":
            element.tail = " " + (element.tail or "")
    return " ".join(cell.text_content().split())


def _to_decimal(value):
    try:
        return Decimal(value.replace(",", "."))
    except InvalidOperation:
        return None


def _parse_hours_text(text):
    text = text.strip().lower()
    if not text:
        return None
    hours = None
    if match := _DECIMAL_HOURS_RE.fullmatch(text):
        number = match.group("h")
        if _AMBIGUOUS_DOT_RE.search(number):
            return None
        hours = _to_decimal(number)
    elif match := _COLON_RE.fullmatch(text):
        hours = Decimal(match.group("h")) + Decimal(match.group("m")) / _SIXTY
    elif match := _HOURS_MINUTES_RE.fullmatch(text):
        minutes = Decimal(match.group("m"))
        if minutes < _SIXTY:
            hours = Decimal(match.group("h")) + minutes / _SIXTY
    elif match := _MINUTES_RE.fullmatch(text):
        hours = Decimal(match.group("m")) / _SIXTY
    if hours is None or hours < 0 or hours > MAX_PHASE_HOURS:
        return None
    return hours


def _postproduction_hours(description_html):
    if not description_html or "postprodukce" not in description_html.lower():
        return None
    try:
        root = lxml_html.fromstring(description_html)
    except Exception:
        return None
    for row in root.iter("tr"):
        cells = [child for child in row if child.tag in ("td", "th")]
        if len(cells) < 2:
            continue
        if _cell_text(cells[0]).rstrip(":").strip().lower() != "postprodukce":
            continue
        return _parse_hours_text(_cell_text(cells[1]))
    return None


def backfill_postproduction(apps, schema_editor):
    filled = []
    overwritten = []

    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                i.id,
                p.identifier,
                i.sequence_id,
                i.description_html,
                i.budget_complete,
                -- historická částka bez rozpadu = ta, která se nevratně přepíše
                (
                    i.cost_order_calling IS NULL
                    AND i.cost_business IS NULL
                    AND i.cost_data_capture IS NULL
                    AND i.cost_transport IS NULL
                ) AS was_legacy
            FROM issues AS i
            JOIN projects AS p ON p.id = i.project_id
            WHERE i.cost_postproduction IS NULL
              AND i.deleted_at IS NULL
              AND i.description_html ILIKE %s
            """,
            ["%postprodukce%"],
        )
        rows = cursor.fetchall()

        for issue_id, identifier, sequence_id, description_html, old_total, was_legacy in rows:
            hours = _postproduction_hours(description_html)
            if hours is None:
                continue
            cost = int((hours * POSTPRODUCTION_HOURLY_RATE).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            cursor.execute(
                """
                UPDATE issues
                SET cost_postproduction = %s,
                    budget_complete = %s
                        + COALESCE(cost_order_calling, 0)
                        + COALESCE(cost_business, 0)
                        + COALESCE(cost_data_capture, 0)
                        + COALESCE(cost_transport, 0)
                WHERE id = %s
                  AND cost_postproduction IS NULL
                RETURNING budget_complete
                """,
                [cost, cost, issue_id],
            )
            result = cursor.fetchone()
            if result is None:
                continue
            new_total = result[0]
            filled.append((identifier, sequence_id, hours, cost))
            if was_legacy and old_total is not None and old_total != new_total:
                overwritten.append((identifier, sequence_id, old_total, new_total))

    print(f"\n  -> Postprodukce z tabulky Časová náročnost doplněna u {len(filled)} issues")
    for identifier, sequence_id, hours, cost in filled:
        print(f"     {identifier}-{sequence_id}: {hours} h × {POSTPRODUCTION_HOURLY_RATE} = {cost} Kč")
    if overwritten:
        print(f"  -> Přepsané historické částky Náklady celkem ({len(overwritten)}), issue: stará -> nová:")
        for identifier, sequence_id, old_total, new_total in overwritten:
            print(f"     {identifier}-{sequence_id}: {old_total} -> {new_total}")
    else:
        print("  -> Žádná historická částka Náklady celkem se nepřepsala")


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0125_issue_scanner_issueversion_scanner"),
    ]

    operations = [
        migrations.RunPython(
            backfill_postproduction,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
