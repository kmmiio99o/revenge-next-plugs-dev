import { FONT_FACE_CSS } from '../fonts'
import { GIF_ENCODER_SOURCE } from './gif'
import type { QuotePayload } from './layout'

/**
 * Builds the HTML document that the hidden renderer WebView loads.
 *
 * The document draws the card on a canvas and posts the finished image back
 * through `ReactNativeWebView.postMessage` as a data URL. Everything the
 * document needs — font faces, palette, GIF encoder — is embedded, so the
 * only network traffic is the avatar fetch.
 */
export function buildRendererHtml(payload: QuotePayload): string {
	const safePayload = JSON.stringify(payload).replace(
		/<\/script/gi,
		'<\\/script',
	)

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
${FONT_FACE_CSS}
html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
canvas { display: block; }
</style>
</head>
<body>
<canvas id="q"></canvas>
<script>
var payload = ${safePayload};
${GIF_ENCODER_SOURCE}

var settled = false;
function post(data) {
  if (settled && data && data.type !== 'progress') return;
  if (data && (data.type === 'result' || data.type === 'error')) settled = true;
  try { window.ReactNativeWebView.postMessage(JSON.stringify(data)); } catch (e) {}
}

setTimeout(function () {
  if (!settled) post({ type: 'error', renderId: payload.renderId, message: 'Render timed out.' });
}, 30000);

function hexA(hex, alpha) {
  var raw = String(hex || '#000').replace('#', '');
  if (raw.length === 3) raw = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
  var n = parseInt(raw, 16);
  if (isNaN(n)) return 'rgba(0, 0, 0, ' + alpha + ')';
  return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + alpha + ')';
}

function waitForFonts() {
  try {
    return Promise.race([
      Promise.all([
        document.fonts.load("400 44px 'QuoteRounded'"),
        document.fonts.load("700 44px 'QuoteRounded'"),
        document.fonts.ready,
      ]),
      new Promise(function (resolve) { setTimeout(resolve, 4000); }),
    ]).catch(function () {});
  } catch (e) {
    return Promise.resolve();
  }
}

function loadAvatar(url) {
  if (!url) return Promise.resolve(null);
  var request = fetch(url, { mode: 'cors', credentials: 'omit' })
    .then(function (res) {
      if (!res.ok) throw new Error('avatar http ' + res.status);
      return res.blob();
    })
    .then(function (blob) {
      var objectUrl = URL.createObjectURL(blob);
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(objectUrl); reject(new Error('avatar decode failed')); };
        img.src = objectUrl;
      });
    });
  var timeout = new Promise(function (_r, reject) {
    setTimeout(function () { reject(new Error('avatar timed out')); }, 10000);
  });
  return Promise.race([request, timeout]).catch(function () { return null; });
}

var CODE_STACK = "'DejaVu Sans Mono', 'Noto Sans Mono', 'Noto Color Emoji', monospace";

function fontFor(run, size, stack) {
  var style = run && run.italic ? 'italic ' : '';
  var weight = run && run.bold ? '700' : '400';
  var family = run && run.code ? CODE_STACK : stack;
  return style + weight + ' ' + size + 'px ' + family;
}

function tokenize(runs) {
  var tokens = [];
  for (var i = 0; i < (runs || []).length; i++) {
    var run = runs[i];
    var pieces = String(run.text == null ? '' : run.text).split(/(\\n| +)/);
    for (var j = 0; j < pieces.length; j++) {
      var piece = pieces[j];
      if (!piece) continue;
      if (piece === '\\n') tokens.push({ nl: true });
      else if (/^ +$/.test(piece)) tokens.push({ space: true });
      else tokens.push({ text: piece, run: run });
    }
  }
  return tokens;
}

function wrap(ctx, tokens, stack, size, maxWidth) {
  var lines = [];
  var line = [];
  var width = 0;
  var pendingSpace = false;

  function measure(text, run) {
    ctx.font = fontFor(run, size, stack);
    return ctx.measureText(text).width;
  }

  function flush() {
    while (line.length && line[line.length - 1].space) line.pop();
    if (line.length) lines.push({ items: line, width: width });
    line = [];
    width = 0;
    pendingSpace = false;
  }

  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.nl) { flush(); continue; }
    if (t.space) {
      if (!line.length) continue;
      pendingSpace = true;
      continue;
    }

    var tokenWidth = measure(t.text, t.run);
    var spaceWidth = pendingSpace ? measure(' ', t.run) : 0;
    if (line.length && width + spaceWidth + tokenWidth > maxWidth) {
      flush();
      spaceWidth = 0;
    }
    if (pendingSpace) {
      line.push({ space: true, w: spaceWidth });
      width += spaceWidth;
      pendingSpace = false;
    }
    line.push({ token: t, w: tokenWidth });
    width += tokenWidth;
  }
  flush();
  return lines;
}

