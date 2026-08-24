<?php

declare(strict_types=1);

namespace Modules\Menu\Providers;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\StopList;
use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Modules\Menu\Services\EloquentMenuCatalog;
use Modules\Menu\Services\EloquentStopList;
use Modules\Menu\Services\MenuSheetImporter;
use Symfony\Component\HttpFoundation\Response;

class MenuServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Menu';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'menu';

    /**
     * Provider classes to register.
     *
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    /**
     * Menu answers the platform's read contract for dishes.
     *
     * This is how Orders and the Telegram bots reach the menu without importing
     * anything from this module, and how the kitchen's wall screen takes a dish
     * off without importing one either. The core binds null implementations as
     * fallbacks, so nothing breaks when Menu is absent — it just reports that
     * there are no dishes and nothing is stopped.
     */
    public function register(): void
    {
        parent::register();

        $this->app->bind(MenuCatalog::class, EloquentMenuCatalog::class);

        // The 86 sheet. Written by the Kitchen module's wall screen and read by
        // the POS, neither of which may import a Menu model.
        $this->app->bind(StopList::class, EloquentStopList::class);

        ErrorCatalogue::register(...self::refusals());
    }

    /**
     * Every way this module refuses a spreadsheet.
     *
     * All five are whole-file refusals — a row this module cannot read is
     * reported per row inside a 200 and never as an error, because a sheet of
     * two hundred dishes with two bad prices is an import of 198, not a
     * failure. These five are the cases where there is nothing to import at
     * all, and each one names a different next action: convert the workbook,
     * check the file, split the file, answer the mapping dialog.
     *
     * Registered rather than left to the catalogue's fallback, which answers
     * 500 with "something went wrong". A manager who reads that after
     * uploading their accountant's file concludes the platform is broken and
     * files a ticket; "this is an .xlsx — save it as CSV" is the same
     * information and costs nobody an afternoon.
     *
     * @return array<int, ApiError>
     */
    private static function refusals(): array
    {
        return [
            /*
             * The commonest of the five by a distance: everybody's menu is an
             * .xlsx, because everybody's menu is in Excel.
             *
             * Reading one needs a spreadsheet parser this repository does not
             * carry, so the sentence has to do the work the dependency would
             * — it names the format and the exact menu item that fixes it.
             */
            new ApiError(
                'menu.import_not_csv',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu fayl Excel kitobi (.xlsx). Excel’da «Save as → CSV UTF-8» qilib, qaytadan yuklang.',
                'Это книга Excel (.xlsx). Сохраните её как «CSV UTF-8» и загрузите снова.',
                'That is an Excel workbook (.xlsx). Save it as CSV UTF-8 and upload it again.',
            ),
            new ApiError(
                'menu.import_empty',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Faylda ustun sarlavhalari yoki qatorlar yo\'q.',
                'В файле нет заголовков колонок или строк.',
                'The file has no column headers or no rows.',
            ),
            new ApiError(
                'menu.import_unreadable',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Faylni o\'qib bo\'lmadi. Uni CSV sifatida qaytadan saqlang.',
                'Файл не удалось прочитать. Сохраните его как CSV заново.',
                'The file could not be read. Save it as CSV again.',
            ),
            /*
             * The one refusal that is a question rather than a no. It carries
             * `columns` and `mapping` in its meta, which is precisely what the
             * console's column-mapping dialog is drawn from — so a sheet whose
             * headers nobody recognised is one dialog away from importing.
             */
            new ApiError(
                'menu.import_columns_unmapped',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Majburiy ustunlar topilmadi: nomi va narxi. Ustunlarni qo\'lda moslashtiring.',
                'Не найдены обязательные колонки: название и цена. Сопоставьте колонки вручную.',
                'The required columns — name and price — were not found. Map the columns by hand.',
            ),
            new ApiError(
                'menu.import_too_many_rows',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Jadvalda '.MenuSheetImporter::MAX_ROWS.' qatordan ko\'p — bu bitta menyu emas. Faylni bo\'lib yuboring.',
                'В таблице больше '.MenuSheetImporter::MAX_ROWS.' строк — это не одно меню. Разделите файл.',
                'The sheet has more than '.MenuSheetImporter::MAX_ROWS.' rows — that is not one menu. Split the file.',
            ),

            /*
             * The photograph — three ways an upload that passed validation can
             * still not become a menu picture. Validation checks the MIME type
             * and the byte count; these come from actually decoding the file,
             * which is the only way to learn that it is truncated, or forty
             * megapixels, or a PNG with a JPEG's extension. 422, every one:
             * the person chose a file and can choose another.
             */
            new ApiError(
                'menu.image_unreadable',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Rasmni o\'qib bo\'lmadi — fayl buzilgan yoki rasm emas.',
                'Не удалось прочитать изображение — файл повреждён или это не картинка.',
                'The image could not be read — the file is damaged or is not a picture.',
            ),
            new ApiError(
                'menu.image_unsupported_format',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Faqat JPG, PNG yoki WebP qabul qilinadi.',
                'Принимаются только JPG, PNG или WebP.',
                'Only JPG, PNG or WebP is accepted.',
            ),
            new ApiError(
                'menu.image_too_many_pixels',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Rasm juda katta. Telefonda kesib yoki kichraytirib yuboring.',
                'Изображение слишком большое. Обрежьте или уменьшите его на телефоне.',
                'The image is too large. Crop or shrink it on the phone first.',
            ),
            new ApiError(
                'menu.image_missing',
                Response::HTTP_NOT_FOUND,
                'Bu taomda rasm yo\'q.',
                'У этого блюда нет фотографии.',
                'This dish has no photograph.',
            ),
        ];
    }
}
