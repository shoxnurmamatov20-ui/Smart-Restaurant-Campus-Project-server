<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * One photograph for one dish.
 *
 * Three limits, and all three are about the same person: an owner standing in
 * their own restaurant with a phone.
 *
 *  - `image` **plus** an explicit MIME list. `image` alone accepts SVG on some
 *    builds, and an SVG is a document that can carry script — served from our
 *    own origin, to a guest's browser, from the one endpoint we invite people
 *    to upload to. The pipeline re-encodes everything to WebP anyway, which is
 *    a second wall: nothing that arrives is ever served as it arrived.
 *  - 12 MB. The first version said 2, which refused most camera originals and
 *    asked the owner to crop on their phone first. The platform shrinks every
 *    upload now, so the right ceiling is "what a phone produces", and the
 *    memory it costs is bounded separately, by pixels rather than bytes
 *    (`ImagePipeline::inspect()`).
 *  - `dimensions` is deliberately absent. A square crop, a wide banner and a
 *    tall portrait are all legitimate; the renditions keep the aspect ratio
 *    and the surfaces crop, so a minimum here would refuse pictures that work.
 */
final class UploadMenuItemImageRequest extends FormRequest
{
    /** Route middleware (`permission:menu.update`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, ValidationRule|string>>
     */
    public function rules(): array
    {
        $mimes = (array) config('menu.images.mimes', ['jpeg', 'jpg', 'png', 'webp']);

        return [
            'image' => [
                'required',
                'file',
                'image',
                'mimes:'.implode(',', $mimes),
                'max:'.(int) config('menu.images.max_kilobytes', 12288),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        $megabytes = (int) round((int) config('menu.images.max_kilobytes', 12288) / 1024);

        return [
            'image.required' => 'Rasm fayli yuborilmadi.',
            'image.image' => 'Fayl rasm emas.',
            'image.mimes' => 'Faqat JPG, PNG yoki WebP qabul qilinadi.',
            'image.max' => sprintf('Rasm %d MB dan katta bo\'lmasligi kerak.', $megabytes),
        ];
    }
}
