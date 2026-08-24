<?php

declare(strict_types=1);

namespace App\Support\Errors;

use Symfony\Component\HttpFoundation\Response;

/**
 * Every error this API can return, in one place.
 *
 * A catalogue rather than strings at the throw site, for three reasons. The
 * code becomes stable — a client can branch on `stop_list.item_unavailable`
 * for years while the wording changes underneath it. The three translations
 * stay together, so a new language is one column and not a search across
 * forty controllers. And the HTTP status stops being a judgement call made
 * per throw: `order.invalid_transition` is 409 everywhere, because it is the
 * same event everywhere.
 *
 * Modules register their own codes from their service provider. The core set
 * below is the part that belongs to no module: tenancy, auth, and the
 * conventions in API.md §1.
 *
 * Naming is `domain.what_happened`, lower_snake, and the domain matches the
 * module. Never a bare word — `not_found` tells a client nothing about which
 * of five lookups failed.
 */
final class ErrorCatalogue
{
    /** @var array<string, ApiError> */
    private static array $codes = [];

    private static bool $booted = false;

    public static function register(ApiError ...$errors): void
    {
        foreach ($errors as $error) {
            self::$codes[$error->code] = $error;
        }
    }

    public static function has(string $code): bool
    {
        self::boot();

        return isset(self::$codes[$code]);
    }

    /**
     * The definition for a code.
     *
     * An unknown code is a programming error, not a runtime one — it means a
     * throw site named something the catalogue never heard of. Rather than
     * fail the request a second time, answer with a generic 500 carrying the
     * unknown code, so the client still gets the envelope and the code still
     * reaches the logs.
     */
    public static function get(string $code): ApiError
    {
        self::boot();

        return self::$codes[$code] ?? new ApiError(
            code: $code,
            status: Response::HTTP_INTERNAL_SERVER_ERROR,
            uz: 'Kutilmagan xatolik. Iltimos, qaytadan urinib ko\'ring.',
            ru: 'Непредвиденная ошибка. Попробуйте ещё раз.',
            en: 'Something went wrong. Please try again.',
            retryable: true,
        );
    }

    /** @return array<string, ApiError> */
    public static function all(): array
    {
        self::boot();

        return self::$codes;
    }

    /** Test seam: forget module registrations between cases. */
    public static function reset(): void
    {
        self::$codes = [];
        self::$booted = false;
    }

    private static function boot(): void
    {
        if (self::$booted) {
            return;
        }

        self::$booted = true;
        self::register(...self::core());
    }

