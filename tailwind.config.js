/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#121212',
        foreground: '#ffffff',
        surface: '#1a1a1a',
        'surface-2': '#282828',
        muted: '#3a3a3a',
        'muted-foreground': '#a7a7a7',
        primary: '#1db954',
        'primary-foreground': '#000000',
        border: 'rgba(255, 255, 255, 0.08)',
        danger: '#e22134',
      },
      fontFamily: {
        display: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontWeight: {
        700: '700',
        600: '600',
      },
    },
  },
  plugins: [],
}