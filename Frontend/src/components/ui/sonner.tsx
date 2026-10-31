import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** The app's only toast surface. Flat, token-driven, max 3 visible. */
const Toaster = (props: ToasterProps) => {
  const { isDarkMode } = useTheme();

  return (
    <Sonner
      theme={isDarkMode ? "dark" : "light"}
      position="bottom-right"
      visibleToasts={3}
      duration={4000}
      closeButton
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-popover group-[.toaster]:rounded-lg",
          title: "group-[.toast]:text-sm group-[.toast]:font-medium",
          description: "group-[.toast]:text-sm group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
