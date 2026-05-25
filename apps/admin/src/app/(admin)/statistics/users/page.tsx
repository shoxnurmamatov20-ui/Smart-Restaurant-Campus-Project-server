export const metadata = { title: 'Foydalanuvchilar statistikasi · Super Admin' };

export default function UsersStatsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Foydalanuvchilar statistikasi</h1>
      {/* TODO: rolda bo'yicha split, yangi ro'yxatdan o'tishlar, faol/passiv, MAU/DAU */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        User analitika charts
      </div>
    </div>
  );
}
