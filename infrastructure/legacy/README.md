# Legacy — Docker-Compose davrining deploy fayllari

Bu papkadagi hech narsa bugun ishlamaydi va hech narsaga ulanmagan.

- **`nginx/`** — `restaurant-campus.uz` domeni uchun yozilgan sayt konfiguratsiyasi.
  U domen hech qachon ko'tarilmagan; jonli o'rnatma `mypos.tashmedunitf.uz` da
  va uning nginx'i boshqacha qurilgan (edge-proxy ortida, TLS'siz port 80).
- **`scripts/`** — `setup-server.sh`, `deploy.sh`, `backup.sh`,
  `start-services.ps1`. Compose-era ssenariy: bitta serverda `docker compose`
  bilan ko'tarish. Jonli serverda Docker yo'q va bu skriptlar ishlatilmagan.

Nima uchun o'chirilmasdan saqlanadi: `docker-compose.yml` (repo ildizida) hali
local dev muhiti sifatida yashaydi va bu fayllar o'sha davr qarorlarining
yozuvi; K8s yo'li qurilganda rate-limit va header bloklarini shu yerdan olish
mumkin.

Haqiqiy deploy ikki joyda hujjatlangan:

| Nima                                 | Qayerda                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Jonli server (pos26) qanday turibdi  | [`docs/deployment/pos26-uzcloud.md`](../../docs/deployment/pos26-uzcloud.md) |
| Systemd + php-fpm cutover (yozilgan) | [`infrastructure/server/`](../server/README.md)                              |
| Kubernetes (kelajak)                 | [`infrastructure/kubernetes/`](../kubernetes/README.md)                      |
