export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`bg-neutral-200 rounded animate-pulse ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="w-11 h-11 rounded-full" />
        <SkeletonBlock className="h-4 w-32" />
      </div>
      <SkeletonBlock className="h-32 rounded-2xl" />
      <div className="grid grid-cols-4 gap-2">
        <SkeletonBlock className="h-16 rounded-2xl" />
        <SkeletonBlock className="h-16 rounded-2xl" />
        <SkeletonBlock className="h-16 rounded-2xl" />
        <SkeletonBlock className="h-16 rounded-2xl" />
      </div>
      <SkeletonBlock className="h-14 rounded-2xl" />
      <SkeletonBlock className="h-40 rounded-2xl" />
    </div>
  );
}
