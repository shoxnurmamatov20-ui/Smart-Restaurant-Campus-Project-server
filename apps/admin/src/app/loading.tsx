export default function Loading() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="border-primary h-10 w-10 animate-spin rounded-full border-3 border-t-transparent" />
        <p className="text-muted-foreground text-sm">Admin panel yuklanmoqda...</p>
      </div>
    </div>
  );
}
