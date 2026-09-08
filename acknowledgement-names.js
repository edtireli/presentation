// Explicit personal mentions in the source acknowledgements. “my dad” identifies
// a person whose name is not supplied; preserve that phrase rather than invent one.
export const ACKNOWLEDGEMENT_PERSONAL_MENTIONS = Object.freeze([
  'Henrik Larsson', 'Mark', 'Ulrich', 'Stig', 'Martine', 'Tanne', 'Bodil',
  'Derya', 'my dad', 'Miriam', 'Nicholas', 'Rikke', 'Clara',
]);

const escapedNames = [...ACKNOWLEDGEMENT_PERSONAL_MENTIONS]
  .sort((a, b) => b.length - a.length)
  .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
// Unicode letter/number boundaries avoid marking names inside unrelated words.
// Capture the leading separator so the matcher also works without lookbehind.
const names = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapedNames.join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'gu');

export function renderAcknowledgementParagraph(text) {
  if (typeof text !== 'string') throw new TypeError('Acknowledgement text must be a string.');
  const paragraph = document.createElement('p');
  let cursor = 0;
  for (const match of text.matchAll(names)) {
    const start = match.index + match[1].length;
    if (start > cursor) paragraph.append(document.createTextNode(text.slice(cursor, start)));
    const mark = document.createElement('mark');
    mark.className = 'acknowledgement-name';
    mark.textContent = match[2];
    paragraph.append(mark);
    cursor = start + match[2].length;
  }
  if (cursor < text.length) paragraph.append(document.createTextNode(text.slice(cursor)));
  return paragraph;
}
