import { Router, Request, Response } from 'express';
import { getSuspectResponse, generateCaseSummary, getOfficerChatResponse, getPartnerIntervention, getBadCopHint } from '../services/geminiChat.js';
import { generateCaseFromPrompt, checkCaseConsistency, editCaseWithPrompt, calculateDifficulty, applyConsistencyImagePipeline } from '../services/geminiCase.js';
import { generateImageRaw, generateEvidenceImage, generateEmotionalVariantsFromBase, generateOnePortraitVariantFromBase, generateSuspectFromUpload, generateNeutralPortraitForSuspect, regenerateSingleSuspect, pregenerateCaseImages, createImageFromPrompt, editImageWithPrompt } from '../services/geminiImages.js';
import { generateTTS } from '../services/geminiTTS.js';

const router = Router();

// --- CHAT ENDPOINTS ---

router.post('/chat/suspect', async (req: Request, res: Response) => {
  try {
    const { suspect, caseData, userInput, type, evidenceAttachment, currentAggravation, isFirstTurn, discoveredEvidence, currentGameTime, conversationHistory } = req.body;
    const result = await getSuspectResponse(suspect, caseData, userInput, type, evidenceAttachment, currentAggravation, isFirstTurn, discoveredEvidence, currentGameTime, conversationHistory);
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Route] chat/suspect error:', error);
    res.status(500).json({ error: error.message || 'Failed to get suspect response' });
  }
});

router.post('/chat/officer', async (req: Request, res: Response) => {
  try {
    const { caseData, userMessage, evidenceFound, notes, chatHistory, timelineKnown, officerThread } = req.body;
    const result = await getOfficerChatResponse(
      caseData,
      userMessage,
      evidenceFound,
      notes,
      chatHistory,
      Array.isArray(timelineKnown) ? timelineKnown : [],
      Array.isArray(officerThread) ? officerThread : []
    );
    res.json({ text: result });
  } catch (error: any) {
    console.error('[Gemini Route] chat/officer error:', error);
    res.status(500).json({ error: error.message || 'Failed to get officer response' });
  }
});

router.post('/chat/partner', async (req: Request, res: Response) => {
  try {
    const { type, suspect, caseData, history, discoveredEvidence, timelineKnown } = req.body;
    const result = await getPartnerIntervention(
      type,
      suspect,
      caseData,
      history,
      discoveredEvidence,
      Array.isArray(timelineKnown) ? timelineKnown : []
    );
    res.json({ text: result });
  } catch (error: any) {
    console.error('[Gemini Route] chat/partner error:', error);
    res.status(500).json({ error: error.message || 'Failed to get partner intervention' });
  }
});

router.post('/chat/badcop-hint', async (req: Request, res: Response) => {
  try {
    const { suspect, discoveredEvidence, responseText } = req.body;
    const result = await getBadCopHint(suspect, Array.isArray(discoveredEvidence) ? discoveredEvidence : [], responseText);
    res.json({ text: result });
  } catch (error: any) {
    console.error('[Gemini Route] chat/badcop-hint error:', error);
    res.status(500).json({ error: error.message || 'Failed to get bad cop hint' });
  }
});

router.post('/chat/case-summary', async (req: Request, res: Response) => {
  try {
    const { caseData, accusedId, gameResult, evidenceDiscovered } = req.body;
    const result = await generateCaseSummary(caseData, accusedId, gameResult, evidenceDiscovered);
    res.json({ text: result });
  } catch (error: any) {
    console.error('[Gemini Route] chat/case-summary error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate case summary' });
  }
});

// --- CASE ENDPOINTS ---

router.post('/case/generate', async (req: Request, res: Response) => {
  try {
    const { userPrompt, isLucky } = req.body;
    const result = await generateCaseFromPrompt(userPrompt, isLucky);
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Route] case/generate error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate case' });
  }
});

router.post('/case/consistency', async (req: Request, res: Response) => {
  try {
    const { caseData, baseline, editContext } = req.body;
    const result = await checkCaseConsistency(caseData, undefined, baseline, editContext);
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Route] case/consistency error:', error);
    res.status(500).json({ error: error.message || 'Failed to check case consistency' });
  }
});

/** Narrative-only phase (no image regeneration). Pair with POST /case/consistency/images. */
router.post('/case/consistency/narrative', async (req: Request, res: Response) => {
  try {
    const { caseData, baseline, editContext } = req.body;
    const result = await checkCaseConsistency(caseData, undefined, baseline, editContext, { narrativeOnly: true });
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Route] case/consistency/narrative error:', error);
    res.status(500).json({ error: error.message || 'Failed narrative consistency check' });
  }
});

/** Image pipeline after narrative merge. Body: { mergedCase, originalCaseData } (original = pre-check draft). */
router.post('/case/consistency/images', async (req: Request, res: Response) => {
  try {
    const { mergedCase, originalCaseData } = req.body;
    if (!mergedCase || !originalCaseData) {
      res.status(400).json({ error: 'mergedCase and originalCaseData are required' });
      return;
    }
    const { changesMade } = await applyConsistencyImagePipeline(mergedCase, originalCaseData, undefined);
    res.json({ updatedCase: mergedCase, imagePipelineChanges: changesMade });
  } catch (error: any) {
    console.error('[Gemini Route] case/consistency/images error:', error);
    res.status(500).json({ error: error.message || 'Failed consistency image pipeline' });
  }
});

