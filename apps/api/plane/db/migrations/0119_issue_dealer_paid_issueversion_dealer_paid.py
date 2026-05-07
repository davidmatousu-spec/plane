from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0118_issue_budget_issue_budget_complete_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='issue',
            name='dealer_paid',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='issueversion',
            name='dealer_paid',
            field=models.BooleanField(default=False),
        ),
    ]
