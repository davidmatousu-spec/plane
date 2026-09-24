# Ručně psaná migrace – NESPOUŠTĚT makemigrations (viz 0122_issue_cost_fields.py).
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0124_backfill_order_calling_firmly_ordered"),
    ]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="scanner",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="scanner",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
