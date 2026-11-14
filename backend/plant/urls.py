from django.urls import path

from .api.views import auth, logs, masters

D = '<str:machine_id>/<str:date>'

urlpatterns = [
    path('auth/login/', auth.login),
    path('auth/logout/', auth.logout),
    path('auth/me/', auth.me),
    path('auth/password/', auth.change_password),
    path('bootstrap/', auth.bootstrap),
    path('live/', masters.live),
    # Machine master
    path('machines/', masters.machines),
    path('machines/bulk/', masters.machines_bulk),
    path('machines/<str:machine_id>/', masters.machine),
    path('machines/<str:machine_id>/telemetry/', masters.telemetry),
    path('images/', masters.images),
    path('parts/bulk/', masters.parts_bulk),
    path('molds/bulk/', masters.molds_bulk),
    # Shift master, users, roles
    path('shift-master/', masters.shift_master),
    path('users/', masters.users),
    path('users/<str:username>/', masters.user),
    path('roles/', masters.roles),
    # Parameter master
    path('recipes/', masters.recipes),
    path('recipes/<str:recipe_id>/draft/', masters.recipe_draft),
    path('recipes/<str:recipe_id>/approve/', masters.recipe_approve),
    path('recipes/<str:recipe_id>/reject/', masters.recipe_reject),
    # Parameter log and deviations
    path(f'logs/{D}/', logs.log),
    path(f'logs/{D}/hours/<str:hour>/', logs.log_hour),
    path(f'logs/{D}/deviations/<str:dev_id>/reason/', logs.deviation_reason),
    path(f'logs/{D}/deviations/<str:dev_id>/review/', logs.deviation_review),
    path('deviations/counts/', logs.deviation_counts),
    path('notifications/', logs.notifications),
    path('notifications/read/', logs.notifications_read),
    path('report/', logs.report),
    path('audit/', masters.audit_trail),
]
