"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes injects an inline <script> to set the theme class before
// hydration and avoid a flash of the wrong theme. React 19 now warns about
// any <script> rendered inside a component tree, even though this one only
// ever runs during SSR and is harmless on the client. This is a known,
// unresolved upstream issue (see https://github.com/pacocoursey/next-themes/issues/385).
// Silence just this specific warning until next-themes ships a fix.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
        if (
            typeof args[0] === "string" &&
            args[0].includes("Encountered a script tag")
        ) {
            return;
        }
        originalConsoleError(...args);
    };
}

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
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
