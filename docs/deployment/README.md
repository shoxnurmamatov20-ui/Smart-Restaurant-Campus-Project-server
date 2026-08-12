# Deployment

## Production server

| Parametr | Qiymat                              |
| -------- | ----------------------------------- |
| OS       | Ubuntu Server 24.04 LTS             |
| RAM      | 500 GB                              |
| Disk     | 12 TB                               |
| Provider | Restoran on-prem yoki bulut         |
| Domen    | restaurant-campus.uz (planlanmoqda) |

## Birinchi marta o'rnatish

```bash
# 1. Server'ga SSH bilan kiring (root yoki sudo user)
ssh root@<server-ip>

# 2. Loyihani klone qiling
git clone https://github.com/<owner>/smart-restaurant-campus.git /tmp/restaurant-campus-bootstrap

# 3. Setup skriptini ishga tushiring
sudo bash /tmp/restaurant-campus-bootstrap/infrastructure/scripts/setup-server.sh
# Bu: Docker, UFW, fail2ban, user "restaurant" yaratadi, /srv/restaurant-campus papkasini tayyorlaydi

# 4. Loyiha foydalanuvchisi sifatida
su - restaurant
cd /srv/restaurant-campus
git clone https://github.com/<owner>/smart-restaurant-campus.git .

# 5. .env tayyorlash
cp .env.example .env
nano .env   # Real qiymatlarni kiriting

# 6. Servislarni ishga tushirish
docker compose -f docker-compose.prod.yml up -d

# 7. Database migrate va seed
docker compose exec api php artisan migrate --force
docker compose exec api php artisan db:seed --force
docker compose exec api php artisan admin:create

# 8. SSL (Let's Encrypt — kerak bo'lsa)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d restaurant-campus.uz -d www.restaurant-campus.uz -d admin.restaurant-campus.uz
```

## Yangilanish (deploy)

```bash
cd /srv/restaurant-campus
bash infrastructure/scripts/deploy.sh
```

Yoki avtomatik (GitHub Actions orqali):

- `main` ga push → CI run → testlar pass bo'lsa → server'ga SSH deploy
- Konfiguratsiya: `.github/workflows/deploy-production.yml` (TBD)

## Backup

Avtomatik kunlik backup:

```bash
# Crontab
0 3 * * * /srv/restaurant-campus/infrastructure/scripts/backup.sh
```

Backup joyi: `/srv/restaurant-campus/backups/` (postgres + minio + redis snapshot)

Retention: 30 kun (deploy.sh ichida sozlanadi)

## Monitoring

Optional Prometheus + Grafana profile:

```bash
docker compose --profile monitoring up -d
# Grafana: http://server:3030 (admin/admin — birinchi marta o'zgartiring)
# Prometheus: http://server:9090
```

## Disaster recovery

| Scenariy           | Yechim                                                         |
| ------------------ | -------------------------------------------------------------- |
| Postgres buzildi   | `pg_restore` oxirgi backup'dan                                 |
| Server o'lik       | Yangi server'da `setup-server.sh` + git clone + backup restore |
| Docker corrupt     | `docker system prune -a` + re-pull images                      |
| Domen ishlamayapti | DNS tekshirish + nginx logs                                    |

## SSL sertifikat yangilash

Let's Encrypt sertifikat 90 kunda yangilanadi:

```bash
# Auto-renew test
sudo certbot renew --dry-run

# Crontab (1-chi va 15-chi har oy)
0 0 1,15 * * certbot renew --quiet --post-hook "systemctl reload nginx"
```
