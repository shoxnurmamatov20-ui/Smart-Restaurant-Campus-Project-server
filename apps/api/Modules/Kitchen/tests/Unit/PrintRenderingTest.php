<?php

declare(strict_types=1);

namespace Modules\Kitchen\Tests\Unit;

use Modules\Kitchen\Printing\Charset;
use Modules\Kitchen\Printing\Document;
use Modules\Kitchen\Printing\EscPos;
use Modules\Kitchen\Printing\Money;
use PHPUnit\Framework\TestCase;

/**
 * Turning words and tiyin into something a thermal printer can lay out.
 *
 * No database and no framework: everything here is a pure function, and the
 * failures it guards against are the ones that only show up on paper — a price
 * off by a hundred, an Uzbek word full of question marks, a receipt wrapped into
 * confetti on a 58 mm roll.
 */
final class PrintRenderingTest extends TestCase
{
    // ============ Money ============

    public function test_tiyin_are_printed_as_som(): void
    {
        // 1 so'm = 100 tiyin. Getting this factor wrong prints a bill a hundred
        // times too large, which is the single most expensive typo available.
        $this->assertSame('45 234', Money::som(4_523_400));
        $this->assertSame('0', Money::som(0));
        $this->assertSame('1 234 567 890', Money::som(123_456_789_000));
    }

    public function test_the_tiyin_part_is_shown_only_when_there_is_one(): void
    {
        // Menu prices are whole so'm, so ",00" after every line would be a
        // column of noise saying nothing — but a 40-tiyin rounding difference
        // has to be legible or the line does not explain itself.
        $this->assertSame('45 234', Money::som(4_523_400));
        $this->assertSame('45 234,50', Money::som(4_523_450));
        $this->assertSame('0,99', Money::som(99));
    }

    public function test_a_signed_amount_shows_which_way_it_went(): void
    {
        // Rounding of +40 and -40 must not look alike on a receipt.
        $this->assertSame('+400', Money::signed(40_000));
        $this->assertSame('-400', Money::signed(-40_000));
    }

    // ============ Charset ============

    public function test_uzbek_latin_survives_a_codepage_that_has_never_heard_of_it(): void
    {
        // U+02BB, the sign on o' and g'. No printer page contains it, so
        // untreated every gʻoz, qoʻy and shoʻrva prints with a question mark in
        // the middle — on every receipt the platform would ever produce.
        $this->assertSame("Qo'y sho'rva, g'oz", Charset::normalise('Qoʻy shoʻrva, gʻoz'));
        $this->assertStringNotContainsString('?', Charset::encode('Qoʻy shoʻrva, gʻoz', 'cp866'));
    }

    public function test_cyrillic_survives_cp866_and_is_transliterated_without_it(): void
    {
        // A printer with no Cyrillic page is a real thing on a shop floor, and
        // "Ko'k choy" beats a column of question marks.
        $this->assertSame(bin2hex("\x8a\xf7\xaa"), bin2hex(Charset::encode('Кўк', 'cp866')));
        $this->assertSame("Ko'k choy", Charset::normalise('Кўк чой', 'ascii'));
        $this->assertSame('Shashlik', Charset::normalise('Шашлык', 'ascii'));
    }

    public function test_typographic_characters_become_ones_a_printer_has(): void
    {
        $this->assertSame('"Bahor" - N5 ...', Charset::normalise('«Bahor» — №5 …'));
        // A non-breaking space prints as a question mark, and the place it turns
        // up is inside a price.
        $this->assertSame('45 000', Charset::normalise("45\u{00A0}000"));
    }

    public function test_the_codepage_is_selected_by_its_escpos_page_number(): void
    {
        $this->assertSame(17, Charset::pageFor('cp866'));
        $this->assertSame(46, Charset::pageFor('cp1251'));
        // An unknown page falls back to PC437, which every printer has.
        $this->assertSame(0, Charset::pageFor('klingon'));
    }

    // ============ Layout ============

    public function test_text_wraps_at_the_printers_column_count_not_at_bytes(): void
    {
        // PHP's wordwrap counts bytes, so a Cyrillic line wrapped with it comes
        // out at half the intended width.
        $lines = $this->preview((new Document(20))->line('Шашлык говяжий острый'));

        foreach (explode("\n", $lines) as $line) {
            $this->assertLessThanOrEqual(20, mb_strlen($line), "Line too long: {$line}");
        }

        $this->assertStringContainsString('Шашлык', $lines);
    }

