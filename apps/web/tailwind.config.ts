// apps/web/tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rta: {
          bg:        "#0D0D0D",
          surface:   "#1F0E59",
          surface2:  "#2A1870",
          border:    "#481CA6",
          accent:    "#481CA6",
          accentHi:  "#6B3FD4",
          cta:       "#F28241",
          success:   "#5ABF86",
          ink:       "#F0ECF8",
          muted:     "#9B8FC0",
          gold:      "#f5c842",
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"Segoe UI"', "sans-serif"],
      },
      keyframes: {
        legendaryPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(245,200,66,0.5), 0 0 40px rgba(242,130,65,0.25)" },
          "50%":       { boxShadow: "0 0 30px rgba(245,200,66,0.8), 0 0 60px rgba(242,130,65,0.4)" },
        },
      },
      animation: {
        legendaryPulse: "legendaryPulse 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
