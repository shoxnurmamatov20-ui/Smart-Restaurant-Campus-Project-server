<?php

declare(strict_types=1);

namespace Modules\Crm\Services;

/**
 * How many SMS parts a body costs, and what that is in tiyin.
 *
 * The twin of `smsParts()` and `smsCost()` in
 * `apps/web/src/app/(dashboard)/marketing/marketing-data.ts`, and the pair is
 * the same arrangement `pricing.ts` has with `BillTotals`: the browser has to
 * price the message while somebody types it, and the server has to price what
 * it actually sent. Two implementations of one rule, and the rule is short
 * enough that copying it is cheaper than a round trip per keystroke.
 *
 * If you change one, change the other in the same commit and re-run
 * `CampaignTest` — a composer that promises 17 160 and an invoice that says
 * 34 320 is a marketer who stops believing the screen.
 *
 * ---------------------------------------------------------------------------
 * Why one Cyrillic character more than doubles the bill
 *
 * GSM-7 fits 160 characters in a part. A single character outside it — one
 * Cyrillic letter, one ё in an otherwise Latin message — drops the whole
 * message to UCS-2, which fits 70. That is why the composer shows the alphabet
 * it detected rather than only the count: the cliff is invisible otherwise.
 */
final class SmsCost
{
    public const GSM7_PER_PART = 160;

    public const UCS2_PER_PART = 70;

    /** Whether this body will be billed as UCS-2. */
    public static function isCyrillic(string $text): bool
    {
        return preg_match('/[\x{0400}-\x{04FF}]/u', $text) === 1;
    }

    /**
     * Parts for one body.
     *
     * Always at least one: an empty message is not free, and a campaign with an
     * empty body is refused by validation long before it reaches here.
     */
    public static function parts(string $text): int
    {
        $per = self::isCyrillic($text) ? self::UCS2_PER_PART : self::GSM7_PER_PART;

        return max(1, (int) ceil(mb_strlen($text) / $per));
    }

    /** Tiyin for one body sent to one phone. */
    public static function tiyin(string $text, int $recipients = 1): int
    {
        return self::parts($text) * max(0, $recipients) * (int) config('crm.campaigns.sms_part_tiyin');
    }
}
