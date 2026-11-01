// Shareable gratitude cards: draws a gratitude onto a 1080×1350 image
// (good for Instagram, WhatsApp and Facebook) with the Gladmoment / Gemrhythm credit.
import { BRAND } from './config.js';

export const CARD_STYLES = [
  { id: 'dusk', label: 'Dusk', bg: ['#4b2aae', '#8a3ac0', '#d0566f', '#f2a35e'], ink: '#ffffff', soft: 'rgba(255,255,255,0.82)', blobs: ['#ffb38a', '#ffd66b', '#3fd1c4'] },
  { id: 'dawn', label: 'Dawn', bg: ['#fff1e6', '#ffd9c4', '#f6c7d9', '#e6dcff'], ink: '#2c1b4f', soft: 'rgba(44,27,79,0.72)', blobs: ['#ffffff', '#ffe08a', '#b79cff'] },
  { id: 'sea', label: 'Sea', bg: ['#0d4f5c', '#167a7f', '#2aa39a', '#9fd8c8'], ink: '#ffffff', soft: 'rgba(255,255,255,0.85)', blobs: ['#ffe08a', '#b6f0e4', '#5fb3ff'] },
];

export const CARD_SIZE = { width: 1080, height: 1350 };

/** Split text into lines that fit `maxWidth` using the context's current font. */
export function wrapLines(measure, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (measure(test) <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(ctx, text, maxWidth, maxHeight) {
  for (let size = 76; size >= 34; size -= 4) {
    ctx.font = `500 ${size}px Georgia, 'Iowan Old Style', 'Times New Roman', serif`;
    const lines = wrapLines((s) => ctx.measureText(s).width, text, maxWidth);
    const lineHeight = size * 1.32;
    if (lines.length * lineHeight <= maxHeight) return { size, lines, lineHeight };
  }
  const size = 34;
  ctx.font = `500 ${size}px Georgia, serif`;
  let lines = wrapLines((s) => ctx.measureText(s).width, text, maxWidth);
  const maxLines = Math.floor(maxHeight / (size * 1.32));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s,.;:]+\S*$/, '')}…`;
  }
  return { size, lines, lineHeight: size * 1.32 };
}

/**
 * Draw a gratitude card.
 * @param {HTMLCanvasElement} canvas
 * @param {{ text: string, date?: Date, styleId?: string, heading?: string }} opts
 */
export function drawCard(canvas, { text, date = new Date(), styleId = 'dusk', heading = 'Today I’m grateful for' }) {
  const { width: W, height: H } = CARD_SIZE;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const s = CARD_STYLES.find((x) => x.id === styleId) || CARD_STYLES[0];

  const grad = ctx.createLinearGradient(0, 0, W, H);
  s.bg.forEach((c, i) => grad.addColorStop(i / (s.bg.length - 1), c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Soft glowing blobs
  [[W * 0.92, H * 0.06, 360, s.blobs[0]], [W * 0.15, H * 0.98, 380, s.blobs[2]], [W * 0.85, H * 0.88, 260, s.blobs[1]]].forEach(([x, y, r, c]) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${c}88`);
    g.addColorStop(1, `${c}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });

  // Inner frame
  ctx.strokeStyle = s.soft;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(60, 60, W - 120, H - 120, 48) : ctx.rect(60, 60, W - 120, H - 120);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const pad = 130;
  // Flower mark + heading
  ctx.fillStyle = s.ink;
  ctx.font = "64px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('💛', pad, 250);
  ctx.font = "700 40px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = s.soft;
  ctx.fillText(heading.toUpperCase().split('').join(String.fromCharCode(8202)), pad, 340);

  // Big quote mark
  ctx.fillStyle = s.ink;
  ctx.globalAlpha = 0.25;
  ctx.font = '700 260px Georgia, serif';
  ctx.fillText('“', pad - 20, 560);
  ctx.globalAlpha = 1;

  // The gratitude itself
  const clean = String(text).trim().replace(/^i'?m grateful for\s*/i, '').replace(/^./, (c) => c.toUpperCase());
  const body = clean || String(text).trim();
  const area = { x: pad, y: 430, w: W - pad * 2, h: H - 430 - 330 };
  const fit = fitText(ctx, body, area.w, area.h);
  ctx.fillStyle = s.ink;
  ctx.font = `500 ${fit.size}px Georgia, 'Iowan Old Style', 'Times New Roman', serif`;
  const blockH = fit.lines.length * fit.lineHeight;
  let y = area.y + Math.max(0, (area.h - blockH) / 2) + fit.size;
  for (const line of fit.lines) {
    ctx.fillText(line, area.x, y);
    y += fit.lineHeight;
  }

  // Date
  ctx.font = "600 34px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = s.soft;
  ctx.fillText(new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), pad, H - 250);

  // Footer credit
  ctx.fillStyle = s.ink;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(pad, H - 205, W - pad * 2, 2);
  ctx.globalAlpha = 1;
  ctx.font = "800 40px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(BRAND.appName, pad, H - 140);
  ctx.font = "500 32px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = s.soft;
  const url = BRAND.appUrl;
  ctx.fillText(url, W - pad - ctx.measureText(url).width, H - 140);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** Share via the phone's share sheet when possible; otherwise download the image. */
export async function shareCard(canvas, { text } = {}) {
  const blob = await canvasToBlob(canvas);
  if (!blob) return 'failed';
  const file = new File([blob], 'gladmoment-gratitude.png', { type: 'image/png' });
  const shareText = `${text ? `${text}\n\n` : ''}Made with ${BRAND.appName}, a free gratitude app: https://${BRAND.appUrl}/`;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: shareText, title: BRAND.appName });
      return 'shared';
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gladmoment-gratitude.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
