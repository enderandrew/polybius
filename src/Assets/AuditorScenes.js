/**
 * AuditorScenes.js
 *
 * The hidden meta-narrative. Deliberately kept in its own module and NOT
 * appended to ScreenParodySurface.PARODY_MESSAGES — anyone who opens the
 * bundle looking for jokes shouldn't stumble over the whole arc at once.
 *
 * ── Line format ──────────────────────────────────────────────────────────────
 *
 * Text lines may contain {tokens} resolved at display time from live data:
 *
 *   {sessionElapsed}  this session, e.g. "1h 24m"
 *   {totalPlaytime}   lifetime across all sessions, e.g. "11h 07m"
 *   {localTime}       wall clock, 24h, e.g. "02:47"
 *   {timeOfDay}       "morning" | "afternoon" | "evening" | "night"
 *   {timezone}        IANA zone, e.g. "America/Chicago"
 *   {sessionCount}    sessions the save has recorded
 *   {phantomCount}    sessionCount + 3 — sessions "on file" the player has no
 *                     memory of. The discrepancy IS the point of scene 4.
 *   {highestLevel}    furthest surface reached
 *
 * ── Timing ───────────────────────────────────────────────────────────────────
 *
 * Every scene runs at least CIGARETTE_DURATION_MS because the cigarette sound
 * plays in full on every scene, including the ones where the Auditor isn't
 * visible. He is always present; the sound is the proof.
 */

/** Length of the cigarette SFX. No scene may be shorter than this. */
export const CIGARETTE_DURATION_MS = 3200;

/**
 * Reading-time floor.
 *
 * The cigarette length alone (3.2s) only guaranteed the SOUND finished — it
 * was nowhere near enough to actually read a scene, which made several of them
 * effectively unreadable in play. These constants give every scene a computed
 * minimum derived from its own word count, so a future text edit can't
 * silently reintroduce the problem.
 */
export const READING_BASE_MS = 2000;
export const READING_MS_PER_WORD = 350;

/**
 * @param {string[]} lines
 * @return {number} minimum time this text needs on screen, in ms.
 */
export function minimumHoldFor(lines) {
  const words = lines.join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(
    CIGARETTE_DURATION_MS,
    READING_BASE_MS + words * READING_MS_PER_WORD,
  );
}

/**
 * The real 5x5 Polybius square used by scene 5 (I/J merged, keyed on
 * POLYBIUS). Exported so the art prompt and any in-game rendering can't drift
 * out of sync with the ciphertext.
 *
 *       1 2 3 4 5
 *   1   P O L Y B
 *   2   I U S A C
 *   3   D E F G H
 *   4   K M N Q R
 *   5   T V W X Z
 */
export const POLYBIUS_SQUARE = [
  ['P', 'O', 'L', 'Y', 'B'],
  ['I', 'U', 'S', 'A', 'C'],
  ['D', 'E', 'F', 'G', 'H'],
  ['K', 'M', 'N', 'Q', 'R'],
  ['T', 'V', 'W', 'X', 'Z'],
];

/** Decodes to WE NEVER LEFT PORTLAND. Verified round-trip. */
export const CIPHERTEXT =
  '53 32 43 32 52 32 45 13 32 33 51 11 12 45 51 13 24 43 31';

/**
 * @typedef {object} AuditorScene
 * @property {number} id
 * @property {string} name              internal label, never displayed
 * @property {string[]} lines           text, may contain {tokens}
 * @property {?string} art              image under public/, or null for text-only
 * @property {number} holdMs            total scene duration
 * @property {boolean} thud             low sub-bass hit
 * @property {number} thudAtMs          when the thud lands
 * @property {?object} speech           { text, pitch, rate, volume } or null
 * @property {boolean} bgmCut           silence the music for the scene
 * @property {?string} special          renderer hook for one-off scenes
 */

