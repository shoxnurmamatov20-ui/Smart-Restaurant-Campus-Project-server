export const metadata = { title: 'Rollar va permissionlar · Super Admin' };

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Rollar va permissionlar</h1>
        <p className="mt-2 text-muted-foreground">
          RBAC tizimi (Spatie laravel-permission)
        </p>
      </header>

      {/* TODO: Rollar ro'yxati + permissionlar matrix (15+ rol × 100+ permission) */}
      <div className="rounded-md border bg-white p-12 text-center text-muted-foreground">
        Rollar matrix
      </div>
    </div>
  );
}
