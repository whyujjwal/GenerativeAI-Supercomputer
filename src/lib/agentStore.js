const STORAGE_KEY = 'sc_custom_agents';

/**
 * @returns {Array<{ id: string, name: string, emoji: string, instructions: string, brain: string, model: string, tools: 'all'|string[], imageModel: string, videoModel: string }>}
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
 * @param {Array<Object>} agents
 */
function writeAll(agents) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

function newId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @returns {Array<Object>}
 */
export function listAgents() {
    return readAll();
}

/**
 * @param {string} id
 * @returns {Object|null}
 */
export function getAgent(id) {
    if (!id) return null;
    return readAll().find((a) => a.id === id) || null;
}

/**
 * @param {Object} agent
 * @returns {Object}
 */
export function saveAgent(agent) {
    const agents = readAll();
    const payload = { ...agent };
    if (!payload.id) {
        payload.id = newId();
    }
    const idx = agents.findIndex((a) => a.id === payload.id);
    if (idx >= 0) {
        agents[idx] = payload;
    } else {
        agents.push(payload);
    }
    writeAll(agents);
    return payload;
}

/**
 * @param {string} id
 */
export function deleteAgent(id) {
    writeAll(readAll().filter((a) => a.id !== id));
}
