export function normalizeError(status, data, fallback = 'Request failed') {
  let message = fallback;

  if (typeof data === 'string' && data.trim()) {
    message = data.trim();
  } else if (data && typeof data === 'object') {
    if (typeof data.error === 'string') {
      message = data.error;
    } else if (data.error && typeof data.error.message === 'string') {
      message = data.error.message;
    } else if (typeof data.message === 'string') {
      message = data.message;
    } else if (typeof data.error_description === 'string') {
      message = data.error_description;
    }
  }

  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
}

export async function readResponseBody(res) {
  const text = await res.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await readResponseBody(res);

  if (!res.ok) {
    throw normalizeError(res.status, data, `HTTP ${res.status}`);
  }

  return data;
}

export async function fetchText(url, options = {}) {
  const res = await fetch(url, options);

  if (!res.ok) {
    const data = await readResponseBody(res);
    throw normalizeError(res.status, data, `HTTP ${res.status}`);
  }

  return res.text();
}

export async function fetchBuffer(url, options = {}) {
  const res = await fetch(url, options);

  if (!res.ok) {
    const data = await readResponseBody(res);
    throw normalizeError(res.status, data, `HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
