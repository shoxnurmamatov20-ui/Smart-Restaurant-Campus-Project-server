<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/**
 * A row in the console's bell.
 *
 * Everything the tray in `(dashboard)/shell-client.tsx` needs, said once:
 * which catalogue key names the thing that happened, how loudly it asks, where
 * pressing the row goes, which venue it happened at, and the two sentences
 * that carry the figures.
 *
 * ---------------------------------------------------------------------------
 * The key and the sentence are both here, and neither replaces the other
 *
 * `key` is a catalogue key (`console.notification.*` in `apps/web/src/i18n`),
 * so the console can name the KIND of event in the reader's own language and
 * paint it, filter it and count it without parsing prose. What the catalogue
 * cannot hold is this row's figures — a variance is not "a variance", it is
 * minus thirty-two thousand on shift 41 — so the row also carries a title and
 * a body, and the console prefers them when they are there.
 *
 * Both, and in three languages, because a Russian accountant and an Uzbek
 * owner read the same bell in the same restaurant (convention 10). Composing
 * them at write time rather than at read time is deliberate: the sentence is
 * about the shift as it was that evening, and a shift that is later amended
 * must not silently rewrite the notice that reported it.
 *
 * ---------------------------------------------------------------------------
 * Database only, on purpose
 *
 * A subclass that also wants a phone says so in its own `via()` —
 * {@see ApprovalWaiting}, which is a push first and a console row second. The
 * default here is the screen alone, because most of what belongs in a bell is
 * something to read when you next look up, not something to wake somebody for,
 * and a platform that pushes everything is a platform whose app is muted.
 */
abstract class ConsoleNotice extends Notification
{
    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array{key: string, level: string, href: string, branch_id: int|null, title: array{uz: string, ru: string, en: string}, body: array{uz: string, ru: string, en: string}}
     */
    public function toDatabase(object $notifiable): array
    {
        return [
            'key' => $this->key(),
            'level' => $this->level(),
            'href' => $this->href(),
            'branch_id' => $this->branchId(),
            'title' => $this->titles(),
            'body' => $this->bodies(),
        ];
    }

    /** The `console.notification.*` key the console translates. */
    abstract protected function key(): string;

    /** `high` — a decision today; `mid` — a heads-up; `low` — a fact. */
    abstract protected function level(): string;

    /** A console route. A notice you cannot follow has to be re-found by hand. */
    abstract protected function href(): string;

    /** The venue it happened at, or null for the whole business. */
    abstract protected function branchId(): ?int;

    /** @return array{uz: string, ru: string, en: string} */
    abstract protected function titles(): array;

    /** @return array{uz: string, ru: string, en: string} */
    abstract protected function bodies(): array;

    /**
     * Tiyin as a person reads them: whole so'm, thin-space grouped.
     *
     * Money is integer tiyin everywhere on this platform (convention 1) and a
     * notification is the one place it stops being arithmetic and starts being
     * a sentence. Rounding down rather than to the nearest is deliberate — the
     * figure beside it in the Z-report is the exact one, and a bell that said
     * 32 001 where the report says 32 000 is a bell somebody stops believing.
     */
    protected static function som(int $tiyin): string
    {
        return number_format(intdiv(abs($tiyin), 100), 0, ',', ' ');
    }

    /**
     * The same, with the sign spelled out.
     *
     * A true minus sign (U+2212), not a hyphen: this is read at a glance next
     * to a figure, and a hyphen at that size is a dash somebody misses. The
     * plus is not decoration either — an over-count is usually a sale that was
     * taken and never rung up, which is the half of the problem that is theft.
     */
    protected static function signedSom(int $tiyin): string
    {
        return ($tiyin < 0 ? "\u{2212}" : '+').self::som($tiyin);
    }
}
