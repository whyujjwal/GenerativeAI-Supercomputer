import { createProvider, PROVIDERS } from '../lib/agent/llmProvider.js';
import { buildToolRegistry } from '../lib/agent/tools.js';
import { buildConnectorTools } from '../lib/agent/connectorTools.js';
import * as backendClient from '../lib/agent/backendClient.js';
import { Agent } from '../lib/agent/agentLoop.js';
import { MemoryStore } from '../lib/agent/memory.js';
import { loadSkills } from '../lib/agent/skills.js';
import {
    getActivePersona,
    setActivePersona,
    clearActivePersona,
    listPersonas,
} from '../lib/agent/personas.js';
import {
    listMarketplaceSkills,
    listMarketplacePersonas,
    installSkill,
    uninstallSkill,
} from '../lib/agent/marketplace.js';
import { t } from '../lib/i18n.js';

function isVideoUrl(url) {
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function isImageUrl(url) {
    return /\.(jpg|jpeg|png|gif|webp|avif|bmp)(\?|$)/i.test(url);
}

function formatArgs(args) {
    if (!args || typeof args !== 'object') return '';
    try {
        return JSON.stringify(args, null, 2);
    } catch {
        return String(args);
    }
}

export function SupercomputerStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col bg-app-bg relative overflow-hidden';

    let running = false;

    // --- Hero ---
    const hero = document.createElement('div');
    hero.className = 'shrink-0 flex flex-col items-center pt-8 pb-4 px-4 animate-fade-in-up';
    hero.innerHTML = `
        <div class="mb-4 relative">
            <div class="absolute inset-0 bg-primary/20 blur-[80px] rounded-full opacity-40"></div>
            <div class="relative w-16 h-16 bg-teal-900/40 rounded-2xl flex items-center justify-center border border-white/5">
                <div class="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20 shadow-glow">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-primary">
                        <path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z"/>
                        <circle cx="9" cy="13" r="1" fill="currentColor"/>
                        <circle cx="15" cy="13" r="1" fill="currentColor"/>
                    </svg>
                </div>
            </div>
        </div>
        <h1 class="text-2xl md:text-4xl font-black text-white tracking-widest uppercase mb-1 text-center">${t('nav.supercomputer')}</h1>
        <p class="text-secondary text-sm font-medium opacity-60 text-center">Describe a creative brief — the agent plans and runs generation tools for you.</p>
    `;
    container.appendChild(hero);

    const BRAIN_STORAGE_KEY = 'supercomputer_brain';

    const getSelectedBrain = () => {
        const stored = localStorage.getItem(BRAIN_STORAGE_KEY);
        if (stored && PROVIDERS.some((p) => p.id === stored)) return stored;
        return 'claude';
    };

    const getProviderMeta = (brainId = getSelectedBrain()) =>
        PROVIDERS.find((p) => p.id === brainId) || PROVIDERS[0];

    let selectedBrain = getSelectedBrain();

    const memory = new MemoryStore();
    let skills = loadSkills();
    let activePersona = getActivePersona();

    let connectorStatus = { slack: false, google: false, notion: false };
    let backendReachable = false;

    const connectorNoteWrap = document.createElement('div');
    connectorNoteWrap.className = 'shrink-0 mx-4 mb-3 max-w-2xl w-full self-center hidden';
    container.appendChild(connectorNoteWrap);

    const showConnectorNote = (message, { tone = 'success' } = {}) => {
        const border =
            tone === 'error'
                ? 'border-red-500/30'
                : tone === 'info'
                  ? 'border-primary/30'
                  : 'border-green-500/30';
        const text =
            tone === 'error'
                ? 'text-red-300'
                : tone === 'info'
                  ? 'text-primary'
                  : 'text-green-300';
        connectorNoteWrap.className = `shrink-0 mx-4 mb-3 max-w-2xl w-full self-center`;
        connectorNoteWrap.innerHTML = `
            <div class="bg-[#111]/90 backdrop-blur-xl border ${border} rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <p class="text-sm ${text}">${escapeHtml(message)}</p>
                <button type="button" id="connector-note-close"
                    class="text-white/40 hover:text-white text-lg leading-none px-2 shrink-0">&times;</button>
            </div>
        `;
        connectorNoteWrap.querySelector('#connector-note-close').onclick = () => {
            connectorNoteWrap.classList.add('hidden');
        };
        connectorNoteWrap.classList.remove('hidden');
    };

    const refreshConnectorStatus = async () => {
        if (!backendClient.isConfigured()) {
            backendReachable = false;
            connectorStatus = { slack: false, google: false, notion: false };
            return connectorStatus;
        }

        const health = await backendClient.health();
        backendReachable = health?.ok === true;
        if (!backendReachable) {
            connectorStatus = { slack: false, google: false, notion: false };
            return connectorStatus;
        }

        const status = await backendClient.status();
        if (status?.disabled) {
            connectorStatus = { slack: false, google: false, notion: false };
            return connectorStatus;
        }

        connectorStatus = {
            slack: !!status.slack,
            google: !!status.google,
            notion: !!status.notion,
        };
        return connectorStatus;
    };

    const buildMergedRegistry = () => {
        const base = buildToolRegistry();
        if (!backendClient.isConfigured() || !backendReachable) {
            return base;
        }
        const connector = buildConnectorTools(connectorStatus);
        return {
            definitions: [...base.definitions, ...connector.definitions],
            handlers: { ...base.handlers, ...connector.handlers },
        };
    };

    const CONNECTOR_PROVIDERS = [
        { id: 'slack', label: 'Slack', description: 'Post messages to channels.' },
        { id: 'google', label: 'Google', description: 'Drive uploads and Gmail send.' },
        { id: 'notion', label: 'Notion', description: 'Create pages in your workspace.' },
    ];

    const updateBriefPlaceholder = () => {
        if (activePersona) {
            const hint = activePersona.skills?.[0] || '';
            textarea.placeholder = hint
                ? `${activePersona.tagline} — try ${hint} in your brief…`
                : `${activePersona.tagline} — describe your creative brief…`;
        } else {
            textarea.placeholder =
                'Describe your creative brief… e.g. "generate an image of a neon cyberpunk cat"';
        }
    };

    // --- Brand panel ---
    const brandPanelWrap = document.createElement('div');
    brandPanelWrap.className = 'shrink-0 mx-4 mb-3 max-w-2xl w-full self-center hidden';
    container.appendChild(brandPanelWrap);

    const BRAND_FIELDS = [
        { key: 'brandVoice', label: 'Brand voice', placeholder: 'Tone, vocabulary, do/don\'t say…' },
        { key: 'stylePreferences', label: 'Style preferences', placeholder: 'Color palette, mood, visual references…' },
        { key: 'audience', label: 'Audience', placeholder: 'Who is this content for?' },
        { key: 'persona', label: 'Persona', placeholder: 'Creator or brand character…' },
        { key: 'notes', label: 'Notes', placeholder: 'Anything else the agent should remember…' },
    ];

    const renderBrandPanel = () => {
        const brand = memory.getBrand();
        brandPanelWrap.innerHTML = `
            <div class="bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                <div class="flex items-center justify-between gap-2">
                    <p class="text-xs font-bold text-primary uppercase tracking-wider">Brand memory</p>
                    <button type="button" id="brand-panel-close"
                        class="text-white/40 hover:text-white text-lg leading-none px-2">&times;</button>
                </div>
                <p class="text-[11px] text-white/40">Saved locally — steers every agent run via system prompt.</p>
                <div class="flex flex-col gap-3" id="brand-fields"></div>
                <button type="button" id="brand-save"
                    class="self-end bg-primary text-black font-bold px-4 py-2 rounded-xl text-sm hover:shadow-glow transition-all">
                    ${t('common.save')}
                </button>
            </div>
        `;

        const fieldsWrap = brandPanelWrap.querySelector('#brand-fields');
        const fieldEls = {};
        BRAND_FIELDS.forEach(({ key, label, placeholder }) => {
            const group = document.createElement('div');
            group.className = 'flex flex-col gap-1';
            group.innerHTML = `
                <label class="text-[10px] font-bold text-white/50 uppercase tracking-widest">${escapeHtml(label)}</label>
                <textarea data-brand-key="${key}" rows="2"
                    placeholder="${escapeHtml(placeholder)}"
                    class="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50 resize-none custom-scrollbar">${escapeHtml(brand[key] || '')}</textarea>
            `;
            fieldEls[key] = group.querySelector('textarea');
            fieldsWrap.appendChild(group);
        });

        brandPanelWrap.querySelector('#brand-panel-close').onclick = () => {
            brandPanelWrap.classList.add('hidden');
        };

        brandPanelWrap.querySelector('#brand-save').onclick = () => {
            const payload = {};
            BRAND_FIELDS.forEach(({ key }) => {
                payload[key] = fieldEls[key].value;
            });
            memory.setBrand(payload);
            brandPanelWrap.querySelector('#brand-save').textContent = 'Saved ✓';
            setTimeout(() => {
                brandPanelWrap.querySelector('#brand-save').textContent = t('common.save');
            }, 1500);
        };
    };

    let brandPanelRendered = false;
    const toggleBrandPanel = () => {
        if (brandPanelWrap.classList.contains('hidden')) {
            if (!brandPanelRendered) {
                renderBrandPanel();
                brandPanelRendered = true;
            } else {
                renderBrandPanel();
            }
            brandPanelWrap.classList.remove('hidden');
        } else {
            brandPanelWrap.classList.add('hidden');
        }
    };

    // --- API key banner (adapts to selected brain) ---
    const keyBanner = document.createElement('div');
    keyBanner.className = 'shrink-0 mx-4 mb-3 max-w-2xl w-full self-center';
    container.appendChild(keyBanner);

    const KEY_BANNER_COPY = {
        claude: {
            title: 'Anthropic API key required',
            hint: 'Paste your Anthropic API key to power the agent brain.',
            placeholder: 'sk-ant-...',
        },
        openai: {
            title: 'OpenAI API key required',
            hint: 'Paste your OpenAI API key to power the agent brain.',
            placeholder: 'sk-...',
        },
        gemini: {
            title: 'Gemini API key required',
            hint: 'Paste your Google Gemini API key to power the agent brain.',
            placeholder: 'AIza...',
        },
    };

    const renderKeyBanner = () => {
        const meta = getProviderMeta(selectedBrain);
        if (localStorage.getItem(meta.keyStorageKey)) {
            keyBanner.classList.add('hidden');
            keyBanner.innerHTML = '';
            return;
        }
        const copy = KEY_BANNER_COPY[meta.id] || KEY_BANNER_COPY.claude;
        keyBanner.classList.remove('hidden');
        keyBanner.innerHTML = `
            <div class="bg-[#111]/90 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">${copy.title}</p>
                    <p class="text-[11px] text-white/50">${copy.hint}</p>
                </div>
                <div class="flex gap-2 flex-1 sm:max-w-md">
                    <input type="password" id="brain-key-input"
                        placeholder="${copy.placeholder}"
                        class="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50">
                    <button id="brain-key-save"
                        class="shrink-0 bg-primary text-black font-bold px-4 py-2.5 rounded-xl text-sm hover:shadow-glow transition-all">
                        ${t('common.save')}
                    </button>
                </div>
            </div>
        `;
        keyBanner.querySelector('#brain-key-save').onclick = () => {
            const input = keyBanner.querySelector('#brain-key-input');
            const key = input.value.trim();
            if (key) {
                localStorage.setItem(meta.keyStorageKey, key);
                renderKeyBanner();
            } else {
                input.classList.add('border-red-500/50');
                setTimeout(() => input.classList.remove('border-red-500/50'), 2000);
            }
        };
    };
    renderKeyBanner();

    // --- Transcript ---
    const transcriptWrap = document.createElement('div');
    transcriptWrap.className = 'flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 md:px-6 pb-4';
    const transcript = document.createElement('div');
    transcript.className = 'max-w-3xl mx-auto flex flex-col gap-3';
    transcriptWrap.appendChild(transcript);
    container.appendChild(transcriptWrap);

    const scrollToBottom = () => {
        transcriptWrap.scrollTop = transcriptWrap.scrollHeight;
    };

    const emptyHint = document.createElement('p');
    emptyHint.className = 'text-center text-white/25 text-sm py-8';
    emptyHint.textContent = 'Your agent transcript will appear here.';
    transcript.appendChild(emptyHint);

    const appendRow = (el) => {
        emptyHint.remove();
        transcript.appendChild(el);
        scrollToBottom();
    };

    const appendUserBubble = (text) => {
        const row = document.createElement('div');
        row.className = 'flex justify-end';
        row.innerHTML = `
            <div class="max-w-[85%] bg-primary/20 border border-primary/30 rounded-2xl rounded-br-md px-4 py-3 text-white text-sm leading-relaxed">
                ${escapeHtml(text)}
            </div>
        `;
        appendRow(row);
    };

    const appendAssistantBubble = (text) => {
        const row = document.createElement('div');
        row.className = 'flex justify-start';
        row.innerHTML = `
            <div class="max-w-[85%] bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3 text-white/90 text-sm leading-relaxed whitespace-pre-wrap">
                ${escapeHtml(text)}
            </div>
        `;
        appendRow(row);
    };

    const appendPlanBlock = (text, toolCalls, { awaitingApproval = false, onApprove, onCancel } = {}) => {
        const block = document.createElement('div');
        block.className = 'bg-[#111]/80 backdrop-blur border border-white/10 rounded-2xl p-4 flex flex-col gap-3';
        if (text) {
            const planText = document.createElement('p');
            planText.className = 'text-sm text-white/80 whitespace-pre-wrap leading-relaxed';
            planText.textContent = text;
            block.appendChild(planText);
        }
        if (toolCalls?.length) {
            const label = document.createElement('p');
            label.className = 'text-[10px] font-bold text-primary uppercase tracking-widest';
            label.textContent = awaitingApproval ? 'Approve plan before running tools' : 'Pending tool calls';
            block.appendChild(label);
            const list = document.createElement('ul');
            list.className = 'flex flex-col gap-2';
            toolCalls.forEach((tc) => {
                const item = document.createElement('li');
                item.className = 'bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono';
                item.innerHTML = `
                    <span class="text-primary font-bold">${escapeHtml(tc.name)}</span>
                    <pre class="text-white/50 mt-1 whitespace-pre-wrap break-all text-[10px]">${escapeHtml(formatArgs(tc.args))}</pre>
                `;
                list.appendChild(item);
            });
            block.appendChild(list);
        }
        if (awaitingApproval) {
            const costNote = document.createElement('p');
            costNote.className = 'text-[11px] text-white/40';
            costNote.textContent = 'Cost shown on the provider';
            block.appendChild(costNote);

            const actions = document.createElement('div');
            actions.className = 'flex gap-2 pt-1';
            const approveBtn = document.createElement('button');
            approveBtn.className = 'bg-primary text-black font-bold px-4 py-2 rounded-xl text-sm hover:shadow-glow transition-all';
            approveBtn.textContent = 'Approve';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'bg-white/10 text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-white/15 transition-all';
            cancelBtn.textContent = 'Cancel';
            approveBtn.onclick = () => {
                approveBtn.disabled = true;
                cancelBtn.disabled = true;
                onApprove?.();
            };
            cancelBtn.onclick = () => {
                approveBtn.disabled = true;
                cancelBtn.disabled = true;
                onCancel?.();
            };
            actions.appendChild(approveBtn);
            actions.appendChild(cancelBtn);
            block.appendChild(actions);
        }
        appendRow(block);
        return block;
    };

    const appendToolStart = (name) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2 text-sm text-white/50 px-2';
        row.innerHTML = `<span class="animate-spin text-primary">◌</span> running <span class="text-primary font-bold">${escapeHtml(name)}</span>…`;
        appendRow(row);
    };

    const appendToolResult = (name, result) => {
        const block = document.createElement('div');
        block.className = 'bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col gap-2';

        const header = document.createElement('p');
        header.className = 'text-[10px] font-bold uppercase tracking-widest';
        header.innerHTML = `<span class="text-white/40">${escapeHtml(name)}</span> → `;

        if (result?.ok && result.url) {
            header.innerHTML += '<span class="text-green-400">ok</span>';
            block.appendChild(header);

            if (isVideoUrl(result.url)) {
                const video = document.createElement('video');
                video.src = result.url;
                video.controls = true;
                video.className = 'max-h-48 rounded-xl border border-white/10';
                block.appendChild(video);
            } else if (isImageUrl(result.url)) {
                const img = document.createElement('img');
                img.src = result.url;
                img.alt = name;
                img.className = 'max-h-48 rounded-xl border border-white/10 object-contain';
                block.appendChild(img);
            } else {
                const link = document.createElement('a');
                link.href = result.url;
                link.target = '_blank';
                link.rel = 'noreferrer';
                link.className = 'text-xs text-primary hover:underline break-all';
                link.textContent = result.url;
                block.appendChild(link);
            }
        } else {
            header.innerHTML += `<span class="text-red-400">error</span>`;
            block.appendChild(header);
            if (result?.error) {
                const err = document.createElement('p');
                err.className = 'text-xs text-red-300/80';
                err.textContent = result.error;
                block.appendChild(err);
            }
        }
        appendRow(block);
    };

    const appendError = (message) => {
        const row = document.createElement('div');
        row.className = 'bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300';
        row.textContent = message;
        appendRow(row);
    };

    const appendCancelledBubble = () => {
        const row = document.createElement('div');
        row.className = 'bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-200';
        row.textContent = 'Plan cancelled — no tools were run.';
        appendRow(row);
    };

    const appendDoneBubble = (text) => {
        if (!text) return;
        const row = document.createElement('div');
        row.className = 'flex justify-start';
        row.innerHTML = `
            <div class="max-w-[85%] bg-primary/10 border border-primary/20 rounded-2xl px-4 py-3 text-white text-sm leading-relaxed whitespace-pre-wrap">
                <span class="text-[10px] font-bold text-primary uppercase tracking-widest block mb-1">Done</span>
                ${escapeHtml(text)}
            </div>
        `;
        appendRow(row);
    };

    let confirmPlanResolver = null;

    const handleEvent = (event) => {
        switch (event.type) {
            case 'plan':
                if (confirmPlanResolver) {
                    appendPlanBlock(event.text, event.toolCalls, {
                        awaitingApproval: true,
                        onApprove: () => confirmPlanResolver(true),
                        onCancel: () => confirmPlanResolver(false),
                    });
                } else {
                    appendPlanBlock(event.text, event.toolCalls);
                }
                break;
            case 'tool_start':
                appendToolStart(event.name);
                break;
            case 'tool_result':
                appendToolResult(event.name, event.result);
                break;
            case 'assistant':
                if (event.text) appendAssistantBubble(event.text);
                break;
            case 'error':
                appendError(event.message || 'Unknown error');
                break;
            case 'cancelled':
                appendCancelledBubble();
                break;
            case 'done':
                appendDoneBubble(event.text);
                break;
            default:
                break;
        }
    };

    // --- Input bar ---
    const inputWrap = document.createElement('div');
    inputWrap.className = 'shrink-0 p-4 md:p-6 border-t border-white/5 bg-black/40 backdrop-blur-md';

    const bar = document.createElement('div');
    bar.className = 'max-w-3xl mx-auto w-full bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2rem] p-3 md:p-4 flex flex-col gap-3 shadow-3xl';

    const textarea = document.createElement('textarea');
    textarea.className = 'w-full bg-transparent border-none text-white text-base md:text-lg placeholder:text-muted focus:outline-none resize-none leading-relaxed min-h-[48px] max-h-[150px] overflow-y-auto custom-scrollbar px-2';
    textarea.rows = 1;
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    };

    const bottomRow = document.createElement('div');
    bottomRow.className = 'flex items-center justify-between gap-3 px-2 pt-2 border-t border-white/5';

    const leftControls = document.createElement('div');
    leftControls.className = 'flex items-center gap-2 flex-wrap';

    const brandBtn = document.createElement('button');
    brandBtn.type = 'button';
    brandBtn.title = 'Brand memory';
    brandBtn.className = 'bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white/70 text-xs font-bold uppercase tracking-wider hover:border-primary/50 hover:text-white transition-all';
    brandBtn.textContent = '⚙ Brand';
    brandBtn.onclick = toggleBrandPanel;

    const skillsWrap = document.createElement('div');
    skillsWrap.className = 'relative';

    const skillsBtn = document.createElement('button');
    skillsBtn.type = 'button';
    skillsBtn.className = 'bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white/70 text-xs font-bold uppercase tracking-wider hover:border-primary/50 hover:text-white transition-all';
    skillsBtn.textContent = 'Skills';

    const skillsMenu = document.createElement('div');
    skillsMenu.className = 'hidden absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-y-auto custom-scrollbar bg-[#111]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-3xl z-50';

    const skillsHint = document.createElement('p');
    skillsHint.className = 'text-[10px] text-white/40 px-2 py-1 border-b border-white/5 mb-1';
    skillsHint.textContent = 'Type /trigger in your brief to invoke a skill';
    skillsMenu.appendChild(skillsHint);

    const skillsListEl = document.createElement('div');
    skillsListEl.id = 'skills-menu-list';
    skillsMenu.appendChild(skillsListEl);

    const renderSkillsMenu = () => {
        skills = loadSkills();
        skillsListEl.innerHTML = '';
        skills.forEach((skill) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 transition-all';
            item.innerHTML = `
                <span class="text-primary font-bold text-xs">${escapeHtml(skill.trigger)}</span>
                <span class="block text-[11px] text-white/50 mt-0.5">${escapeHtml(skill.description)}</span>
            `;
            item.onclick = () => {
                const current = textarea.value.trim();
                textarea.value = current ? `${current} ${skill.trigger} ` : `${skill.trigger} `;
                textarea.focus();
                textarea.dispatchEvent(new Event('input'));
                skillsMenu.classList.add('hidden');
            };
            skillsListEl.appendChild(item);
        });
    };
    renderSkillsMenu();

    skillsBtn.onclick = (e) => {
        e.stopPropagation();
        skillsMenu.classList.toggle('hidden');
    };

    document.addEventListener('click', () => skillsMenu.classList.add('hidden'));
    skillsWrap.addEventListener('click', (e) => e.stopPropagation());
    skillsWrap.appendChild(skillsBtn);
    skillsWrap.appendChild(skillsMenu);

    leftControls.appendChild(brandBtn);
    leftControls.appendChild(skillsWrap);

    const marketplaceBtn = document.createElement('button');
    marketplaceBtn.type = 'button';
    marketplaceBtn.className = 'bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white/70 text-xs font-bold uppercase tracking-wider hover:border-primary/50 hover:text-white transition-all';
    marketplaceBtn.textContent = 'Marketplace';
    leftControls.appendChild(marketplaceBtn);

    const personaWrap = document.createElement('div');
    personaWrap.className = 'relative';

    const personaBtn = document.createElement('button');
    personaBtn.type = 'button';
    personaBtn.className = 'bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white/70 text-xs font-bold tracking-wider hover:border-primary/50 hover:text-white transition-all flex items-center gap-1.5 max-w-[11rem] truncate';
    personaBtn.title = 'Active persona';

    const personaMenu = document.createElement('div');
    personaMenu.className = 'hidden absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-y-auto custom-scrollbar bg-[#111]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-3xl z-50';

    const renderPersonaBtn = () => {
        if (activePersona) {
            personaBtn.innerHTML = `<span>${activePersona.emoji}</span><span class="truncate">${escapeHtml(activePersona.name)}</span>`;
        } else {
            personaBtn.textContent = 'No persona';
        }
    };

    const renderPersonaMenu = () => {
        personaMenu.innerHTML = '';
        const hint = document.createElement('p');
        hint.className = 'text-[10px] text-white/40 px-2 py-1 border-b border-white/5 mb-1';
        hint.textContent = 'Select an AI employee persona';
        personaMenu.appendChild(hint);

        const noneItem = document.createElement('button');
        noneItem.type = 'button';
        noneItem.className = `w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 transition-all ${!activePersona ? 'bg-primary/10 border border-primary/20' : ''}`;
        noneItem.innerHTML = '<span class="text-white/70 text-xs font-bold">No persona</span>';
        noneItem.onclick = () => {
            clearActivePersona();
            activePersona = null;
            renderPersonaBtn();
            updateBriefPlaceholder();
            personaMenu.classList.add('hidden');
        };
        personaMenu.appendChild(noneItem);

        listPersonas().forEach((persona) => {
            const item = document.createElement('button');
            item.type = 'button';
            const isActive = activePersona?.id === persona.id;
            item.className = `w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 transition-all ${isActive ? 'bg-primary/10 border border-primary/20' : ''}`;
            item.innerHTML = `
                <span class="text-white text-xs font-bold">${persona.emoji} ${escapeHtml(persona.name)}</span>
                <span class="block text-[11px] text-white/50 mt-0.5">${escapeHtml(persona.tagline)}</span>
            `;
            item.onclick = () => {
                setActivePersona(persona.id);
                activePersona = getActivePersona();
                renderPersonaBtn();
                updateBriefPlaceholder();
                personaMenu.classList.add('hidden');
            };
            personaMenu.appendChild(item);
        });
    };

    renderPersonaBtn();
    renderPersonaMenu();
    personaBtn.onclick = (e) => {
        e.stopPropagation();
        renderPersonaMenu();
        personaMenu.classList.toggle('hidden');
    };
    personaWrap.addEventListener('click', (e) => e.stopPropagation());
    personaWrap.appendChild(personaBtn);
    personaWrap.appendChild(personaMenu);

    const marketplaceOverlay = document.createElement('div');
    marketplaceOverlay.className = 'hidden fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm';

    const marketplaceModal = document.createElement('div');
    marketplaceModal.className = 'bg-[#111]/95 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-3xl';

    let marketplaceTab = 'personas';

    const renderConnectorsPanel = (content) => {
        const backendUrl = backendClient.getBackendUrl();
        const reachabilityNote = backendClient.isConfigured()
            ? backendReachable
                ? '<p class="text-[11px] text-green-400/80">Backend reachable — connector tools active for connected providers.</p>'
                : '<p class="text-[11px] text-amber-400/80">Backend URL saved but server is unreachable. Check the URL and that the server is running.</p>'
            : '<p class="text-[11px] text-white/40">Optional — leave empty to use Phase 4 behavior without connectors.</p>';

        content.innerHTML = `
            <div class="flex flex-col gap-2">
                <label class="text-[10px] font-bold text-white/50 uppercase tracking-widest">Backend URL</label>
                <div class="flex gap-2">
                    <input type="url" id="connector-backend-url"
                        placeholder="http://localhost:3001"
                        value="${escapeHtml(backendUrl)}"
                        class="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50">
                    <button type="button" id="connector-backend-save"
                        class="shrink-0 bg-primary text-black font-bold px-4 py-2 rounded-xl text-sm hover:shadow-glow transition-all">
                        ${t('common.save')}
                    </button>
                </div>
                ${reachabilityNote}
            </div>
            <div id="connector-providers" class="flex flex-col gap-3 mt-2"></div>
        `;

        content.querySelector('#connector-backend-save').onclick = async () => {
            const input = content.querySelector('#connector-backend-url');
            backendClient.setBackendUrl(input.value);
            await refreshConnectorStatus();
            renderConnectorsPanel(content);
        };

        const providersWrap = content.querySelector('#connector-providers');

        if (!backendClient.isConfigured()) {
            const hint = document.createElement('p');
            hint.className = 'text-[11px] text-white/40';
            hint.textContent = 'Set a backend URL above to connect Slack, Google, or Notion.';
            providersWrap.appendChild(hint);
            return;
        }

        CONNECTOR_PROVIDERS.forEach((provider) => {
            const connected = !!connectorStatus[provider.id];
            const row = document.createElement('div');
            row.className = 'bg-white/5 border border-white/10 rounded-xl p-3 flex items-start justify-between gap-3';
            row.innerHTML = `
                <div class="min-w-0 flex-1">
                    <p class="text-white text-sm font-bold">${escapeHtml(provider.label)}</p>
                    <p class="text-[11px] text-white/50 mt-0.5">${escapeHtml(provider.description)}</p>
                    <p class="text-[10px] mt-1 font-bold uppercase tracking-widest ${connected ? 'text-green-400' : 'text-white/30'}">
                        ${connected ? 'Connected' : 'Not connected'}
                    </p>
                </div>
                <div class="shrink-0 flex flex-col gap-1.5"></div>
            `;
            const actions = row.querySelector('.shrink-0');

            if (connected) {
                const disconnectBtn = document.createElement('button');
                disconnectBtn.type = 'button';
                disconnectBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20 transition-all';
                disconnectBtn.textContent = 'Disconnect';
                disconnectBtn.onclick = async () => {
                    disconnectBtn.disabled = true;
                    const res = await backendClient.disconnect(provider.id);
                    if (res.ok) {
                        await refreshConnectorStatus();
                        renderConnectorsPanel(content);
                    } else {
                        disconnectBtn.disabled = false;
                        showConnectorNote(res.error || 'Failed to disconnect', { tone: 'error' });
                    }
                };
                actions.appendChild(disconnectBtn);
            } else {
                const connectBtn = document.createElement('button');
                connectBtn.type = 'button';
                connectBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white hover:bg-primary/20 hover:text-primary hover:border-primary/30 transition-all';
                connectBtn.textContent = 'Connect';
                connectBtn.onclick = () => {
                    const url = backendClient.oauthUrl(provider.id);
                    if (url) {
                        window.open(url, '_blank', 'noopener,noreferrer');
                    }
                };
                actions.appendChild(connectBtn);
            }

            providersWrap.appendChild(row);
        });
    };

    const renderMarketplaceModal = () => {
        marketplaceModal.innerHTML = `
            <div class="flex items-center justify-between gap-2 p-4 border-b border-white/10">
                <p class="text-xs font-bold text-primary uppercase tracking-wider">Marketplace</p>
                <button type="button" id="marketplace-close"
                    class="text-white/40 hover:text-white text-lg leading-none px-2">&times;</button>
            </div>
            <div class="flex gap-1 p-2 border-b border-white/5">
                <button type="button" data-tab="personas"
                    class="flex-1 px-2 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${marketplaceTab === 'personas' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-white/50 hover:text-white hover:bg-white/5'}">
                    Personas
                </button>
                <button type="button" data-tab="skills"
                    class="flex-1 px-2 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${marketplaceTab === 'skills' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-white/50 hover:text-white hover:bg-white/5'}">
                    Skills
                </button>
                <button type="button" data-tab="connectors"
                    class="flex-1 px-2 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${marketplaceTab === 'connectors' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-white/50 hover:text-white hover:bg-white/5'}">
                    Connectors
                </button>
            </div>
            <div id="marketplace-content" class="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3"></div>
        `;

        marketplaceModal.querySelector('#marketplace-close').onclick = () => {
            marketplaceOverlay.classList.add('hidden');
        };

        marketplaceModal.querySelectorAll('[data-tab]').forEach((tabBtn) => {
            tabBtn.onclick = () => {
                marketplaceTab = tabBtn.dataset.tab;
                renderMarketplaceModal();
            };
        });

        const content = marketplaceModal.querySelector('#marketplace-content');

        if (marketplaceTab === 'connectors') {
            renderConnectorsPanel(content);
        } else if (marketplaceTab === 'personas') {
            listMarketplacePersonas().forEach((persona) => {
                const card = document.createElement('div');
                card.className = 'bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2';
                const skillTags = (persona.skills || [])
                    .map((s) => `<span class="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-lg font-bold">${escapeHtml(s)}</span>`)
                    .join(' ');
                card.innerHTML = `
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <p class="text-white text-sm font-bold">${persona.emoji} ${escapeHtml(persona.name)}</p>
                            <p class="text-[11px] text-white/50 mt-0.5">${escapeHtml(persona.tagline)}</p>
                        </div>
                        <button type="button" class="persona-activate shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${persona.active ? 'bg-primary/20 text-primary border border-primary/30 cursor-default' : 'bg-white/10 text-white hover:bg-white/15'}">
                            ${persona.active ? 'Active' : 'Activate'}
                        </button>
                    </div>
                    <p class="text-[11px] text-white/40 leading-relaxed">${escapeHtml(persona.description)}</p>
                    <div class="flex flex-wrap gap-1">${skillTags}</div>
                `;
                const activateBtn = card.querySelector('.persona-activate');
                if (!persona.active) {
                    activateBtn.onclick = () => {
                        setActivePersona(persona.id);
                        activePersona = getActivePersona();
                        renderPersonaBtn();
                        renderPersonaMenu();
                        updateBriefPlaceholder();
                        renderMarketplaceModal();
                    };
                }
                content.appendChild(card);
            });
        } else {
            listMarketplaceSkills().forEach((skill) => {
                const row = document.createElement('div');
                row.className = 'bg-white/5 border border-white/10 rounded-xl p-3 flex items-start justify-between gap-3';
                const builtinBadge = skill.builtin
                    ? '<span class="text-[9px] uppercase tracking-widest text-white/30 font-bold">Built-in</span>'
                    : '';
                row.innerHTML = `
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-primary font-bold text-xs">${escapeHtml(skill.trigger)}</span>
                            ${builtinBadge}
                        </div>
                        <p class="text-[11px] text-white/50 mt-1 leading-relaxed">${escapeHtml(skill.description)}</p>
                    </div>
                    <button type="button" class="skill-toggle shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"></button>
                `;
                const toggleBtn = row.querySelector('.skill-toggle');
                if (skill.builtin) {
                    toggleBtn.textContent = 'Built-in';
                    toggleBtn.className += ' bg-white/5 text-white/30 cursor-default';
                } else if (skill.installed) {
                    toggleBtn.textContent = 'Installed';
                    toggleBtn.className += ' bg-primary/20 text-primary border border-primary/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30';
                    toggleBtn.onclick = () => {
                        uninstallSkill(skill.trigger);
                        renderSkillsMenu();
                        renderMarketplaceModal();
                    };
                } else {
                    toggleBtn.textContent = 'Install';
                    toggleBtn.className += ' bg-white/10 text-white hover:bg-primary/20 hover:text-primary hover:border-primary/30';
                    toggleBtn.onclick = () => {
                        installSkill(skill);
                        renderSkillsMenu();
                        renderMarketplaceModal();
                    };
                }
                content.appendChild(row);
            });
        }
    };

    marketplaceOverlay.appendChild(marketplaceModal);
    marketplaceOverlay.onclick = (e) => {
        if (e.target === marketplaceOverlay) marketplaceOverlay.classList.add('hidden');
    };
    marketplaceModal.onclick = (e) => e.stopPropagation();
    container.appendChild(marketplaceOverlay);

    marketplaceBtn.onclick = () => {
        renderMarketplaceModal();
        marketplaceOverlay.classList.remove('hidden');
    };

    document.addEventListener('click', () => personaMenu.classList.add('hidden'));

    const brainSelect = document.createElement('select');
    brainSelect.className = 'bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-bold uppercase tracking-wider focus:outline-none focus:border-primary/50 cursor-pointer';
    brainSelect.title = 'Agent brain';
    for (const provider of PROVIDERS) {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.label;
        brainSelect.appendChild(option);
    }
    brainSelect.value = selectedBrain;
    brainSelect.onchange = () => {
        selectedBrain = brainSelect.value;
        localStorage.setItem(BRAIN_STORAGE_KEY, selectedBrain);
        renderKeyBanner();
    };

    const sendBtn = document.createElement('button');
    sendBtn.className = 'bg-primary text-black px-6 md:px-8 py-3 rounded-xl md:rounded-[1.25rem] font-black text-sm md:text-base hover:shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100';
    sendBtn.textContent = 'Send';

    const setRunning = (value) => {
        running = value;
        sendBtn.disabled = value;
        textarea.disabled = value;
        sendBtn.textContent = value ? t('common.generating') : 'Send';
    };

    const runAgent = async (briefText) => {
        const meta = getProviderMeta(selectedBrain);
        if (!localStorage.getItem(meta.keyStorageKey)) {
            renderKeyBanner();
            keyBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        appendUserBubble(briefText);
        setRunning(true);

        try {
            const provider = createProvider(selectedBrain);
            const registry = buildMergedRegistry();
            memory.setWorking({ ...memory.getWorking(), brain: selectedBrain });
            const agent = new Agent({
                provider,
                registry,
                memory,
                skills: loadSkills(),
                persona: activePersona,
                onEvent: handleEvent,
                confirmPlan: (plan) =>
                    new Promise((resolve) => {
                        confirmPlanResolver = resolve;
                        handleEvent({ type: 'plan', text: plan.text, toolCalls: plan.toolCalls });
                    }),
            });
            await agent.run(briefText);
        } catch (err) {
            // error event already emitted by agent loop; ensure UI shows something
            if (!err.message?.includes('API key')) {
                appendError(err.message || String(err));
            }
        } finally {
            confirmPlanResolver = null;
            setRunning(false);
        }
    };

    sendBtn.onclick = () => {
        if (running) return;
        const briefText = textarea.value.trim();
        if (!briefText) return;
        textarea.value = '';
        textarea.style.height = 'auto';
        runAgent(briefText);
    };

    textarea.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    };

    leftControls.appendChild(personaWrap);
    leftControls.appendChild(brainSelect);
    bottomRow.appendChild(leftControls);
    updateBriefPlaceholder();
    bottomRow.appendChild(sendBtn);
    bar.appendChild(textarea);
    bar.appendChild(bottomRow);
    inputWrap.appendChild(bar);
    container.appendChild(inputWrap);

    (async () => {
        if (backendClient.isConfigured()) {
            await refreshConnectorStatus();
        }

        const params = new URLSearchParams(window.location.search);
        const connected = params.get('connected');
        const oauthError = params.get('oauth_error');

        if (connected) {
            await refreshConnectorStatus();
            const label = CONNECTOR_PROVIDERS.find((p) => p.id === connected)?.label || connected;
            showConnectorNote(`${label} connected successfully.`, { tone: 'success' });
            const url = new URL(window.location.href);
            url.searchParams.delete('connected');
            window.history.replaceState({}, '', url);
        } else if (oauthError) {
            showConnectorNote(`OAuth failed: ${oauthError}`, { tone: 'error' });
            const url = new URL(window.location.href);
            url.searchParams.delete('oauth_error');
            window.history.replaceState({}, '', url);
        }
    })();

    return container;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
