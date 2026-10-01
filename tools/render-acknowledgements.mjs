const marker = '<!-- DEFENSE_ACKNOWLEDGEMENTS -->';
const escapeHTML = text => text.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function renderAcknowledgements(html, data) {
  if (html.split(marker).length !== 2) throw Error('Expected one acknowledgements placeholder.');
  if (!Array.isArray(data?.paragraphs) || !data.paragraphs.length
      || data.paragraphs.some(text => typeof text !== 'string' || !text.trim()))
    throw Error('Acknowledgements need non-empty text paragraphs.');
  return html.replace(marker, () => data.paragraphs.map(text => `<p>${escapeHTML(text)}</p>`).join('\n        '));
}
