"""One token per sign-in (QA SEC-23). Tokens already handed out are copied over with the same key,
so nobody who is signed in now has to sign in again."""
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models

import plant.models


def copy_tokens(apps, schema_editor):
    Token = apps.get_model('authtoken', 'Token')
    SessionToken = apps.get_model('plant', 'SessionToken')
    SessionToken.objects.bulk_create(
        SessionToken(key=t.key, user_id=t.user_id, last_used=t.created, device='(signed in before per-device tokens)')
        for t in Token.objects.all()
    )
    Token.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('plant', '0003_viewer_read_only'),
        ('authtoken', '0004_alter_tokenproxy_options'),
    ]

    operations = [
        migrations.CreateModel(
            name='SessionToken',
            fields=[
                ('key', models.CharField(default=plant.models.new_token_key, max_length=40, primary_key=True, serialize=False)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('last_used', models.DateTimeField(default=django.utils.timezone.now)),
                ('device', models.CharField(blank=True, max_length=200)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='session_tokens', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-last_used']},
        ),
        migrations.RunPython(copy_tokens, migrations.RunPython.noop),
    ]
