/* ---------- config utility helpers ---------- */
const ConfigUtils = (() => {
  function parsePreviewCssInput(value) {
    if (Array.isArray(value)) {
      return value.map(item => String(item).trim()).filter(Boolean);
    }

    return String(value || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  function configMediaObject(config) {
    const media = config && config.media;
    return media && typeof media === 'object' && !Array.isArray(media) ? media : {};
  }

  function configPreviewObject(config) {
    const preview = config && config.preview;
    return preview && typeof preview === 'object' && !Array.isArray(preview) ? preview : {};
  }

  function shouldPersistWorkBranch(config, workBranch, defaultWorkBranch = 'content') {
    return !!(
      config &&
      Object.prototype.hasOwnProperty.call(config, 'workBranch')
    ) || workBranch !== defaultWorkBranch;
  }

  function buildNextGitCMSConfig(existingConfig, settings) {
    const existing =
      existingConfig && typeof existingConfig === 'object' && !Array.isArray(existingConfig)
        ? existingConfig
        : {};

    const next = {
      ...existing,
      manifestPath: settings.manifestPath,
      media: {
        ...configMediaObject(existing),
        dir: settings.mediaDir,
        publicPrefix: settings.mediaPrefix
      },
      preview: {
        ...configPreviewObject(existing),
        css: parsePreviewCssInput(settings.previewCss)
      }
    };

    if (shouldPersistWorkBranch(existing, settings.workBranch, settings.defaultWorkBranch)) {
      next.workBranch = settings.workBranch;
    } else if (!Object.prototype.hasOwnProperty.call(existing, 'workBranch')) {
      delete next.workBranch;
    }

    return next;
  }

  function settingsChanged(current, next) {
    return JSON.stringify(current || {}) !== JSON.stringify(next || {});
  }

  return Object.freeze({
    parsePreviewCssInput,
    configMediaObject,
    configPreviewObject,
    shouldPersistWorkBranch,
    buildNextGitCMSConfig,
    settingsChanged
  });
})();
