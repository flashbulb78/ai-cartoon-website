import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        success: "var(--success)",
        warning: "var(--warning)",
        // Map standard gray palette to theme variables
        gray: {
          50: "var(--muted)",
          100: "var(--secondary)",
          200: "var(--border)",
          300: "var(--border)",
          400: "var(--muted-foreground)",
          500: "var(--muted-foreground)",
          600: "var(--muted-foreground)",
          700: "var(--foreground)",
          800: "var(--foreground)",
          900: "var(--foreground)",
          950: "var(--background)",
        },
        white: "var(--background)",
        black: "var(--background)",
      },
    },
  },
} satisfies Config;
