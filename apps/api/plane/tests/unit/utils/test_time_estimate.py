from decimal import Decimal

import pytest

from plane.utils.time_estimate import (
    POSTPRODUCTION_HOURLY_RATE,
    parse_hours_text,
    parse_phase_hours,
    postproduction_cost_from_hours,
)

# Odstavec tak, jak ho ukládá editor Plane
P = '<p class="editor-paragraph-block">'


def _cell(text):
    return f"{P}{text}</p>"


def _table(cell_html, label="postprodukce"):
    """Tabulka "Časová náročnost" ve tvaru, v jakém ji ukládá editor Plane."""
    return (
        '<table data-id="t"><tbody>'
        f"<tr><th>{P}fáze</p></th><th>{P}počet hodin</p></th></tr>"
        f'<tr><td colspan="1" rowspan="1" colwidth="150">{P}doprava</p></td><td>{P}</p></td></tr>'
        f'<tr><td colspan="1" rowspan="1">{P}{label}</p></td>'
        f'<td colspan="1" rowspan="1" hidecontent="false" class="" style="">{cell_html}</td></tr>'
        "</tbody></table>"
    )


def _cost(description_html):
    hours = parse_phase_hours(description_html, "postprodukce")
    return None if hours is None else postproduction_cost_from_hours(hours)


@pytest.mark.unit
class TestParseHoursText:
    """Převod textu buňky na hodiny"""

    def test_supported_notations(self):
        cases = {
            "3": Decimal("3"),
            "2,5": Decimal("2.5"),
            "2,30": Decimal("2.30"),  # desetinná čárka platí vždy
            ",5": Decimal("0.5"),
            ".5": Decimal("0.5"),
            "2.5": Decimal("2.5"),
            "3 h": Decimal("3"),
            "3 HOD": Decimal("3"),
            "3 hod.": Decimal("3"),
            "3 hodiny": Decimal("3"),
            "5 hodin": Decimal("5"),
            "1 hodina": Decimal("1"),
            "cca 1,5 hod": Decimal("1.5"),
            "~2": Decimal("2"),
            "2:30": Decimal("2.5"),
            "2h30": Decimal("2.5"),
            "2 h 30 min": Decimal("2.5"),
            "1 h 45 m": Decimal("1.75"),
            "2 hod 15 minut": Decimal("2.25"),
            "30 min": Decimal("0.5"),
            "45 minut": Decimal("0.75"),
        }
        for text, expected in cases.items():
            assert parse_hours_text(text) == expected, text

    def test_ambiguous_or_invalid_returns_none(self):
        # Peníze: nejednoznačný zápis nesmí zapsat žádnou částku
        for text in [
            "",
            "   ",
            "nevím",
            "1/2",
            "3-4",
            "1+2",
            "-3",
            "1e5",
            "1½",
            "2:75",
            "2h 75min",
            "1 h 60 min",
            "2.30",  # čas 2 h 30 min, nebo 2,3 h?
            "1.45",
            "1.500",  # tisíce?
            "2.30 h",
            "10001",  # nad MAX_PHASE_HOURS
            "99999999999",
        ]:
            assert parse_hours_text(text) is None, text


@pytest.mark.unit
class TestParsePhaseHours:
    """Čtení řádku "postprodukce" z tabulky v popisu"""

    def test_reads_postprodukce_row(self):
        assert parse_phase_hours(_table(_cell("3")), "postprodukce") == Decimal("3")
        assert _cost(_table(_cell("3"))) == 3 * POSTPRODUCTION_HOURLY_RATE

    def test_ignores_other_rows_and_heading(self):
        html = f"<h5>Postprodukce</h5>{_table(_cell(''))}"
        html = html.replace(f"{P}doprava</p></td><td>{P}</p>", f"{P}doprava</p></td><td>{P}4</p>")
        assert parse_phase_hours(html, "postprodukce") is None

    def test_cell_markup_variants(self):
        assert _cost(_table(_cell("&nbsp;4&nbsp;"))) == 4 * POSTPRODUCTION_HOURLY_RATE
        assert _cost(_table(_cell("<strong>2</strong>,5"))) == 1673
        assert _cost(_table(_cell("3") + _cell(""))) == 3 * POSTPRODUCTION_HOURLY_RATE

    def test_multi_block_cells_are_ambiguous(self):
        # dvě čísla na dvou řádcích se nesmí slít do "34"
        assert _cost(_table(_cell("3") + _cell("4"))) is None
        assert _cost(_table(_cell("3<br>4"))) is None
        assert _cost(_table("3" + _cell("4"))) is None
        assert _cost(_table("<h3>2</h3>" + _cell("30 min"))) is None
        assert _cost(_table("<pre><code>2</code></pre>" + _cell("30 min"))) is None

    def test_label_variants(self):
        for label in ["postprodukce", "Postprodukce", "POSTPRODUKCE", "postprodukce:", "postprodukce "]:
            assert parse_phase_hours(_table(_cell("2"), label=label), "postprodukce") == Decimal("2"), label

    def test_missing_table_or_empty_input(self):
        assert parse_phase_hours(None, "postprodukce") is None
        assert parse_phase_hours("", "postprodukce") is None
        assert parse_phase_hours("<p>postprodukce 3 h</p>", "postprodukce") is None
        assert parse_phase_hours(_table(_cell("")), "postprodukce") is None

    def test_malformed_html_never_raises(self):
        # chyba parseru by shodila ukládání popisu (500)
        for html in [
            "<table><tr><td>postprodukce<td>5",
            "postprodukce",
            "<!-- postprodukce -->",
            '<?xml version="1.0" encoding="UTF-8"?><p>postprodukce</p>',
            "postprodukce\x00<table>",
            "<tr><td>postprodukce</td><td>" + "9" * 5000 + "</td></tr>",
        ]:
            parse_phase_hours(html, "postprodukce")
        assert parse_phase_hours("<table><tr><td>postprodukce<td>5", "postprodukce") == Decimal("5")


@pytest.mark.unit
class TestPostproductionCost:
    """Hodiny × sazba"""

    def test_rate(self):
        assert POSTPRODUCTION_HOURLY_RATE == 669
        assert postproduction_cost_from_hours(Decimal("1")) == 669

    def test_rounding_half_up_to_whole_crowns(self):
        assert postproduction_cost_from_hours(Decimal("2.5")) == 1673  # 1672,5
        assert postproduction_cost_from_hours(Decimal("0.5")) == 335  # 334,5
        assert postproduction_cost_from_hours(Decimal(20) / Decimal(60)) == 223  # 20 min
