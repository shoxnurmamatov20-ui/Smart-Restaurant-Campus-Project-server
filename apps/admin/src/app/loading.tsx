export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Admin panel yuklanmoqda...</p>
      </div>
    </div>
  );
}
