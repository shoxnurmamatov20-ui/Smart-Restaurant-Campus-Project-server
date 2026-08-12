<?php

declare(strict_types=1);

namespace Modules\Staff\Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\StaffMember;

/**
 * A week on the rota, and who actually turned up.
 *
 * StaffDatabaseSeeder hires eight people and stops, which leaves the manager's
 * shift screen empty and the attendance column blank. Half of what a branch
 * manager does is the rota, so a demo without one cannot show the module doing
 * its job.
 *
 * Seven days: three behind, today, three ahead. That shape is deliberate —
 * the past is where attendance lives, the future is where planning lives, and
 * the screen has to show both to be worth looking at. Today is the row a
 * manager actually reads.
 *
 * Attendance is written for past shifts only. A shift that has not happened
 * cannot have been attended, and a demo that says otherwise teaches a manager
 * to distrust the column.
 */
final class StaffShiftSeeder extends Seeder
{
    /** Days either side of today. Seven rows, because a rota is a week. */
    private const DAYS_BACK = 3;

    private const DAYS_FORWARD = 3;

    /**
     * When each post works, in hours from midnight.
     *
     * A kitchen starts before the doors open and a bar closes after they shut;
     * flattening everyone onto one 09:00–18:00 block would draw a rota no
     * restaurant has ever run.
     *
     * @var array<string, array{int, int}>
     */
    private const HOURS = [
        'chef' => [8, 20],
        'cook' => [9, 21],
        'waiter' => [10, 22],
        'cashier' => [10, 22],
        'bartender' => [14, 24],
        'host' => [11, 23],
        'courier' => [11, 23],
        'storekeeper' => [7, 15],
    ];

    /**
     * Who was late, and on which day of the run.
     *
     * Two people, twice, out of roughly forty attended shifts. Enough for the
     * "late" flag to be visible on the screen and not so much that lateness
     * looks normal — the figure a manager reads is the exception rate.
     *
     * @var array<int, array{int, int}>
     */
    private const LATE = [[4, 1], [6, 2]];

    public function run(): void
    {
        $members = StaffMember::query()->where('status', 'active')->orderBy('id')->get();

        if ($members->isEmpty()) {
            $this->command?->warn('⏭  Staff: xodim yo\'q — avval StaffDatabaseSeeder.');

            return;
        }

        $shifts = 0;
        $attended = 0;

        foreach ($members as $member) {
            [$from, $to] = self::HOURS[$member->position] ?? [9, 18];

            for ($offset = -self::DAYS_BACK; $offset <= self::DAYS_FORWARD; $offset++) {
                $day = now()->startOfDay()->addDays($offset);

                // Everyone gets one day off, staggered by employee so the
                // restaurant is never empty and no two people rest together.
                if (($day->dayOfWeek + (int) $member->id) % 7 === 0) {
                    continue;
                }

                $starts = $day->copy()->addHours($from);
                $ends = $day->copy()->addHours($to);
                $past = $offset < 0;

                Shift::query()->updateOrCreate(
                    ['staff_member_id' => $member->id, 'starts_at' => $starts],
                    [
                        'tenant_id' => $member->tenant_id,
                        'branch_id' => $member->branch_id,
                        'ends_at' => $ends,
                        'role' => $member->position,
                        // A shift that has happened was confirmed by happening.
                        // One still ahead is only planned until someone agrees
                        // to it, which is the manager's job on this screen.
                        'status' => $past || $offset === 0 ? 'confirmed' : 'planned',
                    ],
                );

                $shifts++;

                if (! $past) {
                    continue;
                }

                $late = in_array([(int) $member->id, abs($offset)], self::LATE, true);
                $in = $starts->copy()->addMinutes($late ? 18 : -4);
                $out = $ends->copy()->addMinutes(6);

                Attendance::query()->updateOrCreate(
                    ['staff_member_id' => $member->id, 'checked_in_at' => $in],
                    [
                        'tenant_id' => $member->tenant_id,
                        'branch_id' => $member->branch_id,
                        'checked_out_at' => $out,
                        // Face ID at the door for the floor, a PIN at the pass
                        // for the kitchen — where a cook's hands are rarely
                        // clean enough for a screen.
                        'method' => in_array($member->position, ['chef', 'cook'], true) ? 'pin' : 'face',
                        'minutes_worked' => $in->diffInMinutes($out),
                        'is_late' => $late,
                    ],
                );

                $attended++;
            }
        }

        $this->command?->info("✅ Staff: {$shifts} ta smena, {$attended} ta davomat yozildi.");
    }
}