/** @type {AuditorScene[]} */
const AUDITOR_SCENES = [
  {
    id: 1,
    name: 'FORM',
    lines: [
      'sinneslöschen  ▸  form 12-B',
      'subject response: mostly nominal',
      'session 1 of 1 reviewed',
      "the auditor's notes classified",
    ],
    art: null,
    holdMs: 7000,
    thud: false,
    thudAtMs: 0,
    speech: null,
    bgmCut: true,
    special: 'ember-corner',
  },
  {
    id: 2,
    name: 'COUNTERSIGNED',
    lines: [
      'session 1 of 1',
      'countersigned — auditor 0',
      '',
      'you looked directly at form 12-B',
      'this has been noted',
    ],
    art: null,
    holdMs: 7000,
    thud: true,
    thudAtMs: 2000,
    speech: null,
    bgmCut: true,
    special: 'ember-corner-double',
  },
  {
    id: 3,
    name: 'INVENTORY',
    lines: [
      'elapsed this session:  {sessionElapsed}',
      'total time on file:    {totalPlaytime}',
      'local time:            {localTime}',
      'surfaces cleared:      {highestLevel}',
      '',
      'subjects who continue past this hour',
      'report the most vivid dreams',
    ],
    art: 'auditor/03-chair.png',
    holdMs: 9000,
    thud: false,
    thudAtMs: 0,
    speech: null,
    bgmCut: true,
    special: null,
  },
  {
    id: 4,
    name: 'DISCREPANCY',
    lines: [
      'you have played {sessionCount} sessions',
      'we have {phantomCount} on file',
      '',
      'three are not yours to remember',
    ],
    art: 'auditor/04-doorway.png',
    holdMs: 6500,
    thud: false,
    thudAtMs: 0,
    speech: null,
    bgmCut: true,
    special: null,
  },
  {
    id: 5,
    name: 'CIPHER',
    // No lines and no grid drawing: the art supplies the square, the
    // ciphertext and the plaintext. Anything drawn here would print on top of
    // artwork that already says it.
    lines: [],
    art: 'auditor/05-cipher.png',
    holdMs: 8000,
    thud: false,
    thudAtMs: 0,
    speech: null,
    bgmCut: true,
    special: null,
  },
  {
    id: 6,
    name: 'REQUISITION',
    lines: [
      'req. 44817 — replacement subject',
      'justification:  attrition',
      'approved:       auditor 0',
      'priority:       routine',
      '',
      'thank you for your continued participation',
    ],
    art: 'auditor/06-stamp.png',
    holdMs: 8000,
    thud: true,
    thudAtMs: 2600,
    speech: null,
    bgmCut: true,
    special: null,
  },
  {
    id: 7,
    name: 'SUBJECT 12',
    lines: [
      'subject 12 — 1981-11-03',
      '"it asked me to keep playing"',
      '"i did"',
      '',
      'subject 12 did not report for session 7',
      'or the rest of their life',
    ],
    art: 'auditor/07-cabinet.png',
    holdMs: 8500,
    thud: false,
    thudAtMs: 0,
    speech: {
      text: 'it asked me to keep playing. i did.',
      pitch: 0.2,
      rate: 0.6,
      volume: 0.4,
    },
    bgmCut: true,
    special: null,
  },
  {
    id: 8,
    name: 'THE MASK',
    lines: [
      'the voice you have been hearing',
      'was written to be ridiculous',
      '',
      'you were never meant to believe it',
      'you were meant to stop looking',
      '',
      'the experiment will continue',
      'but you will receive no further warnings',
    ],
    art: 'auditor/08-split.png',
    holdMs: 10000,
    thud: false,
    thudAtMs: 0,
    speech: null,
    bgmCut: true,
    // BGM stabs back in mid-bar, wrong and too loud, then cuts.
    special: 'bgm-stab',
  },
  {
    id: 9,
    name: 'PHOTOGRAPH',
    lines: [],
    art: 'auditor/09-photo.png',
    holdMs: 5500,
    thud: false,
    thudAtMs: 0,
    speech: null,
    bgmCut: true,
    special: null,
  },
  {
    id: 10,
    name: 'PROXIMITY',
    lines: [
      'you are closer to the machine',
      'than you were an hour ago',
      '',
      'so is the auditor',
      '',
      'do you know what happens next?',
    ],
    art: 'auditor/10-photo-closer.png',
    holdMs: 7500,
    thud: false,
    thudAtMs: 0,
    speech: null,
    bgmCut: true,
    special: 'rising-tone',
  },
  {
    id: 11,
    name: 'THE OFFER',
    lines: [
      'there is no next surface for you',
      'there is a window behind you',
      '',
      'it is {timeOfDay}',
      'it is {localTime}',
      '',
      'please close this tab',
    ],
    art: 'auditor/11-close.png',
    holdMs: 8500,
    thud: false,
    thudAtMs: 0,
    speech: {
      text: 'please close this tab.',
      pitch: 0.15,
      rate: 0.55,
      volume: 0.6,
    },
    bgmCut: true,
    special: null,
  },
  {
    id: 12,
    name: 'FILED',
    lines: [
      'session closed - form 12-B filed',
      '',
      'thank you for your continued participation',
      '',
      'if you are selected for the next',
      'phase of the experiment',
      'you will not know',
      '',
      'auditor 0',
    ],
    art: 'auditor/12-empty.png',
    // Waits for input rather than auto-advancing. holdMs is the floor.
    holdMs: 9500,
    thud: false,
    thudAtMs: 0,
    speech: null,
    bgmCut: true,
    special: 'wait-for-input',
  },
];

// Applied once at module load so no scene can ship with a hold shorter than
// its own text needs.
for (const scene of AUDITOR_SCENES) {
  scene.holdMs = Math.max(scene.holdMs, minimumHoldFor(scene.lines));
}

export default AUDITOR_SCENES;
