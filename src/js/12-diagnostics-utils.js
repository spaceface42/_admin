/* ---------- diagnostics utility helpers ---------- */
const DiagnosticsUtils = (() => {
  function diagnosticsStatusClass(key, value) {
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

  function diagnosticsRows(data) {
    return Object.entries(data || {}).map(([key, value]) => ({
      key,
      value: String(value),
      statusClass: diagnosticsStatusClass(key, String(value))
    }));
  }

  function diagnosticsText(data, warnings = []) {
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


  function diagnosticsTextSections(sections = [], warnings = []) {
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

  function diagnosticsWorkflowNote({ workBranch, defaultBranch, mediaDir, mediaPrefix }) {
    return {
      workBranch: workBranch || 'content',
      defaultBranch: defaultBranch || 'main',
      mediaDir: mediaDir || 'not set',
      mediaPrefix: mediaPrefix || 'not set'
    };
  }

  return Object.freeze({
    diagnosticsStatusClass,
    diagnosticsRows,
    diagnosticsText,
    diagnosticsTextSections,
    diagnosticsWorkflowNote
  });
})();
