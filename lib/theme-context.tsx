"use client";

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes";

/**
 * App-wide theme provider — re-exported from a stable path so generated
 * pages/_app.tsx can import `@/lib/theme-context` without inventing ad-hoc
 * theme wiring. Required by components/ui/sonner (useTheme).
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
