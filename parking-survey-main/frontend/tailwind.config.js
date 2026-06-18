/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#eef7ff',
                    100: '#d9edff',
                    200: '#bce0ff',
                    300: '#8eccff',
                    400: '#58afff',
                    500: '#3290ff',
                    600: '#1a70f5',
                    700: '#145ae1',
                    800: '#1749b6',
                    900: '#19408f',
                    950: '#142857',
                },
                surface: {
                    50: '#f5f7fa',
                    100: '#ebeef3',
                    200: '#d3d9e3',
                    300: '#adb7ca',
                    400: '#8290ac',
                    500: '#627392',
                    600: '#4e5c79',
                    700: '#404b63',
                    800: '#374053',
                    900: '#1e2433',
                    950: '#131825',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
            },
        },
    },
    plugins: [],
}
