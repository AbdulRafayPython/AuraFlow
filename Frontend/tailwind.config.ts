import type { Config } from "tailwindcss";
import tailwindcssAnimate from 'tailwindcss-animate';
import tailwindScrollbar from 'tailwind-scrollbar';

export default {
  darkMode: ["class"],
  content: ["./index.html", "./pages/**/*.{ts,tsx,js,jsx}", "./components/**/*.{ts,tsx,js,jsx}", "./app/**/*.{ts,tsx,js,jsx}", "./src/**/*.{ts,tsx,js,jsx}"],
  prefix: "",
  safelist: [
    // pages/AgentDetails.tsx builds `bg-${agent.color}-500/20` and `text-${agent.color}-400` at runtime.
    ...['blue', 'pink', 'red', 'green', 'purple', 'indigo', 'orange', 'violet', 'cyan', 'emerald', 'amber'].flatMap(c => [
      `bg-${c}-500/20`, `text-${c}-400`,
    ]),
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    // Type scale: 12 / 13 / 14 (ui) / 15 / 18 / 24. 12px is the floor.
    fontSize: {
      xs: ["12px", { lineHeight: "16px" }],
      sm: ["13px", { lineHeight: "20px" }],
      ui: ["14px", { lineHeight: "20px" }],
      base: ["15px", { lineHeight: "22px" }],
      lg: ["18px", { lineHeight: "26px" }],
      xl: ["18px", { lineHeight: "26px" }],
      "2xl": ["24px", { lineHeight: "32px" }],
      "3xl": ["30px", { lineHeight: "38px" }],
      "4xl": ["36px", { lineHeight: "44px" }],
      "5xl": ["48px", { lineHeight: "1" }],
      "6xl": ["60px", { lineHeight: "1" }],
      "7xl": ["72px", { lineHeight: "1" }],
      "8xl": ["96px", { lineHeight: "1" }],
      "9xl": ["128px", { lineHeight: "1" }],
    },
    // Radius scale: 4 / 6 / 8 / 12 / full
    borderRadius: {
      none: "0px",
      sm: "4px",
      DEFAULT: "4px",
      md: "6px",
      lg: "8px",
      xl: "12px",
      "2xl": "12px",
      "3xl": "12px",
      full: "9999px",
    },
    // Shadows are for popovers and menus only.
    boxShadow: {
      none: "none",
      sm: "0 1px 2px 0 rgb(0 0 0 / 0.2)",
      DEFAULT: "0 1px 2px 0 rgb(0 0 0 / 0.2)",
      md: "var(--shadow-popover)",
      lg: "var(--shadow-popover)",
      xl: "var(--shadow-popover)",
      "2xl": "var(--shadow-popover)",
      inner: "inset 0 1px 2px 0 rgb(0 0 0 / 0.2)",
      popover: "var(--shadow-popover)",
    },
    extend: {
      fontFamily: {
        sans: ["'Inter Variable'", "Inter", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"],
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      width: {
        rail: "var(--rail-width)",
        sidebar: "var(--sidebar-width)",
        "right-pane": "var(--right-pane-width)",
        members: "var(--members-width)",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          light: "hsl(var(--primary-light))",
          dark: "hsl(var(--primary-dark))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          light: "hsl(var(--destructive-light))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          light: "hsl(var(--accent-light))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          light: "hsl(var(--success-light))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          light: "hsl(var(--warning-light))",
        },
        chat: {
          user: "hsl(var(--chat-user))",
          other: "hsl(var(--chat-other))",
          agent: "hsl(var(--chat-agent))",
          system: "hsl(var(--chat-system))",
        },
        agent: {
          active: "hsl(var(--agent-active))",
          inactive: "hsl(var(--agent-inactive))",
          disabled: "hsl(var(--agent-disabled))",
        },
        channel: {
          default: "hsl(var(--channel-default))",
          hover: "hsl(var(--channel-hover))",
          active: "hsl(var(--channel-active))",
          muted: "hsl(var(--channel-muted))",
          unread: "hsl(var(--channel-unread))",
        },
        discord: {
          background: "hsl(var(--discord-background))",
          secondary: "hsl(var(--discord-secondary))",
          tertiary: "hsl(var(--discord-tertiary))",
          accent: "hsl(var(--discord-accent))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.15s ease-out",
        "accordion-up": "accordion-up 0.15s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindScrollbar],
} satisfies Config;
