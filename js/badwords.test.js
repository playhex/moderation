import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BAD_WORDS, highlightBadWords } from './badwords.js';

const wrap = w => `<u class="text-danger fw-bold">${w}</u>`;

describe('BAD_WORDS', () => {
  it('is a non-empty array of strings', () => {
    assert.ok(Array.isArray(BAD_WORDS));
    assert.ok(BAD_WORDS.length > 0);
    for (const w of BAD_WORDS) assert.equal(typeof w, 'string');
  });
});

describe('highlightBadWords', () => {
  it('returns the input unchanged when no bad word is present', () => {
    assert.equal(highlightBadWords('Good morning'), 'Good morning');
    assert.equal(highlightBadWords(''), '');
  });

  it('wraps a bad word with the highlight markup', () => {
    assert.equal(highlightBadWords('you idiot', ['idiot']), `you ${wrap('idiot')}`);
  });

  it('is case-insensitive', () => {
    assert.equal(highlightBadWords('IDIOT', ['idiot']), wrap('IDIOT'));
    assert.equal(highlightBadWords('Idiot', ['idiot']), wrap('Idiot'));
  });

  it('highlights all occurrences in a message', () => {
    assert.equal(highlightBadWords('idiot and moron', ['idiot', 'moron']), `${wrap('idiot')} and ${wrap('moron')}`);
  });

  it('highlights a bad word mid-sentence', () => {
    assert.equal(highlightBadWords('what a stupid move', ['stupid']), `what a ${wrap('stupid')} move`);
  });

  it('handles already HTML-escaped input without double-escaping', () => {
    const escaped = 'say &amp; do nothing bad';
    assert.equal(highlightBadWords(escaped), escaped);
  });

  it('handles multiple distinct bad words back to back', () => {
    assert.equal(highlightBadWords('fuck shit', ['fuck', 'shit']), `${wrap('fuck')} ${wrap('shit')}`);
  });

  it('does not highlight bad words if inside another word', () => {
    assert.equal(highlightBadWords('hello classic', ['hell', 'ass']), 'hello classic');
  });

  it('always highlight some bad words', () => {
    assert.equal(highlightBadWords('hail hitler nigger'), `${wrap('hail')} ${wrap('hitler')} ${wrap('nigger')}`);
  });
});
