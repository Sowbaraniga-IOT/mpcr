"""Helpers shared by every view."""
from datetime import date as Date

from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler

from ...services.logic import PasswordChangeRequired, Refused, can
from ...models import AuditEntry



def exception_handler(exc, context):
    if isinstance(exc, PasswordChangeRequired):
        return Response({'detail': str(exc), 'code': 'password_change_required'}, status=exc.status)
    if isinstance(exc, Refused):
        return Response({'detail': str(exc)}, status=exc.status)
    return drf_handler(exc, context)


def require(user, *permissions):
    """Allow the request when the user holds any one of the permissions."""
    if not any(can(user, p) for p in permissions):
        raise PermissionDenied('Your role may not do this.')


def require_admin(user):
    if user.role != 'Admin':
        raise PermissionDenied('Only an admin may do this.')


def parse_date(text):
    """'2026-11-03' or '03.11.2026'"""
    try:
        if '.' in text:
            d, m, y = text.split('.')
            return Date(int(y), int(m), int(d))
        return Date.fromisoformat(text)
    except (ValueError, TypeError):
        raise Refused(f'“{text}” is not a date')


def body(request):
    """The request's JSON body, which must be an object ({…}), not a list or a bare value."""
    if not isinstance(request.data, dict):
        raise Refused('The request body must be a JSON object.')
    return request.data


def whole_number(value, name, default, low, high):
    """A paging value from the client: missing → default, anything else must be a whole number,
    clamped to low … high."""
    if value is None or value == '':
        return default
    try:
        number = int(value)
        if isinstance(value, float) and value != number:
            raise ValueError
    except (TypeError, ValueError):
        raise Refused(f'{name} must be a whole number, not “{value}”.')
    return min(max(low, number), high)


def audit(user, area, text):
    AuditEntry.objects.create(by=user.username.upper() if user else 'system', role=user.role if user else '', area=area, text=text)


def ok(data=None, code=status.HTTP_200_OK):
    return Response({'ok': True} if data is None else data, status=code)
