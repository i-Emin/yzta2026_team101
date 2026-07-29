/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        finsim: {
          primary: "#1D4ED8",   // blue-700
          primaryDark: "#1E3A8A", // blue-900
          bg: "#F8FAFC",        // slate-50
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      keyframes: {
        bounceDot: {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "40%": { transform: "translateY(-4px)", opacity: "1" },
        },
      },
      animation: {
        "bounce-dot": "bounceDot 1.2s infinite ease-in-out",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};