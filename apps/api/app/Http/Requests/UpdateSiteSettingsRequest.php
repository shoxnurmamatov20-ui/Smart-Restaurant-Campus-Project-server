<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Contracts\Validation\Validator;

/**
 * The public website's own settings — the `site` group of the same document.
 *
 * Everything the parent does, plus the one rule a rule list cannot express:
 * a subdomain is unique across the whole platform, and the platform is the
 * only place that can know it. Two restaurants both answering on
 * `choyxona.mypos.uz` is not a validation nicety — it is one of them serving
 * the other's menu.
 */
final class UpdateSiteSettingsRequest extends UpdateSettingsRequest
{
    protected string $group = 'site';

    public function withValidator(Validator $validator): void
    {
        parent::withValidator($validator);

        $validator->after(function (Validator $validator): void {
            $subdomain = $this->input('subdomain');

            if (! is_string($subdomain) || $subdomain === '') {
                return;
            }

            if ($this->subdomainIsTaken($subdomain)) {
                $validator->errors()->add('subdomain', __('Bu manzil band.'));
            }
        });

        $validator->after(function (Validator $validator): void {
            /*
             * Two sections the design draws as permanent rather than as a
             * switch. A restaurant's website without its menu is not a smaller
             * website, it is a page that answers the one question every visitor
             * came with by saying nothing.
             */
            foreach (['home', 'menu'] as $locked) {
                if ($this->input("sections.{$locked}") === false) {
                    $validator->errors()->add(
                        "sections.{$locked}",
                        __("Bu bo'limni o'chirib bo'lmaydi."),
                    );
                }
            }
        });
    }

    private function subdomainIsTaken(string $subdomain): bool
    {
        $mine = app(TenantContext::class)->tenant()?->id;

        /*
         * Raw rather than Eloquent, and deliberately outside tenancy: the whole
         * question is whether SOMEBODY ELSE holds this name, and a scoped query
         * can only ever answer "not you", which is the answer that lets the
         * collision through. Reading one boolean about a name that will be
         * published on the open internet leaks nothing.
         */
        return Tenant::query()
            ->when($mine !== null, fn ($query) => $query->whereKeyNot($mine))
            ->whereRaw("settings #>> '{site,subdomain}' = ?", [$subdomain])
            ->withoutGlobalScopes()
            ->exists() || $this->reservedByPlatform($subdomain);
    }

    /**
     * Names the platform itself answers on.
     *
     * A restaurant that claimed `api` or `www` would take the platform's own
     * host out of service for everybody, which is a bigger outage than any
     * single tenant can be allowed to cause by typing in a text field.
     */
    private function reservedByPlatform(string $subdomain): bool
    {
        /** @var list<string> $central */
        $central = config('tenancy.central_domains', []);
        $reserved = ['www', 'api', 'admin', 'app', 'platform', 'static', 'cdn', 'mail'];

        foreach ($central as $domain) {
            $reserved[] = explode('.', $domain)[0];
        }

        return in_array($subdomain, $reserved, true);
    }
}
