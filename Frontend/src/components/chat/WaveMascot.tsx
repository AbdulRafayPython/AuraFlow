// Orbi, AuraFlow's own little mascot: a soft rounded friend with an aura
// antenna who waves at you in a brand-new DM. Pure SVG + CSS (index.css,
// `.af-mascot*`): a gentle bob, a wave every few seconds and a blink. Motion
// stops for people who ask for reduced motion.
import { useId } from "react";
import { cn } from "@/lib/utils";

export default function WaveMascot({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const shade = `orbi-shade-${id}`;
  const limb = `orbi-limb-${id}`;
  return (
    <svg
      viewBox="0 0 160 150"
      className={cn("af-mascot", className)}
      role="img"
      aria-label="Orbi waving hello"
    >
      <defs>
        {/* Lit from the top-left: lighter there, deeper at the bottom-right. */}
        <radialGradient id={shade} cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
        </radialGradient>
        <linearGradient id={limb} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.14" />
        </linearGradient>
      </defs>
      {/* Ground shadow (shrinks as Orbi rises) */}
      <ellipse className="af-mascot-shadow" cx="78" cy="138" rx="34" ry="5" fill="hsl(var(--foreground) / 0.12)" />

      <g className="af-mascot-body">
        {/* Waving arm, behind the body so the shoulder tucks in */}
        <g className="af-mascot-arm">
          <path d="M108 84 C 118 76, 126 66, 130 52" stroke="hsl(var(--primary))" strokeWidth="14" strokeLinecap="round" fill="none" />
          <path d="M108 84 C 118 76, 126 66, 130 52" stroke={`url(#${limb})`} strokeWidth="14" strokeLinecap="round" fill="none" />
          {/* Mitten hand with a little thumb */}
          <ellipse cx="132" cy="44" rx="10" ry="11" fill="hsl(var(--primary))" />
          <ellipse cx="123" cy="48" rx="4.5" ry="5.5" fill="hsl(var(--primary))" />
          <ellipse cx="132" cy="44" rx="10" ry="11" fill={`url(#${limb})`} />
        </g>

        {/* Antenna with the aura dot */}
        <path d="M78 34 C 78 24, 84 18, 90 14" stroke="hsl(var(--primary))" strokeWidth="5" strokeLinecap="round" fill="none" />
        <circle className="af-mascot-aura" cx="92" cy="12" r="9" fill="hsl(var(--primary) / 0.25)" />
        <circle cx="92" cy="12" r="5" fill="hsl(var(--primary))" />

        {/* Body */}
        <rect x="34" y="32" width="88" height="94" rx="42" fill="hsl(var(--primary))" />
        <rect x="34" y="32" width="88" height="94" rx="42" fill={`url(#${shade})`} />
        {/* Soft light on the top-left, like a rounded toy */}
        <path d="M50 58 C 54 46, 64 40, 74 39" stroke="hsl(0 0% 100% / 0.28)" strokeWidth="6" strokeLinecap="round" fill="none" />
        {/* Belly */}
        <ellipse cx="78" cy="104" rx="26" ry="15" fill="hsl(0 0% 100% / 0.16)" />

        {/* Resting arm */}
        <path d="M40 86 C 32 92, 30 100, 32 108" stroke="hsl(var(--primary))" strokeWidth="13" strokeLinecap="round" fill="none" />
        <path d="M40 86 C 32 92, 30 100, 32 108" stroke="hsl(0 0% 0% / 0.10)" strokeWidth="13" strokeLinecap="round" fill="none" />

        {/* Face */}
        <g className="af-mascot-eyes">
          <ellipse cx="64" cy="72" rx="6" ry="8" fill="hsl(225 25% 12%)" />
          <ellipse cx="94" cy="72" rx="6" ry="8" fill="hsl(225 25% 12%)" />
          <circle cx="66" cy="69" r="2" fill="#fff" />
          <circle cx="96" cy="69" r="2" fill="#fff" />
        </g>
        <ellipse cx="54" cy="86" rx="6" ry="3.5" fill="hsl(350 90% 75% / 0.55)" />
        <ellipse cx="104" cy="86" rx="6" ry="3.5" fill="hsl(350 90% 75% / 0.55)" />
        <path d="M71 86 Q 79 94, 87 86" stroke="hsl(225 25% 12%)" strokeWidth="3.5" strokeLinecap="round" fill="none" />

        {/* Feet */}
        <ellipse cx="62" cy="128" rx="11" ry="6" fill="hsl(var(--primary))" />
        <ellipse cx="94" cy="128" rx="11" ry="6" fill="hsl(var(--primary))" />
        <ellipse cx="62" cy="128" rx="11" ry="6" fill="hsl(0 0% 0% / 0.12)" />
        <ellipse cx="94" cy="128" rx="11" ry="6" fill="hsl(0 0% 0% / 0.12)" />
      </g>
    </svg>
  );
}
