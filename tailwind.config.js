/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./app/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./packages/studio/src/**/*.{js,jsx}",
        "./packages/Open-AI-Design-Agent/packages/design-agent/src/**/*.{js,jsx}",
        "./packages/Open-Poe-AI/packages/agents/src/**/*.{js,jsx,ts,tsx}",
        "./packages/Vibe-Workflow/packages/workflow-builder/src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
                    hover: '#06b6d4',
                },
                'app-bg': 'rgb(var(--bg) / <alpha-value>)',
                'panel-bg': 'rgb(var(--surface) / <alpha-value>)',
                'card-bg': 'rgb(var(--surface) / <alpha-value>)',
                secondary: 'rgb(var(--text-dim) / <alpha-value>)',
                muted: 'rgb(var(--text-muted) / <alpha-value>)',
                bg: 'rgb(var(--bg) / <alpha-value>)',
                surface: 'rgb(var(--surface) / <alpha-value>)',
                'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
                'border-token': 'rgb(var(--border) / <alpha-value>)',
                fg: 'rgb(var(--text) / <alpha-value>)',
                dim: 'rgb(var(--text-dim) / <alpha-value>)',
                accent: 'rgb(var(--accent) / <alpha-value>)',
                'accent-contrast': 'rgb(var(--accent-contrast) / <alpha-value>)',
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
            borderRadius: {
                'xl': '1rem',
                '2xl': '1.5rem',
                '3xl': '2rem',
            },
            boxShadow: {
                'glow': '0 0 20px rgb(var(--glow) / 0.4)',
                'glow-accent': '0 0 20px rgba(168, 85, 247, 0.4)',
                '3xl': '0 35px 60px -15px rgba(0, 0, 0, 0.8)',
            }
        },
    },
    plugins: [],
}
