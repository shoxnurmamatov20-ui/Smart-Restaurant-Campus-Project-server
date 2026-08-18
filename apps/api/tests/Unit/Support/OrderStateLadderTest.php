<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\Orders\OrderChannel;
use App\Support\Orders\OrderState;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * The ladder exists twice — once in PHP for the API, once in TypeScript for
 * the four surfaces that render it — and the whole point of writing it down
 * was that it had already drifted five ways. Two copies drift too, silently,
 * and the first symptom is a guest being shown a state the API stopped
 * emitting a month earlier.
 *
 * So this reads the TypeScript and asserts the two agree. It is a unit test
 * with no database, which means it runs on a laptop, in CI, and on the box
 * that has no test database — every place the drift could be introduced.
 */
final class OrderStateLadderTest extends TestCase
{
    private const TS_LADDER = __DIR__.'/../../../../../packages/i18n/src/order-state.ts';

    #[Test]
    public function the_typescript_ladder_is_where_this_test_expects_it(): void
    {
        // A moved file must fail loudly here rather than make the comparison
        // below vacuous — a test that silently checks nothing is worse than
        // no test.
        $this->assertFileExists(
            self::TS_LADDER,
            'The shared ladder moved. Update this test rather than deleting it.',
        );
    }

    #[Test]
    public function both_languages_carry_the_same_states_in_the_same_order(): void
    {
        $this->assertSame(
            $this->typescriptStates(),
            OrderState::values(),
            'PHP and TypeScript disagree about the order state ladder. '
            .'Both are read by surfaces that must show the same bill the same way.',
        );
    }

    #[Test]
    public function the_ladder_has_no_invented_states(): void
    {
        // `in_kitchen` was this model's own invention: it appears in no design
        // file and in no handoff document, and three surfaces each guessed at
        // its meaning.
        $this->assertNotContains('in_kitchen', OrderState::values());
        $this->assertNotContains('on_the_way', OrderState::values());
        $this->assertNotContains('cancelled', OrderState::values());
    }

    #[Test]
    public function void_refund_and_comp_are_three_separate_terminal_states(): void
    {
        foreach ([OrderState::Voided, OrderState::Refunded, OrderState::Comped] as $state) {
            $this->assertTrue($state->isTerminal(), "{$state->value} must be terminal");
        }

        $this->assertNotSame(OrderState::Voided, OrderState::Comped);
        $this->assertCount(4, array_filter(OrderState::cases(), fn ($s) => $s->isTerminal()));
    }

    #[Test]
    public function a_bill_cannot_skip_the_kitchen(): void
    {
        $this->assertFalse(OrderState::Draft->canMoveTo(OrderState::Paid));
        $this->assertFalse(OrderState::Placed->canMoveTo(OrderState::Ready));
        $this->assertTrue(OrderState::Draft->canMoveTo(OrderState::Placed));
        $this->assertTrue(OrderState::Cooking->canMoveTo(OrderState::Ready));
    }

    #[Test]
    public function money_can_still_come_back_after_paid(): void
    {
        $this->assertTrue(OrderState::Paid->canMoveTo(OrderState::Refunded));
        $this->assertFalse(OrderState::Paid->canMoveTo(OrderState::Voided));
        $this->assertSame([], OrderState::Refunded->allowedNext());
    }

    #[Test]
    public function a_counter_can_take_the_money_before_the_food_is_ready(): void
    {
        // Fast food and bar are two of the POS's four modes, and in both the
        // guest pays before anything is cooked. A ladder that only allowed
        // `paid` after `served` was describing table service and calling it
        // the rule.
        $this->assertTrue(OrderState::Placed->canMoveTo(OrderState::Paid));
        $this->assertTrue(OrderState::Cooking->canMoveTo(OrderState::Paid));

        // But a draft has not been fired, so there is no agreed order to be
        // paid for. The till fires and settles in one action, not one step.
        $this->assertFalse(OrderState::Draft->canMoveTo(OrderState::Paid));
        $this->assertFalse(OrderState::Draft->canMoveTo(OrderState::ToPay));
    }

