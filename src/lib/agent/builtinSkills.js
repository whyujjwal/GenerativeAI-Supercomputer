/**
 * Built-in skill templates invoked via /trigger prefixes in the brief.
 * @type {Array<{ id: string, name: string, trigger: string, description: string, inputs: string, guidance: string, steps: Array<{ tool: string, notes: string }> }>}
 */
export const BUILTIN_SKILLS = [
  {
    id: 'cinematic',
    name: 'Cinematic',
    trigger: '/cinematic',
    description: 'Cinematic still → image-to-video with filmic motion and lighting.',
    inputs: 'free-text brief describing scene, mood, and motion',
    guidance: `You are executing the /cinematic skill — a film-quality image-to-video workflow.

Workflow:
1. Call list_models to pick a strong t2i model and an i2v model suited to cinematic motion.
2. generate_image: compose a cinematic hero frame — anamorphic feel, motivated lighting, shallow depth, 16:9 or 2.39:1 aspect.
3. generate_i2v: animate the hero frame with subtle camera motion (dolly, pan, or slow push-in). Prefer smooth, filmic motion over chaotic movement.
4. REVIEW the video; retry i2v with adjusted motion/prompt if needed.

Prioritize atmosphere, color grade consistency, and one clear focal subject.`,
    steps: [
      { tool: 'list_models', notes: 'Find t2i and i2v model ids.' },
      { tool: 'generate_image', notes: 'Hero cinematic still from the brief.' },
      { tool: 'generate_i2v', notes: 'Animate the still with filmic camera motion.' },
    ],
  },
  {
    id: 'montage',
    name: 'Montage',
    trigger: '/montage',
    description: 'Multi-shot image pack with consistent style for a montage sequence.',
    inputs: 'free-text brief describing theme, shots, and pacing',
    guidance: `You are executing the /montage skill — a multi-shot visual sequence.

Workflow:
1. Call list_models for t2i (and t2v if motion clips are requested).
2. Plan 3–5 distinct shots that share a unified color palette, aspect ratio, and mood.
3. generate_image for each shot with consistent style keywords across prompts.
4. Optionally generate_video or generate_i2v for select hero shots.
5. Deliver all asset URLs grouped by shot order; note how they stitch into a montage.

Keep visual continuity — same lighting direction, grade, and subject world across shots.`,
    steps: [
      { tool: 'list_models', notes: 'Pick models for stills and optional clips.' },
      { tool: 'generate_image', notes: 'Shot 1 — establish the visual language.' },
      { tool: 'generate_image', notes: 'Shots 2–N — variations on theme.' },
      { tool: 'generate_video', notes: 'Optional motion clips for key beats.' },
    ],
  },
  {
    id: 'product',
    name: 'Product',
    trigger: '/product',
    description: 'Product photo pack — clean hero, detail, and lifestyle angles.',
    inputs: 'free-text brief describing product, brand feel, and backgrounds',
    guidance: `You are executing the /product skill — a commercial product photography pack.

Workflow:
1. Call list_models for t2i and i2i models.
2. generate_image: hero product shot on clean background (studio lighting, sharp detail).
3. generate_image: alternate angle or detail macro.
4. If a reference product photo URL is in the brief, use generate_i2i to refine or relight it.
5. generate_image: lifestyle/context shot placing the product in use.

Use consistent product description across prompts. Prefer 1:1 or 4:5 for social, 16:9 for web hero.`,
    steps: [
      { tool: 'list_models', notes: 'Pick t2i/i2i models for product work.' },
      { tool: 'generate_image', notes: 'Hero studio product shot.' },
      { tool: 'generate_image', notes: 'Detail or alternate angle.' },
      { tool: 'generate_i2i', notes: 'Optional refine when reference URL provided.' },
    ],
  },
  {
    id: 'ugc',
    name: 'UGC Ad',
    trigger: '/ugc',
    description: 'Creator-style UGC ad — authentic selfie framing and casual delivery.',
    inputs: 'free-text brief describing product, hook, and creator vibe',
    guidance: `You are executing the /ugc skill — a user-generated-content style ad.

Workflow:
1. Call list_models for t2i and i2v.
2. generate_image: casual creator portrait or POV frame (phone-camera aesthetic, natural light, 9:16 vertical).
3. generate_i2v: subtle authentic motion — talking to camera, product reveal, or unboxing gesture.
4. Keep prompts conversational and imperfect-on-purpose (not overly polished studio look).

Deliver vertical assets suitable for TikTok/Reels/Stories.`,
    steps: [
      { tool: 'list_models', notes: 'Pick t2i and i2v for UGC aesthetic.' },
      { tool: 'generate_image', notes: 'Creator-style hero frame, 9:16.' },
      { tool: 'generate_i2v', notes: 'Animate with natural handheld feel.' },
    ],
  },
  {
    id: 'portrait-talk',
    name: 'Portrait Talk',
    trigger: '/portrait-talk',
    description: 'Portrait image + audio lipsync for a talking-head clip.',
    inputs: 'free-text brief describing subject, expression, and audio source',
    guidance: `You are executing the /portrait-talk skill — portrait plus lipsync video.

Workflow:
1. Call list_models for t2i and lipsync models.
2. generate_image: tight portrait ( shoulders-up, face clearly visible, neutral or slight smile, good lighting ).
3. If the user provides an audio URL in the brief, call process_lipsync with the portrait URL and audio URL.
4. If no audio URL, ask in the plan summary — lipsync requires an audio file URL (upload_file can host one).
5. REVIEW sync quality; retry lipsync with a different model if needed.

Prefer front-facing portraits with unobstructed mouth area.`,
    steps: [
      { tool: 'list_models', notes: 'Pick t2i and lipsync model ids.' },
      { tool: 'generate_image', notes: 'Talking-head portrait, face-forward.' },
      { tool: 'upload_file', notes: 'Optional — host audio if user provides a file.' },
      { tool: 'process_lipsync', notes: 'Sync portrait to audio URL.' },
    ],
  },
];
