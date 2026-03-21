import admin from 'firebase-admin';
import { ai, GEMINI_MODELS } from "./geminiClient.js";
import { STYLE_REF_URL, PIXEL_ART_BASE, INSTRUCTION_NEW_CHAR, INSTRUCTION_PRESERVE_CHAR, INSTRUCTION_RELATED_EVIDENCE, getStyleRefBase64 } from "./geminiStyles.js";

// --- Types ---
interface Evidence { id: string; title: string; description: string; imageUrl?: string; }
interface SupportCharacter { id: string; name: string; gender: string; role: string; personality: string; avatarSeed: number; portraits?: Record<string, string>; voice?: string; }
interface Suspect {
  id: string; name: string; gender: string; age: number; bio: string; role: string;
  status: string; personality: string; avatarSeed: number; baseAggravation: number;
  isGuilty: boolean; secret: string; physicalDescription?: string; isDeceased?: boolean;
  alibi: any; motive: string; relationships: any[]; timeline: any[];
  knownFacts: string[]; professionalBackground: string; witnessObservations: string;
  hiddenEvidence: Evidence[]; portraits?: Record<string, string>; voice?: string;
}
interface CaseData {
  id: string; title: string; type: string; description: string; difficulty: string;
  suspects: Suspect[]; initialEvidence: Evidence[]; initialTimeline: any[];
  officer: SupportCharacter; partner: SupportCharacter; startTime?: string;
  heroImageUrl?: string; authorId?: string; [key: string]: any;
}

// Emotion enum (duplicated from frontend types)
const Emotion = {
  NEUTRAL: 'NEUTRAL', ANGRY: 'ANGRY', SAD: 'SAD', NERVOUS: 'NERVOUS',
  HAPPY: 'HAPPY', SURPRISED: 'SURPRISED', SLY: 'SLY', CONTENT: 'CONTENT',
  DEFENSIVE: 'DEFENSIVE', ARROGANT: 'ARROGANT',
  HEAD: 'HEAD', TORSO: 'TORSO', HANDS: 'HANDS', LEGS: 'LEGS'
} as const;

// --- Helper: color descriptions ---
const getSuspectColorDescription = (seed: number) => {
  const descriptions = ['crimson', 'emerald', 'sapphire', 'amber', 'amethyst', 'cyan', 'slate', 'sepia', 'violet', 'teal'];
  return descriptions[seed % descriptions.length];
};

