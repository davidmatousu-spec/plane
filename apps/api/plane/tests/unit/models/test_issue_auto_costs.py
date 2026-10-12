from datetime import date

import pytest

from plane.db.models import Issue, Project, State, Workspace
from plane.db.models.issue import ADMINISTRATION_DEFAULT_AMOUNT, ORDER_CALLING_DEFAULT_AMOUNT
from plane.utils.issue_dates import INVOICE_STATE_NAME

TODAY = date(2026, 10, 12)

P = '<p class="editor-paragraph-block">'


def _description_with_postproduction_hours(hours_text):
    """Popis se šablonovou tabulkou "Časová náročnost" (tvar z editoru Plane)."""
    return (
        "<h5>Časová náročnost</h5>"
        '<table data-id="t"><tbody>'
        f"<tr><th>{P}fáze</p></th><th>{P}počet hodin</p></th></tr>"
        f"<tr><td>{P}doprava</p></td><td>{P}</p></td></tr>"
        f"<tr><td>{P}postprodukce</p></td><td>{P}{hours_text}</p></td></tr>"
        "</tbody></table>"
    )


@pytest.fixture
def workspace(create_user):
    return Workspace.objects.create(name="Test Workspace", slug="test-workspace-costs", owner=create_user)


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(name="Test Project", identifier="TC", workspace=workspace, created_by=create_user)


@pytest.fixture
def state(project):
    return State.objects.create(name="Todo", project=project, group="backlog", default=True)


@pytest.fixture
def invoice_state(project):
    return State.objects.create(name=INVOICE_STATE_NAME, project=project, group="started")


@pytest.fixture
def fixed_today(monkeypatch):
    monkeypatch.setattr("plane.db.models.issue.local_today", lambda: TODAY)
    return TODAY


@pytest.fixture
def make_issue(workspace, project, state, create_user):
    def _make(**kwargs):
        return Issue.objects.create(
            name="Test Issue",
            workspace=workspace,
            project=project,
            state=state,
            created_by=create_user,
            **kwargs,
        )

    return _make


@pytest.mark.unit
class TestFirmlyOrderedDefaults:
    """Závazně objednáno -> Navolání zakázky 1200 + Administrativa 1300"""

    @pytest.mark.django_db
    def test_checking_firmly_ordered_fills_defaults_and_total(self, make_issue):
        issue = make_issue()
        assert issue.cost_order_calling is None
        assert issue.cost_administration is None

        issue.firmly_ordered = True
        issue.save()
        issue.refresh_from_db()

        assert issue.cost_order_calling == ORDER_CALLING_DEFAULT_AMOUNT == 1200
        assert issue.cost_administration == ADMINISTRATION_DEFAULT_AMOUNT == 1300
        assert issue.budget_complete == 2500

    @pytest.mark.django_db
    def test_created_as_firmly_ordered_fills_defaults(self, make_issue):
        issue = make_issue(firmly_ordered=True)
        issue.refresh_from_db()

        assert issue.cost_order_calling == 1200
        assert issue.cost_administration == 1300
        assert issue.budget_complete == 2500

    @pytest.mark.django_db
    def test_manual_values_are_not_overwritten(self, make_issue):
        issue = make_issue(cost_administration=500)

        issue.firmly_ordered = True
        issue.save()
        issue.refresh_from_db()

        assert issue.cost_administration == 500
        assert issue.cost_order_calling == 1200
        assert issue.budget_complete == 1700

    @pytest.mark.django_db
    def test_cleared_value_is_not_refilled_while_still_firmly_ordered(self, make_issue):
        issue = make_issue(firmly_ordered=True)

        issue.cost_administration = None
        issue.save()
        issue.refresh_from_db()

        assert issue.cost_administration is None
        assert issue.budget_complete == 1200

    @pytest.mark.django_db
    def test_update_fields_save_persists_defaults(self, make_issue):
        issue = make_issue()

        issue.firmly_ordered = True
        issue.save(update_fields=["firmly_ordered"])
        issue.refresh_from_db()

        assert issue.cost_order_calling == 1200
        assert issue.cost_administration == 1300
        assert issue.budget_complete == 2500


