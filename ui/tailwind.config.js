/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        wind: {
          head: '#ef4444', // red for headwind
          cross: '#f59e0b', // amber for crosswind
          tail: '#10b981', // emerald for tailwind
        }
      }
    },
  },
  plugins: [],
}
