import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const iconProps: IconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function SidebarIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m5 12 14-7-4.5 14-2.8-5.1L5 12Z" />
      <path d="m11.7 13.9 3.2-3.2" />
    </svg>
  );
}

export function ResearchIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19V8" />
      <path d="m3 5 6-3 6 5 6-4" />
    </svg>
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M20 15a3 3 0 0 1-3 3H8l-4 3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8Z" />
    </svg>
  );
}
