
import { CaseData } from "../types";
import { geminiPost } from "./backendGemini";

// --- HELPERS ---

export const calculateDifficulty = (caseData: Partial<CaseData>): "Easy" | "Medium" | "Hard" => {
    const suspects = caseData.suspects || [];
    const aliveSuspects = suspects.filter(s => !s.isDeceased);
    const suspectCount = aliveSuspects.length;
    const initialEvidenceCount = caseData.initialEvidence?.length || 0;
    const hiddenEvidenceCount = suspects.reduce((acc, s) => acc + (s.hiddenEvidence?.length || 0), 0);
    const initialTimelineCount = caseData.initialTimeline?.length || 0;
    const totalEvidence = initialEvidenceCount + hiddenEvidenceCount;

    // Multiple victims and multiple guilty suspects significantly increase difficulty
    const victimCount = suspects.filter(s => s.isDeceased).length;
    const guiltyCount = suspects.filter(s => s.isGuilty).length;

    // Base complexity from suspect count and evidence
    let points = (suspectCount * 2) + totalEvidence - (initialTimelineCount * 0.5);

    // Extra victims add complexity (each additional victim beyond 1 adds +4)
    if (victimCount > 1) points += (victimCount - 1) * 4;

    // Multiple guilty suspects make deduction harder (each additional beyond 1 adds +5)
    if (guiltyCount > 1) points += (guiltyCount - 1) * 5;

    // Higher base aggravation = more hostile/uncooperative suspects = harder to extract info
    if (aliveSuspects.length > 0) {
        const avgAggravation = aliveSuspects.reduce((sum, s) => sum + (s.baseAggravation || 0), 0) / aliveSuspects.length;
        points += (avgAggravation / 100) * 6;
    }

    // Fewer partner charges = fewer safety nets = harder case
    // Default is 3 charges. Each charge below 3 adds +3 difficulty, above 3 subtracts 2.
    const charges = caseData.partnerCharges ?? 3;
    if (charges < 3) points += (3 - charges) * 3;
    else if (charges > 3) points -= (charges - 3) * 2;

    if (points > 28) return "Hard";
    if (points >= 20) return "Medium";
    return "Easy";
};

/**
 * Computes a diff between a baseline case (last AI-generated version) and the current draft.
 * Returns a structured object describing what the user manually changed.
 */
export const computeUserDiff = (baseline: CaseData, current: CaseData): Record<string, any> => {
    const diff: Record<string, any> = {};

    // Top-level case fields
    const topFields = ['title', 'type', 'description'] as const;
    topFields.forEach(f => {
        if ((baseline as any)[f] !== (current as any)[f]) {
            diff[f] = (current as any)[f];
        }
    });

    // Support characters
    ['officer', 'partner'].forEach(key => {
        const baseChar = (baseline as any)[key];
        const currChar = (current as any)[key];
        if (baseChar && currChar) {
            const charDiff: Record<string, any> = {};
            ['name', 'gender', 'role', 'personality'].forEach(f => {
                if (baseChar[f] !== currChar[f]) charDiff[f] = currChar[f];
            });
            if (Object.keys(charDiff).length > 0) diff[`_${key}`] = charDiff;
        }
    });

    // Suspects — field-level diff for each suspect by ID
    const suspectDiffs: Record<string, Record<string, any>> = {};
    const suspectFields = [
        'name', 'gender', 'age', 'role', 'status', 'bio', 'personality', 'secret', 'motive',
        'physicalDescription', 'professionalBackground', 'witnessObservations',
        'isGuilty', 'isDeceased', 'baseAggravation'
    ];
    current.suspects.forEach(s => {
        const bs = baseline.suspects.find(b => b.id === s.id);
        if (!bs) return; // Newly added suspect, no baseline to compare
        const fieldDiff: Record<string, any> = {};
        suspectFields.forEach(f => {
            if (JSON.stringify((bs as any)[f]) !== JSON.stringify((s as any)[f])) {
                fieldDiff[f] = (s as any)[f];
            }
        });
        // Check alibi (deep compare)
        if (JSON.stringify(bs.alibi) !== JSON.stringify(s.alibi)) {
            fieldDiff.alibi = s.alibi;
        }
        if (Object.keys(fieldDiff).length > 0) {
            suspectDiffs[s.id] = fieldDiff;
        }
    });
    if (Object.keys(suspectDiffs).length > 0) diff._suspects = suspectDiffs;

    console.log('[DEBUG] computeUserDiff: User manually changed:', Object.keys(diff).length > 0 ? diff : 'nothing');
    return diff;
};

