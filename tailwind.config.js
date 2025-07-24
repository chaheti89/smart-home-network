/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // This line is CRUCIAL. It tells Tailwind where to find your React components.
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}