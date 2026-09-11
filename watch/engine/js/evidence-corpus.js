// Broad search records form the background; source-reviewed story papers retain
// their SVG glyphs and citation links. Rasterize once and share across slide instances.
const CORPUS_IMAGES = new WeakMap();
export function mountEvidenceCorpus(svg, data, holder) {
  const records = data.nodes.filter(node => node.auditStatus === 'automated-screening');
  if (!records.length) return null;
  const [width, height] = data.meta?.coordinateSystem || [1600, 820];
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  layer.setAttribute('x', '0'); layer.setAttribute('y', '0');
  layer.setAttribute('width', width); layer.setAttribute('height', height);
  layer.classList.add('evidence-corpus-layer');
  layer.style.pointerEvents = 'none';
  if (!CORPUS_IMAGES.has(data)) {
  const canvas = document.createElement('canvas');
  canvas.width = width * 2; canvas.height = height * 2;
  canvas.style.width = '100%'; canvas.style.height = '100%';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  context.scale(2, 2);
  // Automated screening does not establish study arms. Uniform small dots avoid
  // giving inferred species the same visual authority as reviewed population glyphs.
  for (const [theme, spec] of Object.entries(data.themes)) {
    context.beginPath();
    for (const node of records) {
      if (node.theme !== theme) continue;
      const x = Number(node.x), y = Number(node.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const radius = Math.max(.7, Math.min(1.3, Number(node.size) || 1));
      context.moveTo(x + radius, y); context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.fillStyle = spec.color || '#87909b';
    context.globalAlpha = .38;
    context.fill();
  }
  CORPUS_IMAGES.set(data, canvas.toDataURL('image/png'));
  canvas.width = canvas.height = 1;
  }
  layer.setAttribute('href', CORPUS_IMAGES.get(data));
  svg.prepend(layer);
  holder.dataset.corpusRecords = String(data.nodes.length);
  holder.dataset.backgroundRecords = String(records.length);
  holder.dataset.reviewedRecords = String(data.nodes.length - records.length);
  svg.setAttribute('aria-label', `${data.nodes.length.toLocaleString()} source-linked literature records. Small dots are automatically themed search records; larger symbols are reviewed papers used in the presentation.`);
  return layer;
}
