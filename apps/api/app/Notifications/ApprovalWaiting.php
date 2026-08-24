<?php

declare(strict_types=1);

namespace App\Notifications;

/**
 * A manager's phone: somebody at a till is waiting for a yes.
 *
 * The design's sharpest observation about the staff app is that the
 * notification *is* the product for a manager — they are not at the till,
 * and the cashier cannot finish the sale until they answer. So the message
 * names the amount and the action, and the tap lands on the queue where the
 * answer is one press.
 *
 * Expires with the approval: a push delivered after the cashier gave up is a
 * question that can no longer be answered, and the app reads `expires_at` to
 * show it as such rather than as a live request.
 *
 * ---------------------------------------------------------------------------
 * Two channels, and the console one is not a duplicate
 *
 * The push goes to a phone that may be in a coat in the office. The console row
 * goes to the screen the same manager is already sitting in front of, and it
 * survives — a push is gone the moment it is swiped, and "what was I being
 * asked at 14:20" had no answer anywhere on this platform. Both carry the same
 * notification id, because Laravel mints it once on the object, so the two are
 * one event seen twice rather than two events.
 *
 * It names no venue. `pos.approval_requested` carries a terminal and not a
 * branch, and `PageTheManager` passes on what the event gave it; the array
 * below reads an optional `branch_id` so the tray starts naming the till's
 * venue the day that payload grows one, without this class changing again.
 */
final class ApprovalWaiting extends ConsoleNotice
{
    /** @param array{action: string, amount: int, reason: ?string, expires_at: string, role: string, branch_id?: int|null} $approval */
    public function __construct(private readonly int $approvalId, private readonly array $approval) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['expo', 'database'];
    }

    /** @return array{title: string, body: string, data: array<string, mixed>, surface: string} */
    public function toExpo(object $notifiable): array
    {
        $som = number_format(intdiv($this->approval['amount'], 100), 0, ',', ' ');

        return [
            'title' => self::title($this->approval['action']),
            'body' => $som." so'm".($this->approval['reason'] ? ' · '.$this->approval['reason'] : ''),
            'data' => [
                'url' => '/crew/'.$this->approval['role'].'/queue',
                'approval_id' => $this->approvalId,
                'expires_at' => $this->approval['expires_at'],
            ],
            'surface' => 'crew',
        ];
    }

    protected function key(): string
    {
        return 'approval_waiting';
    }

    /**
     * Always high: a guest is standing at the till while this is unanswered.
     * Nothing else in the tray has somebody waiting on it in real time.
     */
    protected function level(): string
    {
        return 'high';
    }

    /**
     * The manager's dashboard, where the queue already is
     * (`(dashboard)/dashboard/approval-queue.tsx`) — not the crew app's
     * `/crew/{role}/queue` the push points at. Same question, two surfaces, and
     * a console row that opened a phone route would open a screen with no shell
     * around it.
     */
    protected function href(): string
    {
        return '/dashboard';
    }

    protected function branchId(): ?int
    {
        $branch = $this->approval['branch_id'] ?? null;

        return is_int($branch) ? $branch : null;
    }

    /** @return array{uz: string, ru: string, en: string} */
    protected function titles(): array
    {
        return [
            'uz' => self::title($this->approval['action']),
            'ru' => match ($this->approval['action']) {
                'discount' => 'Ожидается подтверждение скидки',
                'void' => 'Ожидается подтверждение отмены',
                'refund' => 'Ожидается подтверждение возврата',
                'comp' => 'Ожидается подтверждение угощения',
                default => 'Ожидается подтверждение',
            },
            'en' => match ($this->approval['action']) {
                'discount' => 'A discount is waiting for a yes',
                'void' => 'A void is waiting for a yes',
                'refund' => 'A refund is waiting for a yes',
                'comp' => 'A comp is waiting for a yes',
                default => 'A till is waiting for a yes',
            },
        ];
    }

    /** @return array{uz: string, ru: string, en: string} */
    protected function bodies(): array
    {
        $som = self::som($this->approval['amount']);
        $reason = $this->approval['reason'] === null || trim($this->approval['reason']) === ''
            ? ''
            : ' · '.trim($this->approval['reason']);

        return [
            'uz' => "{$som} so'm{$reason}",
            'ru' => "{$som} сум{$reason}",
            'en' => "{$som} so'm{$reason}",
        ];
    }

    private static function title(string $action): string
    {
        return match ($action) {
            'discount' => 'Chegirma tasdig‘i kutilmoqda',
            'void' => 'Bekor qilish tasdig‘i kutilmoqda',
            'refund' => 'Qaytarish tasdig‘i kutilmoqda',
            'comp' => 'Bepul berish tasdig‘i kutilmoqda',
            default => 'Tasdiq kutilmoqda',
        };
    }
}