/**
 * Converts a user diff into a human-readable change log that can be injected
 * into AI prompts. The AI uses this to understand what the user changed and
 * MUST propagate those changes throughout the entire narrative.
 */
export const formatUserChangeLog = (diff: Record<string, any>, baseline: CaseData): string => {
    if (Object.keys(diff).length === 0) return '';

    const lines: string[] = [];

    // Top-level case fields
    if (diff.title) lines.push(`- Case title changed to: "${diff.title}"`);
    if (diff.type) lines.push(`- Case type changed to: "${diff.type}"`);
    if (diff.description) lines.push(`- Case description was rewritten by the user`);

    // Support characters
    ['officer', 'partner'].forEach(key => {
        const charDiff = diff[`_${key}`];
        if (charDiff) {
            const label = key === 'officer' ? 'Officer/Chief' : 'Partner';
            Object.entries(charDiff).forEach(([field, value]) => {
                const origChar = (baseline as any)[key];
                const oldVal = origChar?.[field] || 'unknown';
                lines.push(`- ${label}'s ${field} changed from "${oldVal}" to "${value}"`);
            });
        }
    });

    // Suspects
    const suspectDiffs = diff._suspects as Record<string, Record<string, any>> | undefined;
    if (suspectDiffs) {
        Object.entries(suspectDiffs).forEach(([suspectId, fields]) => {
            const baselineSuspect = baseline.suspects.find(s => s.id === suspectId);
            const suspectLabel = baselineSuspect?.name || suspectId;

            Object.entries(fields).forEach(([field, value]) => {
                const oldVal = baselineSuspect ? (baselineSuspect as any)[field] : 'unknown';

                if (field === 'name') {
                    lines.push(`- Suspect "${oldVal}" was RENAMED to "${value}" — this is the COMPLETE new name. Use "${value}" EXACTLY and COMPLETELY. Do NOT keep any part of the old name "${oldVal}". Update ALL references to this character everywhere (description, bios, relationships, alibis, evidence, timeline, motives, secrets, witness observations).`);
                } else if (field === 'isGuilty') {
                    lines.push(`- Suspect "${suspectLabel}" guilt status changed to: ${value ? 'GUILTY' : 'INNOCENT'}`);
                } else if (field === 'isDeceased') {
                    lines.push(`- Suspect "${suspectLabel}" deceased status changed to: ${value ? 'DECEASED (victim)' : 'ALIVE'}`);
                } else if (field === 'alibi' && typeof value === 'object') {
                    lines.push(`- Suspect "${suspectLabel}"'s alibi was modified by the user`);
                } else if (typeof value === 'string' && value.length > 100) {
                    lines.push(`- Suspect "${suspectLabel}"'s ${field} was rewritten by the user`);
                } else {
                    lines.push(`- Suspect "${suspectLabel}"'s ${field} changed from "${oldVal}" to "${value}"`);
                }
            });
        });
    }

    return lines.join('\n');
};

/**
 * Simple safety-net: re-applies user's manual field-level edits onto an AI-generated case.
 * This ensures the AI didn't accidentally revert any explicit user values.
 * The AI prompt handles narrative propagation; this just enforces raw field values.
 */
export const applyUserDiff = (aiCase: CaseData, userDiff: Record<string, any>): void => {
    // Top-level fields
    ['title', 'type', 'description'].forEach(f => {
        if (userDiff[f] !== undefined) {
            (aiCase as any)[f] = userDiff[f];
        }
    });

    // Support characters
    ['officer', 'partner'].forEach(key => {
        const charDiff = userDiff[`_${key}`];
        if (charDiff && (aiCase as any)[key]) {
            Object.entries(charDiff).forEach(([field, value]) => {
                (aiCase as any)[key][field] = value;
            });
        }
    });

    // Suspects
    const suspectDiffs = userDiff._suspects as Record<string, Record<string, any>> | undefined;
    if (suspectDiffs) {
        Object.entries(suspectDiffs).forEach(([suspectId, fields]) => {
            const suspect = aiCase.suspects.find(s => s.id === suspectId);
            if (suspect) {
                Object.entries(fields).forEach(([field, value]) => {
                    (suspect as any)[field] = value;
                });
            }
        });
    }
};


