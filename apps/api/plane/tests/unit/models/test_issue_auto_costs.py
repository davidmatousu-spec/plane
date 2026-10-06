import pytest

from plane.db.models import Issue, Project, State, Workspace
from plane.db.models.issue import ADMINISTRATION_DEFAULT_AMOUNT, ORDER_CALLING_DEFAULT_AMOUNT

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
