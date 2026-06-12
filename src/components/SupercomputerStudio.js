import { ClaudeProvider } from '../lib/agent/llmProvider.js';
import { buildToolRegistry } from '../lib/agent/tools.js';
import { Agent } from '../lib/agent/agentLoop.js';
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

    // --- Anthropic API key banner ---
    const keyBanner = document.createElement('div');
    keyBanner.className = 'shrink-0 mx-4 mb-3 max-w-2xl w-full self-center';
    container.appendChild(keyBanner);

    const renderKeyBanner = () => {
        if (localStorage.getItem('anthropic_key')) {
            keyBanner.classList.add('hidden');
            keyBanner.innerHTML = '';
            return;
        }
        keyBanner.classList.remove('hidden');
        keyBanner.innerHTML = `
            <div class="bg-[#111]/90 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">Anthropic API key required</p>
                    <p class="text-[11px] text-white/50">Paste your Anthropic API key to power the agent brain.</p>
                </div>
                <div class="flex gap-2 flex-1 sm:max-w-md">
                    <input type="password" id="anthropic-key-input"
                        placeholder="sk-ant-..."
                        class="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50">
                    <button id="anthropic-key-save"
                        class="shrink-0 bg-primary text-black font-bold px-4 py-2.5 rounded-xl text-sm hover:shadow-glow transition-all">
                        ${t('common.save')}
                    </button>
                </div>
            </div>
        `;
        keyBanner.querySelector('#anthropic-key-save').onclick = () => {
            const input = keyBanner.querySelector('#anthropic-key-input');
            const key = input.value.trim();
            if (key) {
                localStorage.setItem('anthropic_key', key);
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

    const appendPlanBlock = (text, toolCalls) => {
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
            label.textContent = 'Pending tool calls';
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
        appendRow(block);
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

    const handleEvent = (event) => {
        switch (event.type) {
            case 'plan':
                appendPlanBlock(event.text, event.toolCalls);
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
    textarea.placeholder = 'Describe your creative brief… e.g. "generate an image of a neon cyberpunk cat"';
    textarea.className = 'w-full bg-transparent border-none text-white text-base md:text-lg placeholder:text-muted focus:outline-none resize-none leading-relaxed min-h-[48px] max-h-[150px] overflow-y-auto custom-scrollbar px-2';
    textarea.rows = 1;
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    };

    const bottomRow = document.createElement('div');
    bottomRow.className = 'flex items-center justify-end px-2 pt-2 border-t border-white/5';

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
        if (!localStorage.getItem('anthropic_key')) {
            renderKeyBanner();
            keyBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        appendUserBubble(briefText);
        setRunning(true);

        try {
            const provider = new ClaudeProvider();
            const registry = buildToolRegistry();
            const agent = new Agent({
                provider,
                registry,
                onEvent: handleEvent,
            });
            await agent.run(briefText);
        } catch (err) {
            // error event already emitted by agent loop; ensure UI shows something
            if (!err.message?.includes('Anthropic API key')) {
                appendError(err.message || String(err));
            }
        } finally {
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

    bottomRow.appendChild(sendBtn);
    bar.appendChild(textarea);
    bar.appendChild(bottomRow);
    inputWrap.appendChild(bar);
    container.appendChild(inputWrap);

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
