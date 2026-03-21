/**
 * Frontend geminiImages.ts — refactored to delegate all Gemini image generation
 * to the backend. getSuspectPortrait stays client-side (no Gemini call).
 *
 * pregenerateCaseImages orchestrates individual backend calls for granular
 * progress reporting during case creation.
 */
import { Suspect, CaseData, Emotion, Evidence, SupportCharacter } from "../types";
import { geminiPost } from "./backendGemini";

// --- CLIENT-SIDE PORTRAIT LOOKUP (no Gemini call) ---

export const getSuspectPortrait = async (suspect: Suspect, emotion: Emotion, aggravation: number, turnId?: string): Promise<string> => {
    // 1. Exact Match (Preferred) - Works for standard emotions AND Body Parts
    if (suspect.portraits && suspect.portraits[emotion] && suspect.portraits[emotion] !== "PLACEHOLDER") {
        return suspect.portraits[emotion];
    }

    // 2. Emotion Mapping for AI Generated Cases (Fallback if generation was partial)
    const isAiGenerated = suspect.portraits && suspect.portraits[Emotion.NEUTRAL] && !suspect.portraits[Emotion.NEUTRAL].includes('dicebear');

    if (isAiGenerated) {
        let mapped: Emotion | null = null;

        // Negative / Hostile -> ANGRY
        if (emotion === Emotion.DEFENSIVE || emotion === Emotion.ARROGANT) mapped = Emotion.ANGRY;
        // Positive / Smug -> HAPPY
        if (emotion === Emotion.SLY || emotion === Emotion.CONTENT) mapped = Emotion.HAPPY;
        // Low Energy / Distress -> NERVOUS
        if (emotion === Emotion.SAD) mapped = Emotion.NERVOUS;
        // If deceased, fallback any missing body part to Neutral (Full Body)
        if (suspect.isDeceased) mapped = Emotion.NEUTRAL;

        if (mapped && suspect.portraits && suspect.portraits[mapped]) {
            return suspect.portraits[mapped];
        }
    }

    // 3. Fallback to Neutral (if exact or mapped missing)
    if (suspect.portraits && suspect.portraits[Emotion.NEUTRAL] && suspect.portraits[Emotion.NEUTRAL] !== "PLACEHOLDER") {
        return suspect.portraits[Emotion.NEUTRAL];
    }

    // 4. No portrait available — return null (UI shows gray placeholder with "?")
    return null;
};

// --- BACKEND-DELEGATED IMAGE FUNCTIONS ---

export const generateEvidenceImage = async (
    evidence: Evidence,
    caseId: string,
    userId: string,
    refImage?: string
): Promise<string> => {
    const result = await geminiPost<{ url: string }>('/image/evidence', {
        evidence, caseId, userId, refImage
    });
    return result.url;
};

export const createImageFromPrompt = async (
    userPrompt: string,
    aspectRatio: string = '3:4'
): Promise<string | null> => {
    const result = await geminiPost<{ base64: string | null }>('/image/create', {
        userPrompt, aspectRatio
    });
    return result.base64 ? `data:image/png;base64,${result.base64}` : null;
};

export const editImageWithPrompt = async (
    baseImageBase64: string,
    userPrompt: string,
    aspectRatio: string = '3:4'
): Promise<string | null> => {
    const result = await geminiPost<{ base64: string | null }>('/image/edit', {
        baseImageBase64, userPrompt, aspectRatio
    });
    return result.base64 ? `data:image/png;base64,${result.base64}` : null;
};

export const generateEmotionalVariantsFromBase = async (
    neutralBase64: string,
    suspect: Suspect | SupportCharacter,
    caseId: string,
    userId: string
): Promise<Record<string, string>> => {
    return geminiPost<Record<string, string>>('/image/variants', {
        neutralBase64, suspect, caseId, userId
    });
};

export const generateSuspectFromUpload = async (
    suspect: Suspect,
    userImageBase64: string,
    caseId: string,
    userId: string,
    onProgress?: (message: string) => void
): Promise<Suspect> => {
    if (onProgress) onProgress("Processing uploaded image on server...");
    return geminiPost<Suspect>('/image/suspect-upload', {
        suspect, userImageBase64, caseId, userId
    });
};

