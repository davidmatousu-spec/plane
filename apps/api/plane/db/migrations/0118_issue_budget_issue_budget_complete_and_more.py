from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('db', '0117_issue_budget_issue_dealer_issueversion_dealer'),
    ]

    operations = [
        migrations.AddField(
            model_name='issue',
            name='budget_complete',
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='issueversion',
            name='budget_complete',
            field=models.BigIntegerField(blank=True, null=True),
        ),
    ]