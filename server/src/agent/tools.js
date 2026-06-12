import {
  i2iModels,
  i2vModels,
  lipsyncModels,
  t2iModels,
  t2vModels,
} from '../../../packages/studio/src/models.js';
import config from '../config.js';
import * as tokenStore from '../tokenStore.js';
import * as google from '../connectors/google.js';
import * as notion from '../connectors/notion.js';
import * as slack from '../connectors/slack.js';
import { MuapiClient } from './muapiClient.js';

/**
 * @param {Promise<*>} promise
 */
async function normalizeMuapiResult(promise) {
  try {
    const raw = await promise;
    if (typeof raw === 'string') {
      return { ok: true, url: raw, result: { url: raw } };
    }
    const url = raw?.url || raw?.outputs?.[0] || raw?.output?.url;
    return { ok: true, url, result: raw };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

/**
 * @param {Array<{ id: string, name: string }>} models
 * @param {string} category
 */
function compactCatalog(models, category) {
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    category,
  }));
}

const CATALOG_BY_CATEGORY = {
  t2i: () => compactCatalog(t2iModels, 't2i'),
  t2v: () => compactCatalog(t2vModels, 't2v'),
  i2i: () => compactCatalog(i2iModels, 'i2i'),
  i2v: () => compactCatalog(i2vModels, 'i2v'),
  lipsync: () => compactCatalog(lipsyncModels, 'lipsync'),
};

const GENERATION_TOOL_DEFINITIONS = [
  {
    name: 'generate_image',
    description:
      'Generate an image from a text prompt (text-to-image). Optionally pass image_url for image-to-image on T2I models that support it.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model id from list_models (t2i category).' },
        prompt: { type: 'string', description: 'Text prompt describing the desired image.' },
        aspect_ratio: { type: 'string', description: 'e.g. 1:1, 16:9, 9:16' },
        resolution: { type: 'string', description: 'Output resolution when supported by the model.' },
        quality: { type: 'string', description: 'Quality preset when supported by the model.' },
        image_url: { type: 'string', description: 'Reference image URL for image-to-image.' },
        strength: { type: 'number', description: 'I2I strength 0–1 (default 0.6).' },
        negative_prompt: { type: 'string' },
        steps: { type: 'number' },
        guidance_scale: { type: 'number' },
        seed: { type: 'number', description: 'Use -1 for random.' },
      },
      required: ['model', 'prompt'],
    },
  },
  {
    name: 'generate_i2i',
    description: 'Transform or edit an image using a dedicated image-to-image model.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model id from list_models (i2i category).' },
        image_url: { type: 'string', description: 'Source image URL.' },
        images_list: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple source image URLs when the model supports it.',
        },
        prompt: { type: 'string', description: 'Optional edit instruction.' },
        aspect_ratio: { type: 'string' },
        resolution: { type: 'string' },
        quality: { type: 'string' },
      },
      required: ['model', 'image_url'],
    },
  },
  {
    name: 'generate_video',
    description: 'Generate a video from a text prompt (text-to-video).',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model id from list_models (t2v category).' },
        prompt: { type: 'string', description: 'Text prompt describing the video.' },
        aspect_ratio: { type: 'string' },
        duration: { type: 'number', description: 'Duration in seconds.' },
        resolution: { type: 'string' },
        quality: { type: 'string' },
        mode: { type: 'string' },
        image_url: { type: 'string', description: 'Optional start frame for models that accept it.' },
      },
      required: ['model', 'prompt'],
    },
  },
  {
    name: 'generate_i2v',
    description: 'Generate a video from a start-frame image (image-to-video).',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model id from list_models (i2v category).' },
        image_url: { type: 'string', description: 'Start frame image URL.' },
        images_list: {
          type: 'array',
          items: { type: 'string' },
          description: 'Image URLs when the model expects images_list.',
        },
        last_image: { type: 'string', description: 'Optional end-frame image URL.' },
        prompt: { type: 'string' },
        aspect_ratio: { type: 'string' },
        duration: { type: 'number' },
        resolution: { type: 'string' },
        quality: { type: 'string' },
        mode: { type: 'string' },
        name: { type: 'string', description: 'Effect name for models that support named effects.' },
      },
      required: ['model', 'image_url'],
    },
  },
  {
    name: 'process_lipsync',
    description:
      'Generate a talking-head / lipsync video from audio plus a portrait image or source video.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model id from list_models (lipsync category).' },
        audio_url: { type: 'string', description: 'Audio file URL.' },
        image_url: { type: 'string', description: 'Portrait image URL (image-based models).' },
        video_url: { type: 'string', description: 'Source video URL (video-based models).' },
        prompt: { type: 'string' },
        resolution: { type: 'string' },
        seed: { type: 'number', description: 'Use -1 for random.' },
      },
      required: ['model', 'audio_url'],
    },
  },
  {
    name: 'upload_file',
    description:
      'Upload a file to Muapi hosting and return a URL usable by other tools. Pass file_url (remote or data URL); the handler fetches and uploads.',
    parameters: {
      type: 'object',
      properties: {
        file_url: { type: 'string', description: 'Remote or data URL of the file to upload.' },
        filename: { type: 'string', description: 'Optional filename hint when fetching from file_url.' },
      },
      required: ['file_url'],
    },
  },
  {
    name: 'list_models',
    description:
      'List available generation models. Returns compact { id, name, category } entries. Call before picking a model id.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['t2i', 't2v', 'i2i', 'i2v', 'lipsync'],
          description: 'Optional filter; omit to return all categories.',
        },
      },
    },
  },
];