    public function test_an_indent_is_kept_on_every_wrapped_line(): void
    {
        // A docket indents a modifier under its dish. Losing the indent turns
        // the paper into a flat list where every line looks like its own order.
        $lines = explode("\n", $this->preview(
            (new Document(24))->line('     - juda uzun qoshimcha nomi bu yerda'),
        ));

        $this->assertGreaterThan(1, count($lines), 'This line is meant to wrap.');
        $this->assertStringStartsWith('     - juda', $lines[0]);

        foreach ($lines as $line) {
            // The indent is content, and it costs columns: 24 columns less a
            // five-space indent leaves 19 for the words.
            $this->assertStringStartsWith('     ', $line);
            $this->assertLessThanOrEqual(24, mb_strlen($line));
        }
    }

    public function test_a_word_longer_than_the_roll_is_cut_rather_than_pushing_the_layout_apart(): void
    {
        $lines = explode("\n", $this->preview((new Document(16))->line(str_repeat('A', 40))));

        $this->assertSame(['AAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAA', 'AAAAAAAA'], $lines);
    }

    public function test_a_label_and_a_figure_are_pushed_to_opposite_edges(): void
    {
        $line = $this->preview((new Document(24))->kv('JAMI', '99 500'));

        $this->assertSame(24, mb_strlen($line));
        $this->assertStringStartsWith('JAMI', $line);
        $this->assertStringEndsWith('99 500', $line);
    }

    public function test_the_label_is_trimmed_and_never_the_figure(): void
    {
        // A guest can work out what a truncated label was. A price cut in half
        // is a receipt they cannot check.
        $line = $this->preview((new Document(20))->kv(str_repeat('x', 40), '99 500'));

        $this->assertSame(20, mb_strlen($line));
        $this->assertStringEndsWith('99 500', $line);
    }

    // ============ ESC/POS ============

    public function test_the_drawer_pulse_is_the_command_the_plan_names(): void
    {
        // ESC p 0 — pin 2, 50 ms on, 500 ms off.
        $bytes = (new EscPos)->render((new Document(48))->pulse());

        $this->assertStringContainsString("\x1bp\x00\x19\xfa", $bytes);
    }

    public function test_paper_is_fed_before_it_is_cut(): void
    {
        // The guillotine sits about four lines above the print head. Cutting
        // without feeding slices through the last thing printed, which on a
        // receipt is the total.
        $bytes = (new EscPos)->render((new Document(48))->line('JAMI')->cut());

        $this->assertStringContainsString("\x1bd\x04\x1dV\x01", $bytes);
    }

    public function test_the_codepage_is_selected_before_anything_is_printed(): void
    {
        $bytes = (new EscPos)->render((new Document(48))->line('Кўк чой'), 'cp866');

        // ESC @ then ESC t 17, in that order: a reset after the page selection
        // would throw the selection away.
        $this->assertStringStartsWith("\x1b@\x1bt".chr(17), $bytes);
    }

    public function test_a_narrow_roll_re_wraps_the_same_document(): void
    {
        // The stored document is device-neutral, which is what lets a job be
        // re-sent to the 58 mm printer at the bar when the 80 mm one dies.
        $document = (new Document(48))->kv('Oraliq jami', '95 000');

        $this->assertSame(48, mb_strlen((new EscPos)->preview($document)));
        $this->assertSame(32, mb_strlen((new EscPos)->preview($document, 32)));
    }

    public function test_a_document_survives_the_round_trip_through_the_spool(): void
    {
        // Jobs are stored as JSON and read back minutes or days later.
        $original = (new Document(48))->headline('STOL 12')->kv('JAMI', '99 500')->pulse()->cut();
        $restored = Document::fromArray($original->toArray());

        $this->assertSame($original->toArray(), $restored->toArray());
    }

    public function test_an_unknown_block_from_a_newer_release_is_dropped_rather_than_fatal(): void
    {
        // Losing a line off a docket is bad. Refusing to print the docket at
        // all, because a job was written by a version that knew one more block
        // type, is worse.
        $restored = Document::fromArray([
            'columns' => 48,
            'blocks' => [
                ['type' => 'text', 'text' => 'Osh', 'align' => 'left', 'bold' => false, 'width' => 1, 'height' => 1],
                ['type' => 'hologram', 'text' => 'from the future'],
            ],
        ]);

        $this->assertCount(1, $restored->blocks());
        $this->assertSame('Osh', $this->preview($restored));
    }

    private function preview(Document $document): string
    {
        return (new EscPos)->preview($document);
    }
}
