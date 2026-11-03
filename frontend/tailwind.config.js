/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        pixel: ["Silkscreen", "monospace"],
      },
      colors: {
        brand: {
          green: "#00A63E",
          "green-tint": "#E5F6EC",
          "green-chip": "#E6F7ED",
          "avatar-green": "#00C950",
        },
        text: {
          strong: "#101828",
          body: "#1E2939",
          muted: "#4A5565",
          subtle: "#6A7282",
          faint: "#99A1AF",
          placeholder: "#A1A1A1",
          "placeholder-login": "#636970",
          "divider-text": "#A4A4A4",
          "section-label": "#B6B6B6",
        },
        surface: {
          soft: "#F4F7F5",
          chip: "#F5F5F5",
          editor: "#FAFAFA",
          card: "#F9FAFB",
          badge: "#F3F4F6",
        },
        line: {
          DEFAULT: "#E5E7EB",
          row: "#F8F9FA",
          card: "#F1F2F4",
          toolbar: "#E7E7E7",
        },
        orange: {
          badge: "#FFEDD4",
          text: "#CA3500",
          border: "#FFD6A7",
        },
        callout: {
          bg: "#FEFCE8",
          border: "#FDC700",
          bolt: "#FF9401",
        },
      },
      boxShadow: {
        popover: "0 2px 8px rgba(0, 0, 0, 0.12)",
      },
      borderRadius: {
        field: "10px",
        editor: "16px",
        popover: "8px",
      },
    },
  },
  plugins: [],
}