export const stripImagesFromCase = (caseData: CaseData): { stripped: any, imageMap: Record<string, string> } => {
    const imageMap: Record<string, string> = {};
    const clone = JSON.parse(JSON.stringify(caseData));

    (clone.initialEvidence || []).forEach((ev: any) => {
        if (ev.imageUrl) {
            imageMap[ev.id] = ev.imageUrl;
            ev.imageUrl = "PLACEHOLDER";
        }
    });

    // Strip support chars
    if (clone.officer?.portraitUrl) {
        imageMap['officer'] = clone.officer.portraitUrl;
        clone.officer.portraitUrl = "PLACEHOLDER";
    }

    if (clone.heroImageUrl) {
        imageMap['hero'] = clone.heroImageUrl;
        clone.heroImageUrl = "PLACEHOLDER";
    }

    // Support Characters: Handle portraits map for both
    if (clone.officer?.portraits) {
        Object.keys(clone.officer.portraits).forEach(key => {
            const pid = `officer-p-${key}`;
            imageMap[pid] = clone.officer.portraits[key];
            clone.officer.portraits[key] = "PLACEHOLDER";
        });
    }

    if (clone.partner?.portraits) {
        Object.keys(clone.partner.portraits).forEach(key => {
            const pid = `partner-p-${key}`;
            imageMap[pid] = clone.partner.portraits[key];
            clone.partner.portraits[key] = "PLACEHOLDER";
        });
    }

    (clone.suspects || []).forEach((s: any) => {
        if (s.portraits) {
            Object.keys(s.portraits).forEach(key => {
                const pid = `${s.id}-p-${key}`;
                imageMap[pid] = s.portraits[key];
                s.portraits[key] = "PLACEHOLDER";
            });
        }
        (s.hiddenEvidence || []).forEach((ev: any) => {
            if (ev.imageUrl) {
                imageMap[ev.id] = ev.imageUrl;
                ev.imageUrl = "PLACEHOLDER";
            }
        });
    });

    return { stripped: clone, imageMap };
};

export const hydrateImagesToCase = (strippedCase: any, imageMap: Record<string, string>): CaseData => {
    (strippedCase.initialEvidence || []).forEach((ev: any) => {
        if (imageMap[ev.id]) ev.imageUrl = imageMap[ev.id];
        else if (ev.imageUrl === "PLACEHOLDER") delete ev.imageUrl;
    });

    if (strippedCase.officer) {
        if (strippedCase.officer.portraits) {
            Object.keys(strippedCase.officer.portraits).forEach(key => {
                const pid = `officer-p-${key}`;
                if (imageMap[pid]) strippedCase.officer.portraits[key] = imageMap[pid];
            });
        }
    }

    if (strippedCase.partner) {
        if (strippedCase.partner.portraits) {
            Object.keys(strippedCase.partner.portraits).forEach(key => {
                const pid = `partner-p-${key}`;
                if (imageMap[pid]) strippedCase.partner.portraits[key] = imageMap[pid];
            });
        }
    }

    (strippedCase.suspects || []).forEach((s: any) => {
        if (s.portraits) {
            Object.keys(s.portraits).forEach(key => {
                const pid = `${s.id}-p-${key}`;
                if (imageMap[pid]) s.portraits[key] = imageMap[pid];
            });
        }
        (s.hiddenEvidence || []).forEach((ev: any) => {
            if (imageMap[ev.id]) ev.imageUrl = imageMap[ev.id];
            else if (ev.imageUrl === "PLACEHOLDER") delete ev.imageUrl;
        });
    });

    return strippedCase as CaseData;
};

