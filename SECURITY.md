# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: (active development) |

## Reporting a Vulnerability

CAMPUS xavfsizlik muammolarini jiddiy qabul qiladi. Agar siz xavfsizlik kamchiligini topgan bo'lsangiz, iltimos:

### ❌ QILMANG
- Issue ochmang (umumiy ko'rinadi)
- Pull Request orqali muammoni "fix" qilmang (umumiy ko'rinadi)
- Twitter/Telegram/forum'da yozmang
- Boshqalar bilan baham ko'rmang (responsible disclosure)

### ✅ QILING

Quyidagi manzilga email yuboring: **uzbcorp@gmail.com**

Email tarkibida quyidagilar bo'lsin:
- **Mavzu (subject):** `[SECURITY] <qisqacha tavsif>`
- **Tafsilot:** Muammo nima, qaerda, qanday yetkazadi
- **Reproduce qadamlar:** Aniq qanday qilib topish mumkin
- **Ta'sir (impact):** Muammodan kim, qanday zarar olishi mumkin
- **Tavsiya yechim:** Agar fikr bo'lsa
- **PoC (proof of concept):** Code/screenshots (xohlasangiz)

### 🕐 Javob vaqti

- **Tasdiqlash:** 24-48 soat ichida
- **Birinchi tahlil:** 7 kun ichida
- **Yechim (fix):** Kritiklik darajasiga qarab — kritik uchun 7 kun, o'rta uchun 30 kun

## Bug Bounty

Hozircha rasmiy bug bounty dasturi yo'q, lekin xavfsizlik tadqiqotchilarini tan olamiz:
- Hall of Fame'da nomingiz
- Loyiha team bilan rasmiy minnatdorchilik
- Kelajakda — bounty dasturi rejada bor

## Xavfsizlik standartlari

CAMPUS quyidagi standartlarga rioya qiladi:
- **OWASP Top 10** (web app xavfsizligi)
- **PCI-DSS** (to'lov ma'lumotlari uchun)
- **GDPR-compatible** (shaxsiy ma'lumotlar)
- **O'zbekiston Respublikasi qonunchiligi** (shaxsiy ma'lumotlar to'g'risida)

## Xavfsizlik xususiyatlari

- 🔐 **2FA** (Super Admin uchun majburiy)
- 🔑 **OAuth 2.0 + JWT** + **Sanctum**
- 🛡️ **CSRF protection** (Sanctum)
- 🚫 **XSS protection** (React default + CSP headers)
- 🔒 **SQL injection protection** (Eloquent prepared statements)
- 📜 **Audit logging** (Spatie ActivityLog)
- 🌐 **HTTPS only** (production)
- 🔐 **Encryption at rest** (database + storage)
- 🌍 **Data sovereignty** (O'zbekiston ichida)
