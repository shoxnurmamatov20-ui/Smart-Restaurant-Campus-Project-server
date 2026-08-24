<?php

declare(strict_types=1);

namespace Modules\Kitchen\Printing;

use JsonSerializable;

/**
 * A printable document, in blocks rather than bytes.
 *
 * What gets stored in the spool, and the reason a job can be inspected, read
 * back in a support call, re-rendered for a narrower roll, or shown on screen
 * without a printer in the room. Storing ESC/POS bytes instead would have made
 * every one of those impossible and pinned the queue to whatever encoding was
 * right the day the job was written.
 *
 * The blocks are deliberately few. Everything a restaurant prints is a title, a
 * label with a number opposite it, a horizontal rule, and paper coming out —
 * and a format with more shapes than that is one where two renderers can
 * disagree about what a receipt looks like.
 *
 * Nothing here wraps text: {@see EscPos} does that, at the width of the printer
 * the job is going to, so the same document can be re-sent to a 58 mm roll after
 * the 80 mm one dies.
 */
final class Document implements JsonSerializable
{
    /** @var array<int, array<string, mixed>> */
    private array $blocks = [];

    /**
     * @param  int  $columns  Characters per line on the printer this was built for.
     *                        Kept with the document so a job read back a week later
     *                        still lays out the way it did when it was fired.
     */
    public function __construct(public readonly int $columns = 48) {}

    // ============ Building ============

    /** A line of text, left aligned, ordinary size. */
    public function line(string $text = ''): self
    {
        return $this->text($text);
    }

    public function centre(string $text): self
    {
        return $this->text($text, align: 'center');
    }

    /** The one thing somebody reads from across a kitchen: a table number. */
    public function headline(string $text): self
    {
        return $this->text($text, align: 'center', bold: true, width: 2, height: 2);
    }

    public function text(
        string $text,
        string $align = 'left',
        bool $bold = false,
        int $width = 1,
        int $height = 1,
    ): self {
        $this->blocks[] = [
            'type' => 'text',
            'text' => $text,
            'align' => in_array($align, ['left', 'center', 'right'], true) ? $align : 'left',
            'bold' => $bold,
            'width' => max(1, min(2, $width)),
            'height' => max(1, min(2, $height)),
        ];

        return $this;
    }

    /**
     * A label and a figure, pushed to opposite edges.
     *
     * Every money line on a receipt is one of these, and having it as a block
     * rather than as string padding at the call site is what keeps the totals
     * column straight when the label is long enough to need trimming.
     */
    public function kv(string $left, string $right, bool $bold = false, int $width = 1): self
    {
        $this->blocks[] = [
            'type' => 'kv',
            'left' => $left,
            'right' => $right,
            'bold' => $bold,
            'width' => max(1, min(2, $width)),
            'height' => 1,
        ];

        return $this;
    }

    public function rule(string $char = '-'): self
    {
        $this->blocks[] = ['type' => 'rule', 'char' => mb_substr($char, 0, 1) ?: '-'];

        return $this;
    }

    public function feed(int $lines = 1): self
    {
        $this->blocks[] = ['type' => 'feed', 'lines' => max(1, min(16, $lines))];

        return $this;
    }

    public function cut(): self
    {
        $this->blocks[] = ['type' => 'cut'];

        return $this;
    }

    /**
     * The cash drawer. A document, not a side effect.
     *
     * Putting the kick in the same queue as the paper is what makes it survive:
     * the drawer opens when the receipt prints, and if the printer was dead at
     * settlement, both happen together when it comes back rather than the drawer
     * having silently never opened.
     */
    public function pulse(): self
    {
        $this->blocks[] = ['type' => 'pulse'];

        return $this;
    }

    public function qr(string $data, int $size = 5): self
    {
        $this->blocks[] = ['type' => 'qr', 'data' => $data, 'size' => max(1, min(16, $size))];

        return $this;
    }

    // ============ Reading ============

    /** @return array<int, array<string, mixed>> */
    public function blocks(): array
    {
        return $this->blocks;
    }

    public function isEmpty(): bool
    {
        return $this->blocks === [];
    }

    /** @return array{columns: int, blocks: array<int, array<string, mixed>>} */
    public function toArray(): array
    {
        return ['columns' => $this->columns, 'blocks' => $this->blocks];
    }

    /** @return array{columns: int, blocks: array<int, array<string, mixed>>} */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    /**
     * Read a document back out of the spool.
     *
     * Tolerant on purpose: a job written by an older release must still print.
     * A block whose type this version does not recognise is dropped rather than
     * fatal — losing a line off a docket is bad, refusing to print the docket at
     * all is worse.
     *
     * @param  array<string, mixed>  $payload
     */
    public static function fromArray(array $payload): self
    {
        $document = new self((int) ($payload['columns'] ?? 48));

        /** @var array<int, mixed> $blocks */
        $blocks = is_array($payload['blocks'] ?? null) ? $payload['blocks'] : [];

        foreach ($blocks as $block) {
            if (! is_array($block) || ! is_string($block['type'] ?? null)) {
                continue;
            }

            match ($block['type']) {
                'text' => $document->text(
                    (string) ($block['text'] ?? ''),
                    (string) ($block['align'] ?? 'left'),
                    (bool) ($block['bold'] ?? false),
                    (int) ($block['width'] ?? 1),
                    (int) ($block['height'] ?? 1),
                ),
                'kv' => $document->kv(
                    (string) ($block['left'] ?? ''),
                    (string) ($block['right'] ?? ''),
                    (bool) ($block['bold'] ?? false),
                    (int) ($block['width'] ?? 1),
                ),
                'rule' => $document->rule((string) ($block['char'] ?? '-')),
                'feed' => $document->feed((int) ($block['lines'] ?? 1)),
                'cut' => $document->cut(),
                'pulse' => $document->pulse(),
                'qr' => $document->qr((string) ($block['data'] ?? ''), (int) ($block['size'] ?? 5)),
                default => null,
            };
        }

        return $document;
    }
}
