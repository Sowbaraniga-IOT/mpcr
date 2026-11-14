from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

from ..models import SessionToken

# How often a token's "last used" time is written back (not on every request).
TOUCH_EVERY = timedelta(minutes=5)


def token_expired(token, now=None):
    """A token runs out after TOKEN_IDLE_HOURS without use."""
    return (now or timezone.now()) - token.last_used > timedelta(hours=settings.TOKEN_IDLE_HOURS)


def end_sessions(user):
    """Sign the user out on every device (e.g. after an admin sets a new access code)."""
    SessionToken.objects.filter(user=user).delete()


class PlantTokenAuthentication(TokenAuthentication):
    """"Authorization: Token <key>" with one token per sign-in (SessionToken), so signing out on
    one device doesn't sign the user out elsewhere. Tokens stop working when an admin switches the
    account's login off, and after TOKEN_IDLE_HOURS without any request."""

    model = SessionToken

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if not user.can_login:
            raise AuthenticationFailed('This account is switched off.')
        now = timezone.now()
        if token_expired(token, now):
            token.delete()
            raise AuthenticationFailed(f'Signed out after {settings.TOKEN_IDLE_HOURS:g} h without use. Sign in again.')
        if now - token.last_used > TOUCH_EVERY:
            SessionToken.objects.filter(pk=token.pk).update(last_used=now)
        return user, token
