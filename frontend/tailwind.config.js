/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        harmaal: {
          sand: '#FDFBF7',    // Background
          earth: '#A67C52',   // Secondary/Accents
          blue: '#2A5C82',    // Primary/Action
          gold: '#C5A059',    // Highlights/Buttons
        }
      },
      fontFamily: {
        // Adding a clean sans-serif stack
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}