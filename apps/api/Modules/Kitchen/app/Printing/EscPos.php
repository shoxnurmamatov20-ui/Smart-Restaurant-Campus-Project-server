<?php

declare(strict_types=1);

namespace Modules\Kitchen\Printing;

/**
 * A document turned into the bytes a thermal printer understands.
 *
 * ESC/POS is Epson's command set and every printer in this market imitates it,
 * which is why this is a plain string builder rather than a driver: there is
 * nothing to negotiate and nothing to ask the device. Bytes go down a socket or
 * a USB endpoint and paper comes out.
 *
 * Rendering happens on the server, not in the agent, and that is a deliberate
 * choice with a cost. It means an agent update is not needed to change what a
 * receipt says, that all three languages are handled in one place that can be
 * tested, and that the agent has no business logic to get wrong — it is a pipe.
 * The cost is that the agent cannot adapt to a printer the server has not been
 * told about, which is what {@see Printer::$columns} and `$codepage` are for.
 *
 * Wrapping is done here rather than at build time so the same stored document
 * can be re-sent to a narrower roll when the 80 mm printer dies and the only
 * working device in the building is the 58 mm one at the bar.
 */
final class EscPos
{
    private const ESC = "\x1b";

    private const GS = "\x1d";

    private const INIT = self::ESC.'@';

    /**
     * `ESC p m t1 t2` — the cash drawer kick, and the one the plan names.
     *
     * m = 0 is pin 2, which is where a drawer is wired in every till this will
     * ever meet. The two durations are in 2 ms units: 50 ms on, 500 ms off. Long
     * enough for the solenoid to throw the latch, short enough not to cook the
     * coil if a job is retried.
     */
    private const DRAWER_PULSE = self::ESC."p\x00\x19\xfa";

    /**
     * Feed before cutting, always.
     *
     * The guillotine sits above the print head by roughly four lines of paper.
     * Cutting without feeding first slices through the last thing printed, which
     * on a receipt is the total.
     */
    private const CUT = self::ESC."d\x04".self::GS.'V'."\x01";

    /**
     * @param  int  $columns  Characters per line. Overrides the document's own,
     *                        because the printer in front of us is the authority.
     */
    public function render(Document $document, string $codepage = 'cp866', ?int $columns = null): string
    {
        $width = max(16, $columns ?? $document->columns);

        $out = self::INIT.self::ESC.'t'.chr(Charset::pageFor($codepage));

        foreach ($document->blocks() as $block) {
            $out .= match ($block['type']) {
                'text' => $this->textBlock($block, $codepage, $width),
                'kv' => $this->kvBlock($block, $codepage, $width),
                'rule' => $this->plain(str_repeat((string) $block['char'], $width), $codepage),
                'feed' => self::ESC.'d'.chr((int) $block['lines']),
                'cut' => self::CUT,
                'pulse' => self::DRAWER_PULSE,
                'qr' => $this->qrBlock($block, $codepage),
                default => '',
            };
        }

        return $out;
    }

    /**
     * The same document as readable text.
     *
     * Not decoration: it is what a test asserts against, what a support screen
     * shows when somebody asks what a job was, and what a developer looks at
     * without owning a printer. Byte-for-byte assertions on ESC/POS tell you a
     * sequence changed and never tell you whether the receipt was right.
     */
    public function preview(Document $document, ?int $columns = null): string
    {
        $width = max(16, $columns ?? $document->columns);
        $lines = [];

        foreach ($document->blocks() as $block) {
            switch ($block['type']) {
                case 'text':
                    $effective = intdiv($width, (int) $block['width']);
                    foreach ($this->wrap(Charset::normalise((string) $block['text']), $effective) as $line) {
                        $lines[] = $this->align($line, $effective, (string) $block['align']);
                    }
                    break;
                case 'kv':
                    $lines[] = $this->pair(
                        Charset::normalise((string) $block['left']),
                        Charset::normalise((string) $block['right']),
                        intdiv($width, (int) $block['width']),
                    );
                    break;
                case 'rule':
                    $lines[] = str_repeat((string) $block['char'], $width);
                    break;
                case 'feed':
                    $lines = array_merge($lines, array_fill(0, (int) $block['lines'], ''));
                    break;
                case 'qr':
                    $lines[] = '[QR '.$block['data'].']';
                    break;
                case 'cut':
                    $lines[] = str_repeat('=', $width);
                    break;
                case 'pulse':
                    $lines[] = '[DRAWER]';
                    break;
            }
        }

        return implode("\n", $lines);
    }

    // ============ Blocks ============

    /** @param array<string, mixed> $block */
    private function textBlock(array $block, string $codepage, int $width): string
    {
        $scale = (int) $block['width'];
        $effective = intdiv($width, $scale);
        $out = $this->style((bool) $block['bold'], $scale, (int) $block['height'], (string) $block['align']);

        foreach ($this->wrap(Charset::normalise((string) $block['text'], $codepage), $effective) as $line) {
            // Aligned by padding rather than by `ESC a`, because the two disagree
            // once a line is wrapped: the printer centres each physical line on
            // its own, so a two-line title comes out as two separately centred
            // fragments rather than a centred block.
            $out .= Charset::encode($this->align($line, $effective, (string) $block['align']), $codepage)."\n";
        }

        return $out.$this->reset();
    }

