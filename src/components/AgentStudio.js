import { createProvider, PROVIDERS } from '../lib/agent/llmProvider.js';
import { buildToolRegistry } from '../lib/agent/tools.js';
import { buildConnectorTools } from '../lib/agent/connectorTools.js';
import * as backendClient from '../lib/agent/backendClient.js';
import { Agent } from '../lib/agent/agentLoop.js';
import { listAgents, getAgent, saveAgent, deleteAgent } from '../lib/agentStore.js';
import { t2iModels, t2vModels } from '../lib/models.js';
import { t } from '../lib/i18n.js';

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

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

function getProviderMeta(brainId) {
    return PROVIDERS.find((p) => p.id === brainId) || PROVIDERS[0];
}

function defaultAgent() {
    return {
        name: 'New Agent',
        emoji: '🤖',
        instructions: '',
        brain: 'claude',
        model: '',
        tools: 'all',
        imageModel: '',
        videoModel: '',
    };
}

function getEditorToolDefinitions() {
    const base = buildToolRegistry().definitions;
    if (!backendClient.isConfigured()) {
        return base;
    }
    const connector = buildConnectorTools({ slack: true, google: true, notion: true });
    return [...base, ...connector.definitions];
}

const KEY_BANNER_COPY = {
    claude: {
        title: 'Anthropic API key required',
        hint: 'Paste your Anthropic API key to run this agent.',
        placeholder: 'sk-ant-...',
    },
    openai: {
        title: 'OpenAI API key required',
        hint: 'Paste your OpenAI API key to run this agent.',
        placeholder: 'sk-...',
    },
    gemini: {
        title: 'Gemini API key required',
        hint: 'Paste your Google Gemini API key to run this agent.',
        placeholder: 'AIza...',
    },
};

