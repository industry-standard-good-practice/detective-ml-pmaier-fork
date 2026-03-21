
/**
 * Timeline extraction utilities.
 * 
 * Handles parsing timeline information from suspect responses,
 * including normalizing spelled-out times and fuzzy matching
 * against known timeline entries.
 */

// --- TIME NORMALIZATION UTILITIES ---
// Map of spelled-out time words -> numeric hour value
const WORD_TO_NUM: Record<string, number> = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6,
  'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12,
  'midnight': 12, 'noon': 12
};

// Check if text has ANY time reference — numerical or spelled-out
export const textHasAnyTimeReference = (text: string): boolean => {
  // Numerical time (e.g. "10:35", "8:00")
  if (/\d{1,2}:\d{2}/.test(text)) return true;
  // Spelled-out hours with time context (e.g. "around eleven", "at eight", "by nine")
  const lower = text.toLowerCase();
  // Require BOTH a standalone time-number word AND a time-context phrase nearby
  const timeContextPatterns = [
    /\baround\b/, /\bpast\b/, /\bbefore\b/, /\bafter\b/, /\buntil\b/, /\btil\b/,
    /\bo'clock\b/, /\boclock\b/, /\bquarter\b/, /\bhalf\b/,
    /\bmorning\b/, /\bevening\b/, /\bafternoon\b/,
    /\bpm\b/, /\bam\b/, /\ba\.m\b/, /\bp\.m\b/,
    /\bat night\b/, /\blast night\b/, /\bthat night\b/
  ];
  const hasTimeContext = timeContextPatterns.some(p => p.test(lower));
  if (!hasTimeContext) return false;
  // Check for standalone time-number words (not substrings like "someone", "listen")
  for (const word of Object.keys(WORD_TO_NUM)) {
    const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
    if (wordRegex.test(lower)) return true;
  }
  // Also match "at X" pattern where X is a standalone time word
  if (/\bat\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|midnight|noon)\b/i.test(lower)) return true;
  return false;
};

/**
 * Normalizes a potentially word-based time string to numerical "H:MM AM/PM" format.
 * Examples: "eleven" -> "11:00", "quarter past eight" -> "8:15", "half past nine" -> "9:30"
 * Already-numerical times pass through unchanged (or lightly cleaned).
 */
export const normalizeTimeString = (timeStr: string): string => {
  if (!timeStr) return timeStr;
  const trimmed = timeStr.trim();

  // Already numerical (e.g. "8:30 PM") — return as-is
  if (/\d{1,2}:\d{2}/.test(trimmed)) return trimmed;

  const lower = trimmed.toLowerCase();

  // Try to find a spelled-out hour
  let hour: number | null = null;
  let minutes = 0;
  let amPm = '';

  // "quarter past X" → X:15
  const quarterPast = lower.match(/quarter\s+past\s+(\w+)/);
  if (quarterPast) {
    hour = WORD_TO_NUM[quarterPast[1]] ?? null;
    minutes = 15;
  }
  // "half past X" → X:30
  const halfPast = lower.match(/half\s+past\s+(\w+)/);
  if (!hour && halfPast) {
    hour = WORD_TO_NUM[halfPast[1]] ?? null;
    minutes = 30;
  }
  // "quarter to X" → (X-1):45
  const quarterTo = lower.match(/quarter\s+to\s+(\w+)/);
  if (!hour && quarterTo) {
    const nextHour = WORD_TO_NUM[quarterTo[1]];
    if (nextHour !== undefined) {
      hour = nextHour === 1 ? 12 : nextHour - 1;
      minutes = 45;
    }
  }
  // Plain word (e.g. "eleven", "eight o'clock")
  if (hour === null) {
    for (const [word, num] of Object.entries(WORD_TO_NUM)) {
      if (lower.includes(word)) {
        hour = num;
        break;
      }
    }
  }

  // Detect AM/PM context
  if (lower.includes('am') || lower.includes('a.m') || lower.includes('morning')) amPm = ' AM';
  else if (lower.includes('pm') || lower.includes('p.m') || lower.includes('evening') || lower.includes('night') || lower.includes('afternoon')) amPm = ' PM';

  if (hour !== null) {
    return `${hour}:${minutes.toString().padStart(2, '0')}${amPm}`;
  }

  // Can't parse — return original
  return trimmed;
};

/**
 * Given a normalized time string (e.g. "8:00") and the suspect's known timeline,
 * returns the canonical time string from the timeline (e.g. "8:00 PM") if it matches.
 */
