import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- STYLE CONSTANTS ---
export const STYLE_REF_URL = "assets/styleRef.png";

export const PIXEL_ART_BASE = "Style: High-quality 16-bit pixel art. Dithered shading. Limited color palette (VGA style). Sharp, distinct pixels. Retro point-and-click adventure game aesthetic. No blur, no anti-aliasing.";

export const INSTRUCTION_NEW_CHAR = "[STRICT INSTRUCTION]: Use the provided reference image ONLY for guidance on the PIXEL ART STYLE and COMPOSITION (framing/layout). DO NOT look at the reference image for subject matter, character appearance, or demeanor. Generate a completely NEW subject based solely on the text prompt.";

export const INSTRUCTION_PRESERVE_CHAR = "[STRICT INSTRUCTION]: The provided image is the REFERENCE CHARACTER. You MUST generate THIS EXACT CHARACTER. Keep facial features, hair, clothing, accessories, and colors EXACTLY the same. Only change the facial expression as requested. Do not change the art style or background color.";

export const INSTRUCTION_RELATED_EVIDENCE = "[STRICT INSTRUCTION]: The provided reference image is the SUBJECT (e.g., the victim). You are generating a CLOSE-UP or DETAIL of a specific piece of evidence RELATED to this subject. Maintain consistency with the subject's skin tone, clothing colors, and materials shown in the reference. The evidence should look like it belongs to or was found on the subject.";

/** Evidence *card* image (inventory thumbnail): the physical clue must fill the frame — not a wide room establishing shot. */
export const EVIDENCE_CARD_CLOSEUP_FRAMING =
  "COMPOSITION (evidence card image): TIGHT forensic close-up or tight medium shot — the physical evidence object is the clear hero, large and readable in frame. Do NOT use a wide establishing shot, panoramic room view, or tiny prop lost in empty space. Any room, rug, furniture, or body may appear only at the edges, cropped, or heavily out of focus — never the main subject.";

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
