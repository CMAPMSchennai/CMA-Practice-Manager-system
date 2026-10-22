import { cn } from "@/lib/utils";

/**
 * A span (displayed as a block) so it is valid inside both <div> and <p>;
 * several stat tiles show it inside a <p> while loading.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="skeleton"
      className={cn("block bg-border/50 animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
