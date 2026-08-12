# PHP & Composer Reinstall Guide (Windows)

## Muammo

Hozirgi mahalliy o'rnatishlar buzilgan:

- `C:\php\php.exe` → **Segmentation fault**
- `C:\Users\User\.local\bin\uv.exe` → **Access Violation** (0xC0000005)
- `composer.bat` → PHP'ga bog'liq, shuning uchun ham ishlamayapti

Sabab odatda: **Visual C++ Redistributable yo'q** yoki PHP binary buzilgan.

## Yechim 1: Laragon (TAVSIYA — eng oson)

[Laragon](https://laragon.org/download/) — Windows uchun "all-in-one" PHP/MySQL/Nginx/Apache stack.

```
1. https://laragon.org/download/ → Laragon Full yuklab oling
2. O'rnating (default C:\laragon)
3. Avtomatik: PHP 8.3 + Composer + nginx + MySQL + Node tayyor
4. PATH ga qo'shiladi
5. Sessiyani qayta ochib php --version tekshiring
```

## Yechim 2: PHP rasmiy + Composer

```powershell
# 1. Visual C++ Redistributable o'rnatish (ENG MUHIM)
winget install Microsoft.VCRedist.2015+.x64

# 2. PHP 8.3 yuklash
# https://windows.php.net/download/#php-8.3 → "Non Thread Safe" x64 zip
# C:\php83 ga ochib qo'ying

# 3. PATH ga qo'shish (System Environment Variables)
$env:PATH = "C:\php83;" + $env:PATH

# 4. php.ini sozlash
cp C:\php83\php.ini-production C:\php83\php.ini
# php.ini ni ochib quyidagi extension'larni faollashtiring:
# extension=pdo_pgsql
# extension=pgsql
# extension=mbstring
# extension=openssl
# extension=curl
# extension=fileinfo
# extension=intl
# extension=gd
# extension=zip

# 5. Composer o'rnatish
# https://getcomposer.org/Composer-Setup.exe → o'rnating (PHP path so'raydi)

# 6. Tekshirish
php --version
composer --version
```

## Yechim 3: Docker (server-style)

Agar Docker Desktop o'rnatilgan bo'lsa:

```powershell
# Composer install Docker konteynerda
docker run --rm -v "${PWD}:/app" composer:2 install
```

## uv (Python) qayta o'rnatish

```powershell
# 1. Eskini o'chirish
Remove-Item C:\Users\User\.local\bin\uv.exe -Force -ErrorAction SilentlyContinue

# 2. Yangi versiya o'rnatish
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# 3. Tekshirish
uv --version
```

Agar yana segfault bersa, **Visual C++ Redistributable** yo'qligida muammo. Yuqoridagi vCRedist o'rnating.

## PHP tuzilgach — Laravel o'rnatish

```powershell
Set-Location "C:\Users\User\Desktop\Smart Restaurant Campus Project\apps\api"
composer install
php artisan key:generate           # APP_KEY o'rnatadi
php artisan install:api            # Sanctum + routes/api.php
php artisan migrate                # database migrations
php artisan module:make Menu Orders Kitchen Tables Inventory Suppliers Staff Finance Crm Analytics
```

## Hozirgi obhod yechimi (workaround)

PHP tuzatilgan bo'lmasa, Laravel skeleton fayllar **commit qilingan** va tayyor.
Sizning kompyuteringizda PHP ishlay boshlasa darhol `composer install` ishlaydi.

Frontend (Next.js apps) va Python AI services Laravel'siz ham ishlaydi:

- Web/Admin uchun mock data ishlatish mumkin
- AI services mustaqil servis
