/**
 * Stroke-only SVG icon set for the Nodus admin surface.
 * All icons are 24x24, 1.5px stroke, currentColor.
 * Keep this set small and consistent — no filled shapes, no gradients.
 */

const paths = {
  // Overview / photography
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="m4 18 5-5 4 3 3-3 4 4" />
    </>
  ),
  schematic: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M8 8h8M8 12h5M8 16h8" />
    </>
  ),
  // Status
  hourglass: (
    <>
      <path d="M7 3h10M7 21h10M7 3v4c0 2 5 3 5 5 0 2-5 3-5 5v4M17 3v4c0 2-5 3-5 5 0 2 5 3 5 5v4" />
    </>
  ),
  check: <path d="m4 12 5 5 11-11" />,
  cross: <path d="M6 6l12 12M18 6 6 18" />,
  // People
  users: (
    <>
      <circle cx="9" cy="9" r="3.5" />
      <path d="M2 20c1-3.5 4-5 7-5s6 1.5 7 5" />
      <path d="M16 10a3 3 0 0 0 0-6" />
      <path d="M22 20c-.7-2.5-2.5-4-5-4.6" />
    </>
  ),
  scout: (
    <>
      <path d="M12 3v5" />
      <path d="M4 21c2-6 6-9 8-9s6 3 8 9" />
      <path d="M8 12l8-4M8 8l8 4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="m11.5 11 8.5-8M16 7l2 2M14 9l2 2" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.8 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
  // Progress / trophy
  trophy: (
    <>
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 3h6v3H9z" />
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 11h6M9 15h4" />
    </>
  ),
  // Folders / system
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  tools: (
    <>
      <path d="M14.7 6.3a4 4 0 0 0 4.8 4.8l2-2a4 4 0 0 1-5.6-5.6l-2 2Z" />
      <path d="m14 10-8.5 8.5a2 2 0 1 1-2.8-2.8L11.2 7.2" />
    </>
  ),
  office: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M8 7h3M8 11h3M8 15h3M13 7h3M13 11h3M13 15h3" />
    </>
  ),
  // Arrows / utility
  arrowRight: <path d="M5 12h14M13 5l7 7-7 7" />,
  arrowUpRight: <path d="M7 17 17 7M9 7h8v8" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  rotateCcw: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  // Editorial
  edit: (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3l-1-1a2.1 2.1 0 0 0-3 0L4 16Z" />
      <path d="M14 6l4 4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v13M7 11l5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
};

const Icon = ({ name, size = 22, strokeWidth = 1.75, className = '', style, title }) => {
  const content = paths[name];
  if (!content) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`nodus-icon ${className}`}
      style={style}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {content}
    </svg>
  );
};

export default Icon;
