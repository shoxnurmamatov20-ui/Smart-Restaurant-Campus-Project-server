export const metadata = { title: 'Taklif yuborish · Super Admin' };

export default function InviteUserPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Foydalanuvchini taklif qilish</h1>
        <p className="mt-2 text-muted-foreground">
          Email ga set-password havolasi yuboriladi
        </p>
      </header>

      {/* TODO: Bulk invite (CSV upload) yoki bitta email taklif */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Taklif formasi (email + rol)
      </div>
    </div>
  );
}
