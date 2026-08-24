<?php

declare(strict_types=1);

namespace Modules\Analytics\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * A scheduled report, in somebody's inbox.
 *
 * A Mailable rather than `Mail::raw`, and the reason is testability rather than
 * ceremony: `Mail::fake()` records mailables and ignores raw sends, so a raw
 * one leaves "did the weekly report actually go out" unassertable — which is
 * the single thing about a schedule anybody needs proved.
 *
 * ---------------------------------------------------------------------------
 * No Blade view, on purpose
 *
 * `Content(htmlString:)` rather than a template. The body is one line saying
 * what the attachment is; the report IS the attachment. A Blade file here would
 * be a second place the report's name and window are written, and the two would
 * disagree the first time one of them was edited.
 *
 * Everything interpolated goes through `e()`. A restaurant's own name reaches
 * this line, and a venue called `Osh & Co <Chilonzor>` would otherwise arrive
 * as broken markup in every inbox it was sent to.
 */
final class ScheduledReportMail extends Mailable
{
    public function __construct(
        private readonly string $line,
        private readonly string $filename,
        private readonly string $csv,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->line);
    }

    public function content(): Content
    {
        return new Content(htmlString: '<p>'.e($this->line).'</p>');
    }

    /**
     * @return list<Attachment>
     */
    public function attachments(): array
    {
        return [
            Attachment::fromData(fn (): string => $this->csv, $this->filename)
                ->withMime('text/csv'),
        ];
    }
}
