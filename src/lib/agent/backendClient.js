const STORAGE_KEY = 'sc_backend_url';

function getBaseUrl() {
    const url = (localStorage.getItem(STORAGE_KEY) || '').trim();
    return url.replace(/\/$/, '');
}

export function isConfigured() {
    return !!getBaseUrl();
}

export function getBackendUrl() {
    return getBaseUrl();
}

export function setBackendUrl(url) {
    const trimmed = (url || '').trim().replace(/\/$/, '');
    if (trimmed) {
        localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

async function request(path, options = {}) {
    const base = getBaseUrl();
    if (!base) {
        return { disabled: true };
    }

    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const res = await fetch(`${base}${path}`, {
            credentials: 'include',
            ...options,
            headers,
        });

        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await res.json().catch(() => ({}))
            : {};

        if (!res.ok) {
            return { ok: false, error: data.error || res.statusText || `HTTP ${res.status}` };
        }

        return data;
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

export async function health() {
    if (!isConfigured()) {
        return { disabled: true };
    }
    return request('/api/health');
}

export async function status() {
    if (!isConfigured()) {
        return { disabled: true };
    }
    return request('/api/connectors/status');
}

export async function call(provider, action, body) {
    if (!isConfigured()) {
        return { disabled: true };
    }
    return request(`/api/connectors/${encodeURIComponent(provider)}/${encodeURIComponent(action)}`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
    });
}

export function oauthUrl(provider) {
    const base = getBaseUrl();
    if (!base) {
        return null;
    }
    return `${base}/api/oauth/${encodeURIComponent(provider)}`;
}

export async function disconnect(provider) {
    if (!isConfigured()) {
        return { disabled: true };
    }
    return request(`/api/connectors/${encodeURIComponent(provider)}/disconnect`, {
        method: 'POST',
    });
}
