from rest_framework.permissions import IsAuthenticated

from ..services.logic import PasswordChangeRequired


class PlantAccess(IsAuthenticated):
    """Signed in, and not waiting to choose a new access code. An account flagged for a reset can
    only sign out and change its code (those views allow IsAuthenticated directly)."""

    def has_permission(self, request, view):
        allowed = super().has_permission(request, view)
        if allowed and request.user.force_reset:
            raise PasswordChangeRequired()
        return allowed