export const matchNormalizedTimeToTimeline = (
  normalizedTime: string,
  timeline: { time: string; activity: string; day: string; dayOffset: number }[]
): string | null => {
  if (!timeline || timeline.length === 0) return null;
  const numericPart = normalizedTime.match(/(\d{1,2}:\d{2})/)?.[1];
  if (!numericPart) return null;

  for (const entry of timeline) {
    if (!entry.time) continue;
    // Exact match
    if (entry.time.trim().toLowerCase() === normalizedTime.toLowerCase()) return entry.time.trim();
    // Numeric part match (e.g. "8:00" matches "8:00 PM")
    const entryNumeric = entry.time.match(/(\d{1,2}:\d{2})/)?.[1];
    if (entryNumeric === numericPart) return entry.time.trim();
  }
  return null;
};

// Extract the sentence from response text that contains a given time reference
const extractSentenceAroundTime = (text: string, timeStr: string): string | null => {
  const numericPart = timeStr.match(/(\d{1,2}:\d{2})/)?.[1] || timeStr;
  const idx = text.toLowerCase().indexOf(numericPart.toLowerCase());
  if (idx === -1) return null;

  // Split on sentence-ending punctuation and find the sentence containing the time
  // Avoid lookbehind (?<=) which is unsupported on older iOS Safari
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let charCount = 0;
  for (const sentence of sentences) {
    const sentenceEnd = charCount + sentence.length;
    if (idx >= charCount && idx < sentenceEnd) {
      return sentence.trim().replace(/^["']+|["']+$/g, '');
    }
    charCount = sentenceEnd + 1; // +1 for the split whitespace
  }
  return null;
};

/**
 * Fallback timeline extraction: scans the suspect's text response for any
 * mention of their known timeline entries. Returns ALL matches as an array.
 * This catches cases where the AI mentions times but forgets to populate
 * the structured `revealedTimelineStatements` field.
 * Uses the suspect's actual spoken words from the response text.
 */
export const extractTimelineFromText = (
  text: string,
  suspectTimeline: { time: string; activity: string; day: string; dayOffset: number }[]
): { time: string; statement: string; day: string; dayOffset: number }[] => {
  if (!text || !suspectTimeline || suspectTimeline.length === 0) return [];
  
  // Extract if the text has any time reference (numerical OR spelled-out)
  if (!textHasAnyTimeReference(text)) return [];
  
  const lowerText = text.toLowerCase();
  const results: { time: string; statement: string; day: string; dayOffset: number }[] = [];

  for (const entry of suspectTimeline) {
    const timeStr = entry.time?.trim();
    if (!timeStr) continue;

    let matched = false;
    // Direct match (e.g. "8:30 PM" in text)
    if (lowerText.includes(timeStr.toLowerCase())) {
      matched = true;
    } else {
      // Numeric-only match (e.g. "8:30" without AM/PM)
      const numericMatch = timeStr.match(/(\d{1,2}:\d{2})/);
      if (numericMatch && lowerText.includes(numericMatch[1])) {
        matched = true;
      }
    }

    // If no direct/numeric match, try matching spelled-out time words in text
    // Use word boundaries to avoid "someone" matching "one", "listen" matching "ten", etc.
    if (!matched) {
      const entryNumeric = timeStr.match(/(\d{1,2}):\d{2}/);
      if (entryNumeric) {
        const entryHour = parseInt(entryNumeric[1], 10);
        for (const [word, num] of Object.entries(WORD_TO_NUM)) {
          if (num === entryHour) {
            const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
            if (wordRegex.test(lowerText)) {
              matched = true;
              break;
            }
          }
        }
      }
    }

    if (matched) {
      // Use the suspect's actual spoken words, falling back to case data if extraction fails
      const extractedStatement = extractSentenceAroundTime(text, timeStr);
      // If the numerical time isn't in the text (spelled out), try to find the sentence with the word
      let finalStatement = extractedStatement;
      if (!finalStatement) {
        const entryNum = timeStr.match(/(\d{1,2}):\d{2}/);
        if (entryNum) {
          const hr = parseInt(entryNum[1], 10);
          const wordForHour = Object.entries(WORD_TO_NUM).find(([, n]) => n === hr)?.[0];
          if (wordForHour) {
            // Find the sentence containing the spelled-out word
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
            const wordBoundaryRegex = new RegExp(`\\b${wordForHour}\\b`, 'i');
            for (const sentence of sentences) {
              if (wordBoundaryRegex.test(sentence)) {
                finalStatement = sentence.trim().replace(/^["']+|["']+$/g, '');
                break;
              }
            }
          }
        }
      }
      results.push({
        time: timeStr,
        statement: finalStatement || entry.activity,
        day: entry.day,
        dayOffset: entry.dayOffset
      });
    }
  }

  return results;
};