function fit(ctx, tokens, stack, layout, fonts, spacing) {
  function measure(size) {
    var lines = wrap(ctx, tokens, stack, size, layout.textWidth);
    var lineHeight = size * fonts.lineHeightMultiplier;
    var authorSize = Math.max(fonts.authorMinimum, size * fonts.authorMultiplier);
    var usernameSize = Math.max(fonts.usernameMinimum, size * fonts.usernameMultiplier);
    var total =
      lines.length * lineHeight +
      spacing.authorTop +
      authorSize +
      spacing.username +
      usernameSize;
    return { lines: lines, size: size, lineHeight: lineHeight, authorSize: authorSize, usernameSize: usernameSize, total: total };
  }

  var size = fonts.initial;
  var best = null;
  while (size >= fonts.minimum) {
    best = measure(size);
    if (best.total <= layout.maxContentHeight) return best;
    size -= fonts.decrement;
  }
  return best || measure(fonts.minimum);
}

function drawLine(ctx, line, boxX, boxWidth, align, baseline, size, stack, colors) {
  var startX =
    align === 'center'
      ? boxX + (boxWidth - line.width) / 2
      : align === 'right'
        ? boxX + boxWidth - line.width
        : boxX;
  var x = startX;

  for (var i = 0; i < line.items.length; i++) {
    var item = line.items[i];
    if (item.space) { x += item.w; continue; }

    var t = item.token;
    var run = t.run;
    ctx.font = fontFor(run, size, stack);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    if (run.code) {
      ctx.fillStyle = hexA(colors.muted, 0.22);
      ctx.fillRect(x - 7, baseline - size * 0.95, item.w + 14, size * 1.34);
    }

    ctx.fillStyle = run.code ? colors.accent : colors.text;
    ctx.fillText(t.text, x, baseline);

    var stroke = Math.max(1.5, Math.round(size * 0.055));
    if (run.strike) {
      var m = ctx.measureText(t.text);
      var ascent = m.actualBoundingBoxAscent || size * 0.8;
      ctx.fillRect(x, baseline - ascent * 0.44, item.w, stroke);
    }
    if (run.underline) {
      ctx.fillRect(x, baseline + size * 0.16, item.w, stroke);
    }
    x += item.w;
  }
}

function supportsFilter(ctx) {
  try { return typeof ctx.filter === 'string'; } catch (e) { return false; }
}

