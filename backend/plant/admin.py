from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from . import models


@admin.register(models.User)
class PlantUserAdmin(UserAdmin):
    list_display = ['username', 'name', 'email', 'employee_id', 'role', 'can_login', 'last_login']
    list_filter = ['role', 'can_login', 'status']
    fieldsets = UserAdmin.fieldsets + (
        ('Plant', {'fields': ['name', 'employee_id', 'role', 'shift', 'access', 'status', 'can_login', 'force_reset']}),
    )


@admin.register(models.Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'model', 'clamp', 'line', 'bay', 'data_source', 'status', 'active', 'mold', 'part_no']
    list_filter = ['line', 'status', 'data_source', 'active']
    search_fields = ['id', 'name', 'mold', 'part_no']


class VersionInline(admin.TabularInline):
    model = models.RecipeVersion
    extra = 0
    fields = ['v', 'status', 'effective_from', 'created_by', 'approved_by', 'note']


@admin.register(models.Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ['id', 'machine_id', 'part_no', 'mold']
    search_fields = ['id', 'machine_id', 'part_no', 'mold']
    inlines = [VersionInline]


@admin.register(models.ParameterLog)
class LogAdmin(admin.ModelAdmin):
    list_display = ['machine', 'date', 'updated_at']
    list_filter = ['date']


@admin.register(models.Deviation)
class DeviationAdmin(admin.ModelAdmin):
    list_display = ['log', 'hour', 'key', 'value', 'status', 'by', 'reason']
    list_filter = ['status']


@admin.register(models.AuditEntry)
class AuditAdmin(admin.ModelAdmin):
    list_display = ['at', 'by', 'role', 'area', 'text']
    list_filter = ['area']


for model in [models.SessionToken, models.Role, models.Part, models.Mold, models.Shift, models.Setting, models.Notification, models.MachineImage]:
    admin.site.register(model)


@admin.register(models.ShiftMaster)
class ShiftMasterAdmin(admin.ModelAdmin):
    """Shift timings. A change here is what the reading schedule uses straight away."""

    list_display = ['Shift_Code', 'Unit_code', 'start_tm', 'end_tm', 'time_diff']
    list_filter = ['Unit_code']

    def save_model(self, request, obj, form, change):
        from .services.shift_master import time_diff, to_minute

        obj.time_diff = time_diff(to_minute(obj.start_tm), to_minute(obj.end_tm))
        super().save_model(request, obj, form, change)