// Helper to enforce relationships exist after generation/check
export const enforceRelationships = (caseData: any) => {
    if (!caseData.suspects || !Array.isArray(caseData.suspects)) {
        console.warn("[DEBUG] enforceRelationships: No suspects array found, skipping.");
        return caseData;
    }

    const hasVictim = caseData.hasVictim !== false; // default true for backwards compat
    const victim = caseData.suspects.find((s: any) => s.isDeceased);
    const victimName = victim?.name.trim();
    const aliveSuspectNames = caseData.suspects.filter((s: any) => !s.isDeceased).map((s: any) => s.name.trim());

    caseData.suspects.forEach((s: any) => {
        if (!s.relationships) s.relationships = [];
        const currentName = s.name.trim();
        const isDeceased = s.isDeceased;

        // 1. Canonicalize "The Victim" relationship (only if hasVictim)
        if (hasVictim && !isDeceased && victimName) {
            // If they have a relationship with the victim's name, rename it to "The Victim"
            s.relationships.forEach((r: any) => {
                if (r.targetName.trim() === victimName) {
                    r.targetName = "The Victim";
                }
            });
        }

        // If hasVictim is false, strip any "The Victim" relationships that may have been generated
        if (!hasVictim) {
            s.relationships = s.relationships.filter((r: any) => r.targetName.trim() !== "The Victim");
        }

        // 2. Define targets for this specific suspect
        const targets: string[] = [];

        if (!isDeceased) {
            // Alive suspects need "The Victim" (if applicable) + other alive suspects
            if (hasVictim) {
                targets.push("The Victim");
            }
            aliveSuspectNames.forEach(name => {
                if (name !== currentName) targets.push(name);
            });
        } else {
            // The victim has relationships with all ALIVE suspects
            aliveSuspectNames.forEach(name => targets.push(name));
        }

        // 3. Ensure relationships with all targets
        targets.forEach((name: string) => {
            const hasRel = s.relationships.some((r: any) => r.targetName.trim() === name);
            if (!hasRel) {
                s.relationships.push({
                    targetName: name,
                    type: "Acquaintance",
                    description: name === "The Victim"
                        ? "I didn't know them personally, just another face in the crowd."
                        : "I've seen them around, but we don't talk much. I don't really have an opinion on them one way or the other."
                });
            }
        });
    });
    return caseData;
};

// Helper to fix timeline entries where time+activity are mashed together in the time field
export const enforceTimelines = (caseData: any) => {
    const fixTimeline = (timeline: any[]): any[] => {
        if (!timeline || !Array.isArray(timeline)) return [];

        // First pass: try to fix entries
        timeline.forEach((entry: any) => {
            if (!entry.time && !entry.activity) return; // Will be stripped

            // If time is missing but activity exists — try to extract time from activity
            if ((!entry.time || entry.time.trim().length === 0) && entry.activity) {
                const actStr = entry.activity.trim();
                const match = actStr.match(/^(\d{1,2}:\d{2}\s*(?:AM|PM|GTS|EST|PST|UTC|[A-Z]{2,4})?)\s*[:\-–—]\s*(.+)$/i);
                if (match) {
                    entry.time = match[1].trim();
                    entry.activity = match[2].trim();
                } else {
                    // Activity has no extractable time — give it a placeholder
                    entry.time = "??:?? ??";
                }
            }

            // If activity is missing but time has a description mashed in
            if (entry.time) {
                const timeStr = entry.time.trim();
                if (!entry.activity || entry.activity.trim().length === 0) {
                    const match = timeStr.match(/^(\d{1,2}:\d{2}\s*(?:AM|PM|GTS|EST|PST|UTC|[A-Z]{2,4})?)\s*[:\-–—]\s*(.+)$/i);
                    if (match) {
                        entry.time = match[1].trim();
                        entry.activity = match[2].trim();
                    }
                }
            }

            // Fix if activity is just a duplicate of the time
            if (entry.activity && entry.time && entry.activity.trim() === entry.time.trim()) {
                entry.activity = '';
            }
        });

        // Second pass: strip entries that are completely empty (no time AND no activity)
        return timeline.filter((entry: any) => {
            const hasTime = entry.time && entry.time.trim().length > 0;
            const hasActivity = entry.activity && entry.activity.trim().length > 0;
            return hasTime || hasActivity;
        });
    };

    // Fix suspect timelines
    if (caseData.suspects && Array.isArray(caseData.suspects)) {
        caseData.suspects.forEach((s: any) => {
            s.timeline = fixTimeline(s.timeline);
        });
    }

    // Fix initial timeline
    caseData.initialTimeline = fixTimeline(caseData.initialTimeline);

    return caseData;
};

/**
 * Validates and fixes the startTime to ensure it falls after all same-day timeline events.
 * If the startTime is before the latest event on today (dayOffset 0), it is shifted forward.
 */
