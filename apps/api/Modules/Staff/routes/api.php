<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Staff\Http\Controllers\AttendanceController;
use Modules\Staff\Http\Controllers\ShiftController;
use Modules\Staff\Http\Controllers\StaffController;
use Modules\Staff\Http\Controllers\StaffMemberController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Staff module API routes — /api/v1/staff/*
|--------------------------------------------------------------------------
*/

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/staff')
    ->name('api.v1.staff.')
    ->group(function (): void {
        Route::get('/', [StaffController::class, 'index'])->name('info');

        Route::get('members', [StaffMemberController::class, 'index'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('members.index');
        Route::post('members', [StaffMemberController::class, 'store'])
            ->middleware(PermissionMiddleware::using('staff.create'))->name('members.store');
        Route::get('members/{member}', [StaffMemberController::class, 'show'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('members.show');
        Route::patch('members/{member}', [StaffMemberController::class, 'update'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('members.update');
        Route::delete('members/{member}', [StaffMemberController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('staff.delete'))->name('members.destroy');

        Route::get('shifts', [ShiftController::class, 'index'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('shifts.index');
        Route::post('shifts', [ShiftController::class, 'store'])
            ->middleware(PermissionMiddleware::using('staff.create'))->name('shifts.store');
        Route::get('shifts/{shift}', [ShiftController::class, 'show'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('shifts.show');
        Route::patch('shifts/{shift}', [ShiftController::class, 'update'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('shifts.update');
        Route::delete('shifts/{shift}', [ShiftController::class, 'destroy'])
            ->middleware(PermissionMiddleware::using('staff.delete'))->name('shifts.destroy');

        Route::get('attendances', [AttendanceController::class, 'index'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('attendances.index');
        Route::get('attendances/{attendance}', [AttendanceController::class, 'show'])
            ->middleware(PermissionMiddleware::using('staff.view'))->name('attendances.show');

        // The two buttons on the service-entrance tablet.
        Route::post('attendance/check-in', [AttendanceController::class, 'checkIn'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('attendance.check-in');
        Route::post('attendance/check-out', [AttendanceController::class, 'checkOut'])
            ->middleware(PermissionMiddleware::using('staff.update'))->name('attendance.check-out');
    });
