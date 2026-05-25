export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">CAMPUS</h1>
          <p className="text-sm text-muted-foreground">Tizimga kirish</p>
        </div>

        {/* TODO: implement login form (react-hook-form + zod + @campus/sdk) */}
        <form className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="email@campus.uz"
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
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Kirish
          </button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          <a href="/forgot-password" className="underline">
            Parolni unutdingizmi?
          </a>
        </div>
      </div>
    </div>
  );
}
