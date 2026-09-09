// Rikke's ink trip. Rasterise the live typography once, then bend the ink itself
// in a continuous field. The real text and its hit targets stay in the document.
// The caller owns the animation clock and removes `nodes` through manageEffect.
const DURATION = 14000;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = (start, end, value) => {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
};

const VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * .5 + .5, .5 - a_position.y * .5);
  gl_Position = vec4(a_position, 0., 1.);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_ink;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_time;
uniform float u_amount;
uniform float u_visibility;
varying vec2 v_uv;

vec3 spectrum(float t) {
  // A continuous, restrained circuit through ivory, gold, rose, violet and blue.
  vec3 a = vec3(.69, .64, .73);
  vec3 b = vec3(.28, .29, .25);
  return a + b * cos(6.28318 * (vec3(t) + vec3(.02, .20, .40)));
}

vec2 bend(vec2 p, float t) {
  vec2 q = p - u_origin;
  float r = length(q);
  float scale = min(1., u_view.x / 720. + .25);
  // Broad travelling folds, with a small twist around the clicked name.
  vec2 fold = vec2(
    sin(p.y * .023 - t * .73 + sin(p.x * .009 + t * .24)) * 19.,
    sin(p.x * .019 + t * .49 + cos(p.y * .011 - t * .31)) * 13.
  );
  float turn = .045 * sin(r * .012 - t * .64) * exp(-r / 1100.);
  fold += vec2(-q.y, q.x) * turn;
  // These two short wavelengths change each serif, counter and stem, rather
  // than moving intact words as a single wobbly sheet.
  vec2 ink = vec2(
    sin(p.y * .21 + t * .92 + sin(p.x * .13 - t * .48)) * 4.6,
    sin(p.x * .19 - t * .78 + cos(p.y * .17 + t * .37)) * 4.2
  );
  float breathe = .72 + .28 * sin(t * .43 + p.y * .006);
  return p + (fold + ink * breathe) * u_amount * scale;
}

vec4 inkAt(vec2 p) {
  vec2 uv = p / u_view;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return vec4(0.);
  return texture2D(u_ink, uv);
}

