import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The only icon sizes the product uses (px). */
export const ICON_SIZES = { sm: 14, md: 16, lg: 20 } as const;
export type IconSize = keyof typeof ICON_SIZES;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "ref" | "size"> {
  /** A lucide-react icon component, e.g. `Hash`. */
  icon: LucideIcon;
  size?: IconSize;
  /** Filled variant for active rail / sidebar items. */
  filled?: boolean;
  /** Accessible name. Omit for decorative icons (aria-hidden). */
  label?: string;
}

/**
 * Thin wrapper over lucide so size and stroke are uniform (14/16/20, 1.75).
 * Icon-only buttons should carry their own `aria-label`; use `label` here
 * only when the icon stands alone.
 */
export function Icon({ icon: Glyph, size = "md", filled = false, label, className, ...props }: IconProps) {
  const px = ICON_SIZES[size];
  return (
    <Glyph
      width={px}
      height={px}
      strokeWidth={1.75}
      fill={filled ? "currentColor" : "none"}
      className={cn("shrink-0", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      {...(props as object)}
    />
  );
}
