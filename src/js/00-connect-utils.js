/* ---------- connect utility helpers ---------- */
const ConnectUtils = (() => {
  function cleanRepoPart(value) {
    return String(value || '')
      .replace(/\.git$/i, '')
      .replace(/[?#].*$/, '')
      .trim();
  }

  function parseRepoUrl(input) {
    const raw = String(input || '')
      .trim()
      .replace(/\.git$/, '');
    if (!raw) return null;

    const githubMatch = raw.match(/github\.com[/:]([^/\s]+)\/([^/\s?#]+)/i);
    const shortMatch = raw.match(/^([^/\s]+)\/([^/\s?#]+)$/);

    const match = githubMatch || shortMatch;
    if (!match) return null;

    const owner = cleanRepoPart(match[1]);
    const repo = cleanRepoPart(match[2]);

    if (!owner || !repo) return null;
    return { owner, repo };
  }

  function branchLabel(name) {
    return String(name || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function configStatePatch(config) {
    const patch = {};

    if (config && typeof config.workBranch === 'string' && config.workBranch.trim()) {
      patch.workBranch = config.workBranch.trim();
    }

    if (config && typeof config.manifestPath === 'string' && config.manifestPath.trim()) {
      patch.manifestPath = config.manifestPath.trim();
    }

    return patch;
  }

  function connectValidation({ repoUrl, token }) {
    if (!parseRepoUrl(repoUrl)) {
      return 'Could not parse a github.com owner/repo from that URL.';
    }

    if (!String(token || '').trim()) {
      return 'A token is required.';
    }

    return '';
  }

  function repoSlug({ owner, repo }) {
    return owner && repo ? `${owner}/${repo}` : '';
  }

  return Object.freeze({
    cleanRepoPart,
    parseRepoUrl,
    branchLabel,
    configStatePatch,
    connectValidation,
    repoSlug
  });
})();
