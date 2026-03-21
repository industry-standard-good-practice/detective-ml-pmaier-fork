import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- STYLE CONSTANTS ---
export const STYLE_REF_URL = "assets/styleRef.png";

export const PIXEL_ART_BASE = "Style: High-quality 16-bit pixel art. Dithered shading. Limited color palette (VGA style). Sharp, distinct pixels. Retro point-and-click adventure game aesthetic. No blur, no anti-aliasing.";

export const INSTRUCTION_NEW_CHAR = "[STRICT INSTRUCTION]: Use the provided reference image ONLY for guidance on the PIXEL ART STYLE and COMPOSITION (framing/layout). DO NOT look at the reference image for subject matter, character appearance, or demeanor. Generate a completely NEW subject based solely on the text prompt.";

export const INSTRUCTION_PRESERVE_CHAR = "[STRICT INSTRUCTION]: The provided image is the REFERENCE CHARACTER. You MUST generate THIS EXACT CHARACTER. Keep facial features, hair, clothing, accessories, and colors EXACTLY the same. Only change the facial expression as requested. Do not change the art style or background color.";

export const INSTRUCTION_RELATED_EVIDENCE = "[STRICT INSTRUCTION]: The provided reference image is the SUBJECT (e.g., the victim). You are generating a CLOSE-UP or DETAIL of a specific piece of evidence RELATED to this subject. Maintain consistency with the subject's skin tone, clothing colors, and materials shown in the reference. The evidence should look like it belongs to or was found on the subject.";

let _styleRefCache: string | null = null;

export const getStyleRefBase64 = async (): Promise<string | null> => {
    if (_styleRefCache) return _styleRefCache;
    if (!STYLE_REF_URL) return null;

    try {
        // In backend context, read the file from the frontend assets directory
        // The style ref image is a frontend static asset
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const frontendAssetsPath = path.resolve(__dirname, '../../../frontend/public/assets/styleRef.png');
        
        if (fs.existsSync(frontendAssetsPath)) {
            const buffer = fs.readFileSync(frontendAssetsPath);
            _styleRefCache = buffer.toString('base64');
            return _styleRefCache;
        }

        // Fallback: try relative to cwd
        const cwdPath = path.resolve(process.cwd(), '../frontend/public/assets/styleRef.png');
        if (fs.existsSync(cwdPath)) {
            const buffer = fs.readFileSync(cwdPath);
            _styleRefCache = buffer.toString('base64');
            return _styleRefCache;
        }
        
        console.warn('[GeminiStyles] Could not find styleRef.png at expected paths');
        return null;
    } catch (e) {
        console.warn("Error reading style reference image:", e);
        return null;
    }
};
