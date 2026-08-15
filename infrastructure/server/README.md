# Server deployment — `pos26` (bare metal, systemd)

Bu papka **serverning butun konfiguratsiyasi**: nginx, php-fpm, systemd unitlari,
logrotate va deploy vositalari. Hammasi repo ichida, versiyalanadi va bitta
buyruq bilan `/etc` ga o'rnatiladi.

> `infrastructure/docker/` va `infrastructure/kubernetes/` — kelajakdagi
> konteynerli deploy uchun. `pos26` esa bare metal + systemd'da ishlaydi va
> aynan shu papka uni tasvirlaydi.

**Asosiy qoida:** `/etc` ichidagi faylni qo'lda tahrirlash bir marta ishlaydi —
keyingi deploy uni ustidan yozadi va tuzatgan narsangiz nima ekani hech qayerda
qolmaydi. O'zgartirish shu yerda qilinadi, keyin `srcp-apply`.

---

## Loyiha qayerda turadi

```
/srv/srcp/
├── releases/
│   ├── 20260814T143000Z/        ← o'zgarmas (immutable) release
│   └── 20260814T151200Z/
├── current -> releases/20260814T151200Z     ← nginx va systemd faqat shunga qaraydi
└── shared/                                   ← release'dan uzoq yashaydigan narsalar
    ├── env/{api,web,admin}.env               (0640 srcp:srcp — sirlar shu yerda)
    ├── storage/                              (Laravel storage: yuklamalar, loglar)
    ├── next-cache/{web,admin}                (deploy'dan keyin ham issiq qoladi)
    └── home/                                 (composer/pnpm keshi)
```

**Nega `/srv`, `/var/www` emas?** FHS bo'yicha `/srv` — "shu tizim xizmat
qiladigan ma'lumot", ya'ni aynan deploy qilingan ilova. `/var/www` esa Debian'da
_document root_ konventsiyasi — web-server diskdan o'zi o'qiydigan papka. Bu
yerda nginx faqat bitta papkani o'qiydi: `apps/api/public` (4 ta fayl),
qolganini proxy qiladi. 1.4 GB monorepo, `vendor/` va `.env` ni document root
ostiga qo'yish hech narsa bermaydi, lekin har bir sirni nginx'ning bitta xato
konfiguratsiyasidan uzoqlikka qo'yadi. Loyihaning o'z `docs/deployment/README.md`
hujjati ham `/srv` ni ko'rsatgan.

**Nega `current` symlink?** Jonli o'tish — bu `rename(2)`, ya'ni atomik: oraliq
holat yo'q. Orqaga qaytish ham xuddi shunday. Ilgari `git pull` ishlatilardi —
build davomida sayt yarim eski, yarim yangi kodni ko'rsatardi va qaytadigan
versiya umuman yo'q edi.

---

## Kundalik buyruqlar

| Kerak                                  | Buyruq                               |
| -------------------------------------- | ------------------------------------ |
| Yangi versiyani chiqarish              | `sudo srcp-deploy`                   |
| To'liq qayta build bilan               | `sudo srcp-deploy --build`           |
| Migratsiya bilan                       | `sudo srcp-deploy --build --migrate` |
| Holatni tekshirish                     | `sudo srcp-health`                   |
| Orqaga qaytish                         | `sudo srcp-rollback`                 |
| Qaysi release'lar bor                  | `srcp-rollback --list`               |
| Faqat konfiguratsiyani qayta o'rnatish | `sudo srcp-apply`                    |
| Hammasini qayta ishga tushirish        | `sudo systemctl restart srcp.target` |
| Loglar                                 | `journalctl -u srcp-web -f`          |

Hammasi **parolsiz** ishlaydi (`/etc/sudoers.d/91-srcp`).

### `srcp-deploy` nima qiladi

1. Manba daraxtini yangi release papkasiga `rsync` qiladi — oldingi release'ga
   **hardlink** bilan, shuning uchun ikkinchi va keyingi release'lar faqat
   o'zgargan narsani egallaydi (1.4 GB emas, bir necha MB).
2. `shared/` ni ulaydi (`.env`, `storage`, Next keshi — symlink orqali).
3. `composer install --no-dev` — pest, phpunit, rector, faker va larastan
   production'dan chiqadi, so'ng `package:discover` qayta yuritiladi.
4. `artisan optimize` — config, **route**, **event** va view keshi.
5. Release'ni **jonli qilishdan oldin** Laravel'ning ko'tarilishini tekshiradi.
6. `current` symlink'ini atomik almashtiradi, konfiguratsiyani o'rnatadi,
   eski `mypos-srcp-*` unitlarini to'xtatadi, yangilarini ishga tushiradi.
7. `srcp-health` bilan tekshiradi. **Sog'lom bo'lmasa — o'zi orqaga qaytadi.**
8. Eski release'larni tozalaydi (oxirgi 5 tasi qoladi).

---

## Nima ishlaydi

