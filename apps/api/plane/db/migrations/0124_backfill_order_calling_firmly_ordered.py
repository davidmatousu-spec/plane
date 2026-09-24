"""
Datová migrace: všem závazně objednaným issues doplní "Navolání zakázky" = 1200 Kč
a přepočítá "Náklady celkem" (budget_complete) jako součet rozpadu.

- Doplňuje jen tam, kde je cost_order_calling prázdné (NULL) - ručně zadané hodnoty nepřepisuje.
- U issues se starou částkou "Náklady celkem" bez rozpadu se stará částka přepíše součtem
  rozpadu (rozhodnutí z 2026-09-24). Přepsané staré částky se vypíšou do logu migrátoru.
- Smazaná (soft-deleted) issues vynechává.
- Raw SQL: v migraci nesmí být Issue.objects ani .save() (viz 0120).
- Částka je tu natvrdo, NE import z modelu - migrace musí zůstat zamrzlá i kdyby se
  ORDER_CALLING_DEFAULT_AMOUNT v modelu později změnil.
- Nevratná (reverse = noop): nelze poznat, které hodnoty doplnila tahle migrace.
"""
from django.db import migrations

ORDER_CALLING_AMOUNT = 1200


def backfill_order_calling(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            WITH target AS (
                SELECT
                    id,
                    budget_complete AS old_total,
                    -- historická částka bez rozpadu = ta, která se nevratně přepíše
                    (
                        cost_business IS NULL
                        AND cost_data_capture IS NULL
                        AND cost_transport IS NULL
                        AND cost_postproduction IS NULL
                    ) AS was_legacy
                FROM issues
                WHERE firmly_ordered = TRUE
                  AND cost_order_calling IS NULL
                  AND deleted_at IS NULL
                FOR UPDATE
            )
            UPDATE issues AS i
            SET cost_order_calling = %s,
                budget_complete = %s
                    + COALESCE(i.cost_business, 0)
                    + COALESCE(i.cost_data_capture, 0)
                    + COALESCE(i.cost_transport, 0)
                    + COALESCE(i.cost_postproduction, 0)
            FROM target AS t, projects AS p
            WHERE i.id = t.id
              AND p.id = i.project_id
            RETURNING p.identifier, i.sequence_id, t.old_total, i.budget_complete, t.was_legacy
            """,
            [ORDER_CALLING_AMOUNT, ORDER_CALLING_AMOUNT],
        )
        rows = cursor.fetchall()

    print(f"\n  -> Navolání zakázky = {ORDER_CALLING_AMOUNT} doplněno u {len(rows)} závazně objednaných issues")

    # Jen historické částky bez rozpadu - u issues s rozpadem se součet jen zvedne o 1200.
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
        ("db", "0123_issue_cost_order_calling"),
    ]

    operations = [
        migrations.RunPython(
            backfill_order_calling,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
