export function diagnosticsStatusClass(key, value) {
  if (key === 'Unsaved fragments' && value !== '0') return 'warn';
  if (key === 'Validation warnings' && value !== '0') return 'warn';
  if (key === 'Config loaded' && value === 'not found') return 'warn';
  if (key === 'Manifest loaded' && value === 'no') return 'warn';

  if (
    ['Repository', 'Default branch', 'Content branch', 'Media folder', 'Media URL prefix'].includes(
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
  return Object.entries(data || {}).map(([key, value]) => ({
    key,
    value: String(value),
    statusClass: diagnosticsStatusClass(key, String(value))
  }));
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
