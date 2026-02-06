/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class",
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: "#008080", // Vibrant Deep Teal
                secondary: "#71717a", // Zinc 500 (Warmed gray)
                "background-light": "#f8fafc", // Very subtle blue-gray
                "background-dark": "#0c0c0e", // Deep warm black
                "surface-light": "#ffffff",
                "surface-dark": "#18181b", // Zinc 900
            },
            fontFamily: {
                display: ["Montserrat", "sans-serif"],
                body: ["Montserrat", "sans-serif"],
            },
            borderRadius: {
                DEFAULT: "0.5rem",
            },
            boxShadow: {
                'soft': '0 4px 12px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)',
            }
        },
    },
    plugins: [],
}