// --- Helper: Upload image to Firebase Storage ---
const uploadImage = async (base64: string, path: string): Promise<string> => {
  if (!base64 || base64.startsWith('http')) return base64;

  try {
    const data = base64.includes(',') ? base64.split(',')[1] : base64;
    const buffer = Buffer.from(data, 'base64');
    const bucket = admin.storage().bucket();
    const file = bucket.file(path);
    await file.save(buffer, {
      metadata: { contentType: 'image/png', cacheControl: 'public, max-age=3600' },
    });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${path}?v=${Date.now()}`;
  } catch (error) {
    console.error(`[Images] Upload failed for ${path}:`, error);
    return base64; // Fallback
  }
};

// --- Victim Prompt Builder ---
const buildVictimPrompt = (s: Suspect, theme?: string): string => {
  const details: string[] = [];
  if (s.gender) details.push(s.gender);
  if (s.role && s.role !== 'The Victim') details.push(`Role: ${s.role}`);
  if (s.bio) details.push(`Bio: ${s.bio}`);
  if (s.witnessObservations) details.push(`Scene details: ${s.witnessObservations}`);
  const physicalDesc = s.physicalDescription || '';
  const contextBlock = details.length > 0 ? details.join('. ') + '.' : '';
  return `
    Subject: Crime scene depiction of a deceased victim. ${contextBlock}
    ${theme ? `Theme: ${theme}.` : ''}
    Visual cues: ${physicalDesc || 'Use the character details above to determine appearance.'}.
    Condition: The victim is deceased.
    Composition: Scene should reflect the narrative context.
    NEGATIVE PROMPT: Smiling, lively, open eyes, looking at camera, text, UI, split screen.
  `;
};

// --- IMAGE GENERATION HELPER ---
export const generateImageRaw = async (
  prompt: string,
  aspectRatio: string = '1:1',
  refImages: string[] = [],
  mode: 'create' | 'edit' | 'evidence' = 'create',
  modelOverride?: string
): Promise<string | null> => {
  try {
    const parts: any[] = [];

    for (const ref of refImages) {
      let base64Data = "";

      if (ref === STYLE_REF_URL) {
        const fetched = await getStyleRefBase64();
        if (fetched) base64Data = fetched;
      } else if (ref.startsWith('data:')) {
        base64Data = ref.split(',')[1];
      } else if (ref.startsWith('http')) {
        // Fetch remote image via Node fetch
        try {
          const response = await fetch(ref);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString('base64');
        } catch (err) {
          throw new Error(`Failed to fetch reference image: ${ref}`);
        }
      } else {
        base64Data = ref;
      }

      if (base64Data) {
        parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
      } else {
        throw new Error(`Reference image data missing for: ${ref}`);
      }
    }

    let instruction = INSTRUCTION_NEW_CHAR;
    if (mode === 'edit') instruction = INSTRUCTION_PRESERVE_CHAR;
    else if (mode === 'evidence') instruction = INSTRUCTION_RELATED_EVIDENCE;

    const fullPrompt = `${PIXEL_ART_BASE} ${instruction} ${prompt}`;
    parts.push({ text: fullPrompt });

    const res = await ai.models.generateContent({
      model: modelOverride || GEMINI_MODELS.IMAGE,
      contents: { parts },
      config: { imageConfig: { aspectRatio } }
    });

    const candidate = res.candidates?.[0];
    if (candidate) {
      const finishReason = candidate.finishReason as string;
      if (finishReason === 'SAFETY') {
        const ratings = (candidate as any).safetyRatings;
        const blocked = ratings?.filter((r: any) => r.blocked)?.map((r: any) => r.category?.replace('HARM_CATEGORY_', '')) || [];
        throw new Error(`Image blocked by safety filter${blocked.length ? ` (${blocked.join(', ')})` : ''}.`);
      }
      if (finishReason === 'RECITATION') throw new Error('Image blocked: too similar to existing copyrighted content.');
      if (finishReason === 'BLOCKLIST') throw new Error('Image blocked: prompt contains restricted terms.');
    }

    const blockReason = (res as any).promptFeedback?.blockReason;
    if (blockReason) throw new Error(`Prompt blocked by safety filter (${blockReason}).`);

    const part = candidate?.content?.parts?.find((p: any) => p.inlineData);
    if (part) return part.inlineData.data;

    throw new Error('No image was returned. This is usually caused by a safety filter.');
  } catch (e: any) {
    const status = e?.status || e?.code || e?.httpStatus;
    const msg = e?.message || String(e);

    if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('Rate limit exceeded — too many image requests. Wait a minute and try again.');
    }
    if (status === 401 || status === 403 || msg.includes('PERMISSION_DENIED')) {
      throw new Error('Authentication error — API key may be invalid or expired.');
    }
    if (status >= 500 || msg.includes('INTERNAL') || msg.includes('UNAVAILABLE')) {
      throw new Error('Google AI server error — the service is temporarily unavailable.');
    }
    if (msg.startsWith('Image blocked') || msg.startsWith('Prompt blocked') || msg.startsWith('No image was returned') || msg.startsWith('Rate limit') || msg.startsWith('Reference image')) {
      throw e;
    }
    console.error("Image Gen Failed", e);
    throw new Error(`Image generation failed: ${msg}`);
  }
};

// --- EMOTION GENERATION ---
const generateEmotionalVariants = async (
  neutralUrl: string,
  avatarSeed: number
): Promise<Record<string, string>> => {
  const newPortraits: Record<string, string> = { [Emotion.NEUTRAL]: neutralUrl };
  const colorDesc = getSuspectColorDescription(avatarSeed);

  const emotionsToGen = [
    Emotion.HAPPY, Emotion.ANGRY, Emotion.SAD, Emotion.NERVOUS,
    Emotion.SURPRISED, Emotion.SLY, Emotion.CONTENT, Emotion.DEFENSIVE, Emotion.ARROGANT
  ];

  const generateVariation = async (emo: string) => {
    const prompt = `Keep the character exactly the same, but change expression to ${emo}. Keep solid ${colorDesc} background. No text, no words.`;
    const raw = await generateImageRaw(prompt, '3:4', [neutralUrl], 'edit');
    return raw ? { emo, url: `data:image/png;base64,${raw}` } : null;
  };

  const BATCH_SIZE = 3;
  for (let i = 0; i < emotionsToGen.length; i += BATCH_SIZE) {
    const batch = emotionsToGen.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(emo => generateVariation(emo)));
    results.forEach(r => { if (r) newPortraits[r.emo] = r.url; });
  }

  return newPortraits;
};

// --- FORENSIC VARIANTS (DECEASED) ---
const generateForensicVariants = async (
  fullBodyUrl: string,
  suspect: Suspect
): Promise<Record<string, string>> => {
  const newPortraits: Record<string, string> = { [Emotion.NEUTRAL]: fullBodyUrl };
  const views = [Emotion.HEAD, Emotion.TORSO, Emotion.HANDS, Emotion.LEGS];

  const generateView = async (view: string) => {
    let partPrompt = "";
    const commonNegative = "NEGATIVE PROMPT: open eyes, staring, pupils, iris, looking at camera, standing up, alive, smiling, text, UI.";
    switch (view) {
      case Emotion.HEAD: partPrompt = "Extreme close up of the victim's head and face. Eyes are CLOSED. Lifeless. Forensic style."; break;
      case Emotion.TORSO: partPrompt = "Close up of the victim's chest, shirt, and pockets. No face visible. Forensic style."; break;
      case Emotion.HANDS: partPrompt = "Close up of the victim's hands and fingers. Pale skin. No face visible. Forensic style."; break;
      case Emotion.LEGS: partPrompt = "Close up of the victim's legs, pants, and shoes. No face visible. Forensic style."; break;
    }
    const prompt = `ZOOM IN: ${partPrompt} Maintain consistent clothing colors and skin tone from reference. Pixel art. ${commonNegative}`;
    const raw = await generateImageRaw(prompt, '3:4', [fullBodyUrl], 'edit');
    return raw ? { view, url: `data:image/png;base64,${raw}` } : null;
  };

  const BATCH_SIZE = 2;
  for (let i = 0; i < views.length; i += BATCH_SIZE) {
    const batch = views.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(v => generateView(v)));
    results.forEach(r => { if (r) newPortraits[r.view] = r.url; });
  }

  return newPortraits;
};

// --- PUBLIC IMAGE METHODS ---

export const generateEvidenceImage = async (
  evidence: Evidence,
  caseId: string,
  userId: string,
  refImage?: string
): Promise<string> => {
  if (!userId) throw new Error('[CRITICAL] generateEvidenceImage: userId is required');
  const refs = STYLE_REF_URL ? [STYLE_REF_URL] : [];
  if (refImage) refs.push(refImage);

  const mode = refImage ? 'evidence' : 'create';

  const b64 = await generateImageRaw(
    `Subject: ${evidence.title}, ${evidence.description}. Style: Forensic evidence photo taken with a harsh flash. High contrast, strong shadows, illuminated center, dark vignette edges. Gritty crime scene aesthetic. No text.`,
    '1:1', refs, mode
  );
  if (!b64) return "";

  const url = await uploadImage(b64, `images/${userId}/cases/${caseId}/evidence/${evidence.id}.png`);
  return url;
};

export const createImageFromPrompt = async (
  userPrompt: string,
  aspectRatio: string = '3:4'
): Promise<string | null> => {
  const refs = STYLE_REF_URL ? [STYLE_REF_URL] : [];
  const raw = await generateImageRaw(userPrompt, aspectRatio, refs, 'create');
  return raw ? `data:image/png;base64,${raw}` : null;
};

export const editImageWithPrompt = async (
  baseImageBase64: string,
  userPrompt: string,
  aspectRatio: string = '3:4'
): Promise<string | null> => {
  const prompt = `[STRICT INSTRUCTION]: Edit the image provided. ${userPrompt}. Maintain the pixel art style and composition. No text, no words.`;
  const raw = await generateImageRaw(prompt, aspectRatio, [baseImageBase64], 'edit');
  return raw ? `data:image/png;base64,${raw}` : null;
};

export const generateEmotionalVariantsFromBase = async (
  neutralBase64: string,
  suspect: Suspect | SupportCharacter,
  caseId: string,
  userId: string
): Promise<Record<string, string>> => {
  const isSuspect = (suspect as any).isGuilty !== undefined;
  const isDeceased = isSuspect && (suspect as Suspect).isDeceased;

  const variantPortraits = isDeceased
    ? await generateForensicVariants(neutralBase64, suspect as Suspect)
    : await generateEmotionalVariants(neutralBase64, suspect.avatarSeed);

  const folder = isSuspect ? 'suspects' : 'support';
  const uploadedPortraits: Record<string, string> = {
    [Emotion.NEUTRAL]: await uploadImage(neutralBase64, `images/${userId}/cases/${caseId}/${folder}/${suspect.id}/neutral.png`)
  };

  for (const [emo, b64] of Object.entries(variantPortraits)) {
    if (emo === Emotion.NEUTRAL) continue;
    uploadedPortraits[emo] = await uploadImage(b64, `images/${userId}/cases/${caseId}/${folder}/${suspect.id}/${emo}.png`);
  }

  return uploadedPortraits;
};

export const generateSuspectFromUpload = async (
  suspect: Suspect,
  userImageBase64: string,
  caseId: string,
  userId: string
): Promise<Suspect> => {
  if (!userId) throw new Error('[CRITICAL] generateSuspectFromUpload: userId is required');
  console.log(`[Gemini] generateSuspectFromUpload: Starting for ${suspect.name} (isDeceased: ${suspect.isDeceased})`);
  const colorDesc = getSuspectColorDescription(suspect.avatarSeed);

  let conversionPrompt: string;

  if (suspect.isDeceased) {
    const victimScene = buildVictimPrompt(suspect);
    conversionPrompt = `
      [TRANSFORM IMAGE]: Redraw the SECOND image as a 16-bit pixel art game asset.
      The FIRST image shows the target ART STYLE — copy its pixel art technique, NOT its subject or proportions.
      The SECOND image is the SUBJECT to transform.
      Output Style: ${PIXEL_ART_BASE}
      Context: Redraw as a DECEASED VICTIM in a crime scene.
      ${victimScene}
      NEGATIVE PROMPT: portrait, mugshot, photorealistic, photography.
    `;
  } else {
    conversionPrompt = `
      [TRANSFORM IMAGE]: Redraw the SECOND image as a 16-bit pixel art game asset.
      The FIRST image shows the target ART STYLE — copy its pixel art technique, NOT its subject or proportions.
      The SECOND image is the SUBJECT to transform.
      POSE OVERRIDE: Standard MUGSHOT POSE facing DIRECTLY at the camera.
      Output Style: ${PIXEL_ART_BASE}
      Background: Solid ${colorDesc} background.
      NEGATIVE PROMPT: Photorealistic, photography, high resolution, smooth shading.
    `;
  }

  let styleRefBase64: string | null = null;
  try {
    const fetched = await getStyleRefBase64();
    if (fetched) styleRefBase64 = fetched;
  } catch (e) {
    console.warn("Failed to get style ref for upload", e);
  }

  let neutralRaw: string | null = null;
  try {
    const parts: any[] = [];
    if (styleRefBase64) {
      parts.push({ inlineData: { mimeType: 'image/png', data: styleRefBase64 } });
    }
    parts.push({ inlineData: { mimeType: 'image/png', data: userImageBase64.split(',')[1] || userImageBase64 } });
    parts.push({ text: conversionPrompt });

    const res = await ai.models.generateContent({
      model: GEMINI_MODELS.IMAGE_HD,
      contents: { parts },
      config: { imageConfig: { aspectRatio: '3:4' } }
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (part) neutralRaw = part.inlineData.data;
  } catch (e: any) {
    console.error("Upload conversion failed", e);
    throw new Error(`Failed to convert uploaded image to pixel art: ${e?.message || 'Unknown error'}`);
  }

  if (!neutralRaw) throw new Error("Failed to convert uploaded image to pixel art.");

  const neutralBase64 = `data:image/png;base64,${neutralRaw}`;
  const neutralUrl = await uploadImage(neutralBase64, `images/${userId}/cases/${caseId}/suspects/${suspect.id}/neutral.png`);

  const variantPortraits = suspect.isDeceased
    ? await generateForensicVariants(neutralBase64, suspect)
    : await generateEmotionalVariants(neutralBase64, suspect.avatarSeed);

  const uploadedPortraits: Record<string, string> = { [Emotion.NEUTRAL]: neutralUrl };
  for (const [emo, b64] of Object.entries(variantPortraits)) {
    if (emo === Emotion.NEUTRAL) continue;
    uploadedPortraits[emo] = await uploadImage(b64, `images/${userId}/cases/${caseId}/suspects/${suspect.id}/${emo}.png`);
  }

  if (suspect.isDeceased && suspect.hiddenEvidence) {
    for (let i = 0; i < suspect.hiddenEvidence.length; i++) {
      const ev = suspect.hiddenEvidence[i];
      try {
        const evUrl = await generateEvidenceImage(ev, caseId, userId, neutralBase64);
        if (evUrl) ev.imageUrl = evUrl;
      } catch (e) {
        console.error(`Failed to regenerate hidden evidence ${ev.id} for victim:`, e);
      }
    }
  }

  return { ...suspect, portraits: uploadedPortraits };
};

export const regenerateSingleSuspect = async (
  suspect: Suspect | SupportCharacter,
  caseId: string,
  userId: string,
  theme: string = "Noir"
): Promise<Suspect | SupportCharacter> => {
  if (!userId) throw new Error('[CRITICAL] regenerateSingleSuspect: userId is required');
  console.log(`[Gemini] regenerateSingleSuspect: Starting for ${suspect.name} (Theme: ${theme})`);
  const colorDesc = getSuspectColorDescription(suspect.avatarSeed);
  const isSuspect = (suspect as any).isGuilty !== undefined;
  const folder = isSuspect ? 'suspects' : 'support';

  let basePrompt = "";
  if (isSuspect && (suspect as Suspect).isDeceased) {
    basePrompt = buildVictimPrompt(suspect as Suspect, theme);
  } else {
    basePrompt = `
      Subject: Portrait of a single ${suspect.gender} character. Role: ${suspect.role}.
      Theme: ${theme}.
      Visual cues: ${(suspect as any).physicalDescription || suspect.personality || "Detective style"}. 
      Expression: Neutral.
      Background: Solid ${colorDesc} background.
      Composition: Front-facing mugshot, full-bleed to the left and right edges.
      NEGATIVE PROMPT: Text, words, letters, UI, interface, signature, watermark, multiple people, photo-realistic.
    `;
  }

  const refs = STYLE_REF_URL ? [STYLE_REF_URL] : [];
  const neutralRaw = await generateImageRaw(basePrompt, '3:4', refs, 'create', GEMINI_MODELS.IMAGE_HD);
  if (!neutralRaw) throw new Error(`Failed to generate base portrait for ${suspect.name}`);

  const neutralBase64 = `data:image/png;base64,${neutralRaw}`;
  const neutralUrl = await uploadImage(neutralBase64, `images/${userId}/cases/${caseId}/${folder}/${suspect.id}/neutral.png`);

  let emotionPortraits: Record<string, string> = {};
  if (isSuspect && (suspect as Suspect).isDeceased) {
    emotionPortraits = await generateForensicVariants(neutralBase64, suspect as Suspect);
  } else {
    emotionPortraits = await generateEmotionalVariants(neutralBase64, suspect.avatarSeed);
  }

  const uploadedPortraits: Record<string, string> = { [Emotion.NEUTRAL]: neutralUrl };
  for (const [emo, b64] of Object.entries(emotionPortraits)) {
    if (emo === Emotion.NEUTRAL) continue;
    uploadedPortraits[emo] = await uploadImage(b64, `images/${userId}/cases/${caseId}/${folder}/${suspect.id}/${emo}.png`);
  }

  if (isSuspect && (suspect as Suspect).isDeceased && (suspect as Suspect).hiddenEvidence) {
    const s = suspect as Suspect;
    for (let i = 0; i < s.hiddenEvidence.length; i++) {
      const ev = s.hiddenEvidence[i];
      try {
        const evUrl = await generateEvidenceImage(ev, caseId, userId, neutralBase64);
        if (evUrl) ev.imageUrl = evUrl;
      } catch (e) {
        console.error(`Failed to regenerate hidden evidence ${ev.id} for victim:`, e);
        throw e;
      }
    }
  }

  return { ...suspect, portraits: uploadedPortraits };
};

export const pregenerateCaseImages = async (caseData: CaseData, userId: string) => {
  if (!userId) throw new Error('[CRITICAL] pregenerateCaseImages: userId is required');
  const styleRefs = STYLE_REF_URL ? [STYLE_REF_URL] : [];

  // Phase 1: Neutrals for All Suspects & Partner & Officer
  const neutralMap: Record<string, string> = {};
  const base64Map: Record<string, string> = {};
  const characterTasks: Promise<void>[] = [];

  (caseData.suspects || []).forEach(s => {
    characterTasks.push((async () => {
      const colorDesc = getSuspectColorDescription(s.avatarSeed);
      let prompt = "";
      if (s.isDeceased) {
        prompt = buildVictimPrompt(s, caseData.type);
      } else {
        prompt = `
          Subject: Portrait of a single ${s.gender} character. Role: ${s.role}. 
          Visual cues: ${s.physicalDescription || "Noir style"}. 
          Expression: Neutral.
          Background: Solid ${colorDesc} background.
          Composition: Front-facing mugshot, full-bleed.
          NEGATIVE PROMPT: Text, UI, border, letters, photo-realistic.
        `;
      }
      const b64 = await generateImageRaw(prompt, '3:4', styleRefs, 'create', GEMINI_MODELS.IMAGE_HD);
      if (b64) {
        const url = await uploadImage(b64, `images/${userId}/cases/${caseData.id}/suspects/${s.id}/neutral.png`);
        neutralMap[s.id] = url;
        base64Map[s.id] = `data:image/png;base64,${b64}`;
        s.portraits = s.portraits || {};
        s.portraits[Emotion.NEUTRAL] = url;
      }
    })());
  });

  if (caseData.partner) {
    characterTasks.push((async () => {
      const p = caseData.partner;
      const prompt = `Subject: Portrait of a ${p.gender} ${p.role} named ${p.name}. Theme: ${caseData.type}. Expression: Eager, helpful. Background: City street or tech lab. Composition: Front-facing mugshot, full-bleed. Pixel Art.`;
      const b64 = await generateImageRaw(prompt, '3:4', styleRefs, 'create', GEMINI_MODELS.IMAGE_HD);
      if (b64) {
        const url = await uploadImage(b64, `images/${userId}/cases/${caseData.id}/partner/neutral.png`);
        neutralMap['partner'] = url;
        base64Map['partner'] = `data:image/png;base64,${b64}`;
        p.portraits = p.portraits || {};
        p.portraits[Emotion.NEUTRAL] = url;
      }
    })());
  }

  if (caseData.officer) {
    characterTasks.push((async () => {
      const o = caseData.officer;
      const prompt = `Subject: Portrait of a ${o.gender} ${o.role} named ${o.name}. Theme: ${caseData.type}. Expression: Stern, commanding. Background: Office or Command Center. Composition: Front-facing mugshot, full-bleed. Pixel Art.`;
      const b64 = await generateImageRaw(prompt, '3:4', styleRefs, 'create', GEMINI_MODELS.IMAGE_HD);
      if (b64) {
        const url = await uploadImage(b64, `images/${userId}/cases/${caseData.id}/officer.png`);
        o.portraits = o.portraits || {};
        o.portraits[Emotion.NEUTRAL] = url;
      }
    })());
  }

  await Promise.all(characterTasks);

  // Phase 2: Evidence (Initial + Hidden)
  const evidenceTasks: Promise<void>[] = [];

  (caseData.initialEvidence || []).forEach(ev => {
    evidenceTasks.push((async () => {
      const b64 = await generateImageRaw(
        `Subject: ${ev.title}, ${ev.description}. Style: Forensic evidence photo taken with a harsh flash. Gritty crime scene aesthetic. No text.`,
        '1:1', styleRefs, 'create'
      );
      if (b64) {
        const url = await uploadImage(b64, `images/${userId}/cases/${caseData.id}/evidence/${ev.id}.png`);
        ev.imageUrl = url;
      }
    })());
  });

  (caseData.suspects || []).forEach(s => {
    const suspectRef = base64Map[s.id];
    (s.hiddenEvidence || []).forEach(ev => {
      evidenceTasks.push((async () => {
        const mode = (s.isDeceased && suspectRef) ? 'evidence' : 'create';
        const refs = suspectRef ? [...styleRefs, suspectRef] : styleRefs;
        const b64 = await generateImageRaw(
          `Subject: ${ev.title}, ${ev.description}. Style: Forensic evidence photo. Gritty crime scene aesthetic. No text.`,
          '1:1', refs, mode as any
        );
        if (b64) {
          const url = await uploadImage(b64, `images/${userId}/cases/${caseData.id}/evidence/${ev.id}.png`);
          ev.imageUrl = url;
        }
      })());
    });
  });

  await Promise.all(evidenceTasks);

  // Phase 3: Emotional OR Forensic Variants
  interface VariantTask {
    targetId: string;
    emotion: string;
    neutralUrl: string;
    type: 'suspect' | 'partner';
  }

  const variantTasks: VariantTask[] = [];
  const livingEmotions = [Emotion.HAPPY, Emotion.ANGRY, Emotion.SAD, Emotion.NERVOUS, Emotion.SURPRISED, Emotion.SLY, Emotion.CONTENT, Emotion.DEFENSIVE, Emotion.ARROGANT];
  const forensicViews = [Emotion.HEAD, Emotion.TORSO, Emotion.HANDS, Emotion.LEGS];

  (caseData.suspects || []).forEach(s => {
    const b64 = base64Map[s.id];
    if (b64) {
      const targetEmotions = s.isDeceased ? forensicViews : livingEmotions;
      targetEmotions.forEach(emo => {
        variantTasks.push({ targetId: s.id, emotion: emo, neutralUrl: b64, type: 'suspect' });
      });
    }
  });

  if (caseData.partner && base64Map['partner']) {
    livingEmotions.forEach(emo => {
      variantTasks.push({ targetId: 'partner', emotion: emo, neutralUrl: base64Map['partner'], type: 'partner' });
    });
  }

  const BATCH_SIZE = 4;
  for (let i = 0; i < variantTasks.length; i += BATCH_SIZE) {
    const batch = variantTasks.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (task) => {
      let prompt = "";
      let colorDesc = "dark grey";

      const s = caseData.suspects.find(x => x.id === task.targetId);
      const isDeceased = s?.isDeceased;

      if (task.type === 'suspect' && s) {
        colorDesc = getSuspectColorDescription(s.avatarSeed);
      } else {
        colorDesc = "city street or tech lab";
      }

      if (isDeceased) {
        let partPrompt = "";
        const commonNegative = "NEGATIVE PROMPT: open eyes, staring, pupils, iris, looking at camera, standing up, alive, smiling, text, UI.";
        switch (task.emotion) {
          case Emotion.HEAD: partPrompt = "Extreme close up of the victim's head and face. Eyes CLOSED. Lifeless. Forensic style."; break;
          case Emotion.TORSO: partPrompt = "Close up of the victim's torso and clothing. No face. Forensic style."; break;
          case Emotion.HANDS: partPrompt = "Close up of the victim's hands. No face. Forensic style."; break;
          case Emotion.LEGS: partPrompt = "Close up of the victim's legs and shoes. No face. Forensic style."; break;
        }
        prompt = `ZOOM IN: ${partPrompt} Maintain consistent clothing colors and skin tone from reference. Pixel art. ${commonNegative}`;
      } else {
        prompt = `Keep the character exactly the same, but change expression to ${task.emotion}. Keep solid/consistent ${colorDesc} background. No text, no words.`;
      }

      const b64 = await generateImageRaw(prompt, '3:4', [task.neutralUrl], 'edit');

      if (b64) {
        const url = await uploadImage(b64, `images/${userId}/cases/${caseData.id}/${task.type === 'suspect' ? 'suspects' : 'partner'}/${task.targetId}/${task.emotion}.png`);
        if (task.type === 'suspect') {
          if (s && s.portraits) s.portraits[task.emotion] = url;
        } else if (task.type === 'partner') {
          const p = caseData.partner;
          if (p && p.portraits) p.portraits[task.emotion] = url;
        }
      }
    }));
  }

  // Phase 4: Hero Image
  const victim = caseData.suspects.find(s => s.isDeceased);
  if (victim?.portraits?.[Emotion.NEUTRAL]) {
    caseData.heroImageUrl = victim.portraits[Emotion.NEUTRAL];
  } else if (caseData.initialEvidence?.[0]?.imageUrl) {
    caseData.heroImageUrl = caseData.initialEvidence[0].imageUrl;
  }
};
