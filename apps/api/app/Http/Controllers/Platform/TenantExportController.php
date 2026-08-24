<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\TenantExport;
use App\Support\Errors\ApiException;
use App\Support\Exports\TenantArchive;
use App\Support\Tenancy\DatabaseTenancy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * "Give this restaurant everything we hold about them."
 *
 * The console's own TODO wrote the specification: an archive is "every table
 * this restaurant owns walked in the background, written to object storage and
 * handed back as a signed URL that expires", because "a synchronous endpoint
 * would time out on the first customer with a year of orders behind it, and a
 * link that does not expire is that customer's entire history left on a public
 * URL".
 *
 * So `store()` answers 202 and nothing else — the work is a job — and
 * `index()` is what the screen polls. `download()` is the third piece and the
 * odd one: it hangs off the public part of the route file rather than this
 * group, because a signed URL is meant to survive being mailed to somebody who
 * has no session here at all.
 */
final class TenantExportController extends Controller
{
    public function __construct(private readonly TenantArchive $archive) {}

    /** Queue the walk. 202: accepted, not finished. */
    public function store(Request $request, Tenant $tenant): JsonResponse
    {
        $export = $this->archive->queue($tenant, $request->user());

        return response()->json(
            ['data' => $this->archive->row($export)],
            Response::HTTP_ACCEPTED,
        );
    }

    /** What has been asked for and what is downloadable, newest first. */
    public function index(Tenant $tenant): JsonResponse
    {
        return response()->json(['data' => $this->archive->listFor($tenant)]);
    }

    /**
     * Hand over the zip.
     *
     * The signature is the whole authorisation. That is deliberate and is the
     * only design that works: the link is mailed, and the person who opens it
     * is on a laptop with no console session — asking them to sign in first
     * would mean asking a restaurant owner to hold a platform credential.
     *
     * Three separate refusals rather than one, because each is a different
     * next action for the person holding the link: a signature we did not
     * write is somebody editing the URL, an expired one means ask again, and a
     * `queued` row means wait. The signature is checked here rather than by the
     * `signed` middleware so that all three come back in this API's one error
     * envelope, in three languages, with a code a client can branch on —
     * Laravel's InvalidSignatureException renders as a bare 403.
     */
    public function download(Request $request, string $export): BinaryFileResponse
    {
        if (! URL::hasCorrectSignature($request)) {
            throw ApiException::of('export.link_invalid');
        }

        if (! URL::signatureHasNotExpired($request)) {
            throw ApiException::of('export.expired');
        }

        /*
         * Read with the policies open, because this request never claimed a
         * restaurant — it cannot: the URL carries an export id and a signature
         * and nothing else, and a `X-Tenant` header a stranger could set would
         * not be a credential anyway. Row-level security fails closed, so
         * without this the lookup returns nothing and every valid link 404s.
         *
         * Safe precisely because the signature already settled which row: the
         * id is inside what was signed, so a caller cannot ask for a different
         * one without invalidating the thing that let them in.
         */
        $row = app(DatabaseTenancy::class)->withoutTenancy(
            fn (): ?TenantExport => TenantExport::query()->withoutGlobalScopes()->find((int) $export),
        );

        if ($row === null) {
            throw ApiException::of('request.not_found');
        }

        if ($row->state === TenantExport::FAILED) {
            throw ApiException::of('export.failed');
        }

        if ($row->isRunning()) {
            throw ApiException::of('export.not_ready');
        }

        $path = $row->absolutePath();

        // The row says ready and the file is not there: the retention sweep has
        // been through, or the archive was built on another node. Same answer
        // as an expired link, because it is the same situation for the caller.
        if (! $row->isDownloadable() || $path === null || ! is_file($path)) {
            throw ApiException::of('export.expired');
        }

        return response()->download(
            $path,
            sprintf('srcp-export-%d-%s.zip', $row->tenant_id, $row->requested_at->format('Ymd-His')),
            ['Content-Type' => 'application/zip'],
        );
    }
}
