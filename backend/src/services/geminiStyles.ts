import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- STYLE CONSTANTS ---
export const STYLE_REF_URL = "assets/styleRef.png";

export const PIXEL_ART_BASE = "Style: High-quality 16-bit pixel art. Dithered shading. Limited color palette (VGA style). Sharp, distinct pixels. Retro point-and-click adventure game aesthetic. No blur, no anti-aliasing.";

export const INSTRUCTION_NEW_CHAR = "[STRICT INSTRUCTION]: Use the provided reference image ONLY for guidance on the PIXEL ART STYLE and COMPOSITION (framing/layout). DO NOT look at the reference image for subject matter, character appearance, or demeanor. Generate a completely NEW subject based solely on the text prompt.";

export const INSTRUCTION_PRESERVE_CHAR = "[STRICT INSTRUCTION]: The provided image is the REFERENCE CHARACTER. You MUST generate THIS EXACT CHARACTER. Keep facial features, hair, clothing, accessories, and colors EXACTLY the same. Only change the facial expression as requested. Do not change the art style or background color.";

/** Interrogation-style cards: head and upper torso only — never full-length standing figures. */
export const LIVING_CHARACTER_PORTRAIT_FRAMING =
  "COMPOSITION: Bust / upper-chest portrait only — camera close enough that head, face, shoulders, and upper torso dominate the frame; crop at mid-chest or higher. FORBIDDEN: full-body, head-to-toe, full-length standing figure, visible legs, knees, shins, feet, or shoes as a readable subject. FORBIDDEN: zooming out to show the whole figure.";

/** Suspect/partner emotional portrait variants: expression + pose; still one coherent mugshot frame. */
export const INSTRUCTION_EDIT_EMOTION_POSE =
  "[STRICT INSTRUCTION]: The provided image is the REFERENCE CHARACTER. You MUST generate THIS EXACT SAME PERSON (same face structure, hair, outfit, accessories, and colors). Keep the solid background color unchanged. Apply BOTH a clear facial expression AND matching upper-body language (shoulders, arms, hands, posture above the waist) as described in the prompt — stay at the same bust-scale crop as the reference; do not zoom out to reveal legs or feet. Do not change the pixel art style. FORBIDDEN: collage, split screen, multiple poses in one image, inset panels, or picture-in-picture.";

/** Victim forensic reframes: same identity and scene, new camera — not expression-only edits. */
export const INSTRUCTION_EDIT_REFRAME = "[STRICT INSTRUCTION]: The provided image is the REFERENCE crime scene and victim. Preserve the SAME deceased victim identity, clothing, and room materials. You MAY and MUST change camera distance, angle, height, and crop exactly as the prompt requires. Output exactly ONE unified image from a single viewpoint. FORBIDDEN: multiple viewpoints, inset frames, overlaid regions at mismatched scale, split panels, or any composite layout. FORBIDDEN: reviving the victim or open eyes. Do not add text or UI.";

export const INSTRUCTION_RELATED_EVIDENCE = "[STRICT INSTRUCTION]: The provided reference image is the SUBJECT associated with the evidence. You are generating a CLOSE-UP or DETAIL of a specific piece of evidence RELATED to this subject. Maintain consistency with the subject's skin tone, clothing colors, and materials shown in the reference. The evidence must read as belonging to or recovered from that subject.";

/** Evidence *card* image (inventory thumbnail): evidence dominates frame area and readability. */
export const EVIDENCE_CARD_CLOSEUP_FRAMING =
  "COMPOSITION (evidence card image): TIGHT forensic close-up or tight medium shot. The physical evidence object is the primary subject: high fractional frame coverage, readable at a glance. FORBIDDEN: wide field of view dominated by environment; FORBIDDEN: evidence below minimum readable size relative to frame. Context (room, rug, furniture, body) permitted only at edges, cropped, or heavily de-emphasized — never co-primary with the evidence.";

let _styleRefCache: string | null = null;

export const getStyleRefBase64 = async (): Promise<string | null> => {
    if (_styleRefCache) return _styleRefCache;
    if (!STYLE_REF_URL) return null;

    try {
        // 1. Try local backend directory first (this works in Cloud Functions deployment)
        const localAssetsPath = path.resolve(process.cwd(), 'assets/styleRef.png');
        if (fs.existsSync(localAssetsPath)) {
            const buffer = fs.readFileSync(localAssetsPath);
            _styleRefCache = buffer.toString('base64');
            return _styleRefCache;
        }

        // 2. Try relative to the monorepo root (for local dev `npm run dev:all`)
        const frontendAssetsPath = path.resolve(process.cwd(), '../frontend/public/assets/styleRef.png');
        if (fs.existsSync(frontendAssetsPath)) {
            const buffer = fs.readFileSync(frontendAssetsPath);
            _styleRefCache = buffer.toString('base64');
            return _styleRefCache;
        }
        
        // 3. Fallback to using __dirname resolution
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const fallbackPath = path.resolve(__dirname, '../../../frontend/public/assets/styleRef.png');
        if (fs.existsSync(fallbackPath)) {
            const buffer = fs.readFileSync(fallbackPath);
            _styleRefCache = buffer.toString('base64');
            return _styleRefCache;
        }
        
        console.warn('[GeminiStyles] Could not find styleRef.png at any expected path');
        return null;
    } catch (e) {
        console.warn("Error reading style reference image:", e);
        return null;
    }
};
