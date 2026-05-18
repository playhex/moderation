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
  // Hate speech
  'hail', 'hitler', 'jews',
];

const createRegex = (badWords) => new RegExp(
  `\\b(${badWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi',
);

const defaultRegex = createRegex(BAD_WORDS);

/**
 * Returns an HTML string with bad-word matches wrapped in <u class="text-warning">.
 * Input must already be HTML-escaped.
 */
export function highlightBadWords(escapedText, badWords) {
  let regex = badWords
    ? createRegex(badWords)
    : defaultRegex
  ;

  return escapedText.replace(regex, '<u class="text-danger fw-bold">$1</u>');
}
