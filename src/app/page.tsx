import Link from "next/link";
import { ContinueReading } from "@/components/home/ContinueReading";
import { FollowingRow } from "@/components/home/FollowingRow";
import { MangaShelf } from "@/components/home/MangaShelf";

function SectionHeading({
  title,
  note,
}: {
  title: string;
  note?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="font-display text-lg font-semibold tracking-wide">
        {title}
      </h2>
      {note && <span className="text-xs text-mist">{note}</span>}
    </div>
  );
}

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="glow pointer-events-none absolute inset-x-0 -top-24 h-80" />
        <div className="relative px-5 pt-10 pb-7 lg:px-10 lg:pt-14">
          <p className="mb-2 text-[10.5px] font-semibold tracking-[0.3em] text-mist uppercase">
            Personal Reader
          </p>
          <h2 className="font-display text-4xl font-bold tracking-tight lg:text-5xl">
            Shadow <span className="text-gradient">Palace</span>
          </h2>
          <p className="mt-3 max-w-md text-sm text-mist">
            Manga, manhwa and light novels — one dark sanctuary, all yours.
          </p>
          <Link
            href="/search"
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-veil/70 bg-palace/70 px-5 py-2.5 text-sm text-moon/90 transition-colors hover:border-flame/60 hover:text-flame"
          >
            <span className="text-mist">⌕</span> Search the archives…
            <kbd className="ml-2 hidden rounded border border-veil px-1.5 py-0.5 text-[10px] text-mist sm:inline">
              /
            </kbd>
          </Link>
        </div>
      </section>

      <div className="space-y-9 px-5 pb-10 lg:px-10">
        {/* Following — live update badges + next-drop estimates */}
        <section>
          <SectionHeading title="Following" note="new chapters & release estimates" />
          <FollowingRow />
        </section>

        {/* Continue reading — local library */}
        <section>
          <SectionHeading
            title="Continue"
            note="picked up where you left off"
          />
          <ContinueReading />
        </section>

        {/* Browse shelves (client-side, instant) */}
        <section>
          <SectionHeading title="Latest Updates" note="fresh chapters" />
          <MangaShelf type="latest" />
        </section>
      </div>
    </div>
  );
}
