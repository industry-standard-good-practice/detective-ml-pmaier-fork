import admin from 'firebase-admin';
import { ai } from "./geminiClient.js";
import { GEMINI_MODELS } from "./geminiModels.js";
import {
  STYLE_REF_URL,
  PIXEL_ART_BASE,
  INSTRUCTION_NEW_CHAR,
  INSTRUCTION_PRESERVE_CHAR,
  INSTRUCTION_EDIT_EMOTION_POSE,
  INSTRUCTION_EDIT_REFRAME,
  INSTRUCTION_RELATED_EVIDENCE,
  EVIDENCE_CARD_CLOSEUP_FRAMING,
  getStyleRefBase64,
} from "./geminiStyles.js";
import {
  inferVictimPortraitKeyForEvidence,
  environmentScenePortraitKey,
  ENV_SCENE_PORTRAIT_PREFIX,
} from "./victimPortraitKey.js";

// --- Types ---
interface Evidence {
  id: string;
  title: string;
  location?: string;
  description: string;
  imageUrl?: string;
  discoveryContext?: 'body' | 'environment';
  environmentIncludesBody?: boolean;
}

export type GenerateEvidenceImageMeta = {
  /** Victim-card hidden clues use special prompts (body vs room) and optional portrait ref. */
  forDeceasedVictim?: boolean;
  caseTheme?: string;
};
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
  heroImageUrl?: string; authorId?: string;[key: string]: any;
}