function drawCover(ctx, img, x, y, w, h, grayscale) {
  var iw = img.naturalWidth || img.width || 1;
  var ih = img.naturalHeight || img.height || 1;
  var scale = Math.max(w / iw, h / ih);
  var dw = iw * scale;
  var dh = ih * scale;

  ctx.save();
  if (grayscale) {
    if (supportsFilter(ctx)) ctx.filter = 'grayscale(1)';
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
    if (grayscale && !supportsFilter(ctx)) {
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
    return;
  }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function drawInitials(ctx, x, y, w, h, name, colors, stack) {
  var gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, colors.accent);
  gradient.addColorStop(1, colors.muted);
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  var initial = (String(name || '?').trim().charAt(0) || '?').toUpperCase();
  ctx.fillStyle = hexA(colors.bg, 0.85);
  ctx.font = '700 ' + Math.max(24, Math.round(w * 0.34)) + 'px ' + stack;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, x + w / 2, y + h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawWatermark(ctx, colors, stack) {
  if (!payload.watermark) return;
  ctx.font = '400 ' + payload.fonts.watermark + 'px ' + stack;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = hexA(colors.accent, 0.72);
  var width = ctx.measureText(payload.watermark).width;
  ctx.fillText(
    payload.watermark,
    payload.layout.width - width - payload.spacing.watermarkPadding,
    payload.layout.height - payload.spacing.watermarkPadding,
  );
}

async function render() {
  var layout = payload.layout;
  var colors = payload.colors;
  var stack = payload.fontFamily;
  var spacing = payload.spacing;

  await waitForFonts();

  var canvas = document.getElementById('q');
  canvas.width = layout.width;
  canvas.height = layout.height;
  var ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable.');

  var avatar = await loadAvatar(payload.avatarUrl);
  var tokens = tokenize(payload.runs);
  var calc = fit(ctx, tokens, stack, layout, payload.fonts, spacing);
  var ascent = calc.size * 0.82;
  var textX = payload.flip ? layout.width - layout.textX - layout.textWidth : layout.textX;
  var align = 'center';

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (payload.modern) {
    var wash = ctx.createLinearGradient(0, 0, layout.width * 0.35, layout.height);
    wash.addColorStop(0, hexA(colors.accent, 0.2));
    wash.addColorStop(1, hexA(colors.bg, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, layout.width, layout.height);

    var radius = layout.avatarRadius;
    var cx = layout.avatarCenterX;
    var cy = layout.avatarCenterY;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) drawCover(ctx, avatar, cx - radius, cy - radius, radius * 2, radius * 2, payload.grayscale);
    else drawInitials(ctx, cx - radius, cy - radius, radius * 2, radius * 2, payload.displayName, colors, stack);
    ctx.restore();

    ctx.lineWidth = 5;
    ctx.strokeStyle = hexA(colors.text, 0.28);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    var startY = cy + radius + spacing.modernGap;
  } else {
    var size = layout.avatarSize;
    var avatarX = payload.flip ? layout.width - size : 0;

    if (avatar) drawCover(ctx, avatar, avatarX, 0, size, size, payload.grayscale);
    else drawInitials(ctx, avatarX, 0, size, size, payload.displayName, colors, stack);

    if (layout.gradientWidth > 0) {
      var scrim = payload.flip
        ? ctx.createLinearGradient(avatarX, 0, avatarX + layout.gradientWidth, 0)
        : ctx.createLinearGradient(avatarX + size - layout.gradientWidth, 0, avatarX + size, 0);
      scrim.addColorStop(0, payload.flip ? colors.bg : hexA(colors.bg, 0));
      scrim.addColorStop(1, payload.flip ? hexA(colors.bg, 0) : colors.bg);
      ctx.fillStyle = scrim;
      ctx.fillRect(avatarX, 0, layout.gradientWidth, size);
    }

    var startY = (layout.height - calc.total) / 2;
  }

  var baseline = startY + ascent;
  for (var i = 0; i < calc.lines.length; i++) {
    drawLine(ctx, calc.lines[i], textX, layout.textWidth, align, baseline, calc.size, stack, colors);
    baseline += calc.lineHeight;
  }

  // baseline now sits one line-height past the last quote line.
  var authorBaseline = baseline - calc.lineHeight + payload.spacing.authorTop + calc.authorSize * 0.6;
  var authorText = '- ' + payload.displayName;
  ctx.font = 'italic 400 ' + calc.authorSize + 'px ' + stack;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colors.text;
  ctx.fillText(authorText, textX + layout.textWidth / 2, authorBaseline);

  var usernameBaseline = authorBaseline + payload.spacing.username + calc.usernameSize;
  ctx.font = '400 ' + calc.usernameSize + 'px ' + stack;
  ctx.fillStyle = colors.muted;
  ctx.fillText(payload.username, textX + layout.textWidth / 2, usernameBaseline);
  ctx.textAlign = 'left';

  drawWatermark(ctx, colors, stack);

  var mime;
  var dataUrl;
  if (payload.gif) {
    var imageData = ctx.getImageData(0, 0, layout.width, layout.height);
    dataUrl = 'data:image/gif;base64,' + encodeGif(imageData.data, layout.width, layout.height);
    mime = 'image/gif';
  } else {
    dataUrl = canvas.toDataURL('image/png');
    mime = 'image/png';
  }

  post({ type: 'result', dataUrl: dataUrl, mime: mime, renderId: payload.renderId });
}

render().catch(function (error) {
  post({
    type: 'error',
    renderId: payload.renderId,
    message: String((error && error.message) || error),
  });
});
</script>
</body>
</html>`
}
