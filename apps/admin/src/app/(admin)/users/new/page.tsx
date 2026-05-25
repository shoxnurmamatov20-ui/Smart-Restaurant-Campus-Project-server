export const metadata = { title: 'Yangi foydalanuvchi · Super Admin' };

export default function NewUserPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Yangi foydalanuvchi yaratish</h1>
        <p className="mt-2 text-muted-foreground">
          Email + parol bilan to'g'ridan-to'g'ri yarating (yoki taklif yuboring)
        </p>
      </header>

      {/* TODO: Forma: ism, familiya, email, telefon, rol, parol (yoki avto), 2FA majburiymi */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Foydalanuvchi yaratish formasi
      </div>
    </div>
  );
}
