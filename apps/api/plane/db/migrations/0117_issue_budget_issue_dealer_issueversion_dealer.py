from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0116_issue_budget_issue_contact_person_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='issue',
            name='dealer',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='issueversion',
            name='dealer',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]