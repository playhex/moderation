export const BAD_WORDS = [
  // Insults
  'idiot', 'stupid', 'moron', 'imbecile', 'retard', 'dumb', 'loser',
  'noob', 'nerd', 'dork', 'jerk', 'ass', 'asshole', 'bastard',
  // Profanity
  'fuck', 'shit', 'crap', 'bitch', 'damn', 'hell', 'cunt', 'cock', 'dick',
  'pussy', 'whore', 'slut',
  // Slurs
  'nigger', 'nigga', 'faggot', 'fag', 'dyke', 'tranny', 'spic', 'kike',
  'chink', 'gook', 'wetback',
  // Threats / toxic
  'kill', 'die', 'cancer', 'kys', 'rape', 'toxic',
];

const pattern = new RegExp(
  `(${BAD_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'gi',
);

/**
 * Returns an HTML string with bad-word matches wrapped in <u class="text-warning">.
 * Input must already be HTML-escaped.
 */
export function highlightBadWords(escapedText) {
  return escapedText.replace(pattern, '<u class="text-danger fw-bold">$1</u>');
}
