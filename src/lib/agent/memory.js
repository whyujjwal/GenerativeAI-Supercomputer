const KEY_WORKING = 'sc_mem_working';
const KEY_BRAND = 'sc_mem_brand';
const KEY_EPISODES = 'sc_mem_episodes';
const MAX_EPISODES = 25;

const DEFAULT_BRAND = {
  brandVoice: '',
  stylePreferences: '',
  audience: '',
  persona: '',
  notes: '',
};

/**
 * @param {string} key
 * @param {*} fallback
 */
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {*} value
 */
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // tolerate quota / privacy mode
  }
}

/**
 * Persistent memory store backed by localStorage.
 */
export class MemoryStore {
  /**
   * @returns {{ brandVoice: string, stylePreferences: string, audience: string, persona: string, notes: string }}
   */
  getBrand() {
    const stored = readJson(KEY_BRAND, null);
    if (!stored || typeof stored !== 'object') return { ...DEFAULT_BRAND };
    return {
      brandVoice: String(stored.brandVoice || ''),
      stylePreferences: String(stored.stylePreferences || ''),
      audience: String(stored.audience || ''),
      persona: String(stored.persona || ''),
      notes: String(stored.notes || ''),
    };
  }

  /**
   * @param {Partial<typeof DEFAULT_BRAND>} obj
   */
  setBrand(obj) {
    const current = this.getBrand();
    writeJson(KEY_BRAND, {
      brandVoice: obj.brandVoice != null ? String(obj.brandVoice) : current.brandVoice,
      stylePreferences:
        obj.stylePreferences != null ? String(obj.stylePreferences) : current.stylePreferences,
      audience: obj.audience != null ? String(obj.audience) : current.audience,
      persona: obj.persona != null ? String(obj.persona) : current.persona,
      notes: obj.notes != null ? String(obj.notes) : current.notes,
    });
  }

  /**
   * @returns {{ brief?: string, lastPlan?: string, generatedAssets?: Array<{ kind: string, url: string }>, updatedAt?: string } | null}
   */
  getWorking() {
    const stored = readJson(KEY_WORKING, null);
    if (!stored || typeof stored !== 'object') return null;
    return stored;
  }

  /**
   * @param {Object} obj
   */
  setWorking(obj) {
    writeJson(KEY_WORKING, {
      ...obj,
      updatedAt: new Date().toISOString(),
    });
  }

  clearWorking() {
    try {
      localStorage.removeItem(KEY_WORKING);
    } catch {
      // tolerate
    }
  }

  /**
   * @param {{ brief: string, brain?: string, steps?: Array<{ tool: string, model?: string, args?: Object }>, assets?: string[], ts?: string }} ep
   */
  addEpisode(ep) {
    const episodes = this.getEpisodes();
    episodes.unshift({
      brief: String(ep.brief || ''),
      brain: ep.brain != null ? String(ep.brain) : undefined,
      steps: Array.isArray(ep.steps) ? ep.steps : [],
      assets: Array.isArray(ep.assets) ? ep.assets.filter(Boolean) : [],
      ts: ep.ts || new Date().toISOString(),
    });
    writeJson(KEY_EPISODES, episodes.slice(0, MAX_EPISODES));
  }

  /**
   * @param {number} [limit]
   * @returns {Array<{ brief: string, brain?: string, steps: Array<{ tool: string, model?: string, args?: Object }>, assets: string[], ts: string }>}
   */
  getEpisodes(limit) {
    const stored = readJson(KEY_EPISODES, []);
    if (!Array.isArray(stored)) return [];
    const episodes = stored.filter((e) => e && typeof e === 'object');
    if (limit != null && limit > 0) return episodes.slice(0, limit);
    return episodes;
  }

  /**
   * Compact memory context for the system prompt.
   * @returns {string}
   */
  buildMemoryContext() {
    const parts = [];
    const brand = this.getBrand();
    const brandLines = [];

    if (brand.brandVoice.trim()) brandLines.push(`Voice: ${brand.brandVoice.trim()}`);
    if (brand.stylePreferences.trim()) brandLines.push(`Style: ${brand.stylePreferences.trim()}`);
    if (brand.audience.trim()) brandLines.push(`Audience: ${brand.audience.trim()}`);
    if (brand.persona.trim()) brandLines.push(`Persona: ${brand.persona.trim()}`);
    if (brand.notes.trim()) brandLines.push(`Notes: ${brand.notes.trim()}`);

    if (brandLines.length) {
      parts.push(`## Brand memory\n${brandLines.join('\n')}`);
    }

    const episodes = this.getEpisodes(3);
    if (episodes.length) {
      const summaries = episodes.map((ep) => {
        const toolsUsed = (ep.steps || [])
          .map((s) => {
            const modelPart = s.model ? ` (${s.model})` : '';
            return `${s.tool || 'unknown'}${modelPart}`;
          })
          .join(', ');
        const brief = (ep.brief || '').trim().slice(0, 120);
        return `- ${brief || '(no brief)'} → ${toolsUsed || 'no tools'}`;
      });
      parts.push(`## Recent successful runs\n${summaries.join('\n')}`);
    }

    return parts.length ? `\n\n${parts.join('\n\n')}` : '';
  }
}
