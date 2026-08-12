# Concept and franchise bot handlers

A group often runs several concepts under one legal entity — a pizzeria, a
coffee shop, a national-cuisine restaurant. Each concept has its own guest
audience and tone of voice, so it gets its own bot rather than a section inside
a shared one.

## Keys

| Key              | Audience | Purpose                                                  |
| ---------------- | -------- | -------------------------------------------------------- |
| `concept_pizza`  | Mehmon   | Pizza menyusi, aksiyalar, yetkazib berish                |
| `concept_coffee` | Mehmon   | Kofexona menyusi, sodiqlik kartasi, yangi ta'mlar        |
| `franchise`      | Egasi    | Franchayzi hamkorlar: standartlar, hisobot, royalti      |
| `audit`          | Egasi    | Checklistlar, sirli mehmon natijalari, tekshiruv aktlari |

## Note

Concept bots are guest-facing and must work without a login — a first-time
visitor scanning a QR code has no account yet. Franchise and audit bots are the
opposite: they carry commercially sensitive numbers and require a linked owner
or brand-manager account.