// Emotion enum (duplicated from frontend types)
const Emotion = {
  NEUTRAL: 'NEUTRAL', ANGRY: 'ANGRY', SAD: 'SAD', NERVOUS: 'NERVOUS',
  HAPPY: 'HAPPY', SURPRISED: 'SURPRISED', SLY: 'SLY', CONTENT: 'CONTENT',
  DEFENSIVE: 'DEFENSIVE', ARROGANT: 'ARROGANT',
  HEAD: 'HEAD', TORSO: 'TORSO', HANDS: 'HANDS', LEGS: 'LEGS',
  /** Crime-scene / room overview for environment-hidden clues (not a body close-up). */
  ENVIRONMENT: 'ENVIRONMENT',
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

export type ImageGenMode = 'create' | 'edit' | 'edit_reframe' | 'edit_emotion' | 'evidence';

// --- IMAGE GENERATION HELPER ---
export const generateImageRaw = async (
  prompt: string,
  aspectRatio: string = '1:1',
  refImages: string[] = [],
  mode: ImageGenMode = 'create',
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
    else if (mode === 'edit_reframe') instruction = INSTRUCTION_EDIT_REFRAME;
    else if (mode === 'edit_emotion') instruction = INSTRUCTION_EDIT_EMOTION_POSE;
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
    if (part?.inlineData?.data) return part.inlineData.data;

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

/**
 * Affect + posture axes per emotion label (no scripted poses — reduces example overfitting).
 * Dimensions: valence, arousal, tension, interpersonal openness, approach (withdrawn ↔ forward).
 */
const SUSPECT_EMOTION_DIRECTIVES: Record<string, string> = {
  HAPPY: 'Affect: positive valence, moderate arousal. Musculoskeletal: low tension; open, approachable configuration.',
  ANGRY: 'Affect: negative valence, high arousal. Musculoskeletal: high tension; confrontational or squared configuration.',
  SAD: 'Affect: negative valence, low energy. Musculoskeletal: elevated passive tension; collapsed or inward configuration.',
  NERVOUS:
    'Affect: negative valence, high arousal. Musculoskeletal: protective or closed configuration; elevated tension in shoulders, jaw, and hands; weight may shift away from the viewer.',
  SURPRISED: 'Affect: high arousal, abrupt shift. Musculoskeletal: sudden retraction or elevation of upper body; widened facial aperture.',
  SLY: 'Affect: controlled positive/negative blend; low trust signaling. Musculoskeletal: asymmetric tension; guarded openness.',
  CONTENT: 'Affect: positive valence, low arousal. Musculoskeletal: low tension; stable, balanced configuration.',
  DEFENSIVE:
    'Affect: negative valence, threat sensitivity. Musculoskeletal: closed or blocking configuration; elevated tension; orientation may shift away from the viewer.',
  ARROGANT: 'Affect: dominance signaling. Musculoskeletal: expanded vertical and frontal projection; controlled high tension.',
};

const buildSuspectEmotionVariantPrompt = (emo: string, colorDesc: string): string => {
  const key = emo.toUpperCase();
  const directive =
    SUSPECT_EMOTION_DIRECTIVES[key] ||
    'Encode the label through congruent facial affect and upper-body posture; at least two independent channels (face, shoulders, arms, or stance) must change from neutral.';
  return `Emotional state: ${key}. ${directive} Keep solid ${colorDesc} background. Single portrait — one figure, one camera. No text, no words.`;
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
    const prompt = buildSuspectEmotionVariantPrompt(emo, colorDesc);
    const raw = await generateImageRaw(prompt, '3:4', [neutralUrl], 'edit_emotion');
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
/** Applied whenever any part of the victim may appear; models often ignore a loose "negative" list — use mandatory rules. */
const DECEASED_FORENSIC_NEGATIVE =
  'MANDATORY IF VICTIM VISIBLE: eyes fully CLOSED, eyelids shut, lifeless; no pupils, no eye whites staring. FORBIDDEN: open eyes, wide eyes, staring upward, eye contact, alive or startled expression, standing, smiling, investigators, CSI techs, or living people as subjects. FORBIDDEN: text, UI.';

/** Single-viewpoint constraint for forensic reframes (no composite layouts). */
const DECEASED_SINGLE_CAMERA_RULE =
  'FORBIDDEN: multiple viewpoints, inset frames, overlaid regions at mismatched scale, split panels, or dual camera angles in one image. REQUIRED: one homogeneous output — single camera position and crop; subject matter fills the frame per the shot type.';

/** Full edit prompt for one deceased examination view (theme used for ENVIRONMENT framing). */
const buildDeceasedForensicEditPrompt = (view: string, theme: string): string => {
  switch (view) {
    case Emotion.HEAD:
      return `CAMERA: closer than reference; subject region head and face only; face occupies majority of frame height and width. Eyes CLOSED, lifeless. Forensic flash. Hair and skin tone consistent with reference. Pixel art. ${DECEASED_SINGLE_CAMERA_RULE} ${DECEASED_FORENSIC_NEGATIVE}`;
    case Emotion.TORSO:
      return `CAMERA: closer than reference; same scene identity. Subject region upper trunk and garments from reference; face excluded from frame by crop. FORBIDDEN: dual-scale composition where full-scene scale and detail scale both appear as distinct layers. ${DECEASED_SINGLE_CAMERA_RULE} Forensic flash. Garment colors consistent with reference. Pixel art. ${DECEASED_FORENSIC_NEGATIVE}`;
    case Emotion.HANDS:
      return `CAMERA: closer than reference. Primary subject: hands; hands occupy majority of frame; adjacent floor or fabric only as immediate context. No face. ${DECEASED_SINGLE_CAMERA_RULE} Forensic flash. Skin and garment colors consistent with reference. Pixel art. ${DECEASED_FORENSIC_NEGATIVE}`;
    case Emotion.LEGS:
      return `CAMERA: closer than reference. Primary subject: legs and footwear; lower limbs occupy majority of frame. No face. ${DECEASED_SINGLE_CAMERA_RULE} Forensic flash. Garment colors consistent with reference. Pixel art. ${DECEASED_FORENSIC_NEGATIVE}`;
    case Emotion.ENVIRONMENT:
      return `CAMERA: wide field of view relative to reference; must differ materially in distance, angle, or height. Room architecture and floor plane occupy majority of frame area; victim occupies small fractional area. FORBIDDEN: same viewpoint and field size as reference with only additive objects. Theme: ${theme}. Forensic flash, pixel art. ${DECEASED_SINGLE_CAMERA_RULE} ${DECEASED_FORENSIC_NEGATIVE}`;
    default:
      return `CAMERA: closer than reference; subject region upper trunk and garments; single coherent shot. ${DECEASED_SINGLE_CAMERA_RULE} Forensic style. Pixel art. ${DECEASED_FORENSIC_NEGATIVE}`;
  }
};

/** One environmental clue → its own crime-scene framing (pregen / consistency). Must differ from NEUTRAL; respect environmentIncludesBody like generateEvidenceImage. */
const buildEnvironmentScenePortraitPrompt = (ev: Evidence, theme: string): string => {
  const loc = (ev.location || '').trim();
  const locBit = loc ? `Placement / anchor (must match this in frame): ${loc}. ` : '';
  const includeBody = ev.environmentIncludesBody === true;

  if (includeBody) {
    return `[ENVIRONMENT CLUE — PORTRAIT CARD] Camera must differ from the neutral full-body reference; FORBIDDEN: identical floor-centered body composition. ${locBit}Primary evidence: "${ev.title}" — ${ev.description}. Theme: ${theme}. Victim only small, partial, or edge-blurred; if any face visible: eyes CLOSED, lifeless. Forensic flash, pixel art. ${DECEASED_FORENSIC_NEGATIVE}`;
  }

  return `[ENVIRONMENT CLUE — PORTRAIT CARD — NO BODY IN FRAME] ${locBit}Depict examination of the clue location — not a body examination and not a floor crime scene overview.

COMPOSITION: tight forensic shot; camera aimed into the placement surface or container. Evidence "${ev.title}" is the dominant readable subject, consistent with: ${ev.description}. Camera angle: downward or oblique into the placement; evidence occupies majority of frame.

Use the reference image for room materials and wood tones only; reframe entirely away from the neutral body-centered layout. FORBIDDEN: victim, corpse, body, limbs, human face, investigators, police, magnifying glass over a person, or living people. No open eyes (no people at all). Forensic flash, pixel art. ${DECEASED_FORENSIC_NEGATIVE}`;
};

function buildVictimExaminationImagePrompt(view: string, theme: string, hiddenEvidence: Evidence[] | undefined): string {
  if (view.startsWith(ENV_SCENE_PORTRAIT_PREFIX)) {
    const ev = hiddenEvidence?.find((e) => environmentScenePortraitKey(e.id) === view);
    if (ev) return buildEnvironmentScenePortraitPrompt(ev, theme);
  }
  return buildDeceasedForensicEditPrompt(view, theme);
}

const generateForensicVariants = async (
  fullBodyUrl: string,
  theme: string = 'Noir',
  hiddenEvidence?: Evidence[]
): Promise<Record<string, string>> => {
  const newPortraits: Record<string, string> = { [Emotion.NEUTRAL]: fullBodyUrl };
  const views: string[] = [Emotion.HEAD, Emotion.TORSO, Emotion.HANDS, Emotion.LEGS, Emotion.ENVIRONMENT];
  (hiddenEvidence || []).forEach((ev) => {
    if (ev.discoveryContext === 'environment') {
      views.push(environmentScenePortraitKey(ev.id));
    }
  });

  const generateView = async (view: string) => {
    const prompt = buildVictimExaminationImagePrompt(view, theme, hiddenEvidence);
    const raw = await generateImageRaw(prompt, '3:4', [fullBodyUrl], 'edit_reframe', GEMINI_MODELS.IMAGE_HD);
    return raw ? { view, url: `data:image/png;base64,${raw}` } : null;
  };

  const BATCH_SIZE = 2;
  for (let i = 0; i < views.length; i += BATCH_SIZE) {
    const batch = views.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((v) => generateView(v)));
    results.forEach((r) => {
      if (r) newPortraits[r.view] = r.url;
    });
  }

  return newPortraits;
};

/**
 * Ensures the victim has portrait URLs for every examination zone required by current hiddenEvidence
 * (inferred from discoveryContext + location/title/description). Mutates suspect.portraits.
 */
export const ensureVictimExaminationPortraits = async (
  suspect: Suspect,
  caseId: string,
  userId: string,
  caseTheme: string
): Promise<number> => {
  if (!userId) throw new Error('[CRITICAL] ensureVictimExaminationPortraits: userId is required');
  if (!suspect.isDeceased || !(suspect.hiddenEvidence?.length)) return 0;

  const neutral = suspect.portraits?.[Emotion.NEUTRAL];
  if (!neutral || neutral === 'PLACEHOLDER') return 0;

  const required = new Set<string>();
  for (const ev of suspect.hiddenEvidence) {
    required.add(inferVictimPortraitKeyForEvidence(ev));
  }

  suspect.portraits = suspect.portraits || {};
  const folder = 'suspects';
  let generated = 0;

  for (const view of required) {
    const cur = suspect.portraits[view];
    if (cur && cur !== 'PLACEHOLDER') continue;

    const prompt = buildVictimExaminationImagePrompt(view, caseTheme, suspect.hiddenEvidence);
    const raw = await generateImageRaw(prompt, '3:4', [neutral], 'edit', GEMINI_MODELS.IMAGE_HD);
    if (!raw) {
      console.warn(`[Images] Failed to generate missing victim portrait "${view}" for ${suspect.name}`);
      continue;
    }
    const b64 = `data:image/png;base64,${raw}`;
    suspect.portraits[view] = await uploadImage(b64, `images/${userId}/cases/${caseId}/${folder}/${suspect.id}/${view}.png`);
    generated += 1;
  }
  return generated;
};

// --- PUBLIC IMAGE METHODS ---

export const generateEvidenceImage = async (
  evidence: Evidence,
  caseId: string,
  userId: string,
  refImage?: string,
  meta?: GenerateEvidenceImageMeta
): Promise<string> => {
  if (!userId) throw new Error('[CRITICAL] generateEvidenceImage: userId is required');
  const styleRefs: string[] = STYLE_REF_URL ? [STYLE_REF_URL] : [];
  const theme = meta?.caseTheme || 'Noir investigation';
  const loc = (evidence.location || '').trim();
  const locBit = loc ? ` Placement: ${loc}.` : '';

  let refs = [...styleRefs];
  let mode: 'create' | 'evidence' = 'create';
  let prompt = '';

  if (meta?.forDeceasedVictim) {
    const zone = evidence.discoveryContext === 'environment' ? 'environment' : 'body';
    if (zone === 'environment') {
      const includeBody = evidence.environmentIncludesBody === true;
      if (includeBody && refImage) {
        refs = [...styleRefs, refImage];
        mode = 'evidence';
        prompt = `${INSTRUCTION_RELATED_EVIDENCE} ${EVIDENCE_CARD_CLOSEUP_FRAMING} ${PIXEL_ART_BASE} Theme: ${theme}. Evidence: "${evidence.title}" — ${evidence.description}.${locBit} The physical evidence fills most of the frame. The victim from the reference may appear only as a small, partial, heavily blurred background hint — never the dominant subject. Harsh flash forensic mood. No text, no captions.`;
      } else {
        refs = [...styleRefs];
        mode = 'create';
        prompt = `${PIXEL_ART_BASE} ${EVIDENCE_CARD_CLOSEUP_FRAMING} Theme: ${theme}.${locBit} Evidence object: "${evidence.title}" — ${evidence.description}. STRICT NEGATIVE: no dead body, no corpse, no human remains, no victim, no person, no limbs, no face in frame. Surrounding rug/floor/furniture only as soft peripheral context. Forensic flash. No text.`;
      }
    } else {
      if (refImage) {
        refs = [...styleRefs, refImage];
        mode = 'evidence';
        prompt = `${INSTRUCTION_RELATED_EVIDENCE} ${EVIDENCE_CARD_CLOSEUP_FRAMING} Close-up forensic detail on the body or clothing. "${evidence.title}", ${evidence.description}.${locBit} ${PIXEL_ART_BASE} Harsh flash, high contrast. No text.`;
      } else {
        refs = [...styleRefs];
        mode = 'create';
        prompt = `Subject: "${evidence.title}", ${evidence.description}.${locBit} ${EVIDENCE_CARD_CLOSEUP_FRAMING} Style: Forensic close-up on remains or garments. ${PIXEL_ART_BASE} No text.`;
      }
    }
  } else {
    if (refImage) {
      refs = [...styleRefs, refImage];
      mode = 'evidence';
      prompt = `Subject: ${evidence.title}, ${evidence.description}.${locBit} ${EVIDENCE_CARD_CLOSEUP_FRAMING} Style: Forensic evidence photo taken with a harsh flash. High contrast, strong shadows. Gritty crime scene aesthetic. ${PIXEL_ART_BASE} No text.`;
    } else if (evidence.discoveryContext === 'environment') {
      refs = [...styleRefs];
      mode = 'create';
      const noBody = evidence.environmentIncludesBody !== true;
      prompt = `${PIXEL_ART_BASE} ${EVIDENCE_CARD_CLOSEUP_FRAMING} Theme: ${theme}.${locBit} "${evidence.title}" — ${evidence.description}. ${noBody ? 'STRICT: no dead body, no corpse, no human remains in frame. ' : ''}Forensic flash. No text.`;
    } else {
      refs = [...styleRefs];
      mode = 'create';
      prompt = `Subject: ${evidence.title}, ${evidence.description}.${locBit} ${EVIDENCE_CARD_CLOSEUP_FRAMING} Style: Forensic evidence photo taken with a harsh flash. High contrast, strong shadows, illuminated center, dark vignette edges. Gritty crime scene aesthetic. ${PIXEL_ART_BASE} No text.`;
    }
  }

  const b64 = await generateImageRaw(prompt, '1:1', refs, mode);
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
  userId: string,
  opts?: { caseTheme?: string }
): Promise<Record<string, string>> => {
  const isSuspect = (suspect as any).isGuilty !== undefined;
  const isDeceased = isSuspect && (suspect as Suspect).isDeceased;
  const theme = (opts?.caseTheme && String(opts.caseTheme).trim()) || 'Noir';

  const variantPortraits = isDeceased
    ? await generateForensicVariants(neutralBase64, theme, (suspect as Suspect).hiddenEvidence)
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

/**
 * Generate and upload a single portrait slot from the neutral base (living emotional, deceased forensic, or NEUTRAL upload-only).
 * Used for progressive variant regeneration from the case-review editor.
 */
export const generateOnePortraitVariantFromBase = async (
  neutralBase64: string,
  variantKey: string,
  suspect: Suspect | SupportCharacter,
  caseId: string,
  userId: string,
  opts?: { caseTheme?: string }
): Promise<{ url: string }> => {
  if (!userId) throw new Error('[CRITICAL] generateOnePortraitVariantFromBase: userId is required');
  const isSuspect = (suspect as any).isGuilty !== undefined;
  const isDeceased = isSuspect && (suspect as Suspect).isDeceased;
  const theme = (opts?.caseTheme && String(opts.caseTheme).trim()) || 'Noir';
  const folder = isSuspect ? 'suspects' : 'support';
  const fileKey = variantKey.replace(/[^a-zA-Z0-9._-]/g, '_');

  if (variantKey === Emotion.NEUTRAL) {
    const url = await uploadImage(neutralBase64, `images/${userId}/cases/${caseId}/${folder}/${suspect.id}/neutral.png`);
    return { url };
  }

  if (!isDeceased) {
    const colorDesc = getSuspectColorDescription(suspect.avatarSeed);
    const prompt = buildSuspectEmotionVariantPrompt(variantKey, colorDesc);
    const raw = await generateImageRaw(prompt, '3:4', [neutralBase64], 'edit_emotion');
    if (!raw) throw new Error(`Failed to generate portrait variant: ${variantKey}`);
    const b64 = `data:image/png;base64,${raw}`;
    const url = await uploadImage(b64, `images/${userId}/cases/${caseId}/${folder}/${suspect.id}/${fileKey}.png`);
    return { url };
  }

  const victim = suspect as Suspect;
  const prompt = buildVictimExaminationImagePrompt(variantKey, theme, victim.hiddenEvidence);
  const raw = await generateImageRaw(prompt, '3:4', [neutralBase64], 'edit_reframe', GEMINI_MODELS.IMAGE_HD);
  if (!raw) throw new Error(`Failed to generate forensic variant: ${variantKey}`);
  const b64 = `data:image/png;base64,${raw}`;
  const url = await uploadImage(b64, `images/${userId}/cases/${caseId}/${folder}/${suspect.id}/${fileKey}.png`);
  return { url };
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
    if (part?.inlineData?.data) neutralRaw = part.inlineData.data;
  } catch (e: any) {
    console.error("Upload conversion failed", e);
    throw new Error(`Failed to convert uploaded image to pixel art: ${e?.message || 'Unknown error'}`);
  }

  if (!neutralRaw) throw new Error("Failed to convert uploaded image to pixel art.");

  const neutralBase64 = `data:image/png;base64,${neutralRaw}`;
  const neutralUrl = await uploadImage(neutralBase64, `images/${userId}/cases/${caseId}/suspects/${suspect.id}/neutral.png`);

  const variantPortraits = suspect.isDeceased
    ? await generateForensicVariants(neutralBase64, 'Noir')
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
        const evUrl = await generateEvidenceImage(ev, caseId, userId, neutralBase64, {
          forDeceasedVictim: true,
          caseTheme: 'Noir',
        });
        if (evUrl) ev.imageUrl = evUrl;
      } catch (e) {
        console.error(`Failed to regenerate hidden evidence ${ev.id} for victim:`, e);
      }
    }
  }

  return { ...suspect, portraits: uploadedPortraits };
};

