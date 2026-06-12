import config from '../config.js';
import * as tokenStore from '../tokenStore.js';
import * as google from '../connectors/google.js';
import * as notion from '../connectors/notion.js';
import * as slack from '../connectors/slack.js';
import { buildBaseSystemPrompt, runAgentLoop } from './loop.js';
import { DEFAULT_MODELS } from './providers.js';
import { buildServerToolRegistry } from './tools.js';

/**
 * @param {string|Object|null|undefined} persona
 */
function resolvePersonaText(persona) {
  if (!persona) return '';
  if (typeof persona === 'string') return persona.trim();
  if (typeof persona === 'object' && persona.systemPersona) {
    return String(persona.systemPersona).trim();
  }
  return '';
}

/**
 * @param {string|Object|null|undefined} brain
 */
function resolveBrainConfig(brain) {
  if (!brain) {
    return { provider: 'claude', model: DEFAULT_MODELS.claude };
  }
  if (typeof brain === 'string') {
    return { provider: brain, model: DEFAULT_MODELS[brain] || DEFAULT_MODELS.claude };
  }
  return {
    provider: brain.provider || 'claude',
    model: brain.model || DEFAULT_MODELS[brain.provider] || DEFAULT_MODELS.claude,
  };
}

/**
 * @param {{ text?: string, assets: string[] }} runResult
 * @param {Object} deliver
 */
async function deliverResults(runResult, deliver) {
  if (!deliver || typeof deliver !== 'object') return;

  const provider = deliver.provider || deliver.connector;
  if (!provider) return;

  const summary = runResult.text || 'Scheduled brief completed.';
  const assetLines = (runResult.assets || []).map((url) => `- ${url}`).join('\n');
  const body = assetLines ? `${summary}\n\nAssets:\n${assetLines}` : summary;

  if (provider === 'slack') {
    const tokenData = await tokenStore.get('slack');
    if (!tokenData) return;
    await slack.postMessage(tokenData, {
      channel: deliver.channel,
      text: body,
    });
    return;
  }

  if (provider === 'google') {
    const tokenData = await tokenStore.get('google');
    if (!tokenData) return;

    if (deliver.type === 'gmail' || deliver.action === 'gmail') {
      await google.gmailSend(tokenData, {
        to: deliver.to,
        subject: deliver.subject || 'GenerativeAI Supercomputer — scheduled brief',
        body,
      });
      return;
    }

    const assetUrl = runResult.assets?.[0];
    if (!assetUrl) return;

    await google.driveUpload(tokenData, {
      name: deliver.name || 'generated-asset',
      mimeType: deliver.mimeType,
      contentUrl: assetUrl,
    });
    return;
  }

  if (provider === 'notion') {
    const tokenData = await tokenStore.get('notion');
    if (!tokenData) return;

    await notion.createPage(tokenData, {
      parentId: deliver.parentId,
      title: deliver.title || 'Scheduled brief result',
      contentMarkdown: body,
    });
  }
}

/**
 * @param {{ brief: string, brain?: string|Object, persona?: string|Object, deliver?: Object }} params
 * @returns {Promise<{ text: string|null, assets: string[], steps: Array<Object>, error?: string }>}
 */
export async function runBrief({ brief, brain, persona, deliver }) {
  const registry = await buildServerToolRegistry();
  const brainCfg = resolveBrainConfig(brain);
  const personaText = resolvePersonaText(persona);
  const basePrompt = buildBaseSystemPrompt(registry.definitions);
  const system = [personaText, basePrompt].filter(Boolean).join('\n\n');

  const providerCfg = {
    provider: brainCfg.provider,
    model: brainCfg.model,
    keys: config.agentKeys,
  };

  try {
    const result = await runAgentLoop({
      brief,
      system,
      registry,
      providerCfg,
    });

    if (deliver) {
      try {
        await deliverResults(result, deliver);
      } catch (error) {
        console.warn('Delivery failed:', error.message || String(error));
      }
    }

    return result;
  } catch (error) {
    return {
      text: null,
      assets: [],
      steps: [],
      error: error.message || String(error),
    };
  }
}
