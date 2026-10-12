# Ručně psaná migrace – NESPOUŠTĚT makemigrations (viz 0122_issue_cost_fields.py).
# Datum závazné objednávky + Datum fakturace (DUZP).
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0128_backfill_administration_firmly_ordered"),
    ]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="firmly_ordered_at",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="firmly_ordered_at",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issue",
            name="invoice_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="invoice_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
