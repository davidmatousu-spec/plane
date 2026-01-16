from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0115_auto_20260105_0836'),
    ]

    operations = [
        migrations.AddField(
            model_name='issue',
            name='budget',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='issue',
            name='contact_person',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='issueversion',
            name='contact_person',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]