<?php

declare(strict_types=1);

namespace Modules\Analytics\Services;

use App\Contracts\Messaging\ChatNotifier;
use Illuminate\Support\Facades\Mail;
use Modules\Analytics\Mail\ScheduledReportMail;
use Modules\Analytics\Models\ReportSchedule;
use Throwable;

/**
 * Building one schedule's report and putting it where it was asked to go.
 *
 * Split out of the command so both the scheduler and `analytics:send-scheduled
 * --id=` run identical code. A "send it to me now so I can see what it looks
 * like" button that took a different path would be a preview of something else.
 *
 * ---------------------------------------------------------------------------
 * Every destination is tried, and one failure does not cancel the others
 *
 * A restaurant sends the weekly cashflow to an accountant and to the owner's
 * Telegram. The accountant's mail server being down must not mean the owner
 * hears nothing — so each destination is attempted, the count of what landed is
 * returned, and the schedule records `sent` only if at least one arrived.
 *
 * ---------------------------------------------------------------------------
 * The file is the report; the message is one line
 *
 * A CSV, built by the same `CsvReport` the manual export uses, so a scheduled
 * file and a downloaded one are byte-identical — including the byte-order mark
 * Excel needs and the tab that stops a dish called `=cmd|…` executing when an
 * accountant opens it.
 */
final class ScheduledDelivery
{
    public function __construct(
        private readonly StandardReports $standard,
        private readonly CustomReports $custom,
        private readonly ChatNotifier $chats,
    ) {}

    /**
     * @return array{delivered: int, attempted: int, rows: int}
     */
    public function run(ReportSchedule $schedule): array
    {
        $window = ReportWindow::of($schedule->period);
        $report = $this->build($schedule, $window);

        /** @var list<array<string, mixed>> $rows */
        $rows = $report['rows'] ?? [];
        $csv = CsvReport::from($report);
        $name = sprintf('%s-%s.csv', $schedule->kind, $window->to);
        $line = $this->summary($schedule, $window, count($rows));

        $delivered = 0;
        $destinations = $schedule->destinations;

        foreach ($destinations as $destination) {
            $channel = $destination['channel'];
            $target = $destination['target'];

            if ($target === '') {
                continue;
            }

            $delivered += $this->sendFile(
                (int) $schedule->tenant_id,
                $channel,
                $target,
                $line,
                $name,
                $csv,
            ) ? 1 : 0;
        }

        return ['delivered' => $delivered, 'attempted' => count($destinations), 'rows' => count($rows)];
    }

    /**
     * One file, to one place, now.
     *
     * Public because the export dialog reaches it: a manager pressing
     * *Telegramga* on a report they are looking at is asking for exactly what a
     * schedule does, minus the schedule. Sharing the method rather than the
     * shape means a manual send and a Monday morning send cannot differ in what
     * arrives — which is the whole argument the class docblock makes about the
     * "send it to me now" button, one level down.
     *
     * `mail` is the channel name a schedule stores and `email` is the word the
     * export dialog uses; both are accepted rather than one of them being
     * renamed, because the stored rows are years of somebody's configuration.
     *
     * Never throws, for the reason every destination here never throws: the
     * caller may have another destination behind this one.
     */
    public function sendFile(
        int $tenantId,
        string $channel,
        string $target,
        string $line,
        string $name,
        string $contents,
    ): bool {
        return match ($channel) {
            'mail', 'email' => $this->mail($target, $line, $name, $contents),
            'telegram' => $this->chats->notify(
                $tenantId,
                $target,
                $line,
                ['name' => $name, 'contents' => $contents],
            ),
            default => false,
        };
    }

    /**
     * The one line that travels with the file, whoever asked for it.
     *
     * Static and public for the same reason `sendFile()` is: the export dialog
     * has a report and a window and no schedule, and a second phrasing of "what
     * this file is" would be the version that goes out of date.
     */
    public static function line(string $kind, ReportWindow $window, int $rows): string
    {
        return sprintf('%s · %s — %s · %d qator', $kind, $window->from, $window->to, $rows);
    }

    /**
     * @return array<string, mixed>
     */
    private function build(ReportSchedule $schedule, ReportWindow $window): array
    {
        if ($schedule->kind !== 'custom') {
            return $this->standard->build($schedule->kind, $window);
        }

        /** @var array<string, mixed> $definition */
        $definition = $schedule->definition ?? [];
        /** @var list<string> $columns */
        $columns = $definition['columns'] ?? [];

        return $this->custom->build(
            (string) ($definition['base'] ?? 'sales'),
            $columns,
            (string) ($definition['group_by'] ?? 'day'),
            $window,
        );
    }

    /**
     * One line, in the reader's own language, saying what the file is.
     *
     * Deliberately not a template with branding: this arrives as an attachment
     * in a chat as often as in an inbox, and a two-page HTML mail rendered into
     * a Telegram caption is unreadable in both.
     */
    private function summary(ReportSchedule $schedule, ReportWindow $window, int $rows): string
    {
        return self::line($schedule->kind, $window, $rows);
    }

    /**
     * Put the file in somebody's inbox.
     *
     * TODO(integration): needs MAIL_HOST — see docs/GO-LIVE.md. The code is
     * complete and `MAIL_MAILER=log` writes the whole message, attachment
     * included, to the log — which is a real delivery for a deployment that has
     * not been given an SMTP account yet. Nothing here changes when one
     * arrives; the driver does.
     */
    private function mail(string $address, string $line, string $name, string $csv): bool
    {
        try {
            Mail::to($address)->send(new ScheduledReportMail($line, $name, $csv));

            return true;
        } catch (Throwable $failure) {
            // Returned rather than thrown, like every other destination here:
            // the caller has ten more schedules behind this one.
            report($failure);

            return false;
        }
    }
}