function buildGenerationHandlers(muapi) {
  return {
    generate_image: (args) => normalizeMuapiResult(muapi.generateImage(args)),
    generate_i2i: (args) => normalizeMuapiResult(muapi.generateI2I(args)),
    generate_video: (args) => normalizeMuapiResult(muapi.generateVideo(args)),
    generate_i2v: (args) => normalizeMuapiResult(muapi.generateI2V(args)),
    process_lipsync: (args) => normalizeMuapiResult(muapi.processLipSync(args)),

    upload_file: async (args) => {
      try {
        if (!args.file_url) {
          return { ok: false, error: 'file_url is required' };
        }

        const res = await fetch(args.file_url);
        if (!res.ok) {
          return { ok: false, error: `Failed to fetch file: ${res.status}` };
        }

        const blob = await res.blob();
        const filename = args.filename || 'upload.bin';
        const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
        return normalizeMuapiResult(muapi.uploadFile(file));
      } catch (error) {
        return { ok: false, error: error.message || String(error) };
      }
    },

    list_models: async (args = {}) => {
      try {
        const { category } = args;
        let models;
        if (category && CATALOG_BY_CATEGORY[category]) {
          models = CATALOG_BY_CATEGORY[category]();
        } else {
          models = [
            ...CATALOG_BY_CATEGORY.t2i(),
            ...CATALOG_BY_CATEGORY.t2v(),
            ...CATALOG_BY_CATEGORY.i2i(),
            ...CATALOG_BY_CATEGORY.i2v(),
            ...CATALOG_BY_CATEGORY.lipsync(),
          ];
        }
        return { ok: true, result: { models } };
      } catch (error) {
        return { ok: false, error: error.message || String(error) };
      }
    },
  };
}

/**
 * @param {{ slack?: boolean, google?: boolean, notion?: boolean }} status
 */
