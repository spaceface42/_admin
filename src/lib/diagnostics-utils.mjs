export function diagnosticsStatusClass(key, value) {
  if (key === 'Unsaved fragments' && value !== '0') return 'warn';
  if (key === 'Validation warnings' && value !== '0') return 'warn';
  if (key === 'Config loaded' && value === 'not found') return 'warn';
  if (key === 'Manifest loaded' && value === 'no') return 'warn';
  if (key === 'Cache status' && /stale|differs|failed|warning/i.test(String(value))) return 'warn';
  if (key === 'Cache status' && /ok|aligned|none/i.test(String(value))) return 'ok';

  if (
    ['Repository', 'Default branch', 'Content branch', 'Media folder', 'Media URL prefix', 'Cache status'].includes(
      key
    ) &&
    value &&
    !/not|unknown/.test(String(value))
  ) {
    return 'ok';
  }

  return '';
}

export function diagnosticsRows(data) {
  return Object.entries(data || {}).map(([key, value]) => diagnosticsRowMeta(key, value));
}

export function diagnosticsText(data, warnings = []) {
  const base = Object.entries(data || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  if (!warnings.length) return base;

  return (
    base +
    '\n\nValidation warnings:\n' +
    warnings.map(warning => `- ${warning.kind}: ${warning.msg}`).join('\n')
  );
}

export function diagnosticsWorkflowNote({ workBranch, defaultBranch, mediaDir, mediaPrefix }) {
  return {
    workBranch: workBranch || 'content',
    defaultBranch: defaultBranch || 'main',
    mediaDir: mediaDir || 'not set',
    mediaPrefix: mediaPrefix || 'not set'
  };
}

export function diagnosticsTextSections(sections = [], warnings = []) {
  const body = sections
    .map(section => {
      const rows = Object.entries(section.data || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      return `${section.title}\n${'-'.repeat(section.title.length)}\n${rows}`;
    })
    .join('\n\n');

  if (!warnings.length) return body;

  return (
    body +
    '\n\nValidation warnings:\n' +
    warnings.map(warning => `- ${warning.kind}: ${warning.msg}`).join('\n')
  );
}

export function diagnosticsBadgeText(statusClass) {
  if (statusClass === 'ok') return 'OK';
  if (statusClass === 'warn') return 'CHECK';
  return '';
}

export function diagnosticsRowMeta(key, value) {
  const stringValue = String(value);
  const statusClass = diagnosticsStatusClass(key, stringValue);
  return {
    key,
    value: stringValue,
    statusClass,
    badge: diagnosticsBadgeText(statusClass),
    isSha: /\bSHA\b/i.test(key) && /^[a-f0-9]{40}$/i.test(stringValue)
  };
}
