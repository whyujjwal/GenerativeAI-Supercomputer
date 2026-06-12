import {
  getI2IModelById,
  getI2VModelById,
  getLipSyncModelById,
  getModelById,
  getVideoModelById,
} from '../../../packages/studio/src/models.js';

const BASE_URL = 'https://api.muapi.ai';

/**
 * Node Muapi client — mirrors src/lib/muapi.js with injected API key.
 */
export class MuapiClient {
  /**
   * @param {string} apiKey
   */
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('MUAPI_KEY is not configured');
    }
    this.apiKey = apiKey;
    this.baseUrl = BASE_URL;
  }

  async pollForResult(requestId, maxAttempts = 60, interval = 2000) {
    const pollUrl = `${this.baseUrl}/api/v1/predictions/${requestId}/result`;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, interval));

      try {
        const response = await fetch(pollUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
          },
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status >= 500) continue;
          throw new Error(`Poll Failed: ${response.status} - ${errText.slice(0, 100)}`);
        }

        const data = await response.json();
        const status = data.status?.toLowerCase();

        if (status === 'completed' || status === 'succeeded' || status === 'success') {
          return data;
        }

        if (status === 'failed' || status === 'error') {
          throw new Error(`Generation failed: ${data.error || 'Unknown error'}`);
        }
      } catch (error) {
        if (attempt === maxAttempts) throw error;
      }
    }

    throw new Error('Generation timed out after polling.');
  }

  async submitAndPoll(url, payload, pollOptions = {}) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Request Failed: ${response.status} ${response.statusText} - ${errText.slice(0, 100)}`);
    }

    const submitData = await response.json();
    const requestId = submitData.request_id || submitData.id;
    if (!requestId) {
      return submitData;
    }

    const result = await this.pollForResult(requestId, pollOptions.maxAttempts, pollOptions.interval);
    const assetUrl = result.outputs?.[0] || result.url || result.output?.url;
    return { ...result, url: assetUrl };
  }

  async generateImage(params) {
    const modelInfo = getModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const url = `${this.baseUrl}/api/v1/${endpoint}`;

    const finalPayload = { prompt: params.prompt };

    if (params.aspect_ratio) finalPayload.aspect_ratio = params.aspect_ratio;
    if (params.resolution) finalPayload.resolution = params.resolution;
    if (params.quality) finalPayload.quality = params.quality;

    if (params.image_url) {
      finalPayload.image_url = params.image_url;
      finalPayload.strength = params.strength || 0.6;
    } else {
      finalPayload.image_url = null;
    }

    if (params.seed && params.seed !== -1) {
      finalPayload.seed = params.seed;
    }

    return this.submitAndPoll(url, finalPayload);
  }

  async generateVideo(params) {
    const modelInfo = getVideoModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const url = `${this.baseUrl}/api/v1/${endpoint}`;

    const finalPayload = {};
    if (params.prompt) finalPayload.prompt = params.prompt;
    if (params.request_id) finalPayload.request_id = params.request_id;
    if (params.aspect_ratio) finalPayload.aspect_ratio = params.aspect_ratio;
    if (params.duration) finalPayload.duration = params.duration;
    if (params.resolution) finalPayload.resolution = params.resolution;
    if (params.quality) finalPayload.quality = params.quality;
    if (params.mode) finalPayload.mode = params.mode;
    if (params.image_url) finalPayload.image_url = params.image_url;

    return this.submitAndPoll(url, finalPayload, { maxAttempts: 900, interval: 2000 });
  }

  async generateI2I(params) {
    const modelInfo = getI2IModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const url = `${this.baseUrl}/api/v1/${endpoint}`;

    const finalPayload = { prompt: params.prompt || '' };
    const imageField = modelInfo?.imageField || 'image_url';
    const imagesList =
      params.images_list?.length > 0 ? params.images_list : params.image_url ? [params.image_url] : null;

    if (imagesList) {
      if (imageField === 'images_list') {
        finalPayload.images_list = imagesList;
      } else {
        finalPayload[imageField] = imagesList[0];
      }
    }

    if (params.aspect_ratio) finalPayload.aspect_ratio = params.aspect_ratio;
    if (params.resolution) finalPayload.resolution = params.resolution;
    if (params.quality) finalPayload.quality = params.quality;

    return this.submitAndPoll(url, finalPayload);
  }

  async generateI2V(params) {
    const modelInfo = getI2VModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const url = `${this.baseUrl}/api/v1/${endpoint}`;

    const finalPayload = {};
    if (params.prompt) finalPayload.prompt = params.prompt;

    const imageField = modelInfo?.imageField || 'image_url';
    if (params.images_list?.length > 0) {
      if (imageField === 'images_list') {
        finalPayload.images_list = params.images_list;
      } else {
        finalPayload[imageField] = params.images_list[0];
      }
    } else if (params.image_url) {
      if (imageField === 'images_list') {
        finalPayload.images_list = [params.image_url];
      } else {
        finalPayload[imageField] = params.image_url;
      }
    }

    const lastImageField = modelInfo?.lastImageField;
    if (lastImageField && params.last_image) {
      if (lastImageField === 'images_list') {
        if (!finalPayload.images_list) finalPayload.images_list = [];
        if (!finalPayload.images_list.includes(params.last_image)) {
          finalPayload.images_list.push(params.last_image);
        }
      } else {
        finalPayload[lastImageField] = params.last_image;
      }
    }

    if (params.aspect_ratio) finalPayload.aspect_ratio = params.aspect_ratio;
    if (params.duration) finalPayload.duration = params.duration;
    if (params.resolution) finalPayload.resolution = params.resolution;
    if (params.quality) finalPayload.quality = params.quality;
    if (params.mode) finalPayload.mode = params.mode;
    if (params.name) finalPayload.name = params.name;

    return this.submitAndPoll(url, finalPayload, { maxAttempts: 900, interval: 2000 });
  }

  async processLipSync(params) {
    const modelInfo = getLipSyncModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const url = `${this.baseUrl}/api/v1/${endpoint}`;

    const finalPayload = {};
    if (params.audio_url) finalPayload.audio_url = params.audio_url;
    if (params.image_url) finalPayload.image_url = params.image_url;
    if (params.video_url) finalPayload.video_url = params.video_url;
    if (modelInfo?.hasPrompt) finalPayload.prompt = params.prompt || '';
    if (params.resolution) finalPayload.resolution = params.resolution;
    if (params.seed !== undefined && params.seed !== -1) finalPayload.seed = params.seed;

    return this.submitAndPoll(url, finalPayload, { maxAttempts: 900, interval: 2000 });
  }

  async uploadFile(file) {
    const url = `${this.baseUrl}/api/v1/upload_file`;
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`File upload failed: ${response.status} - ${errText.slice(0, 100)}`);
    }

    const data = await response.json();
    const fileUrl = data.url || data.file_url || data.data?.url;
    if (!fileUrl) throw new Error('No URL returned from file upload');
    return fileUrl;
  }
}
