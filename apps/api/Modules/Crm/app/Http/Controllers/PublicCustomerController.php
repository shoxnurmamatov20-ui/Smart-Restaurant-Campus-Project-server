<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Modules\Crm\Http\Middleware\RequireCustomerToken;
use Modules\Crm\Http\Requests\UpdateProfileRequest;
use Modules\Crm\Http\Resources\CustomerProfileResource;

/**
 * A guest reading and editing their own account — `GET`/`PATCH` public/me.
 *
 * There is no id in the path and there never will be. The subject of every
 * request here is the token that made it, which is the only shape that cannot
 * become an enumeration: `/public/customers/{id}` would be one guessable
 * integer away from reading somebody else's phone number and loyalty balance,
 * and an ownership check in the controller is a line somebody eventually
 * forgets to write on the fourth endpoint.
 */
final class PublicCustomerController extends Controller
{
    /** GET /api/v1/public/me */
    public function show(Request $request): CustomerProfileResource
    {
        $guest = RequireCustomerToken::of($request);

        return new CustomerProfileResource($guest->load('addresses'));
    }

    /** PATCH /api/v1/public/me — a name and a language, and nothing else. */
    public function update(UpdateProfileRequest $request): CustomerProfileResource
    {
        $guest = RequireCustomerToken::of($request);

        /*
         * `update()` with the validated array, which is exactly the two
         * columns the request allows. Not `$request->all()`, and not a manual
         * copy either — `fill` from an unvalidated array is how `points` ends
         * up mass-assignable the day somebody adds it to the model's fillable
         * list for an unrelated reason.
         */
        $guest->update($request->validated());

        return new CustomerProfileResource($guest->refresh()->load('addresses'));
    }

    /**
     * DELETE /api/v1/public/me/session — sign out on this device.
     *
     * Only the token that made the request dies. A guest signing out on a
     * phone they are handing to somebody must not be signed out on the tablet
     * at home, and a "sign out everywhere" that is the only option is one
     * people learn not to press.
     */
    public function signOut(Request $request): JsonResponse
    {
        $guest = RequireCustomerToken::of($request);
        $bearer = (string) $request->bearerToken();

        $token = PersonalAccessToken::findToken($bearer);

        if ($token !== null && (int) $token->tokenable_id === (int) $guest->getKey()) {
            $token->delete();
        }

        return response()->json(['data' => ['signed_out' => true]]);
    }
}
