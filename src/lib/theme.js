export const THEMES = [
    { id: 'midnight', name: 'Midnight' },
    { id: 'light', name: 'Light' },
    { id: 'sunset', name: 'Sunset' },
    { id: 'mono', name: 'Mono' },
];

const STORAGE_KEY = 'sc_theme';
const DEFAULT_THEME = 'midnight';

export function getTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) return stored;
    return DEFAULT_THEME;
}

export function setTheme(id) {
    if (!THEMES.some((t) => t.id === id)) return;
    localStorage.setItem(STORAGE_KEY, id);
}

export function applyTheme(id) {
    const themeId = THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME;
    document.documentElement.dataset.theme = themeId;
}
