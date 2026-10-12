"""
Pomocné funkce pro automaticky vyplňovaná data u issue
(Datum závazné objednávky, Datum fakturace (DUZP)).
"""

import unicodedata
from datetime import datetime, timezone

import pytz

# Firma je v ČR - "dnes" počítáme v pražském čase, ne v UTC serveru
# (jinak by se mezi 0:00 a 2:00 zapsal včerejší den).
# pytz místo zoneinfo: Alpine image nemá systémová tzdata.
LOCAL_TIMEZONE = pytz.timezone("Europe/Prague")

# Sloupec (State), po jehož dosažení se doplní Datum fakturace (DUZP)
INVOICE_STATE_NAME = "Odevzdáno, čekáme na zaplacení"


def local_today():
    return datetime.now(timezone.utc).astimezone(LOCAL_TIMEZONE).date()


def _normalize_state_name(name):
    """Bez ohledu na velikost písmen, diakritiku, interpunkci a mezery."""
    decomposed = unicodedata.normalize("NFKD", name or "")
    without_accents = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    alnum = "".join(ch if ch.isalnum() else " " for ch in without_accents.lower())
    return " ".join(alnum.split())


_INVOICE_STATE_KEY = _normalize_state_name(INVOICE_STATE_NAME)


def is_invoice_state_name(name):
    return _normalize_state_name(name) == _INVOICE_STATE_KEY