export const enforceStartTimeAlignment = (caseData: any) => {
    if (!caseData.startTime) return caseData;

    const startDate = new Date(caseData.startTime);
    if (isNaN(startDate.getTime())) return caseData; // Invalid date, skip

    // Helper: parse a 12-hour time string (e.g. "10:30 PM") into hours and minutes
    const parseTime12h = (timeStr: string): { hours: number; minutes: number } | null => {
        if (!timeStr) return null;
        const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!match) return null;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const period = match[3].toUpperCase();
        if (period === 'AM' && hours === 12) hours = 0;
        if (period === 'PM' && hours !== 12) hours += 12;
        return { hours, minutes };
    };

    // Collect all today's timeline events (dayOffset === 0)
    const crimeDayEvents: { hours: number; minutes: number }[] = [];

    // From initialTimeline
    (caseData.initialTimeline || []).forEach((entry: any) => {
        if ((entry.dayOffset ?? 0) === 0) {
            const parsed = parseTime12h(entry.time);
            if (parsed) crimeDayEvents.push(parsed);
        }
    });

    // From suspect timelines
    (caseData.suspects || []).forEach((s: any) => {
        (s.timeline || []).forEach((entry: any) => {
            if ((entry.dayOffset ?? 0) === 0) {
                const parsed = parseTime12h(entry.time);
                if (parsed) crimeDayEvents.push(parsed);
            }
        });
    });

    if (crimeDayEvents.length === 0) return caseData;

    // Find the latest crime-day event
    const latestEvent = crimeDayEvents.reduce((latest, ev) => {
        const evMinutes = ev.hours * 60 + ev.minutes;
        const latestMinutes = latest.hours * 60 + latest.minutes;
        return evMinutes > latestMinutes ? ev : latest;
    });

    const latestEventMinutes = latestEvent.hours * 60 + latestEvent.minutes;
    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();

    // If startTime is before or equal to the latest crime-day event, shift it forward by 30 min
    if (startMinutes <= latestEventMinutes) {
        const newMinutes = latestEventMinutes + 30;
        const newHours = Math.floor(newMinutes / 60);
        const newMins = newMinutes % 60;

        if (newHours < 24) {
            startDate.setHours(newHours, newMins, 0, 0);
        } else {
            // Rolls past midnight — move to next day
            startDate.setDate(startDate.getDate() + 1);
            startDate.setHours(newHours - 24, newMins, 0, 0);
        }

        // Format back to a human-readable string
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formatted = startDate.toLocaleDateString('en-US', options)
            + ' at ' + startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        caseData.startTime = formatted;

        console.log(`[DEBUG] enforceStartTimeAlignment: Shifted startTime to ${caseData.startTime} (latest same-day event was at ${latestEvent.hours}:${String(latestEvent.minutes).padStart(2, '0')})`);
    }

    return caseData;
};

/**
 * Ensures the initialTimeline always ends with a "suspects brought in for questioning" entry.
 * If missing, one is appended. If present but not last, it's moved to the end.
 * The entry's time is guaranteed to be AFTER all other dayOffset 0 events.
 */