    /**
     * The codes that belong to no module.
     *
     * @return list<ApiError>
     */
    private static function core(): array
    {
        return [
            // ---- Request conventions (API.md §1) ----
            new ApiError(
                'request.validation_failed',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Yuborilgan ma\'lumot to\'g\'ri emas. Belgilangan maydonni tekshiring.',
                'Отправленные данные неверны. Проверьте отмеченное поле.',
                'The submitted data is not valid. Check the highlighted field.',
            ),
            new ApiError(
                'request.idempotency_key_missing',
                Response::HTTP_BAD_REQUEST,
                'Bu amal bir martalik kalitsiz qabul qilinmaydi.',
                'Эта операция не принимается без ключа идемпотентности.',
                'This operation needs an idempotency key.',
            ),
            new ApiError(
                'request.idempotency_key_reused',
                Response::HTTP_CONFLICT,
                'Bu kalit boshqa so\'rov uchun ishlatilgan. Yangi kalit bering.',
                'Этот ключ уже использован для другого запроса. Дайте новый ключ.',
                'This key was already used for a different request. Send a new one.',
            ),
            new ApiError(
                'request.rate_limited',
                Response::HTTP_TOO_MANY_REQUESTS,
                'Juda ko\'p urinish. Biroz kutib, qaytadan urinib ko\'ring.',
                'Слишком много попыток. Подождите немного и повторите.',
                'Too many attempts. Wait a moment and try again.',
                retryable: true,
            ),
            new ApiError(
                'request.not_found',
                Response::HTTP_NOT_FOUND,
                'So\'ralgan yozuv topilmadi.',
                'Запрошенная запись не найдена.',
                'The requested record was not found.',
            ),
            /*
             * The one place an absent branch is an error rather than a sum.
             *
             * Everywhere else in this API a missing `X-Branch` means "all of them"
             * — that is how an owner and an accountant read the business, and
             * `BranchIsolationTest` holds the line on it. A few acts have no such
             * reading: 86-ing a dish, opening a till, counting a drawer. They
             * happen at an address, and there is no honest answer to "which
             * kitchen" for a request that named none.
             */
            new ApiError(
                'request.branch_required',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu amal uchun filial ko\'rsatilishi shart.',
                'Для этой операции нужно указать филиал.',
                'This operation needs a branch.',
            ),
            new ApiError(
                'request.method_not_allowed',
                Response::HTTP_METHOD_NOT_ALLOWED,
                'Bu manzil bu turdagi so\'rovni qabul qilmaydi.',
                'Этот адрес не принимает такой запрос.',
                'This endpoint does not accept that method.',
            ),
            new ApiError(
                'server.unexpected',
                Response::HTTP_INTERNAL_SERVER_ERROR,
                'Kutilmagan xatolik. Iltimos, qaytadan urinib ko\'ring.',
                'Непредвиденная ошибка. Попробуйте ещё раз.',
                'Something went wrong. Please try again.',
                retryable: true,
            ),
            new ApiError(
                'server.unavailable',
                Response::HTTP_SERVICE_UNAVAILABLE,
                'Xizmat vaqtincha ishlamayapti. Ishlashda davom eting — amal navbatga yozildi.',
                'Сервис временно недоступен. Продолжайте работать — операция в очереди.',
                'The service is temporarily unavailable. Keep working — the action is queued.',
                retryable: true,
            ),

            // ---- Authentication and authorisation ----
            new ApiError(
                'auth.unauthenticated',
                Response::HTTP_UNAUTHORIZED,
                'Tizimga kiring.',
                'Войдите в систему.',
                'Please sign in.',
            ),
            new ApiError(
                'auth.forbidden',
                Response::HTTP_FORBIDDEN,
                'Sizda bu amal uchun ruxsat yo\'q. Menejerga murojaat qiling.',
                'У вас нет прав на это действие. Обратитесь к менеджеру.',
                'You do not have permission for this. Ask a manager.',
            ),
            new ApiError(
                'auth.invalid_credentials',
                Response::HTTP_UNAUTHORIZED,
                'Kirish ma\'lumotlari noto\'g\'ri.',
                'Неверные данные для входа.',
                'Those sign-in details are not correct.',
            ),
            new ApiError(
                'auth.pin_invalid',
                Response::HTTP_UNAUTHORIZED,
                'PIN mos kelmadi.',
                'PIN не совпал.',
                'That PIN did not match.',
            ),
            new ApiError(
                'auth.pin_locked',
                Response::HTTP_LOCKED,
                'Hisob qulflandi. PIN ni menejer tiklaydi.',
                'Учётная запись заблокирована. PIN сбрасывает менеджер.',
                'This account is locked. A manager must reset the PIN.',
            ),

            // ---- Tenancy ----
            new ApiError(
                'tenant.required',
                Response::HTTP_BAD_REQUEST,
                'Restoran aniqlanmadi.',
                'Ресторан не определён.',
                'No restaurant could be resolved for this request.',
            ),
            new ApiError(
                'tenant.mismatch',
                Response::HTTP_FORBIDDEN,
                'Siz boshqa restoran ma\'lumotiga kira olmaysiz.',
                'Вы не можете обращаться к данным другого ресторана.',
                'You cannot reach another restaurant\'s data.',
            ),
            new ApiError(
                'tenant.inactive',
                Response::HTTP_FORBIDDEN,
                'Restoran faol emas.',
                'Ресторан неактивен.',
                'This restaurant is not active.',
            ),
            new ApiError(
                'branch.not_found',
                Response::HTTP_NOT_FOUND,
                'Filial topilmadi.',
                'Филиал не найден.',
                'That branch was not found.',
            ),
            new ApiError(
                'branch.mismatch',
                Response::HTTP_FORBIDDEN,
                'Siz boshqa filial ma\'lumotiga kira olmaysiz.',
                'Вы не можете обращаться к данным другого филиала.',
                'You cannot reach another branch\'s data.',
            ),
            new ApiError(
                'module.disabled',
                Response::HTTP_FORBIDDEN,
                'Bu modul restoran uchun yoqilmagan.',
                'Этот модуль не подключён для ресторана.',
                'This module is not enabled for the restaurant.',
            ),

            // ---- Plan limits (API.md §17 — 402, never a silent block) ----
            new ApiError(
                'plan.limit_exceeded',
                Response::HTTP_PAYMENT_REQUIRED,
                'Tarif chegarasiga yetdingiz. Tarifni ko\'tarish kerak.',
                'Достигнут предел тарифа. Нужно повысить тариф.',
                'You have reached the plan limit. Upgrade to continue.',
            ),

            /*
             * ---- Data export ----
             *
             * A GDPR-shaped archive is a pipeline, not an endpoint: it is
             * queued, it takes minutes, it lands as a file, and the link to it
             * dies after a day. Each of those stages has its own refusal, and
             * they are deliberately not folded into one — "no" tells an
             * operator nothing, while "still being prepared" and "that link has
             * expired" are two different next actions.
             */
            new ApiError(
                'export.already_running',
                Response::HTTP_CONFLICT,
                'Arxiv allaqachon tayyorlanmoqda. Tugashini kuting.',
                'Архив уже готовится. Дождитесь завершения.',
                'An archive is already being prepared. Wait for it to finish.',
            ),
            new ApiError(
                'export.not_ready',
                Response::HTTP_CONFLICT,
                'Arxiv hali tayyor emas.',
                'Архив ещё не готов.',
                'The archive is not ready yet.',
                retryable: true,
            ),
            new ApiError(
                'export.failed',
                Response::HTTP_CONFLICT,
                'Arxiv tayyorlanmadi. Qaytadan so\'rang.',
                'Архив не собрался. Запросите заново.',
                'The archive could not be built. Ask for a new one.',
            ),
            /*
             * 404 rather than 410, and on purpose. A caller holding a stale
             * link and a caller holding a link to something that never existed
             * must not be told apart: the id is a small integer, and a 410
             * would confirm that export #7 was real.
             */
            new ApiError(
                'export.expired',
                Response::HTTP_NOT_FOUND,
                'Havolaning muddati tugagan. Yangi arxiv so\'rang.',
                'Срок действия ссылки истёк. Запросите новый архив.',
                'That link has expired. Ask for a new archive.',
            ),
            new ApiError(
                'export.link_invalid',
                Response::HTTP_FORBIDDEN,
                'Havola haqiqiy emas.',
                'Ссылка недействительна.',
                'That link is not valid.',
            ),
        ];
    }
}