function buildConnectorTools(status = {}) {
  const definitions = [];
  const handlers = {};

  if (status.slack) {
    definitions.push({
      name: 'slack_post_message',
      description: 'Post a message to a Slack channel.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Slack channel ID or name (e.g. #general).' },
          text: { type: 'string', description: 'Message text to post.' },
        },
        required: ['channel', 'text'],
      },
    });

    handlers.slack_post_message = async (args = {}) => {
      try {
        const tokenData = await tokenStore.get('slack');
        if (!tokenData) {
          return { ok: false, error: 'Slack is not connected' };
        }
        const result = await slack.postMessage(tokenData, {
          channel: args.channel,
          text: args.text,
        });
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: error.message || String(error) };
      }
    };
  }

  if (status.google) {
    definitions.push({
      name: 'drive_upload_file',
      description: 'Upload a file to Google Drive from a public URL.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Filename for the Drive upload.' },
          mimeType: { type: 'string', description: 'MIME type (e.g. image/png).' },
          contentUrl: { type: 'string', description: 'Public URL of the file content to upload.' },
        },
        required: ['name', 'contentUrl'],
      },
    });

    definitions.push({
      name: 'gmail_send_email',
      description: 'Send a plain-text email via Gmail.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address.' },
          subject: { type: 'string', description: 'Email subject line.' },
          body: { type: 'string', description: 'Plain-text email body.' },
        },
        required: ['to', 'subject', 'body'],
      },
    });

    handlers.drive_upload_file = async (args = {}) => {
      try {
        const tokenData = await tokenStore.get('google');
        if (!tokenData) {
          return { ok: false, error: 'Google is not connected' };
        }
        const result = await google.driveUpload(tokenData, {
          name: args.name,
          mimeType: args.mimeType,
          contentUrl: args.contentUrl,
        });
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: error.message || String(error) };
      }
    };

    handlers.gmail_send_email = async (args = {}) => {
      try {
        const tokenData = await tokenStore.get('google');
        if (!tokenData) {
          return { ok: false, error: 'Google is not connected' };
        }
        const result = await google.gmailSend(tokenData, {
          to: args.to,
          subject: args.subject,
          body: args.body,
        });
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: error.message || String(error) };
      }
    };
  }

  if (status.notion) {
    definitions.push({
      name: 'notion_create_page',
      description: 'Create a Notion page under a parent page.',
      parameters: {
        type: 'object',
        properties: {
          parentId: { type: 'string', description: 'Parent Notion page ID.' },
          title: { type: 'string', description: 'Title for the new page.' },
          contentMarkdown: { type: 'string', description: 'Page body as markdown paragraphs.' },
        },
        required: ['parentId', 'title'],
      },
    });

    handlers.notion_create_page = async (args = {}) => {
      try {
        const tokenData = await tokenStore.get('notion');
        if (!tokenData) {
          return { ok: false, error: 'Notion is not connected' };
        }
        const result = await notion.createPage(tokenData, {
          parentId: args.parentId,
          title: args.title,
          contentMarkdown: args.contentMarkdown,
        });
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: error.message || String(error) };
      }
    };
  }

  return { definitions, handlers };
}

/**
 * @returns {Promise<{ definitions: Array<Object>, handlers: Record<string, Function> }>}
 */
export async function buildServerToolRegistry() {
  const status = await tokenStore.status();
  const connectorTools = buildConnectorTools(status);

  let generationHandlers = {};
  if (config.muapiKey) {
    const muapi = new MuapiClient(config.muapiKey);
    generationHandlers = buildGenerationHandlers(muapi);
  } else {
    const missing = () => Promise.resolve({ ok: false, error: 'MUAPI_KEY is not configured' });
    generationHandlers = {
      generate_image: missing,
      generate_i2i: missing,
      generate_video: missing,
      generate_i2v: missing,
      process_lipsync: missing,
      upload_file: missing,
      list_models: async () => {
        try {
          const models = [
            ...CATALOG_BY_CATEGORY.t2i(),
            ...CATALOG_BY_CATEGORY.t2v(),
            ...CATALOG_BY_CATEGORY.i2i(),
            ...CATALOG_BY_CATEGORY.i2v(),
            ...CATALOG_BY_CATEGORY.lipsync(),
          ];
          return { ok: true, result: { models } };
        } catch (error) {
          return { ok: false, error: error.message || String(error) };
        }
      },
    };
  }

  return {
    definitions: [...GENERATION_TOOL_DEFINITIONS, ...connectorTools.definitions],
    handlers: { ...generationHandlers, ...connectorTools.handlers },
  };
}
