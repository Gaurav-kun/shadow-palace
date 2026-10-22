"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Horizontal scroller with prev/next arrow buttons (desktop) and native
 * swipe/scroll (touch). Arrows fade out at the ends.
 */
export function Scroller({
  children,
  className,
  itemRef,
}: {
  children: React.ReactNode;
  className?: string;
  itemRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const localRef = useRef<HTMLDivElement>(null);
  const ref = itemRef ?? localRef;
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft < 8);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  };

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ref]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className="group/scroller relative">
      <div
        ref={ref}
        className={cn(
          "no-scrollbar flex gap-3 overflow-x-auto scroll-smooth pb-1",
          className,
        )}
      >
        {children}
      </div>

      {/* Arrows (desktop only) */}
      <button
        onClick={() => scrollBy(-1)}
        disabled={atStart}
        aria-label="Scroll left"
        className={cn(
          "absolute top-1/2 -left-3 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-abyss/90 text-moon ring-1 ring-veil backdrop-blur-md transition-all lg:flex",
          "opacity-0 group-hover/scroller:opacity-100",
          atStart && "pointer-events-none opacity-0",
        )}
      >
        <ChevronLeftIcon className="h-5 w-5" width={20} height={20} />
      </button>
      <button
        onClick={() => scrollBy(1)}
        disabled={atEnd}
        aria-label="Scroll right"
        className={cn(
          "absolute top-1/2 -right-3 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-abyss/90 text-moon ring-1 ring-veil backdrop-blur-md transition-all lg:flex",
          "opacity-0 group-hover/scroller:opacity-100",
          atEnd && "pointer-events-none opacity-0",
        )}
      >
        <ChevronRightIcon className="h-5 w-5" width={20} height={20} />
      </button>

      {/* Edge fade */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-void to-transparent lg:-left-2" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-void to-transparent lg:-right-2" />
    </div>
  );
}
