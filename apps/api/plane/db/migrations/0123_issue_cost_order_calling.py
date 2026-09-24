# Ručně psaná migrace – NESPOUŠTĚT makemigrations (viz 0122_issue_cost_fields.py).
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0122_issue_cost_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="cost_order_calling",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="cost_order_calling",
            field=models.BigIntegerField(blank=True, null=True),
        ),
    ]
