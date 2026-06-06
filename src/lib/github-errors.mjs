export function isNetworkFetchError(error) {
  const message = String(error?.message || error || '');
  return !error?.status && /failed to fetch|networkerror|load failed|network/i.test(message);
}

export function statusLabel(status) {
  if (!status) return 'Network';
  return String(status);
}

export function githubErrorMessage(error, { action = 'GitHub request', conflict = '' } = {}) {
  const status = error?.status;
  const detail = String(error?.message || '').trim();

  if (isNetworkFetchError(error)) {
    return `${action} failed before GitHub returned a response. Check internet access, browser/CORS blocking, or whether the token request was blocked.`;
  }

  if (status === 401) {
    return `${action} failed: bad or expired token.`;
  }

  if (status === 403) {
    return `${action} failed: forbidden. The token probably lacks the required repository permission.`;
  }

  if (status === 404) {
    return `${action} failed: repository, branch, path, or file was not found.`;
  }

  if (status === 409) {
    return conflict || `${action} failed: Git conflict. Refresh, check the branch, and try again.`;
  }

  if (status === 422) {
    return `${action} failed: GitHub rejected the request. The branch, path, or payload may be invalid.`;
  }

  if (status === 429) {
    return `${action} failed: rate limited. Wait a moment and try again.`;
  }

  if (status >= 500) {
    return `${action} failed: GitHub server error (${status}). Try again shortly.`;
  }

  if (status) {
    return `${action} failed (${status})${detail ? `: ${detail}` : '.'}`;
  }

  return `${action} failed${detail ? `: ${detail}` : '.'}`;
}

export function githubErrorKind(error) {
  if (isNetworkFetchError(error)) return 'network';
  if (error?.status === 401) return 'auth';
  if (error?.status === 403) return 'permission';
  if (error?.status === 404) return 'not-found';
  if (error?.status === 409) return 'conflict';
  if (error?.status === 422) return 'invalid-request';
  if (error?.status === 429) return 'rate-limit';
  if (error?.status >= 500) return 'github-server';
  return 'unknown';
}
