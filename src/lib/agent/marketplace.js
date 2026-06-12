import { BUILTIN_SKILLS } from './builtinSkills.js';
import { saveUserSkill, deleteUserSkill, loadSkills } from './skills.js';
import { listPersonas, getActivePersona } from './personas.js';

/**
 * Community skills beyond built-ins — same shape as Phase 3 skills.
 * @type {Array<{ id: string, name: string, trigger: string, description: string, inputs: string, guidance: string, steps: Array<{ tool: string, notes: string }> }>}
 */
export const COMMUNITY_SKILLS = [
  {
    id: 'unbox',
    name: 'Unbox',
    trigger: '/unbox',
    description: 'UGC-style unboxing sequence — reveal, reaction, and product hero.',
    inputs: 'free-text brief describing product, packaging, and creator vibe',
    guidance: `You are executing the /unbox skill — an authentic unboxing video workflow.

Workflow:
1. Call list_models for t2i and i2v.
2. generate_image: POV or creator frame holding sealed package (9:16, natural light).
3. generate_image: mid-unbox moment — hands opening box, product partially visible.
4. generate_i2v: animate the reveal with subtle handheld motion and product lift.
5. generate_image: hero product shot post-unbox on casual surface.

Keep energy authentic — not overly polished. Vertical delivery for social.`,
    steps: [
      { tool: 'list_models', notes: 'Pick t2i and i2v for UGC unbox aesthetic.' },
      { tool: 'generate_image', notes: 'Sealed package / anticipation frame.' },
      { tool: 'generate_image', notes: 'Mid-unbox hands-on frame.' },
      { tool: 'generate_i2v', notes: 'Animate reveal moment.' },
    ],
  },
  {
    id: 'kinetic-type',
    name: 'Kinetic Type',
    trigger: '/kinetic-type',
    description: 'Motion graphics with bold typography and animated text beats.',
    inputs: 'free-text brief describing message, style, and pacing',
    guidance: `You are executing the /kinetic-type skill — animated typography and motion graphics.

Workflow:
1. Call list_models for t2i and t2v or i2v.
2. Plan 3–5 text beats — hook, supporting line, CTA — with distinct visual treatments.
3. generate_image for each beat: high-contrast background, clear negative space for type.
4. generate_video or generate_i2v: animate each beat with motion suited to the words (slide, scale, bounce).
5. Deliver assets in sequence order with timing notes.

Prioritize legibility, bold hierarchy, and rhythmic cuts between beats.`,
    steps: [
      { tool: 'list_models', notes: 'Pick t2i and video models for motion graphics.' },
      { tool: 'generate_image', notes: 'Beat 1 — hook frame with type space.' },
      { tool: 'generate_video', notes: 'Animate text beat with kinetic motion.' },
    ],
  },
  {
    id: 'tryon',
    name: 'Try-On',
    trigger: '/tryon',
    description: 'Virtual try-on — model portrait plus garment overlay via i2i.',
    inputs: 'free-text brief describing garment, model, and setting',
    guidance: `You are executing the /tryon skill — virtual fashion try-on workflow.

Workflow:
1. Call list_models for t2i and i2i.
2. generate_image: full-body or three-quarter model portrait in neutral pose (good for garment overlay).
3. If garment reference URL is in the brief, use generate_i2i to apply the garment onto the model frame.
4. generate_image: alternate angle or lifestyle context shot wearing the look.
5. REVIEW fit and lighting consistency; retry i2i with adjusted prompt if needed.

Keep pose simple and garment description consistent across steps.`,
    steps: [
      { tool: 'list_models', notes: 'Pick t2i and i2i for try-on work.' },
      { tool: 'generate_image', notes: 'Base model portrait, neutral pose.' },
      { tool: 'generate_i2i', notes: 'Apply garment from reference URL.' },
    ],
  },
  {
    id: 'thumbnail',
    name: 'Thumbnail',
    trigger: '/thumbnail',
    description: 'High-click YouTube/social thumbnails — bold subject and readable text space.',
    inputs: 'free-text brief describing topic, emotion, and title text',
    guidance: `You are executing the /thumbnail skill — click-optimized thumbnail stills.

Workflow:
1. Call list_models for t2i.
2. generate_image: 16:9 frame with one dominant subject, exaggerated expression or contrast.
3. Leave clear negative space for title text (top or side third).
4. generate_image: A/B variant with different color grade or composition.
5. Deliver both variants with notes on which text placement works best.

High saturation, sharp focus on face/subject, minimal clutter.`,
    steps: [
      { tool: 'list_models', notes: 'Pick a strong t2i model for thumbnails.' },
      { tool: 'generate_image', notes: 'Primary thumbnail — bold subject, text space.' },
      { tool: 'generate_image', notes: 'A/B variant for testing.' },
    ],
  },
  {
    id: 'data-viz',
    name: 'Data Viz',
    trigger: '/data-viz',
    description: 'Clean infographic-style visuals for charts, stats, and explainers.',
    inputs: 'free-text brief describing data points, chart type, and brand style',
    guidance: `You are executing the /data-viz skill — infographic and data-visualization stills.

Workflow:
1. Call list_models for t2i.
2. Plan the visual hierarchy — headline stat, supporting chart, iconography.
3. generate_image: primary infographic layout with clear labels and readable typography.
4. generate_image: simplified variant or dark-mode alternate if requested.
5. Describe how each visual maps to the data points in the brief.

Prefer flat or isometric styles, high contrast labels, and uncluttered layouts.`,
    steps: [
      { tool: 'list_models', notes: 'Pick t2i suited to graphic/infographic style.' },
      { tool: 'generate_image', notes: 'Primary data-viz infographic frame.' },
      { tool: 'generate_image', notes: 'Optional variant or detail crop.' },
    ],
  },
];

/**
 * @returns {Set<string>}
 */
function getInstalledTriggers() {
  try {
    const userSkills = loadSkills();
    const builtinTriggers = new Set(BUILTIN_SKILLS.map((s) => s.trigger));
    return new Set(
      userSkills
        .filter((s) => s?.trigger && !builtinTriggers.has(s.trigger))
        .map((s) => s.trigger),
    );
  } catch {
    return new Set();
  }
}

/**
 * @returns {Array<Object>}
 */
export function listMarketplaceSkills() {
  const installed = getInstalledTriggers();

  const builtins = BUILTIN_SKILLS.map((skill) => ({
    ...skill,
    installed: true,
    builtin: true,
  }));

  const community = COMMUNITY_SKILLS.map((skill) => ({
    ...skill,
    installed: installed.has(skill.trigger),
    builtin: false,
  }));

  return [...builtins, ...community];
}

/**
 * @param {Object} skill
 */
export function installSkill(skill) {
  if (!skill?.trigger) return;
  saveUserSkill(skill);
}

/**
 * @param {string} trigger
 */
export function uninstallSkill(trigger) {
  if (!trigger) return;
  deleteUserSkill(trigger);
}

/**
 * @returns {Array<Object>}
 */
export function listMarketplacePersonas() {
  const active = getActivePersona();
  const activeId = active?.id || null;

  return listPersonas().map((persona) => ({
    ...persona,
    active: persona.id === activeId,
  }));
}
