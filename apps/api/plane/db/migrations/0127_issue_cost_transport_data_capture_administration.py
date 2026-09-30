# Ručně psaná migrace – NESPOUŠTĚT makemigrations (viz 0122_issue_cost_fields.py).
# Doprava + ubytování (náběr dat) a Administrativa.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0126_backfill_postproduction_from_description"),
    ]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="cost_transport_data_capture",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="cost_transport_data_capture",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issue",
            name="cost_administration",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="cost_administration",
            field=models.BigIntegerField(blank=True, null=True),
        ),
    ]
