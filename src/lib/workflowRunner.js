import { muapi } from './muapi.js';

const TYPE_HANDLERS = {
    image: (params) => muapi.generateImage(params),
    i2i: (params) => muapi.generateI2I(params),
    video: (params) => muapi.generateVideo(params),
    i2v: (params) => muapi.generateI2V(params),
    lipsync: (params) => muapi.processLipSync(params),
};

/**
 * @param {string} prompt
 * @param {Record<string, string>} outputsById
 * @param {string[]} outputsByIndex
 */
function substitutePromptTokens(prompt, outputsById, outputsByIndex) {
    let text = prompt || '';
    text = text.replace(/\{\{step(\d+)\.url\}\}/gi, (_, n) => {
        const idx = parseInt(n, 10) - 1;
        return outputsByIndex[idx] || '';
    });
    text = text.replace(/\{\{([^.}]+)\.url\}\}/g, (_, id) => outputsById[id] || '');
    return text;
}

/**
 * @param {Record<string, unknown>} params
 */
function compactParams(params) {
    const out = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            out[key] = value;
        }
    }
    return out;
}

/**
 * @param {Object} workflow
 * @param {{ onStep?: (event: { stepId: string, status: string, url?: string, error?: string }) => void }} [options]
 * @returns {Promise<{ results: Array<Object> }>}
 */
export async function runWorkflow(workflow, { onStep } = {}) {
    const steps = workflow?.steps || [];
    const results = [];
    const outputsById = {};
    const outputsByIndex = [];
    let failed = false;

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        if (failed) {
            onStep?.({ stepId: step.id, status: 'skipped' });
            results.push({ stepId: step.id, status: 'skipped' });
            continue;
        }

        onStep?.({ stepId: step.id, status: 'running' });

        try {
            const handler = TYPE_HANDLERS[step.type];
            if (!handler) {
                throw new Error(`Unknown step type: ${step.type}`);
            }

            const prompt = substitutePromptTokens(step.prompt, outputsById, outputsByIndex);
            const apiParams = compactParams({
                model: step.model,
                prompt,
                ...(step.params || {}),
            });

            if (step.inputFrom && outputsById[step.inputFrom]) {
                apiParams.image_url = outputsById[step.inputFrom];
            }

            const result = await handler(apiParams);
            const url = result?.url;

            outputsById[step.id] = url;
            outputsByIndex[i] = url;

            onStep?.({ stepId: step.id, status: 'done', url });
            results.push({ stepId: step.id, status: 'done', url, result });
        } catch (error) {
            failed = true;
            const message = error?.message || String(error);
            onStep?.({ stepId: step.id, status: 'error', error: message });
            results.push({ stepId: step.id, status: 'error', error: message });
        }
    }

    return { results };
}