export const ensureBroughtInEntry = (caseData: any) => {
    if (!caseData.initialTimeline) caseData.initialTimeline = [];

    // Helper: parse "8:30 PM" → minutes-since-midnight (or null)
    const parseTime12h = (t: string): number | null => {
        if (!t) return null;
        const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const period = m[3].toUpperCase();
        if (period === 'AM' && h === 12) h = 0;
        if (period === 'PM' && h !== 12) h += 12;
        return h * 60 + min;
    };

    // Helper: minutes-since-midnight → "10:30 PM"
    const formatTime = (mins: number): string => {
        let h = Math.floor(mins / 60) % 24;
        const m = mins % 60;
        const period = h >= 12 ? 'PM' : 'AM';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        return `${h}:${String(m).padStart(2, '0')} ${period}`;
    };

    // Try to extract a time string from startTime
    let timeStr = ''; // will be determined below
    if (caseData.startTime) {
        // Try parsing as a real date first
        const parsed = new Date(caseData.startTime);
        if (!isNaN(parsed.getTime())) {
            timeStr = parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        } else {
            // Try extracting a time pattern like "10:00 PM" from the string
            const timeMatch = caseData.startTime.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
            if (timeMatch) {
                timeStr = timeMatch[1].trim();
            } else {
                // Try to extract descriptive time like "late evening", "midnight", etc.
                const descriptiveMatch = caseData.startTime.match(/(late\s+evening|early\s+morning|midnight|dawn|dusk|noon|midday|evening|morning|afternoon|night)/i);
                if (descriptiveMatch) {
                    timeStr = descriptiveMatch[1].charAt(0).toUpperCase() + descriptiveMatch[1].slice(1);
                }
            }
        }
    }

    // Find the latest time among all OTHER dayOffset 0 events in initialTimeline
    const broughtInPatterns = /brought in|gathered.*for.*question|assembled.*for.*interview|arrive.*for.*question|called in.*for.*question/i;
    let latestMinutes = -1;
    for (const entry of caseData.initialTimeline) {
        if ((entry.dayOffset ?? 0) !== 0) continue;
        if (broughtInPatterns.test(entry.activity || '')) continue; // skip existing brought-in entries
        const mins = parseTime12h(entry.time);
        if (mins !== null && mins > latestMinutes) {
            latestMinutes = mins;
        }
    }

    // Ensure brought-in time is AFTER all other dayOffset 0 events
    const broughtInMinutes = parseTime12h(timeStr);
    if (latestMinutes >= 0) {
        if (broughtInMinutes === null || broughtInMinutes <= latestMinutes) {
            // The extracted time is earlier than or equal to existing events — shift forward
            timeStr = formatTime(Math.min(latestMinutes + 30, 23 * 60 + 59));
        }
    }

    // If we still don't have a parseable time, use a sensible fallback
    if (!timeStr) {
        timeStr = latestMinutes >= 0 ? formatTime(Math.min(latestMinutes + 30, 23 * 60 + 59)) : 'Late Evening';
    }

    // Check if a "brought in" entry already exists
    const existingIdx = caseData.initialTimeline.findIndex((e: any) =>
        broughtInPatterns.test(e.activity || '')
    );

    if (existingIdx !== -1) {
        // Entry exists — ensure it's last, has correct day/dayOffset, and time is correct
        const entry = caseData.initialTimeline[existingIdx];
        entry.day = 'Today';
        entry.dayOffset = 0;
        entry.time = timeStr;
        // Move to end if not already last
        if (existingIdx !== caseData.initialTimeline.length - 1) {
            caseData.initialTimeline.splice(existingIdx, 1);
            caseData.initialTimeline.push(entry);
        }
    } else {
        // No entry exists — add one
        caseData.initialTimeline.push({
            time: timeStr,
            activity: 'All persons of interest brought in for questioning by detective',
            day: 'Today',
            dayOffset: 0
        });
    }

    return caseData;
};

/**
 * Comprehensive post-processor that validates and fixes EVERY field on every suspect.
 * Comprehensive post-processor that validates every field on every suspect.
 * Instead of patching with placeholder defaults, it CARRIES FORWARD the original
 * data from the pre-edit case. If a field existed before and the AI dropped it,
 * the original value is preserved. 100% data completeness, zero placeholders.
 * 
 * Call this AFTER enforceRelationships and enforceTimelines.
 * 
 * @param caseData - The AI-generated case data to validate
 * @param originalCase - The original case data to carry forward from (if available)
 */