export const regenerateSingleSuspect = async (
    suspect: Suspect | SupportCharacter,
    caseId: string,
    userId: string,
    theme: string = "Noir"
): Promise<Suspect | SupportCharacter> => {
    return geminiPost<Suspect | SupportCharacter>('/image/regenerate', {
        suspect, caseId, userId, theme
    });
};

// --- GRANULAR PREGENERATION (orchestrated from frontend for progress reporting) ---

export const pregenerateCaseImages = async (
    caseData: CaseData,
    onStatus: (msg: string) => void,
    userId: string
) => {
    // --- Phase 1/4: Character Profiles (suspects + officer + partner) ---
    onStatus("Phase 1/4: Generating Character Profiles...");

    const totalSuspects = caseData.suspects?.length || 0;
    for (let i = 0; i < totalSuspects; i++) {
        const s = caseData.suspects[i];
        try {
            const updated = await geminiPost<Suspect | SupportCharacter>('/image/regenerate', {
                suspect: s, caseId: caseData.id, userId, theme: caseData.type || 'Noir'
            });
            if ((updated as any).portraits) {
                s.portraits = (updated as any).portraits;
            }
            if (s.isDeceased && (updated as Suspect).hiddenEvidence) {
                (updated as Suspect).hiddenEvidence.forEach((ev: Evidence, j: number) => {
                    if (s.hiddenEvidence[j] && ev.imageUrl) {
                        s.hiddenEvidence[j].imageUrl = ev.imageUrl;
                    }
                });
            }
        } catch (e) {
            console.error(`Failed to generate portrait for ${s.name}:`, e);
        }
    }

    // Officer + partner in parallel
    const supportTasks: Promise<void>[] = [];

    if (caseData.officer) {
        supportTasks.push((async () => {
            try {
                const updated = await geminiPost<SupportCharacter>('/image/regenerate', {
                    suspect: caseData.officer, caseId: caseData.id, userId, theme: caseData.type || 'Noir'
                });
                if (updated.portraits) caseData.officer.portraits = updated.portraits;
            } catch (e) {
                console.error("Failed to generate officer portrait:", e);
            }
        })());
    }

    if (caseData.partner) {
        supportTasks.push((async () => {
            try {
                const updated = await geminiPost<SupportCharacter>('/image/regenerate', {
                    suspect: caseData.partner, caseId: caseData.id, userId, theme: caseData.type || 'Noir'
                });
                if (updated.portraits) caseData.partner.portraits = updated.portraits;
            } catch (e) {
                console.error("Failed to generate partner portrait:", e);
            }
        })());
    }

    if (supportTasks.length > 0) await Promise.all(supportTasks);

    // --- Phase 2/4: Evidence Files ---
    onStatus("Phase 2/4: Generating Evidence Files...");

    for (const ev of (caseData.initialEvidence || [])) {
        try {
            const url = await generateEvidenceImage(ev, caseData.id, userId);
            if (url) ev.imageUrl = url;
        } catch (e) {
            console.error(`Failed to generate evidence image for ${ev.title}:`, e);
        }
    }

    for (const s of (caseData.suspects || [])) {
        if (s.isDeceased) continue;
        for (const ev of (s.hiddenEvidence || [])) {
            if (ev.imageUrl) continue;
            try {
                const url = await generateEvidenceImage(ev, caseData.id, userId);
                if (url) ev.imageUrl = url;
            } catch (e) {
                console.error(`Failed to generate hidden evidence image for ${ev.title}:`, e);
            }
        }
    }

    // --- Phase 3/4: Variants (already generated by /image/regenerate, report progress) ---
    onStatus("Phase 3/4: Generating Variants (100%)...");

    // --- Phase 4/4: Finalize ---
    onStatus("Phase 4/4: Finalizing Case Profile...");
    const victim = caseData.suspects?.find(s => s.isDeceased);
    if (victim?.portraits?.[Emotion.NEUTRAL]) {
        caseData.heroImageUrl = victim.portraits[Emotion.NEUTRAL];
    } else if (caseData.initialEvidence?.[0]?.imageUrl) {
        caseData.heroImageUrl = caseData.initialEvidence[0].imageUrl;
    }

    onStatus("Generation Complete.");
};
