<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\StaffMember;

final class StaffController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'module' => 'Staff',
            'alias' => 'staff',
            'labels' => config('staff.labels'),
            'description' => 'Restoran xodimlari, smenalar jadvali, davomat va ish haqi asosi.',
            'enabled' => (bool) config('staff.enabled', true),
            'endpoints' => [
                'members' => url('/api/v1/staff/members'),
                'shifts' => url('/api/v1/staff/shifts'),
                'attendances' => url('/api/v1/staff/attendances'),
            ],
            'counts' => [
                'members_active' => StaffMember::active()->count(),
                'on_shift_now' => Attendance::open()->count(),
                // `where <` on the raw column, not `whereDate`: wrapping the
                // column in date() stops PostgreSQL using an index on it.
                'health_books_expired' => StaffMember::active()
                    ->whereNotNull('health_book_expires_at')
                    ->where('health_book_expires_at', '<', now())
                    ->count(),
            ],
        ]);
    }
}