| Servis                               | Port                     | Unit                     |
| ------------------------------------ | ------------------------ | ------------------------ |
| Staff console (Next.js, `/`)         | 127.0.0.1:3000           | `srcp-web.service`       |
| Platform console (Next.js, `/admin`) | 127.0.0.1:3010           | `srcp-admin.service`     |
| Laravel API                          | `/run/php/srcp-fpm.sock` | `php8.4-fpm` pool `srcp` |
| Navbat (Horizon)                     | —                        | `srcp-horizon.service`   |
| Rejalashtiruvchi                     | har daqiqa               | `srcp-scheduler.timer`   |

Hammasi **`srcp`** system-akkaunti ostida — login shellsiz, parolsiz.
Ilgari `pos` ostida ishlardi, ya'ni 236 ta route'ning birortasidagi RCE bug
to'g'ridan-to'g'ri sudo huquqi va SSH kalitlariga olib kelardi. Bu — butun
migratsiyadagi eng qimmatli o'zgarish.

Har bir unit `ProtectSystem=strict` bilan ishlaydi: release daraxti runtime'da
**faqat o'qish uchun**. Yozish mumkin bo'lgan yagona joy — `/srv/srcp/shared`.

---

## Muammo bo'lsa

**502 Bad Gateway** → php-fpm o'lgan yoki socket yo'q:

```bash
sudo systemctl status php8.4-fpm
sudo tail -50 /var/log/srcp/fpm-error.log
```

**Sekin so'rov** → 5 soniyadan oshgan har bir so'rovning stack'i yoziladi:

```bash
sudo tail -100 /var/log/srcp/fpm-slow.log
```

**Kodni o'zgartirdim, lekin hech narsa o'zgarmadi** → bu kutilgan holat.
Release'lar o'zgarmas va pool `opcache.validate_timestamps=0` bilan ishlaydi.
To'g'ri yo'l — `sudo srcp-deploy`. Shoshilinch holatda:

```bash
sudo systemctl restart php8.4-fpm
```

**`failed to open stream: operation not permitted`** → `open_basedir` cheklovi
(`php/srcp-fpm-pool.conf`). Yo'lni **ro'yxatga qo'shing**, qatorni o'chirmang.

**Navbat ishlamayapti** → `sudo srcp-health` avval, keyin Horizon dashboard'i
`/horizon` (faqat `super-admin` roli kira oladi).

**Deploy o'zi orqaga qaytdi** → muvaffaqiyatsiz release diskda qoladi:

```bash
srcp-rollback --list
cat /srv/srcp/releases/<nosoz-release>/RELEASE
sudo srcp-health
```

---

## Ilk o'rnatish (yoki yangi serverda)

```bash
sudo bash /path/to/srcp/infrastructure/server/provision.sh
sudo srcp-deploy
sudo srcp-health
```

`provision.sh` **hech qanday ishlab turgan servisga tegmaydi** — u faqat
akkaunt, papka, vositalar va sudoers qoidasini yaratadi. Yarim yo'lda uzilsa,
jonli tizim o'zgarmagan qoladi. Kesib o'tish faqat `srcp-deploy` da bo'ladi.

---

## Fayllar

| Fayl                                       | `/etc` dagi manzili                                             |
| ------------------------------------------ | --------------------------------------------------------------- |
| `nginx/nginx-srcp.conf`                    | `/etc/nginx/sites-available/srcp`                               |
| `nginx/srcp-routes.conf`                   | `/etc/nginx/snippets/srcp-routes.conf`                          |
| `nginx/srcp-proxy.conf`                    | `/etc/nginx/snippets/srcp-proxy.conf`                           |
| `nginx/srcp-fastcgi.conf`                  | `/etc/nginx/snippets/srcp-fastcgi.conf`                         |
| `php/srcp-fpm-pool.conf`                   | `/etc/php/8.4/fpm/pool.d/srcp.conf`                             |
| `php/99-srcp.ini`                          | `/etc/php/8.4/{fpm,cli}/conf.d/99-srcp.ini`                     |
| `systemd/*.service`, `*.timer`, `*.target` | `/etc/systemd/system/`                                          |
| `system/logrotate-srcp`                    | `/etc/logrotate.d/srcp`                                         |
| `system/journald-srcp.conf`                | `/etc/systemd/journald.conf.d/srcp.conf`                        |
| `system/tmpfiles-srcp.conf`                | `/etc/tmpfiles.d/srcp.conf`                                     |
| `system/sudoers-srcp`                      | `/etc/sudoers.d/91-srcp` (0440, `visudo -c` bilan tekshiriladi) |
| `bin/*`                                    | `/usr/local/sbin/`                                              |

`srcp-apply` almashtirgan har bir fayl `/var/backups/srcp/etc/<vaqt>/` da
saqlanadi — hech narsa o'chirilmaydi. Agar `nginx -t` yoki `php-fpm -t`
muvaffaqiyatsiz bo'lsa, o'sha papkadan avtomatik tiklanadi va **hech narsa
reload qilinmaydi**.
