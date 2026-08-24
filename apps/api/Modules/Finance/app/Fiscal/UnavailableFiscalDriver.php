<?php

declare(strict_types=1);

namespace Modules\Finance\Fiscal;

/**
 * No provider configured. The default, and a working state rather than an error.
 *
 * A restaurant sets its OFD up on the day it goes live, and until then it is
 * still cooking, still selling and still counting its drawer. So the absent case
 * has to be an implementation rather than a null check scattered through the
 * module — the same shape `UnavailableTillLedger` and `UnavailableTicketWriter`
 * already use for their contracts.
 *
 * It refuses with {@see FiscalUnavailable}, which is the truthful one: nothing
 * about the document is wrong, there is simply nothing to send it to. The
 * receipt stays pending and files itself the moment a provider is configured —
 * as long as that happens inside the window. Past it the row expires, which is
 * exactly the fact a restaurant trading without a fiscal module should be
 * confronted with.
 */
final class UnavailableFiscalDriver implements FiscalDriver
{
    public function name(): string
    {
        return 'none';
    }

    public function probe(): FiscalProbe
    {
        return new FiscalProbe(
            provider: $this->name(),
            reachable: false,
            moduleNo: null,
            message: 'Fiskal modul sozlanmagan — OFD provayderi va modul raqamini kiriting.',
        );
    }

    public function register(FiscalDocument $document): FiscalMarks
    {
        throw new FiscalUnavailable('Fiskal modul sozlanmagan.');
    }
}
