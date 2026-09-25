"""
Parsování tabulky "Časová náročnost" z popisu issue.

Šablona popisu obsahuje tabulku:

    | fáze          | počet hodin |
    | doprava       |             |
    | skenování     |             |
    | postprodukce  |             |
    ...

Editor ji ukládá jako <table><tr><th|td><p>…</p></th|td>…</tr></table>.

Parser je ZÁMĚRNĚ striktní: jde o peníze, takže buňka musí celá odpovídat jednomu
z podporovaných zápisů. Cokoliv jiného (rozsah "3-4", "1+2", "1/2", dvě čísla na dvou
řádcích, text…) vrátí None a pole se nezmění - lepší nic než špatná částka.

Podporované zápisy (bez ohledu na velikost písmen, volitelně s "cca"/"~" na začátku):
    3 | 2,5 | 2,30 | ,5 | 2.5 | 3 h | 3 hod | 3 hod. | 3 hodiny | 3 hodin | 1 hodina
    2:30                      -> 2,5 h
    2 h 30 min | 2h30 | 1 h 45 m | 2 hod 15 minut   -> hodiny + minuty/60
    30 min | 45 minut         -> minuty/60

Desetinná čárka (česky) platí vždy. Tečka s 2+ číslicemi ("2.30", "1.45", "1.500") je
nejednoznačná - může to být čas 2 h 30 min nebo tisíce - takže vrací None.
"""

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from lxml import html as lxml_html

# Hodinová sazba postprodukce v Kč: Postprodukce = hodiny × sazba
POSTPRODUCTION_HOURLY_RATE = 669

# Ochrana proti nesmyslům (vložené dlouhé číslo by jinak přeteklo BigIntegerField
# a shodilo uložení popisu).
MAX_PHASE_HOURS = Decimal("10000")

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

# Blokové prvky, které editor dovolí v buňce tabulky (content: "block+")
_BLOCK_TAGS = {
    "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol",
    "pre", "blockquote", "table", "tbody", "tr", "td", "th", "hr",
}


def _cell_text(cell) -> str:
    """
    Text buňky. Blokové prvky (odstavce, nadpisy, bloky kódu…) a zalomení <br> oddělí
    mezerou, aby se "3" a "4" na dvou řádcích neslily do "34" a nic se neztratilo.
    Inline značky (<strong>2</strong>,5) zůstanou spojené.
    """
    for element in cell.iter():
        if element is cell:
            continue
        if element.tag in _BLOCK_TAGS:
            element.text = " " + (element.text or "")
            element.tail = " " + (element.tail or "")
        elif element.tag == "br":
            element.tail = " " + (element.tail or "")
    # str.split() bez argumentu bere i &nbsp; (\xa0) jako mezeru
    return " ".join(cell.text_content().split())


def _to_decimal(value: str):
    try:
        return Decimal(value.replace(",", "."))
    except InvalidOperation:
        return None


def parse_hours_text(text):
    """Převede text buňky na hodiny (Decimal), nebo None, když neodpovídá podporovanému zápisu."""
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


def parse_phase_hours(description_html, phase):
    """
    Vrátí počet hodin (Decimal) z řádku `phase` (např. "postprodukce") tabulky
    v popisu, nebo None, když řádek chybí, buňka je prázdná nebo zápis není jednoznačný.
    """
    if not description_html or phase not in description_html.lower():
        return None

    try:
        root = lxml_html.fromstring(description_html)
    except Exception:
        return None

    for row in root.iter("tr"):
        cells = [child for child in row if child.tag in ("td", "th")]
        if len(cells) < 2:
            continue
        label = _cell_text(cells[0]).rstrip(":").strip().lower()
        if label != phase:
            continue
        return parse_hours_text(_cell_text(cells[1]))

    return None


def postproduction_cost_from_hours(hours):
    """Hodiny × sazba, zaokrouhleno na celé Kč (2,5 h × 669 = 1 672,5 -> 1 673)."""
    return int((hours * POSTPRODUCTION_HOURLY_RATE).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