@pytest.mark.unit
class TestPostproductionFromDescription:
    """Postprodukce = hodiny z tabulky "Časová náročnost" × 669"""

    @pytest.mark.django_db
    def test_hours_in_description_fill_postproduction(self, make_issue):
        issue = make_issue(description_html=_description_with_postproduction_hours("2,5"))
        issue.refresh_from_db()

        assert issue.cost_postproduction == 1673
        assert issue.budget_complete == 1673

    @pytest.mark.django_db
    def test_changed_hours_recompute(self, make_issue):
        issue = make_issue(description_html=_description_with_postproduction_hours("2,5"))

        issue.description_html = _description_with_postproduction_hours("3")
        issue.save()
        issue.refresh_from_db()

        assert issue.cost_postproduction == 2007

    @pytest.mark.django_db
    def test_manual_value_survives_unrelated_description_edit(self, make_issue):
        issue = make_issue(description_html=_description_with_postproduction_hours("2,5"))

        issue.cost_postproduction = 1000
        issue.save()
        issue.description_html = "<p>poznámka</p>" + _description_with_postproduction_hours("2,5")
        issue.save()
        issue.refresh_from_db()

        assert issue.cost_postproduction == 1000

    @pytest.mark.django_db
    def test_ambiguous_hours_do_not_touch_value(self, make_issue):
        issue = make_issue(description_html=_description_with_postproduction_hours("2,5"))

        issue.description_html = _description_with_postproduction_hours("3-4")
        issue.save()
        issue.refresh_from_db()

        assert issue.cost_postproduction == 1673


@pytest.mark.unit
class TestFirmlyOrderedDate:
    """Datum závazné objednávky: zaškrtnutí -> dnes, odškrtnutí -> smazat"""

    @pytest.mark.django_db
    def test_checking_sets_today(self, make_issue, fixed_today):
        issue = make_issue()
        assert issue.firmly_ordered_at is None

        issue.firmly_ordered = True
        issue.save()
        issue.refresh_from_db()

        assert issue.firmly_ordered_at == fixed_today

    @pytest.mark.django_db
    def test_manual_date_is_kept_when_checking(self, make_issue, fixed_today):
        issue = make_issue(firmly_ordered_at=date(2026, 9, 1))

        issue.firmly_ordered = True
        issue.save()
        issue.refresh_from_db()

        assert issue.firmly_ordered_at == date(2026, 9, 1)

    @pytest.mark.django_db
    def test_unchecking_clears_date_and_rechecking_sets_new(self, make_issue, fixed_today):
        issue = make_issue(firmly_ordered=True, firmly_ordered_at=date(2026, 9, 1))

        issue.firmly_ordered = False
        issue.save()
        issue.refresh_from_db()
        assert issue.firmly_ordered_at is None

        issue.firmly_ordered = True
        issue.save()
        issue.refresh_from_db()
        assert issue.firmly_ordered_at == fixed_today

    @pytest.mark.django_db
    def test_manual_edit_while_checked_is_kept(self, make_issue, fixed_today):
        issue = make_issue(firmly_ordered=True)

        issue.firmly_ordered_at = date(2026, 8, 15)
        issue.save()
        issue.refresh_from_db()

        assert issue.firmly_ordered_at == date(2026, 8, 15)


@pytest.mark.unit
class TestInvoiceDate:
    """Datum fakturace (DUZP): přesun do "Odevzdáno, čekáme na zaplacení" -> dnes"""

    @pytest.mark.django_db
    def test_moving_to_invoice_state_sets_today(self, make_issue, invoice_state, fixed_today):
        issue = make_issue()
        assert issue.invoice_date is None

        issue.state = invoice_state
        issue.save()
        issue.refresh_from_db()

        assert issue.invoice_date == fixed_today

    @pytest.mark.django_db
    def test_manual_date_is_kept(self, make_issue, invoice_state, fixed_today):
        issue = make_issue(invoice_date=date(2026, 9, 30))

        issue.state = invoice_state
        issue.save()
        issue.refresh_from_db()

        assert issue.invoice_date == date(2026, 9, 30)

    @pytest.mark.django_db
    def test_leaving_invoice_state_keeps_date(self, make_issue, state, invoice_state, fixed_today):
        issue = make_issue()
        issue.state = invoice_state
        issue.save()

        issue.state = state
        issue.save()
        issue.refresh_from_db()

        assert issue.invoice_date == fixed_today

    @pytest.mark.django_db
    def test_other_state_changes_do_not_set_date(self, make_issue, project, fixed_today):
        other_state = State.objects.create(name="Zkreslení dokumentace", project=project, group="started")
        issue = make_issue()

        issue.state = other_state
        issue.save()
        issue.refresh_from_db()

        assert issue.invoice_date is None
