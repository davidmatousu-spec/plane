from datetime import date, datetime, timezone
from unittest import mock

import pytest

from plane.utils import issue_dates
from plane.utils.issue_dates import INVOICE_STATE_NAME, is_invoice_state_name, local_today


@pytest.mark.unit
class TestInvoiceStateName:
    """Rozpoznání sloupce "Odevzdáno, čekáme na zaplacení" """

    def test_matches_exact_and_tolerant_variants(self):
        for name in [
            INVOICE_STATE_NAME,
            "Odevzdáno, čekáme na zaplacení",
            "odevzdáno, čekáme na zaplacení",
            "ODEVZDÁNO, ČEKÁME NA ZAPLACENÍ",
            "Odevzdano, cekame na zaplaceni",  # bez diakritiky
            "Odevzdáno - čekáme na zaplacení",  # jiná interpunkce
            "  Odevzdáno,  čekáme   na zaplacení ",  # mezery
        ]:
            assert is_invoice_state_name(name), name

    def test_other_states_do_not_match(self):
        for name in [None, "", "Odevzdáno", "Zaplaceno", "Čekáme na zaplacení", "Odevzdáno, zaplaceno", "Zkreslení dokumentace"]:
            assert not is_invoice_state_name(name), name


@pytest.mark.unit
class TestLocalToday:
    """'Dnes' v pražském čase, ne v UTC serveru"""

    def _at_utc(self, *args):
        fixed = datetime(*args, tzinfo=timezone.utc)

        class _FixedDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return fixed if tz is None else fixed.astimezone(tz)

        return mock.patch.object(issue_dates, "datetime", _FixedDatetime)

    def test_just_after_midnight_in_prague_is_already_next_day(self):
        # 22:30 UTC 11. 10. = 0:30 SELČ 12. 10.
        with self._at_utc(2026, 10, 11, 22, 30):
            assert local_today() == date(2026, 10, 12)

    def test_winter_time_offset(self):
        # 23:30 UTC 14. 1. = 0:30 SEČ 15. 1.
        with self._at_utc(2026, 1, 14, 23, 30):
            assert local_today() == date(2026, 1, 15)

    def test_midday(self):
        with self._at_utc(2026, 10, 12, 10, 0):
            assert local_today() == date(2026, 10, 12)
