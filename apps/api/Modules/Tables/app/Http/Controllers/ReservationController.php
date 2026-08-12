<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Tables\Http\Requests\StoreReservationRequest;
use Modules\Tables\Http\Requests\UpdateReservationRequest;
use Modules\Tables\Http\Resources\ReservationResource;
use Modules\Tables\Models\Reservation;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for reservations.
 *
 * Mounted under /api/v1/tables/reservations and gated by Spatie permission
 * middleware on the route definition (Modules/Tables/routes/api.php).
 */
final class ReservationController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Reservation::class)
            ->allowedFilters([
                AllowedFilter::exact('status'),
                AllowedFilter::exact('source'),
                AllowedFilter::exact('table', 'restaurant_table_id'),
                AllowedFilter::partial('guest_name'),
                AllowedFilter::partial('guest_phone'),
                AllowedFilter::callback('upcoming', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->upcoming();
                    }
                }),
                AllowedFilter::callback('day', function ($query, $value): void {
                    $query->forDay((string) $value);
                }),
            ])
            ->allowedSorts(['starts_at', 'guest_name', 'created_at'])
            ->allowedIncludes(['restaurantTable'])
            ->defaultSort('starts_at')
            ->paginate($perPage)
            ->withQueryString();

        return ReservationResource::collection($records);
    }

    public function store(StoreReservationRequest $request): ReservationResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Reservation::create($request->validated())->refresh();

        return new ReservationResource($record->load('restaurantTable'));
    }

    public function show(Reservation $reservation): ReservationResource
    {
        return new ReservationResource($reservation->load('restaurantTable'));
    }

    public function update(UpdateReservationRequest $request, Reservation $reservation): ReservationResource
    {
        $reservation->update($request->validated());

        return new ReservationResource($reservation->refresh()->load('restaurantTable'));
    }

    public function destroy(Reservation $reservation): Response
    {
        $reservation->delete();

        return response()->noContent();
    }

    public function confirm(Reservation $reservation): ReservationResource
    {
        $reservation->confirm();

        return new ReservationResource($reservation->refresh());
    }

    public function seat(Reservation $reservation): ReservationResource
    {
        $reservation->seat();

        return new ReservationResource($reservation->refresh());
    }

    public function cancel(Reservation $reservation): ReservationResource
    {
        $reservation->cancel();

        return new ReservationResource($reservation->refresh());
    }
}
