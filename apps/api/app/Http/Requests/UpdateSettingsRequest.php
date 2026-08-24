<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Support\Settings\SettingsSchema;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A patch against `tenants.settings`, checked against the declared schema.
 *
 * Rules come from config/settings.php rather than being written here, so the
 * contract has exactly one home. The `after` hook is the half a rule list
 * cannot do: it names every path the schema never declared and refuses the
 * request, instead of storing a typo forever.
 *
 * Not `final`: `UpdateSiteSettingsRequest` is the same request pointed at the
 * `site` group, and the only thing it adds is the uniqueness check a rule list
 * cannot express. Two copies of the undeclared-key logic is how one of them
 * stops refusing typos.
 */
class UpdateSettingsRequest extends FormRequest
{
    /** Which group of the schema this request writes. Overridden by the site request. */
    protected string $group = 'restaurant';

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return SettingsSchema::rules($this->group);
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            /** @var array<string, mixed> $payload */
            $payload = $this->all();

            foreach (SettingsSchema::undeclared($this->group, $payload) as $path) {
                $validator->errors()->add($path, __(
                    "':path' — bunday sozlama yo'q. Ruxsat etilgan kalitlar config/settings.php da.",
                    ['path' => $path],
                ));
            }
        });
    }
}
