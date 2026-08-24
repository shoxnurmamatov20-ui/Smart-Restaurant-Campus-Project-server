<?php

declare(strict_types=1);

namespace Modules\Tables\Providers;

use App\Contracts\Tables\FloorBoard;
use App\Contracts\Tables\FloorPlan;
use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorCatalogue;
use App\Support\Modules\ApiModuleServiceProvider;
use Modules\Tables\Services\EloquentFloorBoard;
use Modules\Tables\Services\EloquentFloorPlan;
use Symfony\Component\HttpFoundation\Response;

class TablesServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Tables';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'tables';

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
     * The floor's cross-module read and its two writes. `bind` overrides the
     * Unavailable fallbacks in AppServiceProvider the moment this module is
     * installed — same shape as Menu's catalogue.
     */
    public function register(): void
    {
        parent::register();

        $this->app->bind(FloorBoard::class, EloquentFloorBoard::class);

        /*
         * Claiming a table and closing a raised hand, for the staff app's
         * offline queue. Separate from FloorBoard on purpose: that one is a
         * tally anybody may read, and this one changes the room.
         */
        $this->app->bind(FloorPlan::class, EloquentFloorPlan::class);

        /*
         * The public booking form's one refusal.
         *
         * Registered as a code rather than thrown as a sentence, like every
         * other refusal in this platform: the restaurant's website holds all
         * three languages and renders the message in the reader's own, and a
         * hand-written Uzbek string would reach a Russian guest in Uzbek.
         */
        ErrorCatalogue::register(
            new ApiError(
                'tables.no_open_bill',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu stolda ochiq hisob yo\'q.',
                'На этом столе нет открытого счёта.',
                'There is no open bill on this table.',
            ),
            new ApiError(
                'tables.reservation_invalid',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bron ma\'lumotlari to\'g\'ri emas.',
                'Данные брони заполнены неверно.',
                'That booking could not be read.',
            ),

            /*
             * The four a stranger booking from the website can hit.
             *
             * Worded for a phone with nobody standing beside it: what happened,
             * and the one thing that helps. Nobody can translate for the reader
             * and nobody can explain what to do next.
             */
            new ApiError(
                'tables.branch_required',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Qaysi filial ekanini tanlang.',
                'Выберите филиал.',
                'Choose which venue.',
            ),
            /*
             * 422 rather than 409: the time IS the wrong field, and the app can
             * fix it without asking anybody — the chooser redraws from
             * `GET /public/booking-slots` and offers what is left.
             */
            new ApiError(
                'tables.slot_unavailable',
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'Bu vaqtda bron qabul qilinmaydi — boshqa vaqtni tanlang.',
                'На это время бронь недоступна — выберите другое.',
                'That time is not available — choose another.',
            ),
            new ApiError(
                'tables.reservation_not_found',
                Response::HTTP_NOT_FOUND,
                'Bunday bron topilmadi — kodni tekshiring.',
                'Такая бронь не найдена — проверьте код.',
                'No booking with that code.',
            ),
            /*
             * 409: the request is well formed and the screen offered the button.
             * What changed is the booking — somebody seated the party, or it was
             * already called off.
             */
            new ApiError(
                'tables.reservation_closed',
                Response::HTTP_CONFLICT,
                'Bu bron allaqachon yopilgan.',
                'Эта бронь уже закрыта.',
                'That booking is already closed.',
            ),
            new ApiError(
                'tables.call_closed',
                Response::HTTP_CONFLICT,
                'Bu chaqiruv allaqachon yopilgan.',
                'Этот вызов уже закрыт.',
                'That call has already been answered.',
            ),
        );
    }
}
