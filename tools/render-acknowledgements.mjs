const marker = '<!-- DEFENSE_ACKNOWLEDGEMENTS -->';
const escapeHTML = text => text.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

// Match whole personal mentions, including the phrase used for the unnamed dad.
const mentions = [
  'Henrik Larsson', 'Mark', 'Ulrich', 'Stig', 'Martine', 'Tanne', 'Bodil',
  'Derya', 'my dad', 'Miriam', 'Nicholas', 'Rikke', 'Clara',
];
const names = new RegExp(`(^|[^\\p{L}\\p{N}_])(${mentions.join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'gu');
function highlightedParagraph(text) {
  let result = '', cursor = 0;
  for (const match of text.matchAll(names)) {
    const start = match.index + match[1].length;
    result += escapeHTML(text.slice(cursor, start));
    result += `<mark class="acknowledgement-name">${escapeHTML(match[2])}</mark>`;
    cursor = start + match[2].length;
  }
  return result + escapeHTML(text.slice(cursor));
}

export function renderAcknowledgements(html, data) {
  if (html.split(marker).length !== 2) throw Error('Expected one acknowledgements placeholder.');
  if (!Array.isArray(data?.paragraphs) || !data.paragraphs.length
      || data.paragraphs.some(text => typeof text !== 'string' || !text.trim()))
    throw Error('Acknowledgements need non-empty text paragraphs.');
  return html.replace(marker, () => data.paragraphs.map(text => `<p>${highlightedParagraph(text)}</p>`).join('\n        '));
}
