"""
Datová migrace: všem závazně objednaným issues doplní "Administrativa" = 1300 Kč
a přepočítá "Náklady celkem" (budget_complete) jako součet rozpadu.

- Doplňuje jen tam, kde je cost_administration prázdné (NULL) - ručně zadané hodnoty nepřepisuje.
- Smazaná (soft-deleted) issues vynechává.
- Historická částka "Náklady celkem" bez rozpadu se přepíše součtem rozpadu (stejně jako
  v 0124); přepsané částky se vypíšou do logu migrátoru.
- Raw SQL: v migraci nesmí být Issue.objects ani .save() (viz 0120).
- Částka i seznam nákladových polí jsou tu natvrdo (NE import z modelu) - migrace musí
  zůstat zamrzlá.
- Nevratná (reverse = noop): nelze poznat, které hodnoty doplnila tahle migrace.
"""
from django.db import migrations

ADMINISTRATION_AMOUNT = 1300


def backfill_administration(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            WITH target AS (
                SELECT
                    id,
                    budget_complete AS old_total,
                    -- historická částka bez rozpadu = ta, která se nevratně přepíše
                    (
                        cost_order_calling IS NULL
                        AND cost_business IS NULL
                        AND cost_data_capture IS NULL
                        AND cost_transport IS NULL
                        AND cost_transport_data_capture IS NULL
                        AND cost_postproduction IS NULL
                    ) AS was_legacy
                FROM issues
                WHERE firmly_ordered = TRUE
                  AND cost_administration IS NULL
                  AND deleted_at IS NULL
                FOR UPDATE
            )
            UPDATE issues AS i
            SET cost_administration = %s,
                budget_complete = %s
                    + COALESCE(i.cost_order_calling, 0)
                    + COALESCE(i.cost_business, 0)
                    + COALESCE(i.cost_data_capture, 0)
                    + COALESCE(i.cost_transport, 0)
                    + COALESCE(i.cost_transport_data_capture, 0)
                    + COALESCE(i.cost_postproduction, 0)
            FROM target AS t, projects AS p
            WHERE i.id = t.id
              AND p.id = i.project_id
            RETURNING p.identifier, i.sequence_id, t.old_total, i.budget_complete, t.was_legacy
            """,
            [ADMINISTRATION_AMOUNT, ADMINISTRATION_AMOUNT],
        )
        rows = cursor.fetchall()

    print(f"\n  -> Administrativa = {ADMINISTRATION_AMOUNT} doplněna u {len(rows)} závazně objednaných issues")

    overwritten = [
        (identifier, sequence_id, old_total, new_total)
        for identifier, sequence_id, old_total, new_total, was_legacy in rows
        if was_legacy and old_total is not None and old_total != new_total
    ]
    if overwritten:
        print(f"  -> Přepsané historické částky Náklady celkem ({len(overwritten)}), issue: stará -> nová:")
        for identifier, sequence_id, old_total, new_total in overwritten:
            print(f"     {identifier}-{sequence_id}: {old_total} -> {new_total}")
    else:
        print("  -> Žádná historická částka Náklady celkem se nepřepsala")


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0127_issue_cost_transport_data_capture_administration"),
    ]

    operations = [
        migrations.RunPython(
            backfill_administration,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
