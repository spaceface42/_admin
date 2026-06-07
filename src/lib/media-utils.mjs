export const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

export function isImageFilename(name) {
  return IMAGE_EXT_RE.test(String(name || ''));
}

export function sanitizeFilename(name) {
  const parts = String(name || '').split('.');
  const ext =
    parts.length > 1
      ? '.' +
        parts
          .pop()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
      : '';
  const base =
    parts
      .join('.')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'image';
  return base + ext;
}

export function altFromFilename(name) {
  return String(name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitFilename(name) {
  const raw = String(name || '');
  const dot = raw.lastIndexOf('.');
  return dot > 0 ? { base: raw.slice(0, dot), ext: raw.slice(dot) } : { base: raw, ext: '' };
}

export function uniqueNameCandidate(name, index) {
  const { base, ext } = splitFilename(name);
  return `${base}-${index}${ext}`;
}

export function mediaUsageList({ fragments, mediaUrl, filename }) {
  const needles = [mediaUrl, filename].filter(Boolean);
  const hits = [];

  for (const fragment of fragments || []) {
    const html = fragment?.innerHTML || '';
    if (needles.some((needle) => needle && html.includes(needle))) {
      hits.push(`${fragment.label || fragment.id} (${fragment.path})`);
    }
  }

  return hits;
}

export function stampedUploadName({ stamp, index, total, originalName }) {
  const prefix = total > 1 ? `${stamp}-${index + 1}-` : `${stamp}-`;
  return prefix + sanitizeFilename(originalName);
}