export const enforceSuspectSchema = (caseData: any, originalCase?: any) => {
    if (!caseData.suspects || !Array.isArray(caseData.suspects)) return caseData;
    const origSuspects: any[] = originalCase?.suspects || [];

    caseData.suspects.forEach((s: any) => {
        const orig = origSuspects.find((os: any) => os.id === s.id) || {};

        // --- REQUIRED STRING FIELDS: carry forward from original if AI dropped ---
        const stringFields = [
            'name', 'gender', 'bio', 'role', 'status', 'personality', 'secret', 'motive',
            'professionalBackground', 'witnessObservations', 'physicalDescription'
        ];
        stringFields.forEach(f => {
            if (!s[f] || typeof s[f] !== 'string' || s[f].trim().length === 0) {
                if (orig[f] && typeof orig[f] === 'string' && orig[f].trim().length > 0) {
                    s[f] = orig[f];
                }
            }
        });

        // --- STATUS: derive from baseAggravation if still missing after carry-forward ---
        if (!s.status || typeof s.status !== 'string' || s.status.trim().length === 0) {
            if (s.isDeceased) {
                s.status = 'Deceased';
            } else {
                const agg = typeof s.baseAggravation === 'number' ? s.baseAggravation : 0;
                if (agg <= 25) s.status = 'Cooperative';
                else if (agg <= 50) s.status = 'Guarded';
                else if (agg <= 75) s.status = 'Tense';
                else s.status = 'Hostile';
            }
        }

        // --- REQUIRED NUMBER FIELDS: carry forward ---
        if (typeof s.age !== 'number' || isNaN(s.age)) s.age = orig.age ?? s.age;
        if (typeof s.baseAggravation !== 'number' || isNaN(s.baseAggravation)) s.baseAggravation = orig.baseAggravation ?? s.baseAggravation;
        if (typeof s.avatarSeed !== 'number' || isNaN(s.avatarSeed)) s.avatarSeed = orig.avatarSeed ?? Math.floor(Math.random() * 999999);

        // --- REQUIRED BOOLEAN FIELDS: carry forward ---
        if (typeof s.isGuilty !== 'boolean') s.isGuilty = orig.isGuilty ?? false;
        if (s.isDeceased === undefined && orig.isDeceased !== undefined) s.isDeceased = orig.isDeceased;

        // --- ALIBI: carry forward entire alibi if AI mangled it ---
        if (!s.alibi || typeof s.alibi !== 'object') {
            s.alibi = orig.alibi ? JSON.parse(JSON.stringify(orig.alibi)) : { statement: '', isTrue: true, location: '', witnesses: [] };
        } else {
            if (!s.alibi.statement && orig.alibi?.statement) s.alibi.statement = orig.alibi.statement;
            if (typeof s.alibi.isTrue !== 'boolean') s.alibi.isTrue = orig.alibi?.isTrue ?? true;
            if (!s.alibi.location && orig.alibi?.location) s.alibi.location = orig.alibi.location;
            if (!Array.isArray(s.alibi.witnesses)) s.alibi.witnesses = orig.alibi?.witnesses || [];
            s.alibi.witnesses = s.alibi.witnesses.filter((w: any) => typeof w === 'string' && w.trim().length > 0);
        }

        // --- TIMELINE: carry forward original if AI returned nothing ---
        if (!Array.isArray(s.timeline)) {
            s.timeline = orig.timeline ? JSON.parse(JSON.stringify(orig.timeline)) : [];
        } else {
            // Strip entries missing the required time field
            s.timeline = s.timeline.filter((entry: any) => {
                if (!entry || typeof entry !== 'object') return false;
                return entry.time && typeof entry.time === 'string' && entry.time.trim().length > 0;
            });
            // Recover missing activity from original by matching time
            s.timeline.forEach((entry: any) => {
                if (!entry.activity || typeof entry.activity !== 'string' || entry.activity.trim().length === 0) {
                    const origEntry = (orig.timeline || []).find((oe: any) => oe.time === entry.time);
                    if (origEntry?.activity) entry.activity = origEntry.activity;
                }
            });
            // If AI returned empty timeline but original had one, carry forward
            if (s.timeline.length === 0 && orig.timeline && orig.timeline.length > 0) {
                s.timeline = JSON.parse(JSON.stringify(orig.timeline));
            }
        }

        // --- RELATIONSHIPS: carry forward from original if AI dropped ---
        if (!Array.isArray(s.relationships)) {
            s.relationships = orig.relationships ? JSON.parse(JSON.stringify(orig.relationships)) : [];
        } else {
            s.relationships = s.relationships.filter((r: any) => {
                if (!r || typeof r !== 'object') return false;
                return r.targetName && typeof r.targetName === 'string' && r.targetName.trim().length > 0;
            });
            // Recover missing type/description from original
            s.relationships.forEach((r: any) => {
                const origRel = (orig.relationships || []).find((or: any) => or.targetName === r.targetName);
                if (!r.type || typeof r.type !== 'string') r.type = origRel?.type || 'Acquaintance';
                if (!r.description || typeof r.description !== 'string' || r.description.trim().length === 0) {
                    if (origRel?.description) r.description = origRel.description;
                }
            });
        }

        // --- KNOWN FACTS: carry forward if AI dropped ---
        if (!Array.isArray(s.knownFacts)) {
            s.knownFacts = orig.knownFacts ? [...orig.knownFacts] : [];
        } else {
            s.knownFacts = s.knownFacts.filter((f: any) => typeof f === 'string' && f.trim().length > 0);
            if (s.knownFacts.length === 0 && orig.knownFacts && orig.knownFacts.length > 0) {
                s.knownFacts = [...orig.knownFacts];
            }
        }

        // --- HIDDEN EVIDENCE: carry forward images + descriptions from original ---
        if (!Array.isArray(s.hiddenEvidence)) {
            s.hiddenEvidence = orig.hiddenEvidence ? JSON.parse(JSON.stringify(orig.hiddenEvidence)) : [];
        } else {
            s.hiddenEvidence = s.hiddenEvidence.filter((ev: any) => {
                if (!ev || typeof ev !== 'object') return false;
                return ev.title && typeof ev.title === 'string' && ev.title.trim().length > 0;
            });
            s.hiddenEvidence.forEach((ev: any, i: number) => {
                if (!ev.id || typeof ev.id !== 'string') ev.id = `he-${s.id}-${i}`;
                if (!ev.description || typeof ev.description !== 'string') {
                    const origEv = (orig.hiddenEvidence || []).find((oe: any) => oe.id === ev.id || oe.title === ev.title);
                    ev.description = origEv?.description || ev.title;
                }
            });
        }

        // --- PORTRAITS & VOICE: always carry forward (AI never generates these) ---
        if (!s.portraits || Object.keys(s.portraits).length === 0) s.portraits = orig.portraits || {};
        if (!s.voice) s.voice = orig.voice;
    });

    // --- INITIAL EVIDENCE: carry forward descriptions from original ---
    if (Array.isArray(caseData.initialEvidence)) {
        const origEvidence = originalCase?.initialEvidence || [];
        caseData.initialEvidence = caseData.initialEvidence.filter((ev: any) => {
            if (!ev || typeof ev !== 'object') return false;
            return ev.title && typeof ev.title === 'string' && ev.title.trim().length > 0;
        });
        caseData.initialEvidence.forEach((ev: any, i: number) => {
            if (!ev.id || typeof ev.id !== 'string') ev.id = `ie-${i}`;
            if (!ev.description || typeof ev.description !== 'string') {
                const origEv = origEvidence.find((oe: any) => oe.id === ev.id || oe.title === ev.title);
                ev.description = origEv?.description || ev.title;
            }
        });
    }

    // --- INITIAL TIMELINE: carry forward activity from original ---
    if (Array.isArray(caseData.initialTimeline)) {
        const origTimeline = originalCase?.initialTimeline || [];
        caseData.initialTimeline = caseData.initialTimeline.filter((entry: any) => {
            if (!entry || typeof entry !== 'object') return false;
            return entry.time && typeof entry.time === 'string' && entry.time.trim().length > 0;
        });
        caseData.initialTimeline.forEach((entry: any) => {
            if (!entry.activity || typeof entry.activity !== 'string' || entry.activity.trim().length === 0) {
                const origEntry = origTimeline.find((oe: any) => oe.time === entry.time);
                if (origEntry?.activity) entry.activity = origEntry.activity;
            }
        });
    }

    console.log('[DEBUG] enforceSuspectSchema: Validated all suspects and case-level data');
    return caseData;
};

