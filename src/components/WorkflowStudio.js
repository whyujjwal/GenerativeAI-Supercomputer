import {
    listWorkflows,
    getWorkflow,
    saveWorkflow,
    deleteWorkflow,
    newWorkflowId,
} from '../lib/workflowStore.js';
import { runWorkflow } from '../lib/workflowRunner.js';
import { t2iModels, i2iModels, t2vModels, i2vModels, lipsyncModels } from '../lib/models.js';
import { t } from '../lib/i18n.js';

const STEP_TYPES = [
    { id: 'image', label: 'Text → Image' },
    { id: 'i2i', label: 'Image → Image' },
    { id: 'video', label: 'Text → Video' },
    { id: 'i2v', label: 'Image → Video' },
    { id: 'lipsync', label: 'Lip Sync' },
];

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function hasMuapiKey() {
    return !!(window.__MUAPI_KEY__ || localStorage.getItem('muapi_key'));
}

function getModelsForType(type) {
    switch (type) {
        case 'image':
            return t2iModels;
        case 'i2i':
            return i2iModels;
        case 'video':
            return t2vModels;
        case 'i2v':
            return i2vModels;
        case 'lipsync':
            return lipsyncModels;
        default:
            return t2iModels;
    }
}

function defaultStep(type = 'image') {
    const models = getModelsForType(type);
    return {
        id: newWorkflowId(),
        type,
        model: models[0]?.id || '',
        prompt: '',
        params: {},
        inputFrom: null,
    };
}

function defaultWorkflow() {
    return {
        name: 'New Workflow',
        steps: [],
    };
}

function stepLabel(step, index) {
    const typeMeta = STEP_TYPES.find((s) => s.id === step.type);
    const typeName = typeMeta?.label || step.type;
    return `Step ${index + 1}: ${typeName}`;
}

function isVideoUrl(url) {
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url || '');
}

function cloneWorkflow(wf) {
    return {
        ...wf,
        steps: (wf.steps || []).map((s) => ({
            ...s,
            params: { ...(s.params || {}) },
        })),
    };
}

