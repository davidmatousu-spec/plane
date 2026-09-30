import pytest
from django.db import models

from plane.db.models import Issue, IssueVersion
from plane.db.models.issue import ACTIVITY_FIELD_LABELS, COST_FIELDS


@pytest.mark.unit
class TestIssueCostFields:
    """
    Invarianty custom nákladových polí (Navolání zakázky, Obchodní činnost, …).
    Chytají typickou chybu při přidávání dalšího pole: zapomenutý sloupec nebo štítek.
    """

    def test_expected_cost_fields(self):
        assert set(COST_FIELDS) == {
            "cost_order_calling",
            "cost_business",
            "cost_data_capture",
            "cost_transport",  # Doprava + ubytování (obchod)
            "cost_transport_data_capture",  # Doprava + ubytování (náběr dat)
            "cost_postproduction",
            "cost_administration",
        }

    def test_cost_fields_are_nullable_bigints_on_issue_and_version(self):
        for model in (Issue, IssueVersion):
            for name in COST_FIELDS:
                field = model._meta.get_field(name)
                assert isinstance(field, models.BigIntegerField), f"{model.__name__}.{name}"
                assert field.null and field.blank, f"{model.__name__}.{name}"

    def test_every_cost_field_is_logged_in_activity(self):
        # budget_complete (součet) i každé dílčí pole musí mít text do historie
        for name in (*COST_FIELDS, "budget_complete"):
            assert ACTIVITY_FIELD_LABELS.get(name), name