// --- CORE FUNCTIONS ---

export const checkCaseConsistency = async (caseData: CaseData, onProgress?: (msg: string) => void, baseline?: CaseData, editContext?: string): Promise<{ updatedCase: CaseData, report: any }> => {
    if (onProgress) onProgress('Running consistency check on server...');
    try {
        const result = await geminiPost<{ updatedCase: CaseData, report: any }>('/case/consistency', {
            caseData, baseline, editContext
        });
        return result;
    } catch (e) {
        console.error('Consistency Check Failed:', e);
        return { updatedCase: caseData, report: 'Consistency check failed.' };
    }
};

/**
 * Allows the user to request broad, AI-driven edits to an entire case.
 * Handles everything from theme changes to suspect management.
 */
export const editCaseWithPrompt = async (caseData: CaseData, userPrompt: string, onProgress?: (msg: string) => void, baseline?: CaseData): Promise<{ updatedCase: CaseData, report: any }> => {
    if (onProgress) onProgress('Applying AI edits on server...');
    try {
        const result = await geminiPost<{ updatedCase: CaseData, report: any }>('/case/edit', {
            caseData, userPrompt, baseline
        });
        return result;
    } catch (e) {
        console.error('Edit Case Failed:', e);
        throw e;
    }
};

export const generateCaseFromPrompt = async (userPrompt: string, isLucky: boolean = false): Promise<CaseData> => {
    return geminiPost<CaseData>('/case/generate', { userPrompt, isLucky });
};

