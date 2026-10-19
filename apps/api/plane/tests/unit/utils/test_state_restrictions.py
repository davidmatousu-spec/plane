from types import SimpleNamespace

import pytest

from plane.utils.state_restrictions import get_allowed_state_ids, is_state_allowed_for_user

# Sloupce projektu PASPORTY (UUID ověřena proti /api/workspaces/atelier-onixia/projects/.../states/)
SCHUZKA = "f8a976f5-2152-43f5-b36a-cc61bc9d71c6"  # Schůzka (domluvený termín)
VYTVORIT_ZAKAZKU = "a1cb9cc0-825d-43b9-a10f-6d00e3d99156"  # Vytvořit zakázku
LEAD = "dad2e6f5-b80b-4c3b-8b33-5f43bc5fa6cc"  # LEAD
ON_HOLD = "d9eb1998-12b9-4c57-98f0-9053c0a8823d"  # ON HOLD
PO_VOLBACH = "fe0d3c44-ba2e-48fa-8180-7cd4261121a8"  # Po volbách
NABIDKA = "2352ad75-7638-4364-81e7-3ac8a978ae33"  # Nabídka (poslaná nabídka na klienta)
ZAPLACENO = "847b527e-7b1b-4f9a-a155-a2dcf70d86df"  # Zaplaceno / Hotovo


def _user(email):
    return SimpleNamespace(email=email)


@pytest.mark.unit
class TestStateRestrictions:
    """Vlastní role: uživatel vidí jen vybrané sloupce"""

    def test_tomas_sees_exactly_allowed_columns(self):
        allowed = get_allowed_state_ids(_user("tomas.slama@onixia-pasport.cz"))
        assert set(allowed) == {SCHUZKA, VYTVORIT_ZAKAZKU, LEAD, ON_HOLD, PO_VOLBACH}

    def test_email_is_case_insensitive(self):
        assert get_allowed_state_ids(_user("Tomas.Slama@Onixia-Pasport.cz")) is not None

    def test_tomas_does_not_see_other_columns(self):
        user = _user("tomas.slama@onixia-pasport.cz")
        assert not is_state_allowed_for_user(user, NABIDKA)
        assert not is_state_allowed_for_user(user, ZAPLACENO)
        assert is_state_allowed_for_user(user, ON_HOLD)
        assert is_state_allowed_for_user(user, PO_VOLBACH)

    def test_unrestricted_users_are_unaffected(self):
        assert get_allowed_state_ids(_user("adam.bosak@onixia.cz")) is None
        assert get_allowed_state_ids(SimpleNamespace(email=None)) is None