router.post('/case/edit', async (req: Request, res: Response) => {
  try {
    const { caseData, userPrompt, baseline } = req.body;
    const result = await editCaseWithPrompt(caseData, userPrompt, undefined, baseline);
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Route] case/edit error:', error);
    res.status(500).json({ error: error.message || 'Failed to edit case' });
  }
});

// --- IMAGE ENDPOINTS ---

router.post('/image/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, aspectRatio, refImages, mode, modelOverride } = req.body;
    const result = await generateImageRaw(prompt, aspectRatio, refImages, mode, modelOverride);
    res.json({ base64: result });
  } catch (error: any) {
    console.error('[Gemini Route] image/generate error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate image' });
  }
});

router.post('/image/evidence', async (req: Request, res: Response) => {
  try {
    const { evidence, caseId, userId, refImage, forDeceasedVictim, caseTheme } = req.body;
    const result = await generateEvidenceImage(evidence, caseId, userId, refImage, {
      forDeceasedVictim: !!forDeceasedVictim,
      caseTheme: typeof caseTheme === 'string' ? caseTheme : undefined,
    });
    res.json({ url: result });
  } catch (error: any) {
    console.error('[Gemini Route] image/evidence error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate evidence image' });
  }
});

router.post('/image/variants', async (req: Request, res: Response) => {
  try {
    const { neutralBase64, suspect, caseId, userId, caseTheme } = req.body;
    const result = await generateEmotionalVariantsFromBase(neutralBase64, suspect, caseId, userId, {
      caseTheme: typeof caseTheme === 'string' ? caseTheme : undefined,
    });
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Route] image/variants error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate emotional variants' });
  }
});

router.post('/image/variant-one', async (req: Request, res: Response) => {
  try {
    const { neutralBase64, variantKey, suspect, caseId, userId, caseTheme } = req.body;
    if (!variantKey || typeof variantKey !== 'string') {
      res.status(400).json({ error: 'variantKey is required' });
      return;
    }
    const result = await generateOnePortraitVariantFromBase(neutralBase64, variantKey, suspect, caseId, userId, {
      caseTheme: typeof caseTheme === 'string' ? caseTheme : undefined,
    });
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Route] image/variant-one error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate portrait variant' });
  }
});

router.post('/image/suspect-upload', async (req: Request, res: Response) => {
  try {
    const { suspect, userImageBase64, caseId, userId } = req.body;
    const result = await generateSuspectFromUpload(suspect, userImageBase64, caseId, userId);
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Route] image/suspect-upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to process suspect upload' });
  }
});

router.post('/image/regenerate', async (req: Request, res: Response) => {
  try {
    const { suspect, caseId, userId, theme } = req.body;
    const result = await regenerateSingleSuspect(suspect, caseId, userId, theme);
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Route] image/regenerate error:', error);
    res.status(500).json({ error: error.message || 'Failed to regenerate suspect' });
  }
});

router.post('/image/regenerate-neutral', async (req: Request, res: Response) => {
  try {
    const { suspect, caseId, userId, theme } = req.body;
    const result = await generateNeutralPortraitForSuspect(suspect, caseId, userId, theme);
    res.json(result);
  } catch (error: any) {
    console.error('[Gemini Route] image/regenerate-neutral error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate neutral portrait' });
  }
});

router.post('/image/pregenerate', async (req: Request, res: Response) => {
  try {
    const { caseData, userId } = req.body;
    await pregenerateCaseImages(caseData, userId);
    // Return the mutated caseData (images are set directly on the object)
    res.json(caseData);
  } catch (error: any) {
    console.error('[Gemini Route] image/pregenerate error:', error);
    res.status(500).json({ error: error.message || 'Failed to pregenerate case images' });
  }
});

router.post('/image/create', async (req: Request, res: Response) => {
  try {
    const { userPrompt, aspectRatio } = req.body;
    const result = await createImageFromPrompt(userPrompt, aspectRatio);
    res.json({ base64: result });
  } catch (error: any) {
    console.error('[Gemini Route] image/create error:', error);
    res.status(500).json({ error: error.message || 'Failed to create image' });
  }
});

router.post('/image/edit', async (req: Request, res: Response) => {
  try {
    const { baseImageBase64, userPrompt, aspectRatio } = req.body;
    const result = await editImageWithPrompt(baseImageBase64, userPrompt, aspectRatio);
    res.json({ base64: result });
  } catch (error: any) {
    console.error('[Gemini Route] image/edit error:', error);
    res.status(500).json({ error: error.message || 'Failed to edit image' });
  }
});

// --- TTS ENDPOINT ---

router.post('/tts', async (req: Request, res: Response) => {
  try {
    const { text, voiceName, stylePrompt } = req.body;
    const base64Audio = await generateTTS(text, voiceName, stylePrompt);
    res.json({ audio: base64Audio });
  } catch (error: any) {
    console.error('[Gemini Route] tts error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate TTS' });
  }
});

export default router;