    /** @param array<string, mixed> $block */
    private function kvBlock(array $block, string $codepage, int $width): string
    {
        $scale = (int) $block['width'];
        $line = $this->pair(
            Charset::normalise((string) $block['left'], $codepage),
            Charset::normalise((string) $block['right'], $codepage),
            intdiv($width, $scale),
        );

        return $this->style((bool) $block['bold'], $scale, 1, 'left')
            .Charset::encode($line, $codepage)."\n"
            .$this->reset();
    }

    /** @param array<string, mixed> $block */
    private function qrBlock(array $block, string $codepage): string
    {
        $data = Charset::encode((string) $block['data'], $codepage);
        $length = strlen($data) + 3;

        return self::GS.'(k'."\x04\x00\x31\x41\x32\x00"                       // model 2
            .self::GS.'(k'."\x03\x00\x31\x43".chr((int) $block['size'])       // module size
            .self::GS.'(k'."\x03\x00\x31\x45\x30"                             // error correction L
            .self::GS.'(k'.chr($length % 256).chr(intdiv($length, 256))."\x31\x50\x30".$data
            .self::GS.'(k'."\x03\x00\x31\x51\x30";                            // print it
    }

    private function plain(string $text, string $codepage): string
    {
        return Charset::encode($text, $codepage)."\n";
    }

    // ============ Styling ============

    private function style(bool $bold, int $width, int $height, string $align): string
    {
        return self::ESC.'a'.chr(match ($align) {
            'center' => 1, 'right' => 2, default => 0
        })
            .self::ESC.'E'.chr($bold ? 1 : 0)
            .self::GS.'!'.chr((($width - 1) << 4) | ($height - 1));
    }

    private function reset(): string
    {
        return self::ESC.'E'."\x00".self::GS.'!'."\x00".self::ESC.'a'."\x00";
    }

    // ============ Layout ============

    /**
     * Break text to a column count, by characters and not by bytes.
     *
     * PHP's `wordwrap` counts bytes, so a Cyrillic line wrapped with it comes out
     * at half the intended width — the same class of bug the Charset docblock
     * describes, one layer up.
     *
     * Runs of spaces INSIDE a line collapse to one, which is what wrapping means
     * — a caller trying to align two columns with padding would have it thrown
     * away here and never know. That is what `kv` blocks are for. Leading spaces
     * are the exception and are preserved: they are an indent, and an indent is
     * content.
     *
     * @return array<int, string>
     */
    private function wrap(string $text, int $width): array
    {
        $lines = [];

        foreach (preg_split('/\R/u', $text) ?: [''] as $paragraph) {
            /*
             * Leading spaces are content, not whitespace to be tidied away.
             *
             * A docket indents a modifier under the dish it belongs to, and a
             * receipt indents `2 x 45 000` under its line. Splitting on spaces
             * without holding the indent back dropped both, and the paper came
             * out as a flat list where every line looked like a separate order.
             */
            preg_match('/^ */u', $paragraph, $matches);
            $indent = $matches[0] ?? '';
            $room = $width - mb_strlen($indent);

            if ($room < 4) {
                // An indent deeper than the roll is not an indent. Drop it
                // rather than wrap every word onto a line of its own.
                $indent = '';
                $room = $width;
            }

            $current = '';
            $wrapped = [];

            foreach (preg_split('/ +/u', mb_substr($paragraph, mb_strlen($matches[0] ?? ''))) ?: [] as $word) {
                // A word longer than the roll — a URL, a fifty-character dish
                // name — is cut rather than allowed to push the layout apart.
                while (mb_strlen($word) > $room) {
                    if ($current !== '') {
                        $wrapped[] = $current;
                        $current = '';
                    }

                    $wrapped[] = mb_substr($word, 0, $room);
                    $word = mb_substr($word, $room);
                }

                if ($current === '') {
                    $current = $word;
                } elseif (mb_strlen($current) + 1 + mb_strlen($word) <= $room) {
                    $current .= ' '.$word;
                } else {
                    $wrapped[] = $current;
                    $current = $word;
                }
            }

            $wrapped[] = $current;

            foreach ($wrapped as $line) {
                // The indent is re-applied to every physical line, so a wrapped
                // modifier stays under its dish instead of falling back to the
                // margin and reading as a dish of its own.
                $lines[] = $line === '' && $indent === '' ? '' : $indent.$line;
            }
        }

        // Always at least one line: the outer loop appends for every paragraph
        // `preg_split` produces, and it produces one even for empty input.
        return $lines;
    }

    private function align(string $line, int $width, string $align): string
    {
        $length = mb_strlen($line);

        if ($length >= $width) {
            return $line;
        }

        return match ($align) {
            'center' => str_repeat(' ', intdiv($width - $length, 2)).$line,
            'right' => str_repeat(' ', $width - $length).$line,
            default => $line,
        };
    }

    /**
     * Label left, figure right, filler between.
     *
     * The label is what gets trimmed when the two do not fit, never the figure:
     * a guest can work out what `Qo'shimcha go'sht (kat...` was, and cannot work
     * out a price that has been cut in half.
     */
    private function pair(string $left, string $right, int $width): string
    {
        $right = mb_substr($right, 0, $width);
        $room = $width - mb_strlen($right) - 1;

        if ($room < 1) {
            return $right;
        }

        if (mb_strlen($left) > $room) {
            $left = mb_substr($left, 0, $room);
        }

        return $left.str_repeat(' ', $width - mb_strlen($left) - mb_strlen($right)).$right;
    }
}
