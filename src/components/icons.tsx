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

/** App icon — the detailed palace silhouette from the PWA icon (public/icon.svg). */
export function AppIcon({ size = 32, ...props }: { size?: number } & IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      suppressHydrationWarning
      {...props}
    >
      <defs>
        <linearGradient id="app-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1a1333" />
          <stop offset="1" stopColor="#07060b" />
        </linearGradient>
        <linearGradient id="app-gold" x1="0" y1="34" x2="0" y2="49" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <radialGradient id="app-halo" cx="32" cy="23.5" r="19" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fbbf24" stopOpacity="0.42" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="app-moon" cx="32" cy="23.5" r="11" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fef9ec" />
          <stop offset="1" stopColor="#fde68a" />
        </radialGradient>
      </defs>

      {/* night sky */}
      <rect width="64" height="64" rx="14" fill="url(#app-bg)" />

      {/* stars */}
      <circle cx="11" cy="12.5" r="0.85" fill="#fef3c7" opacity="0.75" />
      <circle cx="53" cy="10.5" r="0.65" fill="#fef3c7" opacity="0.5" />
      <circle cx="49" cy="17.5" r="0.55" fill="#fef3c7" opacity="0.38" />
      <circle cx="14" cy="20.5" r="0.55" fill="#fef3c7" opacity="0.45" />
      <circle cx="50.5" cy="25" r="0.5" fill="#fef3c7" opacity="0.3" />

      {/* moon + halo */}
      <circle cx="32" cy="23.5" r="19" fill="url(#app-halo)" />
      <circle cx="32" cy="23.5" r="11" fill="url(#app-moon)" />

      {/* palace silhouette */}
      <g fill="#07060b">
        {/* finial */}
        <circle cx="32" cy="12.7" r="1.05" />
        <rect x="31.4" y="13.6" width="1.2" height="2.8" />

        {/* top roof */}
        <path d="M22.8 20.8 C26.2 20.0 29.2 18.0 32 16.2 C34.8 18.0 37.8 20.0 41.2 20.8 C38.2 22.6 35.2 23.4 32 23.4 C28.8 23.4 25.8 22.6 22.8 20.8 Z" />
        <rect x="27.9" y="23.2" width="8.2" height="4.6" />

        {/* middle roof */}
        <path d="M17.2 30.0 C21.8 29.0 27.0 26.4 32 24.2 C37 26.4 42.2 29.0 46.8 30.0 C42.4 32.4 37.2 33.5 32 33.5 C26.8 33.5 21.6 32.4 17.2 30.0 Z" />
        <rect x="24.6" y="33.3" width="14.8" height="6.0" />

        {/* bottom roof */}
        <path d="M12.2 41.0 C17.8 39.8 24.8 36.6 32 34.0 C39.2 36.6 46.2 39.8 51.8 41.0 C46.2 43.8 39.2 45.2 32 45.2 C24.8 45.2 17.8 43.8 12.2 41.0 Z" />
        <rect x="20" y="45.0" width="24" height="3.8" />
      </g>

      {/* lit windows */}
      <g fill="url(#app-gold)">
        <rect x="27.0" y="34.6" width="2.6" height="2.2" rx="0.45" />
        <rect x="34.4" y="34.6" width="2.6" height="2.2" rx="0.45" />
        <rect x="23.4" y="45.6" width="2.6" height="2.2" rx="0.45" />
        <rect x="38.0" y="45.6" width="2.6" height="2.2" rx="0.45" />
        <path d="M30.3 48.8 V46.4 A1.7 1.7 0 0 1 33.7 46.4 V48.8 Z" />
      </g>

      {/* ground shadow */}
      <ellipse cx="32" cy="48.9" rx="16.5" ry="1.5" fill="#07060b" />
    </svg>
  );
}
