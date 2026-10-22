/**
 * Stroke icon set — 24px grid, currentColor. Hand-rolled to keep the
 * bundle dependency-free and the visual language consistent.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    /* Darkreader (and similar extensions) inject fill/stroke/style
       attributes into SVGs before React hydrates — ignore those. */
    suppressHydrationWarning: true,
    ...props,
  };
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M3 10.5 12 3l9 7.5" />
      <path suppressHydrationWarning d="M5 9.8V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.8" />
      <path suppressHydrationWarning d="M12 6.2v1.6" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle suppressHydrationWarning cx="11" cy="11" r="7" />
      <path suppressHydrationWarning d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function LibraryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M4 4v16" />
      <rect suppressHydrationWarning x="7" y="4" width="4" height="16" rx="1" />
      <path suppressHydrationWarning d="m14.5 5.2 3.6-.9a1 1 0 0 1 1.2.7l2.4 9.6a1 1 0 0 1-.7 1.2l-3.6.9" />
      <path suppressHydrationWarning d="M14.4 12.2 20.9 14" />
    </svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M4 20h16" />
      <rect suppressHydrationWarning x="5" y="11" width="3.6" height="6" rx="1" />
      <rect suppressHydrationWarning x="10.2" y="7" width="3.6" height="10" rx="1" />
      <rect suppressHydrationWarning x="15.4" y="4" width="3.6" height="13" rx="1" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M19 12H5" />
      <path suppressHydrationWarning d="m11 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="m6 15 6-6 6 6" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M12 19V5" />
      <path suppressHydrationWarning d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M12 5v14" />
      <path suppressHydrationWarning d="m19 12-7 7-7-7" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M4 7h10" />
      <path suppressHydrationWarning d="M18 7h2" />
      <circle suppressHydrationWarning cx="16" cy="7" r="2" />
      <path suppressHydrationWarning d="M4 17h4" />
      <path suppressHydrationWarning d="M12 17h8" />
      <circle suppressHydrationWarning cx="10" cy="17" r="2" />
    </svg>
  );
}

export function MaximizeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path suppressHydrationWarning d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path suppressHydrationWarning d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path suppressHydrationWarning d="M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

export function MinimizeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M3 8h3a2 2 0 0 0 2-2V3" />
      <path suppressHydrationWarning d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path suppressHydrationWarning d="M15 21h3a2 2 0 0 0 2-2v-3" />
      <path suppressHydrationWarning d="M9 21H6a2 2 0 0 1-2-2v-3" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M18 6 6 18" />
      <path suppressHydrationWarning d="m6 6 12 12" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M12 5v14" />
      <path suppressHydrationWarning d="M5 12h14" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path suppressHydrationWarning d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function BookOpenIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M2 4.5A2.5 2.5 0 0 1 4.5 2H10a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H4.5A2.5 2.5 0 0 1 2 15.5z" />
      <path suppressHydrationWarning d="M22 4.5A2.5 2.5 0 0 0 19.5 2H14a2 2 0 0 0-2 2v16a2 2 0 0 1 2-2h5.5a2.5 2.5 0 0 0 2.5-2.5z" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path suppressHydrationWarning d="M4 7h16" />
      <path suppressHydrationWarning d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path suppressHydrationWarning d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path suppressHydrationWarning d="M10 11v6" />
      <path suppressHydrationWarning d="M14 11v6" />
    </svg>
  );
}

export function CompassIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle suppressHydrationWarning cx="12" cy="12" r="9" />
      <path suppressHydrationWarning d="m15.5 8.5-2 5-5 2 2-5z" />
    </svg>
  );
}

/** The Shadow Palace mark — crescent moon over a palace spire. */
export function PalaceMark({ size = 32, ...props }: { size?: number } & IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      suppressHydrationWarning
      {...props}
    >
      <defs>
        <linearGradient id="sp-grad" x1="0" y1="0" x2="48" y2="48">
          <stop suppressHydrationWarning offset="0%" stopColor="#8b5cf6" />
          <stop suppressHydrationWarning offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <rect suppressHydrationWarning width="48" height="48" rx="12" fill="url(#sp-grad)" />
      {/* crescent */}
      <path suppressHydrationWarning
        d="M31 10a11 11 0 1 0 7 18.6A12.5 12.5 0 0 1 31 10Z"
        fill="#0b0913"
        fillOpacity="0.85"
      />
      {/* spire */}
      <path suppressHydrationWarning
        d="M14 38h20M17 38V26l7-6 7 6v12"
        stroke="#0b0913"
        strokeOpacity="0.85"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path suppressHydrationWarning d="M24 13v4" stroke="#0b0913" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
