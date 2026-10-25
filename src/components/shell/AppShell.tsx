"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChartIcon,
  HomeIcon,
  LibraryIcon,
  AppIcon,
  SearchIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/chart", label: "Chart", Icon: ChartIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
] as const;

/**
 * App shell — left rail on desktop, bottom tab bar on mobile.
 * The reader route renders bare (it owns its own chrome).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/read/")) return <>{children}</>;

  return (
    <div className="min-h-dvh">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[84px] flex-col items-center border-r border-veil/40 bg-abyss/80 backdrop-blur-xl lg:flex">
        <Link href="/" className="mt-5 mb-6" aria-label="Shadow Palace home">
          <AppIcon size={38} />
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-2">
          {TABS.map(({ href, label, Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex w-[68px] flex-col items-center gap-1 rounded-2xl py-3 transition-colors",
                  active
                    ? "text-flame"
                    : "text-mist hover:bg-hall/60 hover:text-moon",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="rail-glow"
                    className="absolute inset-0 rounded-2xl bg-flame/10 ring-1 ring-flame/25"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="relative h-[22px] w-[22px]" width={22} height={22} />
                <span className="relative text-[10.5px] font-medium tracking-wide">
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
        <p className="mb-4 text-[9px] tracking-[0.2em] text-veil uppercase">
          v0.1
        </p>
      </aside>

      {/* Mobile top bar */}
      <header className="safe-pt sticky top-0 z-40 flex items-center gap-3 border-b border-veil/40 bg-abyss/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <AppIcon size={28} />
        <h1 className="font-display text-[15px] font-semibold tracking-wide">
          Shadow <span className="text-gradient">Palace</span>
        </h1>
      </header>

      {/* Content */}
      <main className="pb-24 lg:pb-10 lg:pl-[84px]">{children}</main>

      {/* Mobile bottom tabs */}
      <nav className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-veil/40 bg-abyss/85 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {TABS.map(({ href, label, Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex min-w-[72px] flex-col items-center gap-1 px-3 pt-2.5 pb-2 transition-colors",
                  active ? "text-flame" : "text-mist",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-glow"
                    className="absolute -top-px h-0.5 w-10 rounded-full bg-gradient-to-r from-flame to-ember"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="h-[21px] w-[21px]" width={21} height={21} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
