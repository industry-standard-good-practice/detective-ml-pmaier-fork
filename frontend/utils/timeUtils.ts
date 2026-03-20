
export const TIME_INCREMENT_MS = 5 * 60 * 1000; // 5 minutes per action
export const WAIT_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes before they get mad
export const INITIAL_TIME_MS = new Date('2030-09-12T23:30:00').getTime(); // Default fallback

/** Formats a timestamp in 12-hour AM/PM format (never military time) */
export const formatTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

/** Formats "Noah Semus" → "Noah S." */
export const formatAuthorName = (displayName: string | null | undefined): string => {
  if (!displayName) return 'Unknown Author';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || 'Unknown Author';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
};

export const DEFAULT_SUGGESTIONS = [
  { label: "Where were you?", text: "Good evening. I'm the detective assigned to this case. Can you tell me where you were at the time of the crime?" },
  { label: "Connection to Victim", text: "I apologize for the intrusion during this difficult time, but I need to ask: how exactly did you know the victim?" },
  { label: "Any Witnesses?", text: "We're verifying timelines. Is there anyone who can confirm your whereabouts during the incident?" }
];
