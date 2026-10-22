import { cn } from "@/lib/utils";

/** Shimmer placeholder block. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-shimmer rounded-xl bg-palace", className)}
      {...props}
    />
  );
}

/** Grid of poster skeletons for loading states. */
export function CardSkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-2/3 w-full" />
          <Skeleton className="mt-2 h-3.5 w-4/5" />
        </div>
      ))}
    </div>
  );
}
