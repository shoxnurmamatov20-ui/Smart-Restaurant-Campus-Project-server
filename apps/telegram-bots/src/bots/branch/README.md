# Per-branch bot handlers

Every venue of a chain gets its own internal channel: shift announcements,
today's stop-list, the cleaning rota, urgent "we are out of lamb" messages.

## Keys (initial 8)

`br_chilonzor`, `br_yunusobod`, `br_mirzo_ulugbek`, `br_sergeli`,
`br_yakkasaroy`, `br_shayxontohur`, `br_olmazor`, `br_bektemir`

## Shared base

These bots differ only by which branch they are bound to, so do NOT copy a
handler file eight times. Put the logic in `src/bots/branch/_base.py` taking a
`branch_code` parameter and let each `br_*.py` be three lines.

## Membership

On `/start`, the auth middleware checks that the user's staff record belongs to
this branch. Someone from Sergeli must not receive Chilonzor's shift traffic —
a branch channel is an internal channel, not a public one.