void main() {
  vec2 p = v_uv * u_view;
  float t = u_time;
  vec2 warped = bend(p, t);
  vec4 original = inkAt(warped);
  float swell = (.55 + .45 * sin(t * .68 + p.y * .038)) * u_amount * 1.15;
  float rim = max(max(inkAt(warped + vec2(swell, 0.)).a,
                     inkAt(warped - vec2(swell, 0.)).a),
                  max(inkAt(warped + vec2(0., swell)).a,
                      inkAt(warped - vec2(0., swell)).a));
  // Earlier positions leave two finite, softly coloured ink impressions.
  float violet = inkAt(bend(p + vec2(2.4, -1.7) * u_amount, t - .34)).a;
  float blue = inkAt(bend(p - vec2(3.8, -2.3) * u_amount, t - .68)).a;
  float colourPosition = p.x * .0008 + p.y * .0011 - t * .035;
  vec3 coreColour = mix(original.rgb, spectrum(colourPosition), u_amount * .87);
  float core = original.a * .96;
  float edge = max(0., rim - original.a) * .72 * u_amount;
  float echoV = violet * .25 * u_amount * (1. - core);
  float echoB = blue * .17 * u_amount * (1. - core);

  // Slow, nested liquid contours continue the text's flow across the page.
  vec2 q = (p - u_origin) / max(u_view.x, u_view.y);
  q.x *= 1.12;
  float radius = length(q);
  float angle = atan(q.y, q.x);
  float liquid = radius * 45. - t * .55
    + 2.2 * sin(angle * 3. + t * .15 + radius * 8.)
    + 1.2 * sin(q.x * 12. - q.y * 9. + t * .26);
  float contour = pow(.5 + .5 * sin(liquid), 22.);
  float innerContour = pow(.5 + .5 * sin(liquid + .65), 38.);
  float haze = .5 + .5 * sin(q.x * 5. + q.y * 8. + t * .19);
  float field = (contour * .065 + innerContour * .025 + haze * .028) * u_amount;
  vec3 fieldColour = spectrum(radius * .8 + angle * .055 - t * .025);
  vec3 colour = coreColour * core
    + spectrum(colourPosition + .13) * edge
    + vec3(.64, .38, .95) * echoV
    + vec3(.30, .59, .98) * echoB
    + fieldColour * field * (1. - core);
  float alpha = min(1., core + edge + echoV + echoB + field * (1. - core));
  // Premultiplied alpha avoids dark fringes on the page's existing field.
  gl_FragColor = vec4(min(colour, vec3(alpha)), alpha) * u_visibility;
}`;

function createInkRenderer(canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: false, premultipliedAlpha: true,
    depth: false, stencil: false, powerPreference: 'low-power',
  });
  if (!gl) return null;
  const shaders = [];
  let program, buffer, texture;
  const dispose = () => {
    if (texture) gl.deleteTexture(texture);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  try {
    for (const [kind, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
      const shader = gl.createShader(kind);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    }
    program = gl.createProgram();
    shaders.forEach(shader => gl.attachShader(program, shader));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, 'u_ink'), 0);
    const uniforms = Object.fromEntries(['view', 'origin', 'time', 'amount', 'visibility']
      .map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
    return {
      upload(source) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      },
      render({width, height, origin, time, amount, visibility}) {
        if (gl.isContextLost()) return false;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uniforms.view, width, height);
        gl.uniform2f(uniforms.origin, origin.x, origin.y);
        gl.uniform1f(uniforms.time, time);
        gl.uniform1f(uniforms.amount, amount);
        gl.uniform1f(uniforms.visibility, visibility);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return true;
      },
      dispose,
    };
  } catch {
    dispose();
    return null;
  }
}

function captureText(source, targets, width, height, density) {
  source.width = Math.ceil(width * density);
  source.height = Math.ceil(height * density);
  const ctx = source.getContext('2d');
  ctx.scale(density, density);
  ctx.textBaseline = 'alphabetic';
  const range = document.createRange();
  for (const {element} of targets) {
    if (!element.isConnected) continue;
    const box = element.getBoundingClientRect();
    if (box.bottom < -60 || box.top > height + 60) continue;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const parent = node.parentElement;
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.fontKerning = 'normal';
      if ('letterSpacing' in ctx) ctx.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
      ctx.fillStyle = parent.closest('.acknowledgement-name') ? '#efd98d' : style.color;
      const metrics = ctx.measureText('Mg');
      const ascent = metrics.fontBoundingBoxAscent ?? Number.parseFloat(style.fontSize) * .8;
      const descent = metrics.fontBoundingBoxDescent ?? Number.parseFloat(style.fontSize) * .2;
      let line = '', lineRect = null;
      const drawLine = () => {
        if (!lineRect || !line.trim()) return;
        const baseline = lineRect.top + (lineRect.height - ascent - descent) / 2 + ascent;
        ctx.fillText(line, lineRect.left, baseline);
      };
      // Range positions retain the browser's exact wrapping and nested marks.
      // Group characters into runs so normal font kerning remains intact.
      for (let index = 0; index < node.length; index++) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        if (!rect.height || rect.bottom < -60 || rect.top > height + 60) {
          drawLine(); line = ''; lineRect = null; continue;
        }
        if (lineRect && Math.abs(rect.top - lineRect.top) > 2) {
          drawLine(); line = ''; lineRect = null;
        }
        if (!lineRect) lineRect = rect;
        line += node.textContent[index];
      }
      drawLine();
    }
  }
}

function createCanvasFallback(canvas, source) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return {
    upload() {},
    render({width, height, density, time, amount, visibility, tint}) {
      ctx.setTransform(density, 0, 0, density, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = visibility;
      // A low-cost, smooth ink ripple for devices without a WebGL context.
      for (let y = 0; y < height; y += 3) {
        const x = (Math.sin(y * .045 + time * .7) * 9 + Math.sin(y * .19 - time * .5) * 3) * amount;
        ctx.drawImage(source, 0, y * density, source.width, Math.min(3 * density, source.height - y * density), x, y, width, 3);
      }
      ctx.globalCompositeOperation = 'source-atop';
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#e4c47f');
      gradient.addColorStop(.35, '#eae1d9');
      gradient.addColorStop(.65, '#bd86ea');
      gradient.addColorStop(1, '#739ade');
      ctx.globalAlpha = tint;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      return true;
    },
    dispose() {},
  };
}

export function createPsychedelicTextEffect() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 2400 : DURATION;
  const source = document.createElement('canvas');
  let canvas = document.createElement('canvas');
  let renderer = reduced ? null : createInkRenderer(canvas);
  if (!renderer) {
    // A canvas which acquired WebGL cannot subsequently acquire a 2D context.
    canvas = document.createElement('canvas');
    renderer = createCanvasFallback(canvas, source);
  }
  canvas.className = 'acknowledgement-psychedelic';
  canvas.dataset.effect = 'psychedelic-text-morph';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.inert = true;
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    zIndex: '100400', pointerEvents: 'none', contain: 'strict',
  });
  const targets = [...document.querySelectorAll('#ack-title, #ack-text p')].map(element => ({
    element,
    opacity: element.style.getPropertyValue('opacity'),
    priority: element.style.getPropertyPriority('opacity'),
    hadStyle: element.hasAttribute('style'),
    baseOpacity: Number(getComputedStyle(element).opacity),
  }));
  let ended = false, dirty = true, width = 0, height = 0, density = 1;
  let origin = {x: innerWidth * .5, y: innerHeight * .55};
  const invalidate = () => {dirty = true;};
  const restore = () => {
    for (const target of targets) {
      if (target.opacity) target.element.style.setProperty('opacity', target.opacity, target.priority);
      else target.element.style.removeProperty('opacity');
      if (!target.hadStyle && !target.element.style.length) {
        // Flush Blink's lazy CSSOM serialization before removing the attribute;
        // otherwise its next read can recreate an empty style="" attribute.
        target.element.getAttribute('style');
        target.element.removeAttribute('style');
      }
    }
  };
  const lost = event => {
    event.preventDefault();
    restore();
    canvas.style.opacity = '0';
    ended = true;
  };
  addEventListener('scroll', invalidate, {passive: true});
  addEventListener('resize', invalidate, {passive: true});
  window.visualViewport?.addEventListener('resize', invalidate, {passive: true});
  canvas.addEventListener('webglcontextlost', lost);
  document.fonts?.addEventListener('loadingdone', invalidate);
  document.body.append(canvas);
  let disposed = false;

  const effect = {
    nodes: [canvas], duration,
    onFrame(progress) {
      if (ended || !renderer) return;
      progress = clamp(progress);
      if (dirty) {
        width = innerWidth; height = innerHeight;
        // Cap fragment work and texture memory on dense/mobile displays.
        density = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(1800000 / (width * height)));
        canvas.width = Math.ceil(width * density);
        canvas.height = Math.ceil(height * density);
        const name = document.querySelector('.acknowledgement-rikke')?.getBoundingClientRect();
        origin = name && name.bottom > 0 && name.top < height
          ? {x: name.left + name.width / 2, y: name.top + name.height / 2}
          : {x: width * .46, y: height * .5};
        captureText(source, targets, width, height, density);
        renderer.upload(source);
        dirty = false;
      }
      const visibility = smooth(0, reduced ? .25 : .10, progress) * (1 - smooth(reduced ? .7 : .83, 1, progress));
      const amount = reduced ? 0 : smooth(.025, .22, progress) * (1 - smooth(.73, .98, progress));
      const painted = renderer.render({width, height, density, origin, time: progress * duration / 1000, amount, visibility, tint: reduced ? .65 : amount * .75});
      if (painted) {
        for (const target of targets) target.element.style.setProperty('opacity', String(target.baseOpacity * (1 - visibility)), 'important');
      } else restore();
    },
    onCleanup() {
      if (disposed) return;
      disposed = true; ended = true;
      restore();
      removeEventListener('scroll', invalidate);
      removeEventListener('resize', invalidate);
      window.visualViewport?.removeEventListener('resize', invalidate);
      canvas.removeEventListener('webglcontextlost', lost);
      document.fonts?.removeEventListener('loadingdone', invalidate);
      renderer?.dispose();
      source.width = 0; source.height = 0;
      canvas.width = 0; canvas.height = 0;
    },
  };
  effect.onFrame(0);
  return effect;
}
