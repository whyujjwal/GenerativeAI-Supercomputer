import { SettingsModal } from './SettingsModal.js';
import { t, getLang, setLang } from '../lib/i18n.js';
import { THEMES, applyTheme, getTheme, setTheme } from '../lib/theme.js';

export function Header(navigate) {
    const header = document.createElement('header');
    header.className = 'w-full flex flex-col z-50 sticky top-0';


    // 2. Main Navigation Bar
    const navBar = document.createElement('div');
    navBar.className = 'w-full h-16 bg-bg flex items-center justify-between px-4 md:px-6 border-b border-border-token backdrop-blur-md bg-opacity-95';

    const leftPart = document.createElement('div');
    leftPart.className = 'flex items-center gap-8';

    // Logo
    const logoContainer = document.createElement('div');
    logoContainer.className = 'cursor-pointer hover:scale-110 transition-transform';
    logoContainer.innerHTML = `
        <div class="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1.5 shadow-lg">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="black"/>
                <path d="M2 17L12 22L22 17" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
    `;

    const menu = document.createElement('nav');
    menu.className = 'hidden lg:flex items-center gap-6 text-[13px] font-bold text-secondary';
    const items = [
        { label: t('nav.supercomputer'), page: 'supercomputer' },
        { label: t('nav.image'),   page: 'image' },
        { label: t('nav.video'),   page: 'video' },
        { label: t('nav.lipsync'), page: 'lipsync' },
        { label: t('nav.cinema'),  page: 'cinema' },
        { label: t('nav.workflows'), page: 'workflows' },
        { label: t('nav.agents'),  page: 'agents' },
        { label: t('nav.mcpcli'),  page: 'mcp-cli' },
    ];

    items.forEach(({ label, page }, idx) => {
        const link = document.createElement('a');
        link.textContent = label;
        link.className = `hover:text-fg transition-all cursor-pointer relative group ${idx === 0 ? 'text-fg' : ''}`;

        if (idx === 0) {
            const dot = document.createElement('div');
            dot.className = 'absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-accent rounded-full';
            link.appendChild(dot);
        }

        link.onclick = () => {
            Array.from(menu.children).forEach(child => child.classList.remove('text-fg'));
            link.classList.add('text-fg');
            navigate(page);
        };

        menu.appendChild(link);
    });

    leftPart.appendChild(logoContainer);
    leftPart.appendChild(menu);

    const rightPart = document.createElement('div');
    rightPart.className = 'flex items-center gap-4';

    const themeSelect = document.createElement('select');
    themeSelect.className = 'px-2 py-1.5 rounded-md border border-border-token bg-surface-2 text-[12px] font-bold text-dim hover:text-fg focus:outline-none focus:border-accent/50 cursor-pointer transition-colors';
    themeSelect.title = 'Theme';
    THEMES.forEach(({ id, name }) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        themeSelect.appendChild(option);
    });
    themeSelect.value = getTheme();
    themeSelect.onchange = () => {
        setTheme(themeSelect.value);
        applyTheme(themeSelect.value);
    };

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-md border border-border-token bg-surface-2 text-[13px] font-bold text-dim hover:text-fg hover:bg-surface hover:border-border-token transition-colors';
    settingsBtn.title = 'Settings — API key, local models, preferences';
    settingsBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>${t('nav.settings')}</span>
    `;
    settingsBtn.onclick = () => {
        document.body.appendChild(SettingsModal());
    };

    // Language toggle button
    const langBtn = document.createElement('button');
    const currentLang = getLang();
    langBtn.className = 'flex items-center px-3 py-1.5 rounded-md border border-border-token bg-surface-2 text-[13px] font-bold text-dim hover:text-fg hover:bg-surface hover:border-border-token transition-colors';
    langBtn.title = currentLang === 'zh' ? 'Switch to English' : '切换为中文';
    langBtn.textContent = currentLang === 'zh' ? 'EN' : '中文';
    langBtn.onclick = () => setLang(currentLang === 'zh' ? 'en' : 'zh');

    rightPart.appendChild(themeSelect);
    rightPart.appendChild(langBtn);
    rightPart.appendChild(settingsBtn);

    navBar.appendChild(leftPart);
    navBar.appendChild(rightPart);

    header.appendChild(navBar);

    return header;
}
