const STORAGE_KEY = 'sc_workflows';

/**
 * @returns {Array<{ id: string, name: string, steps: Array<Object> }>}
 */
function readAll() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * @param {Array<Object>} workflows
 */
function writeAll(workflows) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
}

function newId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @returns {Array<Object>}
 */
export function listWorkflows() {
    return readAll();
}

/**
 * @param {string} id
 * @returns {Object|null}
 */
export function getWorkflow(id) {
    if (!id) return null;
    return readAll().find((w) => w.id === id) || null;
}

/**
 * @param {Object} wf
 * @returns {Object}
 */
export function saveWorkflow(wf) {
    const workflows = readAll();
    const payload = { ...wf, steps: Array.isArray(wf.steps) ? wf.steps : [] };
    if (!payload.id) {
        payload.id = newId();
    }
    const idx = workflows.findIndex((w) => w.id === payload.id);
    if (idx >= 0) {
        workflows[idx] = payload;
    } else {
        workflows.push(payload);
    }
    writeAll(workflows);
    return payload;
}

/**
 * @param {string} id
 */
export function deleteWorkflow(id) {
    writeAll(readAll().filter((w) => w.id !== id));
}

export { newId as newWorkflowId };
