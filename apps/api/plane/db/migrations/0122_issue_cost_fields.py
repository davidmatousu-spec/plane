# Ručně psaná migrace – NESPOUŠTĚT makemigrations.
# Migrace 0116 má odstraněný AddField issue.budget (commit 89ca802ed7), takže
# Django state neodpovídá DB a autogenerovaná migrace by na deployi spadla na
# "column budget already exists".
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0121_issue_firmly_ordered_issueversion_firmly_ordered"),
    ]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="cost_business",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="cost_business",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issue",
            name="cost_data_capture",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="cost_data_capture",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issue",
            name="cost_transport",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="cost_transport",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issue",
            name="cost_postproduction",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="cost_postproduction",
            field=models.BigIntegerField(blank=True, null=True),
        ),
    ]
