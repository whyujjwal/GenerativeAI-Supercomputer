import { BUILTIN_SKILLS } from './builtinSkills.js';

const KEY_USER_SKILLS = 'sc_skills';

/**
 * @returns {Array<{ id: string, name: string, trigger: string, description: string, inputs: string, guidance: string, steps: Array<{ tool: string, notes: string }> }>}
 */
function readUserSkills() {
  try {
    const raw = localStorage.getItem(KEY_USER_SKILLS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {Array<Object>} skills
 */
function writeUserSkills(skills) {
  try {
    localStorage.setItem(KEY_USER_SKILLS, JSON.stringify(skills));
  } catch {
    // tolerate
  }
}

/**
 * Merge built-in skills with user overrides (matched by trigger).
 * @returns {Array<{ id: string, name: string, trigger: string, description: string, inputs: string, guidance: string, steps: Array<{ tool: string, notes: string }> }>}
 */
export function loadSkills() {
  const userSkills = readUserSkills();
  const byTrigger = new Map();

  for (const skill of BUILTIN_SKILLS) {
    byTrigger.set(skill.trigger, { ...skill });
  }
  for (const skill of userSkills) {
    if (skill?.trigger) {
      byTrigger.set(skill.trigger, { ...skill });
    }
  }

  return Array.from(byTrigger.values());
}

/**
 * @param {string} brief
 * @returns {{ skill: Object, rest: string } | null}
 */
export function findSkillInBrief(brief) {
  if (!brief || typeof brief !== 'string') return null;
  const trimmed = brief.trim();
  if (!trimmed.startsWith('/')) return null;

  const skills = loadSkills();
  const sorted = [...skills].sort((a, b) => b.trigger.length - a.trigger.length);

  for (const skill of sorted) {
    const trigger = skill.trigger;
    if (trimmed === trigger || trimmed.startsWith(`${trigger} `) || trimmed.startsWith(`${trigger}\n`)) {
      const rest = trimmed.slice(trigger.length).trim();
      return { skill, rest };
    }
  }

  return null;
}

/**
 * Compact skill listing for the system prompt.
 * @returns {string}
 */
export function listSkillsForPrompt() {
  const skills = loadSkills();
  if (!skills.length) return '';
  return skills.map((s) => `${s.trigger} — ${s.description}`).join('\n');
}

/**
 * @param {Object} skill
 */
export function saveUserSkill(skill) {
  if (!skill?.trigger) return;
  const userSkills = readUserSkills().filter((s) => s.trigger !== skill.trigger);
  userSkills.push(skill);
  writeUserSkills(userSkills);
}

/**
 * @param {string} trigger
 */
export function deleteUserSkill(trigger) {
  if (!trigger) return;
  const userSkills = readUserSkills().filter((s) => s.trigger !== trigger);
  writeUserSkills(userSkills);
}