export function WorkflowStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex bg-bg text-fg overflow-hidden';

    let selectedId = null;
    let draft = null;
    let running = false;
    const runState = new Map();

    const leftPane = document.createElement('div');
    leftPane.className =
        'shrink-0 w-56 md:w-64 border-r border-border-token bg-surface flex flex-col';

    const listHeader = document.createElement('div');
    listHeader.className = 'shrink-0 p-3 border-b border-border-token flex flex-col gap-2';
    listHeader.innerHTML = `
        <p class="text-xs font-bold text-accent uppercase tracking-wider">${escapeHtml(t('workflows.title'))}</p>
    `;

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className =
        'w-full bg-accent text-accent-contrast font-bold px-3 py-2 rounded-xl text-sm hover:shadow-glow transition-all';
    newBtn.textContent = 'New Workflow';
    listHeader.appendChild(newBtn);

    const workflowList = document.createElement('div');
    workflowList.className = 'flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1';

    leftPane.appendChild(listHeader);
    leftPane.appendChild(workflowList);

    const rightPane = document.createElement('div');
    rightPane.className = 'flex-1 min-w-0 flex flex-col overflow-hidden';

    container.appendChild(leftPane);
    container.appendChild(rightPane);

    const loadDraft = () => {
        if (!selectedId) {
            draft = null;
            return;
        }
        const wf = getWorkflow(selectedId);
        draft = wf ? cloneWorkflow(wf) : null;
    };

    const syncDraftFromDom = () => {
        if (!draft) return;

        const nameEl = rightPane.querySelector('#wf-name');
        if (nameEl) draft.name = nameEl.value;

        const stepEls = rightPane.querySelectorAll('[data-step-id]');
        stepEls.forEach((card) => {
            const stepId = card.dataset.stepId;
            const step = draft.steps.find((s) => s.id === stepId);
            if (!step) return;

            const typeEl = card.querySelector('[data-field="type"]');
            const modelEl = card.querySelector('[data-field="model"]');
            const promptEl = card.querySelector('[data-field="prompt"]');
            const inputFromEl = card.querySelector('[data-field="inputFrom"]');
            const aspectEl = card.querySelector('[data-field="aspect_ratio"]');
            const durationEl = card.querySelector('[data-field="duration"]');
            const resolutionEl = card.querySelector('[data-field="resolution"]');
            const qualityEl = card.querySelector('[data-field="quality"]');
            const audioEl = card.querySelector('[data-field="audio_url"]');

            if (typeEl) step.type = typeEl.value;
            if (modelEl) step.model = modelEl.value;
            if (promptEl) step.prompt = promptEl.value;
            if (inputFromEl) {
                step.inputFrom = inputFromEl.value || null;
            }

            step.params = {};
            if (aspectEl?.value) step.params.aspect_ratio = aspectEl.value;
            if (durationEl?.value) step.params.duration = durationEl.value;
            if (resolutionEl?.value) step.params.resolution = resolutionEl.value;
            if (qualityEl?.value) step.params.quality = qualityEl.value;
            if (audioEl?.value) step.params.audio_url = audioEl.value;
        });
    };

    const renderWorkflowList = () => {
        const workflows = listWorkflows();
        workflowList.innerHTML = '';

        if (!workflows.length) {
            const empty = document.createElement('p');
            empty.className = 'text-[11px] text-muted text-center py-4 px-2';
            empty.textContent = 'No saved workflows yet.';
            workflowList.appendChild(empty);
            return;
        }

        workflows.forEach((wf) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const isActive = wf.id === selectedId;
            btn.className = `w-full text-left px-3 py-2.5 rounded-xl transition-all flex flex-col gap-0.5 ${
                isActive
                    ? 'bg-accent/15 border border-accent/30 text-fg'
                    : 'hover:bg-surface-2 text-dim border border-transparent'
            }`;
            btn.innerHTML = `
                <span class="text-sm font-bold truncate">${escapeHtml(wf.name || 'Untitled')}</span>
                <span class="text-[10px] text-muted">${(wf.steps || []).length} step${(wf.steps || []).length === 1 ? '' : 's'}</span>
            `;
            btn.onclick = () => {
                syncDraftFromDom();
                selectedId = wf.id;
                loadDraft();
                runState.clear();
                renderWorkflowList();
                renderRightPane();
            };
            workflowList.appendChild(btn);
        });
    };

    const renderEmptyRight = () => {
        rightPane.innerHTML = `
            <div class="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <p class="text-muted text-sm">Select a workflow or create a new one.</p>
            </div>
        `;
    };

    const renderModelOptions = (step) => {
        const models = getModelsForType(step.type);
        return models
            .map(
                (m) =>
                    `<option value="${escapeHtml(m.id)}" ${m.id === step.model ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
            )
            .join('');
    };

    const renderInputFromOptions = (step, stepIndex) => {
        let html = '<option value="">None</option>';
        for (let i = 0; i < stepIndex; i++) {
            const prev = draft.steps[i];
            html += `<option value="${escapeHtml(prev.id)}" ${step.inputFrom === prev.id ? 'selected' : ''}>${escapeHtml(stepLabel(prev, i))}</option>`;
        }
        return html;
    };

    const renderParamFields = (step) => {
        const p = step.params || {};
        const showAspect = ['image', 'i2i', 'video', 'i2v'].includes(step.type);
        const showDuration = ['video', 'i2v'].includes(step.type);
        const showResolution = ['image', 'i2i', 'video', 'i2v', 'lipsync'].includes(step.type);
        const showQuality = ['image', 'video', 'i2v'].includes(step.type);
        const showAudio = step.type === 'lipsync';

        const fields = [];

        if (showAspect) {
            fields.push(`
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Aspect ratio</label>
                    <input type="text" data-field="aspect_ratio" value="${escapeHtml(p.aspect_ratio || '')}"
                        placeholder="16:9"
                        class="w-full bg-surface border border-border-token rounded-lg px-2 py-1.5 text-fg text-xs focus:outline-none focus:border-accent/50">
                </div>
            `);
        }
        if (showDuration) {
            fields.push(`
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Duration</label>
                    <input type="text" data-field="duration" value="${escapeHtml(p.duration || '')}"
                        placeholder="5"
                        class="w-full bg-surface border border-border-token rounded-lg px-2 py-1.5 text-fg text-xs focus:outline-none focus:border-accent/50">
                </div>
            `);
        }
        if (showResolution) {
            fields.push(`
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Resolution</label>
                    <input type="text" data-field="resolution" value="${escapeHtml(p.resolution || '')}"
                        placeholder="720p"
                        class="w-full bg-surface border border-border-token rounded-lg px-2 py-1.5 text-fg text-xs focus:outline-none focus:border-accent/50">
                </div>
            `);
        }
        if (showQuality) {
            fields.push(`
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Quality</label>
                    <input type="text" data-field="quality" value="${escapeHtml(p.quality || '')}"
                        placeholder="high"
                        class="w-full bg-surface border border-border-token rounded-lg px-2 py-1.5 text-fg text-xs focus:outline-none focus:border-accent/50">
                </div>
            `);
        }
        if (showAudio) {
            fields.push(`
                <div class="flex flex-col gap-1 sm:col-span-2">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Audio URL</label>
                    <input type="text" data-field="audio_url" value="${escapeHtml(p.audio_url || '')}"
                        placeholder="https://…"
                        class="w-full bg-surface border border-border-token rounded-lg px-2 py-1.5 text-fg text-xs focus:outline-none focus:border-accent/50">
                </div>
            `);
        }

        if (!fields.length) return '';
        return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">${fields.join('')}</div>`;
    };

    const renderStepCard = (step, index) => `
        <div data-step-id="${escapeHtml(step.id)}" class="bg-surface-2 border border-border-token rounded-xl p-3 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-bold text-accent uppercase tracking-wider">${escapeHtml(stepLabel(step, index))}</p>
                <div class="flex items-center gap-1 shrink-0">
                    <button type="button" data-action="up" data-step-id="${escapeHtml(step.id)}"
                        class="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted hover:text-fg hover:bg-surface border border-border-token disabled:opacity-30"
                        ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" data-action="down" data-step-id="${escapeHtml(step.id)}"
                        class="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted hover:text-fg hover:bg-surface border border-border-token disabled:opacity-30"
                        ${index === draft.steps.length - 1 ? 'disabled' : ''}>↓</button>
                    <button type="button" data-action="delete" data-step-id="${escapeHtml(step.id)}"
                        class="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted hover:text-fg hover:bg-surface border border-border-token">✕</button>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Type</label>
                    <select data-field="type"
                        class="bg-surface border border-border-token rounded-lg px-2 py-1.5 text-fg text-xs focus:outline-none focus:border-accent/50 cursor-pointer">
                        ${STEP_TYPES.map(
                            (st) =>
                                `<option value="${st.id}" ${st.id === step.type ? 'selected' : ''}>${escapeHtml(st.label)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Model</label>
                    <select data-field="model"
                        class="bg-surface border border-border-token rounded-lg px-2 py-1.5 text-fg text-xs focus:outline-none focus:border-accent/50 cursor-pointer">
                        ${renderModelOptions(step)}
                    </select>
                </div>
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Prompt</label>
                <textarea data-field="prompt" rows="3"
                    placeholder="Describe the generation… Use {{step1.url}} or {{step-id.url}} to reference prior outputs."
                    class="w-full bg-surface border border-border-token rounded-lg px-2 py-1.5 text-fg text-xs placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none custom-scrollbar">${escapeHtml(step.prompt || '')}</textarea>
            </div>
            ${renderParamFields(step)}
            <div class="flex flex-col gap-1 mt-1">
                <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Input from</label>
                <select data-field="inputFrom"
                    class="bg-surface border border-border-token rounded-lg px-2 py-1.5 text-fg text-xs focus:outline-none focus:border-accent/50 cursor-pointer">
                    ${renderInputFromOptions(step, index)}
                </select>
            </div>
        </div>
    `;

    const renderRunStatusRow = (step, index) => {
        const state = runState.get(step.id) || { status: 'pending' };
        const statusLabel = {
            pending: 'Pending',
            running: 'Running…',
            done: 'Done',
            error: 'Error',
            skipped: 'Skipped',
        }[state.status] || state.status;

        const statusClass = {
            pending: 'text-muted',
            running: 'text-accent',
            done: 'text-fg',
            error: 'text-accent',
            skipped: 'text-muted',
        }[state.status] || 'text-muted';

        let mediaHtml = '';
        if (state.url) {
            if (isVideoUrl(state.url)) {
                mediaHtml = `<video src="${escapeHtml(state.url)}" controls class="mt-2 max-w-full max-h-48 rounded-lg border border-border-token"></video>`;
            } else {
                mediaHtml = `<img src="${escapeHtml(state.url)}" alt="Step ${index + 1} result" class="mt-2 max-w-full max-h-48 rounded-lg border border-border-token object-contain">`;
            }
        }
        const errorHtml = state.error
            ? `<p class="mt-1 text-[11px] text-accent">${escapeHtml(state.error)}</p>`
            : '';

        return `
            <div data-run-step="${escapeHtml(step.id)}" class="bg-surface-2 border border-border-token rounded-xl p-3">
                <div class="flex items-center justify-between gap-2">
                    <p class="text-xs font-bold text-fg">${escapeHtml(stepLabel(step, index))}</p>
                    <span class="text-[10px] font-bold uppercase tracking-wider ${statusClass}">${escapeHtml(statusLabel)}</span>
                </div>
                ${errorHtml}
                ${mediaHtml}
            </div>
        `;
    };

    const updateRunPanel = () => {
        const panel = rightPane.querySelector('#wf-run-panel');
        if (!panel || !draft) return;
        panel.innerHTML = draft.steps.length
            ? draft.steps.map((step, i) => renderRunStatusRow(step, i)).join('')
            : '<p class="text-[11px] text-muted">Add at least one step to run.</p>';
    };

    const wireStepActions = () => {
        rightPane.querySelectorAll('[data-action]').forEach((btn) => {
            btn.onclick = () => {
                syncDraftFromDom();
                const stepId = btn.dataset.stepId;
                const action = btn.dataset.action;
                const idx = draft.steps.findIndex((s) => s.id === stepId);
                if (idx < 0) return;

                if (action === 'delete') {
                    draft.steps.splice(idx, 1);
                    draft.steps.forEach((s) => {
                        if (s.inputFrom === stepId) s.inputFrom = null;
                    });
                } else if (action === 'up' && idx > 0) {
                    [draft.steps[idx - 1], draft.steps[idx]] = [draft.steps[idx], draft.steps[idx - 1]];
                } else if (action === 'down' && idx < draft.steps.length - 1) {
                    [draft.steps[idx], draft.steps[idx + 1]] = [draft.steps[idx + 1], draft.steps[idx]];
                }

                renderRightPane();
            };
        });

        rightPane.querySelectorAll('[data-field="type"]').forEach((select) => {
            select.onchange = () => {
                syncDraftFromDom();
                const card = select.closest('[data-step-id]');
                const stepId = card?.dataset.stepId;
                const step = draft.steps.find((s) => s.id === stepId);
                if (!step) return;
                const models = getModelsForType(step.type);
                if (!models.some((m) => m.id === step.model)) {
                    step.model = models[0]?.id || '';
                }
                renderRightPane();
            };
        });
    };

    const renderRightPane = () => {
        if (!draft) {
            renderEmptyRight();
            return;
        }

        rightPane.innerHTML = '';

        const header = document.createElement('div');
        header.className =
            'shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border-token bg-surface';

        header.innerHTML = `
            <div class="flex flex-col gap-1 flex-1 min-w-0">
                <label class="text-[10px] font-bold text-muted uppercase tracking-widest">Workflow name</label>
                <input type="text" id="wf-name" value="${escapeHtml(draft.name || '')}"
                    class="w-full max-w-md bg-surface-2 border border-border-token rounded-xl px-3 py-2 text-fg text-sm focus:outline-none focus:border-accent/50">
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <button type="button" id="wf-save"
                    class="bg-accent text-accent-contrast font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider hover:shadow-glow transition-all">
                    Save
                </button>
                <button type="button" id="wf-delete"
                    class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-muted hover:text-fg border border-border-token hover:bg-surface-2 transition-all">
                    Delete
                </button>
            </div>
        `;
        rightPane.appendChild(header);

        if (!hasMuapiKey()) {
            const banner = document.createElement('div');
            banner.className =
                'shrink-0 mx-4 mt-3 px-3 py-2 rounded-xl border border-accent/30 bg-accent/10 text-xs text-fg';
            banner.innerHTML = `
                <p class="font-bold text-accent">Muapi API key required</p>
                <p class="text-muted mt-0.5">Set your Muapi key in Settings (<code class="text-fg">muapi_key</code> in localStorage) to run workflows.</p>
            `;
            rightPane.appendChild(banner);
        }

        const scroll = document.createElement('div');
        scroll.className = 'flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4';

        const builderSection = document.createElement('div');
        builderSection.className = 'flex flex-col gap-3';
        builderSection.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-bold text-accent uppercase tracking-wider">Builder</p>
                <button type="button" id="wf-add-step"
                    class="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-surface-2 border border-border-token text-fg hover:border-accent/50 transition-all">
                    + Add step
                </button>
            </div>
            <div id="wf-steps" class="flex flex-col gap-3">
                ${
                    draft.steps.length
                        ? draft.steps.map((step, i) => renderStepCard(step, i)).join('')
                        : '<p class="text-[11px] text-muted">No steps yet. Add a step to build your pipeline.</p>'
                }
            </div>
        `;
        scroll.appendChild(builderSection);

        const runSection = document.createElement('div');
        runSection.className = 'flex flex-col gap-3 pt-2 border-t border-border-token';
        runSection.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-bold text-accent uppercase tracking-wider">Run</p>
                <button type="button" id="wf-run"
                    class="bg-accent text-accent-contrast font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider hover:shadow-glow transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    ${running || !draft.steps.length || !hasMuapiKey() ? 'disabled' : ''}>
                    ${running ? 'Running…' : 'Run workflow'}
                </button>
            </div>
            <div id="wf-run-panel" class="flex flex-col gap-2">
                ${
                    draft.steps.length
                        ? draft.steps.map((step, i) => renderRunStatusRow(step, i)).join('')
                        : '<p class="text-[11px] text-muted">Add at least one step to run.</p>'
                }
            </div>
        `;
        scroll.appendChild(runSection);
        rightPane.appendChild(scroll);

        wireStepActions();

        rightPane.querySelector('#wf-add-step').onclick = () => {
            syncDraftFromDom();
            draft.steps.push(defaultStep('image'));
            renderRightPane();
        };

        rightPane.querySelector('#wf-save').onclick = () => {
            syncDraftFromDom();
            const saved = saveWorkflow({ ...draft, id: selectedId });
            selectedId = saved.id;
            draft = cloneWorkflow(saved);
            renderWorkflowList();
            renderRightPane();
        };

        rightPane.querySelector('#wf-delete').onclick = () => {
            if (!selectedId) return;
            deleteWorkflow(selectedId);
            const remaining = listWorkflows();
            selectedId = remaining[0]?.id || null;
            loadDraft();
            runState.clear();
            renderWorkflowList();
            renderRightPane();
        };

        rightPane.querySelector('#wf-run').onclick = async () => {
            if (running || !hasMuapiKey()) return;
            syncDraftFromDom();
            if (!draft.steps.length) return;

            running = true;
            runState.clear();
            draft.steps.forEach((s) => runState.set(s.id, { status: 'pending' }));
            renderRightPane();

            const wfSnapshot = cloneWorkflow(draft);

            try {
                await runWorkflow(wfSnapshot, {
                    onStep: ({ stepId, status, url, error }) => {
                        runState.set(stepId, { status, url, error });
                        updateRunPanel();
                    },
                });
            } catch (err) {
                console.error('[WorkflowStudio] run failed:', err);
            } finally {
                running = false;
                const runBtn = rightPane.querySelector('#wf-run');
                if (runBtn) {
                    runBtn.disabled = !draft.steps.length || !hasMuapiKey();
                    runBtn.textContent = 'Run workflow';
                }
            }
        };
    };

    newBtn.onclick = () => {
        syncDraftFromDom();
        const saved = saveWorkflow(defaultWorkflow());
        selectedId = saved.id;
        loadDraft();
        runState.clear();
        renderWorkflowList();
        renderRightPane();
    };

    renderWorkflowList();
    const workflows = listWorkflows();
    if (workflows.length && !selectedId) {
        selectedId = workflows[0].id;
        loadDraft();
    }
    renderRightPane();

    return container;
}
