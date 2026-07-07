from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0120_auto_set_dealer_paid_from_text'),
    ]

    operations = [
        migrations.AddField(
            model_name='issue',
            name='firmly_ordered',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='issueversion',
            name='firmly_ordered',
            field=models.BooleanField(default=False),
        ),
    ]