/** Generate and upload only the NEUTRAL base (used for progressive case-review reroll). */
export const generateNeutralPortraitForSuspect = async (
  suspect: Suspect | SupportCharacter,
  caseId: string,
  userId: string,
  theme: string = "Noir"
): Promise<{ neutralUrl: string; neutralBase64: string }> => {
  if (!userId) throw new Error('[CRITICAL] generateNeutralPortraitForSuspect: userId is required');
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
  return { neutralUrl, neutralBase64 };
};

export const regenerateSingleSuspect = async (
  suspect: Suspect | SupportCharacter,
  caseId: string,
  userId: string,
  theme: string = "Noir"
): Promise<Suspect | SupportCharacter> => {
  if (!userId) throw new Error('[CRITICAL] regenerateSingleSuspect: userId is required');
  console.log(`[Gemini] regenerateSingleSuspect: Starting for ${suspect.name} (Theme: ${theme})`);
  const { neutralUrl, neutralBase64 } = await generateNeutralPortraitForSuspect(suspect, caseId, userId, theme);
  const isSuspect = (suspect as any).isGuilty !== undefined;
  const folder = isSuspect ? 'suspects' : 'support';

  let emotionPortraits: Record<string, string> = {};
  if (isSuspect && (suspect as Suspect).isDeceased) {
    emotionPortraits = await generateForensicVariants(neutralBase64, theme, (suspect as Suspect).hiddenEvidence);
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
        const evUrl = await generateEvidenceImage(ev, caseId, userId, neutralBase64, {
          forDeceasedVictim: true,
          caseTheme: theme,
        });
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
      try {
        const url = await generateEvidenceImage(ev, caseData.id, userId, undefined, {
          caseTheme: caseData.type,
        });
        if (url) ev.imageUrl = url;
      } catch (e) {
        console.error(`[pregenerate] initial evidence ${ev.id}:`, e);
      }
    })());
  });

  (caseData.suspects || []).forEach(s => {
    const suspectRef = base64Map[s.id];
    (s.hiddenEvidence || []).forEach(ev => {
      evidenceTasks.push((async () => {
        try {
          const url = await generateEvidenceImage(
            ev,
            caseData.id,
            userId,
            s.isDeceased ? suspectRef : undefined,
            s.isDeceased
              ? { forDeceasedVictim: true, caseTheme: caseData.type }
              : undefined
          );
          if (url) ev.imageUrl = url;
        } catch (e) {
          console.error(`[pregenerate] hidden evidence ${ev.id}:`, e);
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
  const forensicViews = [Emotion.HEAD, Emotion.TORSO, Emotion.HANDS, Emotion.LEGS, Emotion.ENVIRONMENT];

  (caseData.suspects || []).forEach(s => {
    const b64 = base64Map[s.id];
    if (b64) {
      if (s.isDeceased) {
        forensicViews.forEach(emo => {
          variantTasks.push({ targetId: s.id, emotion: emo, neutralUrl: b64, type: 'suspect' });
        });
        (s.hiddenEvidence || []).forEach(ev => {
          if (ev.discoveryContext === 'environment') {
            variantTasks.push({
              targetId: s.id,
              emotion: environmentScenePortraitKey(ev.id),
              neutralUrl: b64,
              type: 'suspect',
            });
          }
        });
      } else {
        livingEmotions.forEach(emo => {
          variantTasks.push({ targetId: s.id, emotion: emo, neutralUrl: b64, type: 'suspect' });
        });
      }
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

      const variantMode: ImageGenMode = isDeceased ? 'edit_reframe' : 'edit_emotion';
      if (isDeceased) {
        prompt = buildVictimExaminationImagePrompt(task.emotion, caseData.type || 'Noir', s?.hiddenEvidence);
      } else {
        prompt = buildSuspectEmotionVariantPrompt(task.emotion, colorDesc);
      }

      const b64 = await generateImageRaw(prompt, '3:4', [task.neutralUrl], variantMode, GEMINI_MODELS.IMAGE_HD);

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
