<?php

declare(strict_types=1);

namespace Modules\Menu\Tests\Feature;

use App\Contracts\Menu\Dish;
use App\Contracts\Menu\MenuCatalog;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Media\MediaStore;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Services\DishImageStore;
use Tests\TestCase;

/**
 * A dish photograph — `POST` and `DELETE /v1/menu/items/{item}/image`.
 *
 * The one endpoint on this platform an owner uses from a phone, and therefore
 * the one that has to survive a twelve-megapixel camera original, a flaky
 * connection and somebody uploading a PDF they renamed.
 *
 * What the pipeline does to pixels is covered by `ImagePipelineTest`; this is
 * about what the endpoint does with the result — the row, the bucket, the
 * permissions, and what every reader of the menu sees afterwards.
 */
final class MenuItemImageTest extends TestCase
{
    use RefreshDatabase;

    private const DISK = 'public';

    private const CDN = 'https://cdn.example.test/storage';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        // Never a bucket over the network from a test — see phpunit.xml. The
        // `url` is what a CDN in front of the bucket would answer, so the
        // addresses in the responses can be checked for being built from it.
        Storage::fake(self::DISK, ['url' => self::CDN]);
        config()->set('menu.images.disk', self::DISK);
    }

    /** The key of one rendition, as MediaStore lays it out. */
    private function keyOf(MenuItem $dish, string $hash, string $rendition): string
    {
        return MediaStore::forDisk(self::DISK)->key(DishImageStore::KIND, (int) $dish->tenant_id, $dish->id, $hash, $rendition);
    }

    private function isWebp(string $bytes): bool
    {
        return str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP';
    }

    private function restaurant(string $slug = 'osh-markazi'): Tenant
    {
        return Tenant::query()->create([
            'name' => 'Osh Markazi',
            'slug' => $slug,
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);
    }

    private function dishOf(Tenant $tenant): MenuItem
    {
        $category = MenuCategory::factory()->create(['tenant_id' => $tenant->id]);

        return MenuItem::factory()->create([
            'tenant_id' => $tenant->id,
            'menu_category_id' => $category->id,
        ]);
    }

    /**
     * A real JPEG of a given size, not `UploadedFile::fake()->image()`.
     *
     * The fake helper writes a valid image, but the point of several of these
     * cases is what GD does with the pixels — so the bytes have to be pixels.
     */
    private function photograph(int $width, int $height): UploadedFile
    {
        $image = imagecreatetruecolor($width, $height);
        $path = tempnam(sys_get_temp_dir(), 'dish').'.jpg';
        imagejpeg($image, $path);
        imagedestroy($image);

        return new UploadedFile($path, 'dish.jpg', 'image/jpeg', null, true);
    }

    /** Multipart goes through `call()`, which does not mint a key — see TestCase. */
    private function upload(MenuItem $item, UploadedFile $file): TestResponse
    {
        return $this->withHeaders([
            'Accept' => 'application/json',
            'Idempotency-Key' => (string) Str::uuid(),
        ])->post("/api/v1/menu/items/{$item->id}/image", ['image' => $file]);
    }

    private function remove(MenuItem $item): TestResponse
    {
        return $this->withHeaders([
            'Accept' => 'application/json',
            'Idempotency-Key' => (string) Str::uuid(),
        ])->delete("/api/v1/menu/items/{$item->id}/image");
    }

    private function actingAsOwnerOf(Tenant $tenant): User
    {
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    public function test_an_owner_can_put_a_photograph_on_a_dish(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        $response = $this->upload($dish, $this->photograph(800, 600))->assertOk();

        $image = $response->json('data.image');
        $this->assertIsArray($image);

        // Every size, with an address built from the disk's own URL — a CDN in
        // front of the bucket is a config change, not a row rewrite.
        $this->assertSame(['thumb', 'card', 'full'], array_keys($image['sizes']));
        $this->assertStringStartsWith(self::CDN.'/dish/', $image['sizes']['thumb']['url']);
        $this->assertStringEndsWith('-thumb.webp', $image['sizes']['thumb']['url']);
        $this->assertSame([160, 120], [$image['sizes']['thumb']['width'], $image['sizes']['thumb']['height']]);
        $this->assertSame([640, 480], [$image['sizes']['card']['width'], $image['sizes']['card']['height']]);
        $this->assertSame([800, 600], [$image['sizes']['full']['width'], $image['sizes']['full']['height']], 'never upscaled');
        $this->assertSame([800, 600], [$image['width'], $image['height']]);
        $this->assertStringStartsWith('data:image/webp;base64,', (string) $image['placeholder']);

        // The one-address reader gets the largest.
        $this->assertSame($image['sizes']['full']['url'], $image['src']);
        $this->assertSame($image['src'], $response->json('data.image_url'));

        // In the bucket, sharded and content-named, and WebP whatever arrived.
        $dish->refresh();
        $hash = (string) $dish->image['hash'];
        $this->assertSame(12, strlen($hash));

        foreach (['thumb', 'card', 'full'] as $rendition) {
            $key = $this->keyOf($dish, $hash, $rendition);
            Storage::disk(self::DISK)->assertExists($key);
            $this->assertTrue($this->isWebp((string) Storage::disk(self::DISK)->get($key)), "{$rendition} is WebP");
            $this->assertSame('public', Storage::disk(self::DISK)->getVisibility($key));
        }

        // The row carries facts, never addresses.
        $this->assertStringNotContainsString('http', json_encode($dish->image, JSON_THROW_ON_ERROR));
        $this->assertSame($image['src'], $dish->image_url, 'the column is kept in step for readers of the raw row');
    }

    public function test_a_camera_original_is_scaled_to_the_sizes_a_menu_is_drawn_at(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        $response = $this->upload($dish, $this->photograph(4000, 3000))->assertOk();

        $sizes = $response->json('data.image.sizes');
        $this->assertSame(1600, $sizes['full']['width']);
        $this->assertSame(1200, $sizes['full']['height']);
        $this->assertSame(160, $sizes['thumb']['width']);

        $dish->refresh();
        $stored = getimagesizefromstring((string) Storage::disk(self::DISK)->get($this->keyOf($dish, (string) $dish->image['hash'], 'full')));
        $this->assertIsArray($stored);
        $this->assertSame([1600, 1200], [$stored[0], $stored[1]]);

        // What the bucket pays for the whole set, recorded on the row: a
        // 4000×3000 camera original is several megabytes; its three sizes
        // together are well under a quarter of one.
        $this->assertLessThan(250 * 1024, $dish->image['bytes']);
    }

    public function test_a_second_upload_leaves_no_orphan_behind(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        $this->upload($dish, $this->photograph(600, 400))->assertOk();
        $firstHash = (string) $dish->refresh()->image['hash'];

        $png = imagecreatetruecolor(600, 400);
        imagefill($png, 0, 0, (int) imagecolorallocate($png, 10, 200, 90));
        $path = tempnam(sys_get_temp_dir(), 'dish').'.png';
        imagepng($png, $path);
        imagedestroy($png);

        $this->upload($dish, new UploadedFile($path, 'dish.png', 'image/png', null, true))->assertOk();
        $secondHash = (string) $dish->refresh()->image['hash'];

        $this->assertNotSame($firstHash, $secondHash, 'a different photograph is a different key');

        foreach (['thumb', 'card', 'full'] as $rendition) {
            Storage::disk(self::DISK)->assertExists($this->keyOf($dish, $secondHash, $rendition));
            // The set it replaced. Nothing points at it and nothing lists it,
            // so without this it would live in the bucket for ever.
            Storage::disk(self::DISK)->assertMissing($this->keyOf($dish, $firstHash, $rendition));
        }
    }

    public function test_the_same_photograph_uploaded_twice_keeps_its_files(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        $file = $this->photograph(600, 400);
        $this->upload($dish, $file)->assertOk();
        $hash = (string) $dish->refresh()->image['hash'];

        // A retry after a lost response, or a manager pressing the button
        // twice: same bytes, same keys — and "delete the previous set" must not
        // delete the set just written.
        $this->upload($dish, new UploadedFile($file->getRealPath(), 'dish.jpg', 'image/jpeg', null, true))->assertOk();

        $this->assertSame($hash, (string) $dish->refresh()->image['hash']);
        Storage::disk(self::DISK)->assertExists($this->keyOf($dish, $hash, 'full'));
    }

    public function test_a_manager_can_take_the_photograph_off_again(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        $this->upload($dish, $this->photograph(600, 400))->assertOk();
        $hash = (string) $dish->refresh()->image['hash'];

        $this->remove($dish)->assertOk()->assertJsonPath('data.image', null)->assertJsonPath('data.image_url', null);

        $this->assertNull($dish->refresh()->image);
        $this->assertNull($dish->image_url);

        foreach (['thumb', 'card', 'full'] as $rendition) {
            Storage::disk(self::DISK)->assertMissing($this->keyOf($dish, $hash, $rendition));
        }

        // Nothing left to remove: a client retrying a lost response learns the
        // first attempt landed.
        $this->remove($dish)->assertStatus(404)->assertJsonPath('error.code', 'menu.image_missing');
    }

    public function test_the_files_go_when_the_dish_is_gone_for_good_and_not_before(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        $this->upload($dish, $this->photograph(600, 400))->assertOk();
        $hash = (string) $dish->refresh()->image['hash'];

        // Off the menu — a soft delete — keeps the photograph: the dish can
        // come back, and should not have to be photographed again.
        $dish->delete();
        Storage::disk(self::DISK)->assertExists($this->keyOf($dish, $hash, 'full'));

        $dish->forceDelete();
        Storage::disk(self::DISK)->assertMissing($this->keyOf($dish, $hash, 'full'));
        Storage::disk(self::DISK)->assertMissing($this->keyOf($dish, $hash, 'thumb'));
    }

    public function test_every_reader_of_the_menu_sees_the_sizes(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);
        $dish->update(['status' => 'active', 'is_available' => true]);

        $this->upload($dish, $this->photograph(800, 600))->assertOk();

        // The till, the Telegram bot and the offline bundle all read through
        // the Dish contract; what it carries is what they draw.
        $board = app(MenuCatalog::class)->board('dine_in');
        $seen = null;

        foreach ($board as $section) {
            foreach ($section->dishes as $candidate) {
                if ($candidate->id === $dish->id) {
                    $seen = $candidate;
                }
            }
        }

        $this->assertInstanceOf(Dish::class, $seen, 'the dish is on the board');
        $this->assertIsArray($seen->image);
        $this->assertSame(160, $seen->image['sizes']['thumb']['width']);
        $this->assertStringEndsWith('-full.webp', (string) $seen->imageUrl);
        $this->assertSame($seen->image, $seen->toArray()['image']);

        // The guest, through the public menu.
        $public = $this->withHeaders(['Accept' => 'application/json', 'X-Tenant' => $tenant->slug])
            ->getJson('/api/v1/public/menu')
            ->assertOk();

        /** @var array<int, array{items?: array<int, array<string, mixed>>}> $categories */
        $categories = $public->json('data');

        $found = null;

        foreach ($categories as $category) {
            foreach ($category['items'] ?? [] as $item) {
                if ($item['id'] === $dish->id) {
                    $found = $item;
                }
            }
        }

        $this->assertIsArray($found, 'the dish is on the public menu');
        $this->assertSame(640, $found['image']['sizes']['card']['width']);
        $this->assertStringStartsWith('data:image/webp;base64,', (string) $found['image']['placeholder']);
    }

    public function test_an_address_typed_in_by_hand_still_works_for_readers_that_want_one(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        $dish->update(['image_url' => 'https://photos.example.test/osh.jpg']);

        $this->withHeaders(['Accept' => 'application/json'])
            ->getJson("/api/v1/menu/items/{$dish->id}")
            ->assertOk()
            ->assertJsonPath('data.image_url', 'https://photos.example.test/osh.jpg')
            ->assertJsonPath('data.image', null);
    }

    public function test_a_file_that_is_not_an_image_is_refused(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        $this->upload($dish, UploadedFile::fake()->create('menu.pdf', 40, 'application/pdf'))
            ->assertStatus(422);

        $this->assertNull($dish->refresh()->image);
    }

    public function test_a_file_that_claims_to_be_a_photograph_and_is_not_is_refused_with_a_reason(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        // A real JPEG header — enough to pass the MIME check — on bytes GD
        // cannot decode. It used to reach the manager as a 500.
        $path = tempnam(sys_get_temp_dir(), 'dish').'.jpg';
        file_put_contents($path, "\xFF\xD8\xFF\xE0".str_repeat('x', 400));

        $this->upload($dish, new UploadedFile($path, 'dish.jpg', 'image/jpeg', null, true))
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'menu.image_unreadable');

        $this->assertNull($dish->refresh()->image);
    }

    public function test_a_file_over_the_ceiling_is_refused(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        // The ceiling is what a phone produces, not what a camera produces.
        $this->upload($dish, UploadedFile::fake()->image('huge.jpg')->size(13_000))
            ->assertStatus(422);
    }

    public function test_too_many_pixels_are_refused_before_the_file_is_decoded(): void
    {
        $tenant = $this->restaurant();
        $this->actingAsOwnerOf($tenant);
        $dish = $this->dishOf($tenant);

        config()->set('menu.images.max_megapixels', 0.5);

        $this->upload($dish, $this->photograph(1000, 1000))
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'menu.image_too_many_pixels');
    }

    public function test_a_waiter_cannot_change_what_a_dish_looks_like(): void
    {
        $tenant = $this->restaurant();
        $dish = $this->dishOf($tenant);

        $waiter = User::factory()->create(['tenant_id' => $tenant->id]);
        $waiter->assignRole('waiter');
        $this->actingAs($waiter);

        $this->upload($dish, $this->photograph(400, 400))->assertStatus(403);
        $this->remove($dish)->assertStatus(403);
    }

    public function test_an_owner_cannot_photograph_another_restaurants_dish(): void
    {
        $mine = $this->restaurant();
        $theirs = Tenant::query()->create([
            'name' => 'City Cafe',
            'slug' => 'city-cafe',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ]);

        $foreign = $this->dishOf($theirs);
        $this->actingAsOwnerOf($mine);

        // 404, not 403: the global tenant scope means the dish does not exist
        // as far as this restaurant is concerned, which is the right answer —
        // a 403 would confirm the id names something.
        $this->upload($foreign, $this->photograph(400, 400))->assertStatus(404);
        $this->remove($foreign)->assertStatus(404);
    }

    public function test_signing_in_is_required(): void
    {
        $tenant = $this->restaurant();
        $dish = $this->dishOf($tenant);

        $this->upload($dish, $this->photograph(400, 400))->assertStatus(401);
        $this->remove($dish)->assertStatus(401);
    }
}