    #[Test]
    public function the_bill_can_be_presented_wherever_the_design_file_presents_it(): void
    {
        // The design file's staff pipeline is placed → accepted → cooking →
        // ready → topay → paid. It skips `served`, so `ready → topay` has to
        // work or the ladder refuses the sequence its own screens draw.
        $this->assertTrue(OrderState::Ready->canMoveTo(OrderState::ToPay));
        $this->assertTrue(OrderState::Served->canMoveTo(OrderState::ToPay));

        // Presenting a bill is not the same as being paid for it.
        $this->assertFalse(OrderState::ToPay->canMoveTo(OrderState::Served));
    }

    #[Test]
    public function paying_early_does_not_reopen_the_fulfilment_chain(): void
    {
        // The reason paying early is safe is that the kitchen tracks its own
        // ticket. What must not happen is the bill itself walking backwards:
        // once settled the only way out is a refund.
        foreach (OrderState::cases() as $state) {
            if ($state === OrderState::Refunded) {
                continue;
            }

            $this->assertFalse(
                OrderState::Paid->canMoveTo($state),
                "A paid bill must not move to {$state->value}",
            );
        }
    }

    #[Test]
    public function an_open_bill_can_always_be_voided_or_comped(): void
    {
        foreach (OrderState::cases() as $state) {
            if ($state->isTerminal()) {
                continue;
            }

            $this->assertTrue(
                $state->canMoveTo(OrderState::Voided),
                "A guest can walk out at {$state->value}, so it must be voidable",
            );
            $this->assertTrue($state->canMoveTo(OrderState::Comped));
        }
    }

    #[Test]
    public function channel_applicability_matches_the_typescript(): void
    {
        $ts = $this->typescriptChannels();

        foreach (OrderState::cases() as $state) {
            $php = array_map(fn (OrderChannel $c): string => $c->value, $state->channels());
            sort($php);
            $expected = $ts[$state->value] ?? [];
            sort($expected);

            $this->assertSame(
                $expected,
                $php,
                "Channel applicability for [{$state->value}] differs between PHP and TypeScript",
            );
        }
    }

    #[Test]
    public function a_dine_in_bill_never_goes_on_the_road(): void
    {
        $this->assertFalse(OrderState::Enroute->appliesTo(OrderChannel::DineIn));
        $this->assertTrue(OrderState::Enroute->appliesTo(OrderChannel::Delivery));
        $this->assertFalse(OrderState::ToPay->appliesTo(OrderChannel::Delivery));
    }

    #[Test]
    public function the_service_charge_is_dine_in_only(): void
    {
        // DECISIONS Q2, and the one rule the design file states in its copy
        // and then breaks in its arithmetic.
        $this->assertTrue(OrderChannel::DineIn->chargesService());
        $this->assertFalse(OrderChannel::Pickup->chargesService());
        $this->assertFalse(OrderChannel::Delivery->chargesService());
    }

    /** @return list<string> */
    private function typescriptStates(): array
    {
        $source = (string) file_get_contents(self::TS_LADDER);

        if (preg_match('/export const ORDER_STATES = \[(.*?)\] as const;/s', $source, $m) !== 1) {
            $this->fail('Could not find ORDER_STATES in the TypeScript ladder.');
        }

        preg_match_all("/'([a-z_]+)'/", $m[1], $found);

        return $found[1];
    }

    /** @return array<string, list<string>> */
    private function typescriptChannels(): array
    {
        $source = (string) file_get_contents(self::TS_LADDER);
        $out = [];

        // Each spec block opens with `key: 'x',` and declares `channels: [...]`.
        preg_match_all(
            "/key: '([a-z_]+)',\s*\n\s*channels: \[(.*?)\]/s",
            $source,
            $matches,
            PREG_SET_ORDER,
        );

        foreach ($matches as $match) {
            preg_match_all("/'([a-z]+)'/", $match[2], $channels);
            $out[$match[1]] = $channels[1];
        }

        return $out;
    }
}
