// Two click-held asides in the REPCon participant journey. Rows only fade;
// no camera movement, sliding, or automatic navigation is involved.
export const REPCON_ELIGIBILITY = {
  inclusion: [
    "Age 18–70 years",
    "At least one mTBI",
    "Medical documentation according to WHO classification ICD-10",
    "Post-concussion symptoms for more than 4 weeks after trauma",
    "Proficient in Danish",
  ],
  exclusion: [
    "Moderate or severe TBI",
    "Unavailable for 12 consecutive weeks",
    "Contraindication for MRI, including MRI contrast agents",
    "Medical conditions that can obscure post-concussion symptoms",
    "Cardiovascular diseases prohibiting planned physical exercise",
    "Professional or elite athletes",
  ],
};

const smooth = value => {
  const q = Math.max(0, Math.min(1, value));
  return q * q * (3 - 2 * q);
};

function wrap(g, text, width) {
  const lines = [], words = text.split(/\s+/);
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > width) {
      lines.push(line); line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawRepconEligibility(g, W, H, {step, elapsed, k = W / 640, hi = "#F9F9F7"}) {
  const complete = step === 2;
  const text = (value, x, y, size, alpha = 1, color = hi) => {
    g.save(); g.globalAlpha = alpha; g.fillStyle = color;
    g.textAlign = "left"; g.textBaseline = "middle";
    g.font = `400 ${size * k}px Georgia, 'Times New Roman', serif`;
    g.shadowColor = color === hi ? "rgba(0,0,0,.96)" : "transparent";
    g.shadowBlur = color === hi ? 9 * k : 0;
    g.shadowOffsetY = color === hi ? 2 * k : 0;
    g.fillText(value, x, y); g.restore();
  };
  text("REPCon trial design", W * .055, H * .085, 19.5);
  const heading = (value, x, alpha) => {
    const size = 14.5 * k, y = H * .205;
    g.save(); g.globalAlpha = alpha;
    g.font = `400 ${size}px Georgia, 'Times New Roman', serif`;
    const width = g.measureText(value).width;
    // A single irregular strip, in the same yellow as the presentation markers.
    g.fillStyle = "#efdc60";
    g.beginPath();
    g.moveTo(x - 3 * k, y - size * .53);
    g.lineTo(x + width + 4 * k, y - size * .49);
    g.lineTo(x + width + 2 * k, y + size * .58);
    g.lineTo(x - 4 * k, y + size * .54);
    g.closePath(); g.fill(); g.restore();
    text(value, x, y, 14.5, alpha, "#18170b");
  };
  for (const [index, key] of ["inclusion", "exclusion"].entries()) {
    if (index === 1 && !complete) continue;
    const x = W * (index === 0 ? .055 : .545), width = W * .395;
    const localAge = index === 0 && complete ? 12 : elapsed;
    heading(index === 0 ? "Inclusion" : "Exclusion", x, smooth(localAge / .25));
    g.save(); g.font = `400 ${11.1 * k}px Georgia, 'Times New Roman', serif`;
    const rows = REPCON_ELIGIBILITY[key].map(value => wrap(g, value, width)); g.restore();
    rows.forEach((lines, row) => {
      const alpha = smooth((localAge - .15 - row * .24) / .48);
      if (!alpha) return;
      const y = H * (.295 + row * .105);
      lines.forEach((line, i) => text(line, x, y + i * 13.3 * k, 11.1, alpha));
    });
  }
}
