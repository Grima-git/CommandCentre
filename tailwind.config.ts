import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0A0B14",
          panel: "#11131F",
          card: "#161827",
          elev: "#1C1F30",
          line: "#262A3D",
        },
        txt: {
          primary: "#F2F4FA",
          secondary: "#A8ADC2",
          muted: "#6B7088",
        },
        brand: {
          purple: "#8B5CF6",
          blue: "#3B82F6",
          green: "#10B981",
          cyan: "#06B6D4",
          red: "#EF4444",
          amber: "#F59E0B",
        },
      },
      backgroundImage: {
        "grad-purple": "linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)",
        "grad-green": "linear-gradient(135deg, #10B981 0%, #059669 100%)",
        "grad-blue": "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
        "grad-red": "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
        "grad-amber": "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)",
        glow: "0 0 20px rgba(139,92,246,0.15)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "bar-fill": {
          "0%": { width: "0%" },
          "100%": { width: "var(--bar-w)" },
        },
        "breathe": {
          "0%, 100%": { transform: "scale(1)", filter: "brightness(1)" },
          "50%": { transform: "scale(1.05)", filter: "brightness(1.25)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.6" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "spin-slow": {
          "from": { transform: "rotate(0deg)" },
          "to": { transform: "rotate(360deg)" },
        },
        "spin-slow-r": {
          "from": { transform: "rotate(0deg)" },
          "to": { transform: "rotate(-360deg)" },
        },
        "odin-glow": {
          "0%, 100%": { boxShadow: "0 0 30px rgba(139,92,246,0.35), 0 0 60px rgba(139,92,246,0.15), inset 0 0 20px rgba(139,92,246,0.1)" },
          "50%": { boxShadow: "0 0 60px rgba(139,92,246,0.7), 0 0 120px rgba(139,92,246,0.3), inset 0 0 30px rgba(139,92,246,0.2)" },
        },
        "odin-glow-active": {
          "0%, 100%": { boxShadow: "0 0 50px rgba(6,182,212,0.5), 0 0 100px rgba(6,182,212,0.2), inset 0 0 25px rgba(6,182,212,0.15)" },
          "50%": { boxShadow: "0 0 80px rgba(6,182,212,0.8), 0 0 160px rgba(6,182,212,0.35), inset 0 0 40px rgba(6,182,212,0.25)" },
        },
        "cursor-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out forwards",
        "fade-in": "fade-in 0.25s ease-out forwards",
        "bar-fill": "bar-fill 0.6s ease-out forwards",
        "breathe": "breathe 4s ease-in-out infinite",
        "pulse-ring": "pulse-ring 3s ease-out infinite",
        "spin-slow": "spin-slow 10s linear infinite",
        "spin-slow-r": "spin-slow-r 7s linear infinite",
        "odin-glow": "odin-glow 4s ease-in-out infinite",
        "odin-glow-active": "odin-glow-active 1.5s ease-in-out infinite",
        "cursor-blink": "cursor-blink 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