export function AgentStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex bg-bg text-fg overflow-hidden';

    let selectedId = null;
    let activeTab = 'edit';
    let running = false;
    let connectorStatus = { slack: false, google: false, notion: false };
    let backendReachable = false;

    const leftPane = document.createElement('div');
    leftPane.className =
        'shrink-0 w-56 md:w-64 border-r border-border-token bg-surface flex flex-col';

    const listHeader = document.createElement('div');
    listHeader.className = 'shrink-0 p-3 border-b border-border-token flex flex-col gap-2';
    listHeader.innerHTML = `
        <p class="text-xs font-bold text-accent uppercase tracking-wider">${escapeHtml(t('agents.title'))}</p>
    `;

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className =
        'w-full bg-accent text-accent-contrast font-bold px-3 py-2 rounded-xl text-sm hover:shadow-glow transition-all';
    newBtn.textContent = 'New Agent';
    listHeader.appendChild(newBtn);

    const agentList = document.createElement('div');
    agentList.className = 'flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1';

    leftPane.appendChild(listHeader);
    leftPane.appendChild(agentList);

    const rightPane = document.createElement('div');
    rightPane.className = 'flex-1 min-w-0 flex flex-col overflow-hidden';

    container.appendChild(leftPane);
    container.appendChild(rightPane);

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

    const buildRegistryForAgent = (agent) => {
        const base = buildToolRegistry();
        let definitions = base.definitions;
        let handlers = { ...base.handlers };

        if (agent.tools !== 'all' && Array.isArray(agent.tools)) {
            const allowed = new Set(agent.tools);
            definitions = definitions.filter((d) => allowed.has(d.name));
            handlers = Object.fromEntries(
                Object.entries(handlers).filter(([name]) => allowed.has(name))
            );
        }

        if (backendClient.isConfigured() && backendReachable) {
            const connector = buildConnectorTools(connectorStatus);
            if (agent.tools !== 'all' && Array.isArray(agent.tools)) {
                const allowed = new Set(agent.tools);
                const connDefs = connector.definitions.filter((d) => allowed.has(d.name));
                const connHandlers = Object.fromEntries(
                    Object.entries(connector.handlers).filter(([name]) => allowed.has(name))
                );
                definitions = [...definitions, ...connDefs];
                handlers = { ...handlers, ...connHandlers };
            } else {
                definitions = [...definitions, ...connector.definitions];
                handlers = { ...handlers, ...connector.handlers };
            }
        }

        return { definitions, handlers };
    };

    const renderAgentList = () => {
        const agents = listAgents();
        agentList.innerHTML = '';

        if (!agents.length) {
            const empty = document.createElement('p');
            empty.className = 'text-[11px] text-muted text-center py-4 px-2';
            empty.textContent = 'No saved agents yet.';
            agentList.appendChild(empty);
            return;
        }

        agents.forEach((agent) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const isActive = agent.id === selectedId;
            btn.className = `w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2 ${
                isActive
                    ? 'bg-accent/15 border border-accent/30 text-fg'
                    : 'hover:bg-surface-2 text-dim border border-transparent'
            }`;
            btn.innerHTML = `
                <span class="text-lg shrink-0">${escapeHtml(agent.emoji || '🤖')}</span>
                <span class="text-sm font-bold truncate">${escapeHtml(agent.name || 'Untitled')}</span>
            `;
            btn.onclick = () => {
                selectedId = agent.id;
                renderAgentList();
                renderRightPane();
            };
            agentList.appendChild(btn);
        });
    };

    const renderEmptyRight = () => {
        rightPane.innerHTML = `
            <div class="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <p class="text-muted text-sm">Select an agent or create a new one.</p>
            </div>
        `;
    };

    const renderRightPane = () => {
        const agent = selectedId ? getAgent(selectedId) : null;
        if (!agent) {
            renderEmptyRight();
            return;
        }

        rightPane.innerHTML = '';

        const header = document.createElement('div');
        header.className =
            'shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-border-token bg-surface';

        const titleEl = document.createElement('p');
        titleEl.className = 'text-sm font-bold text-fg truncate';
        titleEl.textContent = `${agent.emoji || '🤖'} ${agent.name || 'Untitled'}`;

        const tabWrap = document.createElement('div');
        tabWrap.className = 'flex gap-1 shrink-0';

        const editTabBtn = document.createElement('button');
        editTabBtn.type = 'button';
        editTabBtn.textContent = 'Edit';
        editTabBtn.className = `px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeTab === 'edit'
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'text-muted hover:text-fg hover:bg-surface-2'
        }`;

        const runTabBtn = document.createElement('button');
        runTabBtn.type = 'button';
        runTabBtn.textContent = 'Run';
        runTabBtn.className = `px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeTab === 'run'
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'text-muted hover:text-fg hover:bg-surface-2'
        }`;

        editTabBtn.onclick = () => {
            activeTab = 'edit';
            renderRightPane();
        };
        runTabBtn.onclick = () => {
            activeTab = 'run';
            renderRightPane();
        };

        tabWrap.appendChild(editTabBtn);
        tabWrap.appendChild(runTabBtn);
        header.appendChild(titleEl);
        header.appendChild(tabWrap);
        rightPane.appendChild(header);

        const content = document.createElement('div');
        content.className = 'flex-1 min-h-0 overflow-hidden flex flex-col';
        rightPane.appendChild(content);

        if (activeTab === 'edit') {
            renderEditTab(content, agent);
        } else {
            renderRunTab(content, agent);
        }
    };

    const renderEditTab = (content, agent) => {
        const scroll = document.createElement('div');
        scroll.className = 'flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4';

        const providerMeta = getProviderMeta(agent.brain || 'claude');
        const toolDefs = getEditorToolDefinitions();
        const selectedTools = agent.tools === 'all' ? null : new Set(agent.tools || []);

        scroll.innerHTML = `
            <div class="flex flex-col sm:flex-row gap-3">
                <div class="flex flex-col gap-1.5 sm:w-24">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Emoji</label>
                    <input type="text" id="agent-emoji" maxlength="4" value="${escapeHtml(agent.emoji || '🤖')}"
                        class="w-full bg-surface-2 border border-border-token rounded-xl px-3 py-2 text-fg text-center text-lg focus:outline-none focus:border-accent/50">
                </div>
                <div class="flex flex-col gap-1.5 flex-1">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Name</label>
                    <input type="text" id="agent-name" value="${escapeHtml(agent.name || '')}"
                        class="w-full bg-surface-2 border border-border-token rounded-xl px-3 py-2 text-fg text-sm focus:outline-none focus:border-accent/50">
                </div>
            </div>
            <div class="flex flex-col gap-1.5">
                <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Instructions</label>
                <textarea id="agent-instructions" rows="6"
                    placeholder="System prompt / persona for this agent…"
                    class="w-full bg-surface-2 border border-border-token rounded-xl px-3 py-2 text-fg text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none custom-scrollbar">${escapeHtml(agent.instructions || '')}</textarea>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Brain</label>
                    <select id="agent-brain"
                        class="bg-surface-2 border border-border-token rounded-xl px-3 py-2 text-fg text-xs font-bold uppercase tracking-wider focus:outline-none focus:border-accent/50 cursor-pointer">
                        ${PROVIDERS.map(
                            (p) =>
                                `<option value="${p.id}" ${p.id === (agent.brain || 'claude') ? 'selected' : ''}>${escapeHtml(p.label)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="flex flex-col gap-1.5">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Model</label>
                    <input type="text" id="agent-model" list="agent-model-list"
                        placeholder="${escapeHtml(providerMeta.defaultModel)}"
                        value="${escapeHtml(agent.model || '')}"
                        class="w-full bg-surface-2 border border-border-token rounded-xl px-3 py-2 text-fg text-sm placeholder:text-muted focus:outline-none focus:border-accent/50">
                    <datalist id="agent-model-list">
                        ${providerMeta.knownModels.map((m) => `<option value="${escapeHtml(m)}">`).join('')}
                    </datalist>
                </div>
            </div>
            <div class="flex flex-col gap-1.5">
                <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Image model</label>
                <select id="agent-image-model"
                    class="bg-surface-2 border border-border-token rounded-xl px-3 py-2 text-fg text-sm focus:outline-none focus:border-accent/50 cursor-pointer">
                    <option value="" ${!agent.imageModel ? 'selected' : ''}>Auto (agent picks)</option>
                    ${t2iModels
                        .map(
                            (m) =>
                                `<option value="${escapeHtml(m.id)}" ${m.id === agent.imageModel ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
                        )
                        .join('')}
                </select>
            </div>
            <div class="flex flex-col gap-1.5">
                <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Video model</label>
                <select id="agent-video-model"
                    class="bg-surface-2 border border-border-token rounded-xl px-3 py-2 text-fg text-sm focus:outline-none focus:border-accent/50 cursor-pointer">
                    <option value="" ${!agent.videoModel ? 'selected' : ''}>Auto (agent picks)</option>
                    ${t2vModels
                        .map(
                            (m) =>
                                `<option value="${escapeHtml(m.id)}" ${m.id === agent.videoModel ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
                        )
                        .join('')}
                </select>
            </div>
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Tools</label>
                    <label class="flex items-center gap-2 text-xs text-dim cursor-pointer">
                        <input type="checkbox" id="agent-tools-all" ${agent.tools === 'all' ? 'checked' : ''}
                            class="rounded border-border-token bg-surface-2 text-accent focus:ring-accent/50">
                        All tools
                    </label>
                </div>
                <div id="agent-tools-list" class="grid grid-cols-1 sm:grid-cols-2 gap-2 ${agent.tools === 'all' ? 'opacity-50 pointer-events-none' : ''}"></div>
            </div>
        `;

        const toolsList = scroll.querySelector('#agent-tools-list');
        toolDefs.forEach((def) => {
            const label = document.createElement('label');
            label.className =
                'flex items-start gap-2 bg-surface-2 border border-border-token rounded-xl px-3 py-2 cursor-pointer hover:border-accent/30 transition-all';
            const checked =
                agent.tools === 'all' || (selectedTools && selectedTools.has(def.name));
            label.innerHTML = `
                <input type="checkbox" class="agent-tool-cb mt-0.5 rounded border-border-token bg-surface text-accent focus:ring-accent/50"
                    data-name="${escapeHtml(def.name)}" ${checked ? 'checked' : ''}>
                <span class="min-w-0">
                    <span class="text-xs font-bold text-accent block">${escapeHtml(def.name)}</span>
                    <span class="text-[10px] text-muted line-clamp-2">${escapeHtml(def.description)}</span>
                </span>
            `;
            toolsList.appendChild(label);
        });

        const toolsAllCb = scroll.querySelector('#agent-tools-all');
        const toolsListWrap = scroll.querySelector('#agent-tools-list');
        toolsAllCb.onchange = () => {
            if (toolsAllCb.checked) {
                toolsListWrap.classList.add('opacity-50', 'pointer-events-none');
            } else {
                toolsListWrap.classList.remove('opacity-50', 'pointer-events-none');
            }
        };

        const brainSelect = scroll.querySelector('#agent-brain');
        brainSelect.onchange = () => {
            const meta = getProviderMeta(brainSelect.value);
            const modelInput = scroll.querySelector('#agent-model');
            const datalist = scroll.querySelector('#agent-model-list');
            modelInput.placeholder = meta.defaultModel;
            datalist.innerHTML = meta.knownModels
                .map((m) => `<option value="${escapeHtml(m)}">`)
                .join('');
        };

        const actions = document.createElement('div');
        actions.className = 'shrink-0 flex gap-2 justify-end p-4 border-t border-border-token bg-surface';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className =
            'px-4 py-2 rounded-xl text-sm font-bold bg-surface-2 text-dim border border-border-token hover:border-accent/30 hover:text-fg transition-all';
        deleteBtn.textContent = 'Delete';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className =
            'bg-accent text-accent-contrast font-bold px-4 py-2 rounded-xl text-sm hover:shadow-glow transition-all';
        saveBtn.textContent = t('common.save');

        const collectAgent = () => {
            const toolsAll = scroll.querySelector('#agent-tools-all').checked;
            let tools;
            if (toolsAll) {
                tools = 'all';
            } else {
                tools = [...scroll.querySelectorAll('.agent-tool-cb:checked')].map(
                    (cb) => cb.dataset.name
                );
            }

            return {
                id: agent.id,
                name: scroll.querySelector('#agent-name').value.trim() || 'Untitled',
                emoji: scroll.querySelector('#agent-emoji').value.trim() || '🤖',
                instructions: scroll.querySelector('#agent-instructions').value,
                brain: scroll.querySelector('#agent-brain').value,
                model: scroll.querySelector('#agent-model').value.trim(),
                tools,
                imageModel: scroll.querySelector('#agent-image-model').value,
                videoModel: scroll.querySelector('#agent-video-model').value,
            };
        };

        saveBtn.onclick = () => {
            const saved = saveAgent(collectAgent());
            selectedId = saved.id;
            renderAgentList();
            saveBtn.textContent = 'Saved ✓';
            setTimeout(() => {
                saveBtn.textContent = t('common.save');
            }, 1500);
        };

        deleteBtn.onclick = () => {
            if (!agent.id) return;
            deleteAgent(agent.id);
            selectedId = listAgents()[0]?.id || null;
            renderAgentList();
            renderRightPane();
        };

        actions.appendChild(deleteBtn);
        actions.appendChild(saveBtn);

        content.appendChild(scroll);
        content.appendChild(actions);
    };

    const renderRunTab = (content, agent) => {
        const keyBanner = document.createElement('div');
        keyBanner.className = 'shrink-0 px-4 pt-3';

        const transcriptWrap = document.createElement('div');
        transcriptWrap.className = 'flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3';
        const transcript = document.createElement('div');
        transcript.className = 'max-w-3xl mx-auto flex flex-col gap-3';
        transcriptWrap.appendChild(transcript);

        const emptyHint = document.createElement('p');
        emptyHint.className = 'text-center text-muted text-sm py-8';
        emptyHint.textContent = 'Send a prompt to run this agent.';
        transcript.appendChild(emptyHint);

        const scrollToBottom = () => {
            transcriptWrap.scrollTop = transcriptWrap.scrollHeight;
        };

        const appendRow = (el) => {
            emptyHint.remove();
            transcript.appendChild(el);
            scrollToBottom();
        };

        const appendUserBubble = (text) => {
            const row = document.createElement('div');
            row.className = 'flex justify-end';
            row.innerHTML = `
                <div class="max-w-[85%] bg-accent/20 border border-accent/30 rounded-2xl rounded-br-md px-4 py-3 text-fg text-sm leading-relaxed">
                    ${escapeHtml(text)}
                </div>
            `;
            appendRow(row);
        };

        const appendAssistantBubble = (text) => {
            const row = document.createElement('div');
            row.className = 'flex justify-start';
            row.innerHTML = `
                <div class="max-w-[85%] bg-surface-2 border border-border-token rounded-2xl rounded-bl-md px-4 py-3 text-fg/90 text-sm leading-relaxed whitespace-pre-wrap">
                    ${escapeHtml(text)}
                </div>
            `;
            appendRow(row);
        };

        const appendPlanBlock = (text, toolCalls) => {
            const block = document.createElement('div');
            block.className =
                'bg-surface/80 backdrop-blur border border-border-token rounded-2xl p-4 flex flex-col gap-3';
            if (text) {
                const planText = document.createElement('p');
                planText.className = 'text-sm text-fg/80 whitespace-pre-wrap leading-relaxed';
                planText.textContent = text;
                block.appendChild(planText);
            }
            if (toolCalls?.length) {
                const label = document.createElement('p');
                label.className = 'text-[10px] font-bold text-accent uppercase tracking-widest';
                label.textContent = 'Pending tool calls';
                block.appendChild(label);
                const list = document.createElement('ul');
                list.className = 'flex flex-col gap-2';
                toolCalls.forEach((tc) => {
                    const item = document.createElement('li');
                    item.className =
                        'bg-surface-2 border border-border-token rounded-xl px-3 py-2 text-xs font-mono';
                    item.innerHTML = `
                        <span class="text-accent font-bold">${escapeHtml(tc.name)}</span>
                        <pre class="text-muted mt-1 whitespace-pre-wrap break-all text-[10px]">${escapeHtml(formatArgs(tc.args))}</pre>
                    `;
                    list.appendChild(item);
                });
                block.appendChild(list);
            }
            appendRow(block);
        };

        const appendToolStart = (name) => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 text-sm text-muted px-2';
            row.innerHTML = `<span class="animate-spin text-accent">◌</span> running <span class="text-accent font-bold">${escapeHtml(name)}</span>…`;
            appendRow(row);
        };

        const appendToolResult = (name, result) => {
            const block = document.createElement('div');
            block.className =
                'bg-surface-2 border border-border-token rounded-2xl p-3 flex flex-col gap-2';

            const header = document.createElement('p');
            header.className = 'text-[10px] font-bold uppercase tracking-widest';
            header.innerHTML = `<span class="text-muted">${escapeHtml(name)}</span> → `;

            if (result?.ok && result.url) {
                header.innerHTML += '<span class="text-accent">ok</span>';
                block.appendChild(header);

                if (isVideoUrl(result.url)) {
                    const video = document.createElement('video');
                    video.src = result.url;
                    video.controls = true;
                    video.className = 'max-h-48 rounded-xl border border-border-token';
                    block.appendChild(video);
                } else if (isImageUrl(result.url)) {
                    const img = document.createElement('img');
                    img.src = result.url;
                    img.alt = name;
                    img.className =
                        'max-h-48 rounded-xl border border-border-token object-contain';
                    block.appendChild(img);
                } else {
                    const link = document.createElement('a');
                    link.href = result.url;
                    link.target = '_blank';
                    link.rel = 'noreferrer';
                    link.className = 'text-xs text-accent hover:underline break-all';
                    link.textContent = result.url;
                    block.appendChild(link);
                }
            } else {
                header.innerHTML += '<span class="text-dim">error</span>';
                block.appendChild(header);
                if (result?.error) {
                    const err = document.createElement('p');
                    err.className = 'text-xs text-muted';
                    err.textContent = result.error;
                    block.appendChild(err);
                }
            }
            appendRow(block);
        };

        const appendError = (message) => {
            const row = document.createElement('div');
            row.className =
                'bg-surface-2 border border-border-token rounded-xl px-4 py-3 text-sm text-dim';
            row.textContent = message;
            appendRow(row);
        };

        const appendDoneBubble = (text) => {
            if (!text) return;
            const row = document.createElement('div');
            row.className = 'flex justify-start';
            row.innerHTML = `
                <div class="max-w-[85%] bg-accent/10 border border-accent/20 rounded-2xl px-4 py-3 text-fg text-sm leading-relaxed whitespace-pre-wrap">
                    <span class="text-[10px] font-bold text-accent uppercase tracking-widest block mb-1">Done</span>
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

        const renderKeyBanner = () => {
            const meta = getProviderMeta(agent.brain || 'claude');
            if (localStorage.getItem(meta.keyStorageKey)) {
                keyBanner.classList.add('hidden');
                keyBanner.innerHTML = '';
                return;
            }
            const copy = KEY_BANNER_COPY[meta.id] || KEY_BANNER_COPY.claude;
            keyBanner.classList.remove('hidden');
            keyBanner.innerHTML = `
                <div class="bg-surface/90 backdrop-blur-xl border border-border-token rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-3xl mx-auto">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold text-accent uppercase tracking-wider mb-1">${copy.title}</p>
                        <p class="text-[11px] text-muted">${copy.hint}</p>
                    </div>
                    <div class="flex gap-2 flex-1 sm:max-w-md">
                        <input type="password" id="agent-brain-key-input"
                            placeholder="${copy.placeholder}"
                            class="flex-1 bg-surface-2 border border-border-token rounded-xl px-4 py-2.5 text-fg text-sm placeholder:text-muted focus:outline-none focus:border-accent/50">
                        <button type="button" id="agent-brain-key-save"
                            class="shrink-0 bg-accent text-accent-contrast font-bold px-4 py-2.5 rounded-xl text-sm hover:shadow-glow transition-all">
                            ${t('common.save')}
                        </button>
                    </div>
                </div>
            `;
            keyBanner.querySelector('#agent-brain-key-save').onclick = () => {
                const input = keyBanner.querySelector('#agent-brain-key-input');
                const key = input.value.trim();
                if (key) {
                    localStorage.setItem(meta.keyStorageKey, key);
                    renderKeyBanner();
                } else {
                    input.classList.add('border-accent/50');
                    setTimeout(() => input.classList.remove('border-accent/50'), 2000);
                }
            };
        };
        renderKeyBanner();

        const inputWrap = document.createElement('div');
        inputWrap.className =
            'shrink-0 p-4 border-t border-border-token bg-surface-2 backdrop-blur-md';

        const bar = document.createElement('div');
        bar.className =
            'max-w-3xl mx-auto w-full bg-surface/90 backdrop-blur-xl border border-border-token rounded-2xl p-3 flex flex-col gap-3 shadow-glow';

        const textarea = document.createElement('textarea');
        textarea.className =
            'w-full bg-transparent border-none text-fg text-sm placeholder:text-muted focus:outline-none resize-none leading-relaxed min-h-[48px] max-h-[120px] overflow-y-auto custom-scrollbar px-2';
        textarea.rows = 2;
        textarea.placeholder = `Message ${agent.name || 'agent'}…`;
        textarea.oninput = () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        };

        const bottomRow = document.createElement('div');
        bottomRow.className =
            'flex items-center justify-end gap-3 px-2 pt-2 border-t border-border-token';

        const sendBtn = document.createElement('button');
        sendBtn.className =
            'bg-accent text-accent-contrast px-6 py-2.5 rounded-xl font-bold text-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed';
        sendBtn.textContent = 'Send';

        const setRunning = (value) => {
            running = value;
            sendBtn.disabled = value;
            textarea.disabled = value;
            sendBtn.textContent = value ? t('common.generating') : 'Send';
        };

        const runAgent = async (briefText) => {
            const current = getAgent(agent.id) || agent;
            const meta = getProviderMeta(current.brain || 'claude');
            if (!localStorage.getItem(meta.keyStorageKey)) {
                renderKeyBanner();
                keyBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                return;
            }

            appendUserBubble(briefText);
            setRunning(true);

            try {
                if (backendClient.isConfigured()) {
                    await refreshConnectorStatus();
                }

                const provider = createProvider(current.brain || 'claude', {
                    model: current.model || undefined,
                });
                const registry = buildRegistryForAgent(current);

                const modelPrefs = {};
                if (current.imageModel) modelPrefs.image = current.imageModel;
                if (current.videoModel) modelPrefs.video = current.videoModel;

                const agentInstance = new Agent({
                    provider,
                    registry,
                    persona: {
                        systemPersona: current.instructions || '',
                        name: current.name || 'Agent',
                    },
                    modelPrefs: Object.keys(modelPrefs).length ? modelPrefs : undefined,
                    onEvent: handleEvent,
                });
                await agentInstance.run(briefText);
            } catch (err) {
                if (!err.message?.includes('API key')) {
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

        content.appendChild(keyBanner);
        content.appendChild(transcriptWrap);
        content.appendChild(inputWrap);
    };

    newBtn.onclick = () => {
        const saved = saveAgent(defaultAgent());
        selectedId = saved.id;
        activeTab = 'edit';
        renderAgentList();
        renderRightPane();
    };

    renderAgentList();
    const agents = listAgents();
    if (agents.length && !selectedId) {
        selectedId = agents[0].id;
    }
    renderRightPane();

    if (backendClient.isConfigured()) {
        refreshConnectorStatus();
    }

    return container;
}
