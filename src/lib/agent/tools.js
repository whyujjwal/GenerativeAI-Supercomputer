import { muapi } from '../muapi.js';
import {
  t2iModels,
  t2vModels,
  i2iModels,
  i2vModels,
  lipsyncModels,
} from '../models.js';

/**
 * @param {Promise<*>} promise
 * @returns {Promise<{ ok: boolean, url?: string, raw?: *, error?: string }>}
 */
async function normalizeMuapiResult(promise) {
  try {
    const raw = await promise;
    if (typeof raw === 'string') {
      return { ok: true, url: raw, raw: { url: raw } };
    }
    const url = raw?.url || raw?.outputs?.[0] || raw?.output?.url;
    return { ok: true, url, raw };
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

const TOOL_DEFINITIONS = [
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

const CATALOG_BY_CATEGORY = {
  t2i: () => compactCatalog(t2iModels, 't2i'),
  t2v: () => compactCatalog(t2vModels, 't2v'),
  i2i: () => compactCatalog(i2iModels, 'i2i'),
  i2v: () => compactCatalog(i2vModels, 'i2v'),
  lipsync: () => compactCatalog(lipsyncModels, 'lipsync'),
};

/**
 * @returns {{ definitions: typeof TOOL_DEFINITIONS, handlers: Record<string, (args: Object) => Promise<Object>> }}
 */
export function buildToolRegistry() {
  const handlers = {
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

        let blob;
        if (args.file_url.startsWith('data:')) {
          const res = await fetch(args.file_url);
          blob = await res.blob();
        } else {
          const res = await fetch(args.file_url);
          if (!res.ok) {
            return { ok: false, error: `Failed to fetch file: ${res.status}` };
          }
          blob = await res.blob();
        }

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
        return { ok: true, raw: { models } };
      } catch (error) {
        return { ok: false, error: error.message || String(error) };
      }
    },
  };

  return {
    definitions: TOOL_DEFINITIONS,
    handlers,
  };
}
