<?php

declare(strict_types=1);

namespace Modules\Board\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Modules\Board\Http\Controllers\Concerns\StandsAtOneVenue;
use Modules\Board\Http\Requests\StoreBoardBannerRequest;
use Modules\Board\Http\Requests\UpdateBoardBannerRequest;
use Modules\Board\Http\Resources\BoardBannerResource;
use Modules\Board\Models\BoardBanner;

/**
 * The promo strip along the bottom — `/board/banners`.
 *
 * The third tab. No reorder endpoint, and that is not an oversight: only one
 * banner shows at a time and several live ones alternate, so there is no
 * position for a person to drag. Ordering them would be inventing a control the
 * wall has no way of obeying.
 *
 * Live and running are different questions and the resource answers both. A
 * banner left switched on after its dates ran out still says "live" in this
 * list — finding that is exactly what the preview above it is for.
 */
final class BoardBannerController extends Controller
{
    use StandsAtOneVenue;

    public function index(): ResourceCollection
    {
        return BoardBannerResource::collection(
            // Live first, then by id. A manager opening this tab is looking for
            // what is on the wall, and what is on the wall should not be below
            // three drafts written after it.
            BoardBanner::query()->orderByDesc('is_live')->orderBy('id')->get(),
        );
    }

    public function store(StoreBoardBannerRequest $request): JsonResponse
    {
        $refusal = $this->refuseWithoutABranch();

        if ($refusal !== null) {
            return $refusal;
        }

        $banner = BoardBanner::create($request->validated());

        return (new BoardBannerResource($banner))->response()->setStatusCode(201);
    }

    public function update(UpdateBoardBannerRequest $request, BoardBanner $banner): BoardBannerResource
    {
        $banner->update($request->validated());

        return new BoardBannerResource($banner);
    }

    public function destroy(BoardBanner $banner): JsonResponse
    {
        $banner->delete();

        return response()->json(null, 204);
    }
}
