export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            🔐
          </div>
          <h1 className="text-2xl font-semibold">CAMPUS Super Admin</h1>
          <p className="text-sm text-muted-foreground">
            Faqat administratorlar uchun · 2FA majburiy
          </p>
        </div>

        {/* TODO: 2FA login (email/password + TOTP).
            - Step 1: email + password
            - Step 2: TOTP 6 digit code (otplib + qrcode)
            - Logged-in via Sanctum stateful cookies */}
        <form className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Admin email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Parol
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="totp" className="text-sm font-medium">
              2FA kodi (6 raqam)
            </label>
            <input
              id="totp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              className="w-full rounded-md border px-3 py-2 text-center text-lg font-mono tracking-widest"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Kirish
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          🔒 Barcha urinishlar audit logga yoziladi
        </p>
      </div>
    </div>
  );
}
