// Theme utility functions and CSS variable helpers
// This provides an easy way to use theme variables in components

export const themeClasses = {
  // Background classes
  bgPrimary: "bg-[hsl(var(--theme-bg-primary))]",
  bgSecondary: "bg-[hsl(var(--theme-bg-secondary))]",
  bgTertiary: "bg-[hsl(var(--theme-bg-tertiary))]",
  bgElevated: "bg-[hsl(var(--theme-bg-elevated))]",
  bgHover: "hover:bg-[hsl(var(--theme-bg-hover))]",
  bgActive: "bg-[hsl(var(--theme-bg-active))]",
  
  // Text classes
  textPrimary: "text-[hsl(var(--theme-text-primary))]",
  textSecondary: "text-[hsl(var(--theme-text-secondary))]",
  textMuted: "text-[hsl(var(--theme-text-muted))]",
  textAccent: "text-[hsl(var(--theme-accent-primary))]",
  
  // Border classes
  borderDefault: "border-[hsl(var(--theme-border-default))]",
  borderHover: "hover:border-[hsl(var(--theme-border-hover))]",
  
  // Accent classes
  accentBg: "bg-[hsl(var(--theme-accent-primary))]",
  accentText: "text-[hsl(var(--theme-accent-primary))]",
  
  // Sidebar and Header
  sidebarBg: "bg-[hsl(var(--theme-sidebar-bg))]",
  headerBg: "bg-[hsl(var(--theme-header-bg))]",
  inputBg: "bg-[hsl(var(--theme-input-bg))]",
  
  // Message bubbles
  messageSelf: "bg-[hsl(var(--theme-message-self))]",
  messageOther: "bg-[hsl(var(--theme-message-other))]",
  
  // Combined common patterns
  card: "bg-[hsl(var(--theme-bg-elevated))] border border-[hsl(var(--theme-border-default))] rounded-lg",
  input: "bg-[hsl(var(--theme-input-bg))] border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder-[hsl(var(--theme-text-muted))]",
  button: "bg-[hsl(var(--theme-accent-primary))] text-white hover:opacity-90 transition-all",
  buttonGhost: "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]",
} as const;

// Glow effect CSS variable
export const glowStyles = {
  primary: "shadow-[var(--theme-glow-primary)]",
  secondary: "shadow-[var(--theme-glow-secondary)]",
};

// Transition class for smooth theme changes
export const themeTransition = "transition-colors duration-300";
