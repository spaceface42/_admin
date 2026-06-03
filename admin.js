let repoOwner = "";
let repoName = "";
let metaPath = "data/meta.json";
let navigationPath = "data/navigation.json";
let pagesDir = "data/pages";
let assetsDir = "data/assets";
const configPath = "admin.config.json";
let maxImageSize = 2 * 1024 * 1024;
let allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const storageKey = "github-json-page-db-v2";
const tokenKey = "github-json-page-db-token";
const repoUrlKey = "github-json-page-db-repo-url";
const rememberTokenKey = "github-json-page-db-remember-token";
let repoApiBase = "";

const form = document.querySelector("#pageForm");
const formTitle = document.querySelector("#formTitle");
const pageType = document.querySelector("#pageType");
const template = document.querySelector("#template");
const published = document.querySelector("#published");
const pageId = document.querySelector("#pageId");
const slug = document.querySelector("#slug");
const title = document.querySelector("#title");
const subtitle = document.querySelector("#subtitle");
const body = document.querySelector("#body");
const coverPreview = document.querySelector("#coverPreview");
const coverFile = document.querySelector("#coverFile");
const coverSrc = document.querySelector("#coverSrc");
const coverAlt = document.querySelector("#coverAlt");
const coverCaption = document.querySelector("#coverCaption");
const imageFields = document.querySelector("#imageFields");
const pageList = document.querySelector("#pageList");
const countBadge = document.querySelector("#countBadge");
const exportButton = document.querySelector("#exportButton");
const importFile = document.querySelector("#importFile");
const resetButton = document.querySelector("#resetButton");
const addImageButton = document.querySelector("#addImageButton");
const connectButton = document.querySelector("#connectButton");
const loadGithubButton = document.querySelector("#loadGithubButton");
const saveGithubButton = document.querySelector("#saveGithubButton");
const githubToken = document.querySelector("#githubToken");
const rememberToken = document.querySelector("#rememberToken");
const repoUrl = document.querySelector("#repoUrl");
const forgetTokenButton = document.querySelector("#forgetTokenButton");
const statusText = document.querySelector("#statusText");
const repoSummary = document.querySelector("#repoSummary");
const configSummary = document.querySelector("#configSummary");
const dataSummary = document.querySelector("#dataSummary");
const publicSiteSummary = document.querySelector("#publicSiteSummary");
const buildSummary = document.querySelector("#buildSummary");
const previewButton = document.querySelector("#previewButton");
const previewPanel = document.querySelector("#previewPanel");
const previewContent = document.querySelector("#previewContent");
const closePreviewButton = document.querySelector("#closePreviewButton");
const navigationItems = document.querySelector("#navigationItems");
const addMenuItemButton = document.querySelector("#addMenuItemButton");

const requiredElements = {
  form,
  pageType,
  template,
  navigationItems,
  addMenuItemButton,
  statusText
};
const missingElements = Object.entries(requiredElements)
  .filter(([, element]) => !element)
  .map(([name]) => name);

if (missingElements.length) {
  throw new Error(`Admin HTML is missing required elements: ${missingElements.join(", ")}`);
}

let db = loadLocalDb();
let editingId = null;
let metaSha = null;
let navigationSha = null;
let pageShas = {};
let deletedPageFiles = [];
let branch = "main";
let siteConfig = {};
let previewUrl = "";
let actionsUrl = "";
let lastLoadedHeadSha = null;
let lastSavedHeadSha = null;

rememberToken.checked = localStorage.getItem(rememberTokenKey) !== "false";
githubToken.value = rememberToken.checked ? localStorage.getItem(tokenKey) || "" : "";
repoUrl.value = localStorage.getItem(repoUrlKey) || "";

function emptyDb() {
  return { meta: { version: 1, pages: [] }, navigation: { main: [] }, pages: {} };
}

function pageFilePath(id) {
  return `${pagesDir}/${id}.json`;
}

function parseRepoUrl(value) {
  const input = value.trim().replace(/\.git$/, "");
  const match = input.match(/github\.com\/([^\/]+)\/([^\/#?]+)/) || input.match(/^([^\/]+)\/([^\/]+)$/);

  if (!match) {
    throw new Error("Enter a GitHub repository URL like https://github.com/owner/repo.");
  }

  return { owner: match[1], name: match[2] };
}

function applyConfig(config) {
  siteConfig = config || {};
  metaPath = validateRepoPath(config.paths?.meta || "data/meta.json", "meta path");
  navigationPath = validateRepoPath(config.paths?.navigation || "data/navigation.json", "navigation path");
  pagesDir = validateRepoPath(config.paths?.pages || "data/pages", "pages path");
  assetsDir = validateRepoPath(config.paths?.assets || "data/assets", "assets path");
  maxImageSize = Number(config.uploads?.maxImageSize) || maxImageSize;
  allowedImageTypes = Array.isArray(config.uploads?.allowedImageTypes)
    ? config.uploads.allowedImageTypes.map(String)
    : allowedImageTypes;
  previewUrl = String(config.site?.previewUrl || config.site?.url || "").trim();
  actionsUrl = `https://github.com/${repoOwner}/${repoName}/actions`;
  renderContentTypes(config.contentTypes || []);
  configSummary.textContent = `${config.name || "Configured site"} (${configPath})`;
  dataSummary.textContent = `${metaPath}, ${navigationPath}, ${pagesDir}, ${assetsDir}`;
  renderSummaryLink(publicSiteSummary, previewUrl, previewUrl || "Not configured");
  renderSummaryLink(buildSummary, actionsUrl, "Actions");
}

function renderContentTypes(contentTypes) {
  const current = pageType.value;
  pageType.innerHTML = "";

  const types = contentTypes.length
    ? contentTypes
    : [
        { type: "page", label: "Page" },
        { type: "gallery", label: "Gallery" }
      ];

  types.forEach((item) => {
    const option = document.createElement("option");
    option.value = String(item.type || "page");
    option.textContent = String(item.label || item.type || "Page");
    pageType.append(option);
  });

  if ([...pageType.options].some((option) => option.value === current)) {
    pageType.value = current;
  }
}

function currentTypeConfig() {
  return (siteConfig.contentTypes || []).find((item) => item.type === pageType.value) || {};
}

function configuredFieldsForCurrentType() {
  return (currentTypeConfig().fields || []).map((field) =>
    typeof field === "string" ? { name: field } : field
  );
}

function validateRequiredConfiguredFields() {
  const fields = configuredFieldsForCurrentType().filter((field) => field.required);
  const values = {
    title: title.value.trim(),
    subtitle: subtitle.value.trim(),
    body: body.value.trim(),
    coverImage: coverSrc.value.trim() || coverFile.files[0],
    images: imageFields.children.length
  };

  for (const field of fields) {
    if (!values[field.name]) {
      alert(`${field.label || field.name} is required.`);
      return false;
    }
  }

  return true;
}

function renderSummaryLink(container, href, label) {
  container.textContent = "";

  if (!href) {
    container.textContent = label;
    return;
  }

  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  container.append(link);
}

function validateRepoPath(value, label = "path") {
  const path = String(value || "").trim().replace(/^\/+/, "");

  if (!path) {
    throw new Error(`Invalid ${label}: path is empty.`);
  }

  if (/^(https?:|data:|blob:)/i.test(path)) {
    throw new Error(`Invalid ${label}: repository paths cannot be URLs.`);
  }

  if (path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid ${label}: ${path}`);
  }

  return path;
}

function validatePathInDir(value, dir, label = "path") {
  const path = validateRepoPath(value, label);
  const base = validateRepoPath(dir, `${label} base`);

  if (path !== base && !path.startsWith(`${base}/`)) {
    throw new Error(`Invalid ${label}: ${path} must be inside ${base}/.`);
  }

  return path;
}

async function connectRepository() {
  try {
    setBusy(true);
    const repo = parseRepoUrl(repoUrl.value);
    repoOwner = repo.owner;
    repoName = repo.name;
    repoApiBase = `https://api.github.com/repos/${repoOwner}/${repoName}`;
    localStorage.setItem(repoUrlKey, repoUrl.value.trim());
    repoSummary.textContent = `${repoOwner}/${repoName}`;
    setStatus("Checking repository...");
    await loadRepoInfo();
    lastLoadedHeadSha = await getHeadSha();
    setStatus(`Loading ${configPath}...`);
    const payload = await loadGithubFile(configPath);
    const config = JSON.parse(decodeBase64(payload.content));
    applyConfig(config);
    db = loadLocalDb();
    resetForm();
    renderPages();
    renderNavigation();
    setBuildStatus("No build checked yet");
    setStatus(`Connected to ${repoOwner}/${repoName}.`);
  } catch (error) {
    setStatus(`Connect failed: ${explainGithubError(error)}`);
  } finally {
    setBusy(false);
  }
}

function assetFilePath(pageIdValue, file, fallbackName) {
  const extension = extensionForFile(file);
  return `${assetsDir}/${pageIdValue}/${fallbackName}${extension}`;
}

function currentStorageKey() {
  return repoOwner && repoName ? `${storageKey}:${repoOwner}/${repoName}` : storageKey;
}

function loadLocalDb() {
  const saved = localStorage.getItem(currentStorageKey());

  if (!saved) {
    return emptyDb();
  }

  try {
    return normalizeDb(JSON.parse(saved));
  } catch {
    return emptyDb();
  }
}

function normalizeDb(value) {
  const next = emptyDb();

  if (!value) {
    return next;
  }

  if (Array.isArray(value.pages)) {
    value.pages.forEach((page) => {
      const normalized = normalizePage(page);
      next.pages[normalized.id] = normalized;
    });
  } else if (value.pages && typeof value.pages === "object") {
    Object.values(value.pages).forEach((page) => {
      const normalized = normalizePage(page);
      next.pages[normalized.id] = normalized;
    });
  }

  if (value.meta && Array.isArray(value.meta.pages)) {
    next.meta = normalizeMeta(value.meta, next.pages);
  } else {
    next.meta = buildMetaFromPages(next.pages);
  }

  next.navigation = normalizeNavigation(value.navigation);

  return next;
}

function normalizeNavigation(value) {
  const source = value && typeof value === "object" ? value : {};
  const main = Array.isArray(source.main) ? source.main : [];

  return {
    main: main
      .map((item) => ({
        label: String(item?.label || ""),
        page: String(item?.page || ""),
        href: String(item?.href || "")
      }))
      .filter((item) => item.label || item.page || item.href)
  };
}

function normalizeMeta(meta, pages) {
  return {
    version: Number(meta.version) || 1,
    pages: meta.pages
      .map((item, index) => normalizeMetaItem(item, pages[item.id], index))
      .filter((item) => item.id)
  };
}

function normalizeMetaItem(item, page, index) {
  const id = String(item.id || page?.id || "");

  if (!id) {
    return { id: "" };
  }

  return {
    id,
    slug: String(page?.slug || item.slug || id),
    type: String(page?.type || item.type || "page"),
    title: String(page?.title || item.title || id),
    subtitle: String(page?.subtitle ?? item.subtitle ?? ""),
    published: Boolean(page?.published ?? item.published ?? true),
    order: Number(item.order ?? index + 1),
    file: String(item.file || pageFilePath(id)),
    updatedAt: String(page?.updatedAt || item.updatedAt || new Date().toISOString())
  };
}

function normalizePage(page) {
  const id = String(page?.id || "page-1");

  return {
    id,
    slug: String(page?.slug || id),
    type: String(page?.type || "page"),
    template: String(page?.template || ""),
    title: String(page?.title || id),
    subtitle: String(page?.subtitle || ""),
    body: String(page?.body || ""),
    coverImage: normalizeImage(page?.coverImage),
    images: Array.isArray(page?.images) ? page.images.map(normalizeImage).filter(Boolean) : [],
    published: Boolean(page?.published ?? true),
    createdAt: String(page?.createdAt || new Date().toISOString()),
    updatedAt: String(page?.updatedAt || new Date().toISOString())
  };
}

function normalizeImage(image) {
  if (!image || !image.src) {
    return null;
  }

  return {
    id: String(image.id || crypto.randomUUID()),
    src: String(image.src || ""),
    alt: String(image.alt || ""),
    caption: String(image.caption || ""),
    pendingFile: image.pendingFile || null
  };
}

function buildMetaFromPages(pages) {
  return {
    version: 1,
    pages: Object.values(pages).map((page, index) => normalizeMetaItem({}, page, index))
  };
}

function validateDbPaths() {
  validateRepoPath(metaPath, "meta path");
  validateRepoPath(navigationPath, "navigation path");

  for (const item of db.meta.pages) {
    item.file = validatePathInDir(item.file || pageFilePath(item.id), pagesDir, `page file for ${item.id}`);

    const page = db.pages[item.id];

    if (!page) {
      continue;
    }

    if (page.coverImage?.pendingFile) {
      page.coverImage.src = validatePathInDir(page.coverImage.src, assetsDir, `cover image for ${page.id}`);
    }

    for (const image of page.images) {
      if (image.pendingFile) {
        image.src = validatePathInDir(image.src, assetsDir, `image for ${page.id}`);
      }
    }
  }

  for (const path of deletedPageFiles) {
    validatePathInDir(path, pagesDir, "deleted page file");
  }
}

function saveLocalDb() {
  localStorage.setItem(currentStorageKey(), JSON.stringify(stripPendingFiles(db), null, 2));
}

function stripPendingFiles(value) {
  return JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (key === "pendingFile") {
        return undefined;
      }

      return item;
    })
  );
}

function setStatus(message) {
  statusText.textContent = message;
}

function setBuildStatus(message, url = actionsUrl) {
  if (url) {
    renderSummaryLink(buildSummary, url, message);
  } else {
    buildSummary.textContent = message;
  }
}

function explainGithubError(error) {
  if (error.status === 401) {
    return "Bad or expired token. Create a new fine-grained token and paste it here.";
  }

  if (error.status === 403) {
    return "Token is valid, but it does not have permission. Give it Contents: Read and write.";
  }

  if (error.status === 404) {
    return `GitHub cannot find ${repoOwner}/${repoName}, or this token cannot access it.`;
  }

  return error.message;
}

function isMissingFileError(error) {
  return error.status === 404 && error.payload?.message === "Not Found";
}

function ensureConnected() {
  if (!repoApiBase) {
    throw new Error("Connect to a repository first.");
  }
}

function getToken() {
  const token = githubToken.value.trim();

  if (rememberToken.checked && token) {
    localStorage.setItem(tokenKey, token);
  } else if (!rememberToken.checked) {
    localStorage.removeItem(tokenKey);
  }

  return token;
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function stripDataUrl(value) {
  return value.split(",")[1] || "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function validateImageFile(file) {
  if (!allowedImageTypes.includes(file.type)) {
    throw new Error(`${file.name} is not a supported image type.`);
  }

  if (file.size > maxImageSize) {
    throw new Error(`${file.name} is too large. Maximum size is ${formatBytes(maxImageSize)}.`);
  }
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function extensionForFile(file) {
  const extensions = {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
  };

  return extensions[file.type] || `.${file.name.split(".").pop().toLowerCase()}`;
}

async function githubRequest(url, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error("Add a GitHub token first.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(payload?.message || `GitHub returned ${response.status}.`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function loadRepoInfo() {
  const payload = await githubRequest(repoApiBase);
  branch = payload.default_branch || branch;
}

async function getHeadSha() {
  const ref = await getBranchRef();
  return ref.object.sha;
}

async function confirmRemoteIsFresh() {
  if (!lastLoadedHeadSha) {
    return true;
  }

  const remoteHeadSha = await getHeadSha();

  if (remoteHeadSha === lastLoadedHeadSha || remoteHeadSha === lastSavedHeadSha) {
    return true;
  }

  return confirm(
    `The repository changed since you last loaded it.\n\nLoaded: ${lastLoadedHeadSha.slice(0, 7)}\nRemote: ${remoteHeadSha.slice(0, 7)}\n\nSave anyway and build on top of the newest remote commit?`
  );
}

async function loadGithubFile(path) {
  return githubRequest(`${repoApiBase}/contents/${path}?ref=${encodeURIComponent(branch)}`);
}

async function saveGithubFile(path, value, sha, message) {
    const body = {
      branch,
      content: encodeBase64(`${JSON.stringify(stripPendingFiles(value), null, 2)}\n`),
      message
    };

  if (sha) {
    body.sha = sha;
  }

  return githubRequest(`${repoApiBase}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

async function saveGithubAsset(path, file, sha, message) {
  validateImageFile(file);

  const dataUrl = await fileToDataUrl(file);
  const body = {
    branch,
    content: stripDataUrl(dataUrl),
    message
  };

  if (sha) {
    body.sha = sha;
  }

  return githubRequest(`${repoApiBase}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

async function githubJsonRequest(path, options = {}) {
  return githubRequest(`${repoApiBase}${path}`, options);
}

async function getBranchRef() {
  return githubJsonRequest(`/git/ref/heads/${branch}`);
}

async function getGitCommit(sha) {
  return githubJsonRequest(`/git/commits/${sha}`);
}

async function createBlob(content, encoding = "utf-8") {
  return githubJsonRequest("/git/blobs", {
    method: "POST",
    body: JSON.stringify({ content, encoding })
  });
}

async function createTree(baseTreeSha, tree) {
  return githubJsonRequest("/git/trees", {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree
    })
  });
}

async function createCommit(message, treeSha, parentSha) {
  return githubJsonRequest("/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha]
    })
  });
}

async function updateBranchRef(commitSha) {
  return githubJsonRequest(`/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({
      sha: commitSha,
      force: false
    })
  });
}

async function fileToBase64(file) {
  const dataUrl = await fileToDataUrl(file);
  return stripDataUrl(dataUrl);
}

function jsonFileContent(value) {
  return `${JSON.stringify(stripPendingFiles(value), null, 2)}\n`;
}

function collectPendingFiles() {
  const files = [];

  for (const item of db.meta.pages) {
    const page = db.pages[item.id];

    if (!page) {
      continue;
    }

    if (page.coverImage?.pendingFile) {
      files.push({
        image: page.coverImage,
        file: page.coverImage.pendingFile,
        path: page.coverImage.src,
        label: `cover image for ${page.id}`
      });
    }

    for (const image of page.images) {
      if (image.pendingFile) {
        files.push({
          image,
          file: image.pendingFile,
          path: image.src,
          label: `image for ${page.id}`
        });
      }
    }
  }

  return files;
}

function clearPendingFiles(pendingFiles) {
  pendingFiles.forEach((item) => {
    delete item.image.pendingFile;
  });
}

async function commitDatabaseChanges() {
  validateDbPaths();

  const pendingFiles = collectPendingFiles();
  const treeEntries = [];

  setStatus("Preparing one Git commit...");
  const ref = await getBranchRef();
  const parentSha = ref.object.sha;
  const parentCommit = await getGitCommit(parentSha);
  const baseTreeSha = parentCommit.tree.sha;

  for (const item of db.meta.pages) {
    const page = db.pages[item.id];

    if (!page) {
      continue;
    }

    const filePath = validatePathInDir(item.file, pagesDir, `page file for ${item.id}`);
    const blob = await createBlob(jsonFileContent(page));
    treeEntries.push({
      path: filePath,
      mode: "100644",
      type: "blob",
      sha: blob.sha
    });
  }

  const metaBlob = await createBlob(jsonFileContent(db.meta));
  treeEntries.push({
    path: validateRepoPath(metaPath, "meta path"),
    mode: "100644",
    type: "blob",
    sha: metaBlob.sha
  });

  const navigationBlob = await createBlob(jsonFileContent(db.navigation));
  treeEntries.push({
    path: validateRepoPath(navigationPath, "navigation path"),
    mode: "100644",
    type: "blob",
    sha: navigationBlob.sha
  });

  for (const item of pendingFiles) {
    validateImageFile(item.file);
    const filePath = validatePathInDir(item.path, assetsDir, item.label);
    setStatus(`Preparing ${filePath}...`);
    const blob = await createBlob(await fileToBase64(item.file), "base64");
    treeEntries.push({
      path: filePath,
      mode: "100644",
      type: "blob",
      sha: blob.sha
    });
  }

  for (const path of deletedPageFiles) {
    treeEntries.push({
      path: validatePathInDir(path, pagesDir, "deleted page file"),
      mode: "100644",
      type: "blob",
      sha: null
    });
  }

  const tree = await createTree(baseTreeSha, treeEntries);

  if (tree.sha === baseTreeSha) {
    clearPendingFiles(pendingFiles);
    deletedPageFiles = [];
    saveLocalDb();
    return { changed: false, sha: parentSha };
  }

  setStatus("Committing database changes...");
  const commit = await createCommit("Update site data", tree.sha, parentSha);
  await updateBranchRef(commit.sha);

  clearPendingFiles(pendingFiles);
  deletedPageFiles = [];
  metaSha = null;
  navigationSha = null;
  pageShas = {};
  saveLocalDb();

  return { changed: true, sha: commit.sha };
}

async function listWorkflowRunsForCommit(commitSha) {
  const query = new URLSearchParams({
    branch,
    event: "push",
    head_sha: commitSha,
    per_page: "10"
  });

  const payload = await githubJsonRequest(`/actions/runs?${query.toString()}`);

  return (payload.workflow_runs || []).filter((run) =>
    ["Build and deploy site", "Build docs"].includes(run.name)
  );
}

async function waitForDocsBuild(commitSha) {
  if (!actionsUrl) {
    return;
  }

  setBuildStatus(`Build queued for ${commitSha.slice(0, 7)}...`);

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const runs = await listWorkflowRunsForCommit(commitSha);
    const run = runs[0];

    if (!run) {
      setBuildStatus(`Waiting for site build to start...`);
    } else if (run.status === "completed") {
      if (run.conclusion === "success") {
        const label = previewUrl ? `Build completed. Open public site.` : `Build completed.`;
        setBuildStatus(label, previewUrl || run.html_url);
        setStatus(
          previewUrl
            ? `GitHub save and site build completed. Public site: ${previewUrl}`
            : `GitHub save and site build completed.`
        );
      } else {
        setBuildStatus(`Build ${run.conclusion}. View Actions.`, run.html_url);
        setStatus(`GitHub save succeeded, but site build ${run.conclusion}. Check Actions: ${run.html_url}`);
      }

      return;
    } else {
      setBuildStatus(`Build ${run.status}...`, run.html_url);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  setBuildStatus(`Build not finished yet. View Actions.`, actionsUrl);
  setStatus(`GitHub save succeeded. Site build is still running or delayed: ${actionsUrl}`);
}

async function loadGithubDb() {
  try {
    ensureConnected();
    setBusy(true);
    setStatus("Checking GitHub repository...");
    await loadRepoInfo();
    lastLoadedHeadSha = await getHeadSha();

    setStatus(`Loading ${metaPath} from ${branch}...`);

    let metaPayload;

    try {
      metaPayload = await loadGithubFile(metaPath);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }

      db = emptyDb();
      metaSha = null;
      navigationSha = null;
      pageShas = {};
      deletedPageFiles = [];
      saveLocalDb();
      resetForm();
      renderPages();
      renderNavigation();
      setStatus(`${metaPath} does not exist yet. Add a page, then Save to GitHub to create it.`);
      return;
    }

    const meta = JSON.parse(decodeBase64(metaPayload.content));
    let navigation = { main: [] };
    let nextNavigationSha = null;
    const nextPages = {};
    const nextPageShas = {};

    try {
      setStatus(`Loading ${navigationPath}...`);
      const navigationPayload = await loadGithubFile(navigationPath);
      navigation = JSON.parse(decodeBase64(navigationPayload.content));
      nextNavigationSha = navigationPayload.sha;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }

    for (const item of meta.pages || []) {
      const itemFile = validatePathInDir(item.file || pageFilePath(item.id), pagesDir, `page file for ${item.id}`);
      setStatus(`Loading ${itemFile}...`);
      const pagePayload = await loadGithubFile(itemFile);
      const page = normalizePage(JSON.parse(decodeBase64(pagePayload.content)));
      nextPages[page.id] = page;
      nextPageShas[page.id] = pagePayload.sha;
    }

    db = {
      meta: normalizeMeta(meta, nextPages),
      navigation: normalizeNavigation(navigation),
      pages: nextPages
    };
    metaSha = metaPayload.sha;
    navigationSha = nextNavigationSha;
    pageShas = nextPageShas;
    deletedPageFiles = [];
    saveLocalDb();
    resetForm();
    renderPages();
    renderNavigation();
    lastSavedHeadSha = null;
    setBuildStatus("No build checked yet");
    setStatus(`Loaded ${db.meta.pages.length} records from ${repoOwner}/${repoName}.`);
  } catch (error) {
    setStatus(`Load failed: ${explainGithubError(error)}`);
  } finally {
    setBusy(false);
  }
}

async function saveGithubDb() {
  try {
    ensureConnected();

    if (formHasDraft() && !upsertPage()) {
      return;
    }

    db.navigation = readNavigationRows();
    saveLocalDb();
    setBusy(true);
    setStatus("Checking GitHub repository...");
    await loadRepoInfo();

    if (!(await confirmRemoteIsFresh())) {
      setStatus("Save cancelled. Load DB to review the latest remote data.");
      return;
    }

    const result = await commitDatabaseChanges();

    setStatus(
      result.changed
        ? `Saved ${db.meta.pages.length} records in one Git commit: ${result.sha.slice(0, 7)}. Waiting for site build...`
        : `No Git changes to save. Site output is already based on the latest committed data.`
    );

    if (result.changed) {
      lastLoadedHeadSha = result.sha;
      lastSavedHeadSha = result.sha;
      await waitForDocsBuild(result.sha);
    }
  } catch (error) {
    setStatus(`Save failed: ${explainGithubError(error)}`);
  } finally {
    setBusy(false);
  }
}

async function getExistingFile(path) {
  try {
    return await loadGithubFile(path);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

async function deleteGithubFile(path, sha, message) {
  return githubRequest(`${repoApiBase}/contents/${path}`, {
    method: "DELETE",
    body: JSON.stringify({ branch, message, sha })
  });
}

async function uploadPendingImages() {
  for (const item of db.meta.pages) {
    const page = db.pages[item.id];

    if (!page) {
      continue;
    }

    if (page.coverImage?.pendingFile) {
      const path = page.coverImage.src;
      setStatus(`Uploading ${path}...`);
      const previous = await getExistingFile(path);
      await saveGithubAsset(path, page.coverImage.pendingFile, previous?.sha, `Upload cover image for ${page.id}`);
      delete page.coverImage.pendingFile;
    }

    for (const image of page.images) {
      if (!image.pendingFile) {
        continue;
      }

      const path = image.src;
      setStatus(`Uploading ${path}...`);
      const previous = await getExistingFile(path);
      await saveGithubAsset(path, image.pendingFile, previous?.sha, `Upload image for ${page.id}`);
      delete image.pendingFile;
    }
  }

  saveLocalDb();
}

function setBusy(isBusy) {
  connectButton.disabled = isBusy;
  loadGithubButton.disabled = isBusy;
  saveGithubButton.disabled = isBusy;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resetForm() {
  editingId = null;
  form.reset();
  pageType.value = "page";
  template.value = "";
  published.checked = true;
  coverPreview.removeAttribute("src");
  imageFields.innerHTML = "";
  formTitle.textContent = "New page";
  pageId.disabled = false;
}

function renderPages() {
  countBadge.textContent = `${db.meta.pages.length} ${db.meta.pages.length === 1 ? "record" : "records"}`;

  if (db.meta.pages.length === 0) {
    pageList.innerHTML = '<div class="empty">No pages yet. Create page-1 to start.</div>';
    return;
  }

  pageList.innerHTML = "";

  db.meta.pages
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((item) => {
      const row = document.createElement("article");
      row.className = "page-row";

      const summary = document.createElement("div");
      const heading = document.createElement("h3");
      const meta = document.createElement("div");
      const typeBadge = document.createElement("span");

      heading.textContent = item.title || item.id;
      meta.className = "meta";
      typeBadge.className = "type-badge";
      typeBadge.textContent = item.type;
      meta.append(typeBadge, document.createTextNode(`${item.id} / ${item.slug}`));

      summary.append(heading, meta);

      const actions = document.createElement("div");
      actions.className = "row-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => editPage(item.id));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-button";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deletePage(item.id));

      actions.append(editButton, deleteButton);
      row.append(summary, actions);
      pageList.append(row);
    });
}

function pageOptionsHtml(selected = "") {
  const options = ['<option value="">Direct URL</option>'];

  db.meta.pages
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((item) => {
      const value = item.slug || item.id;
      const label = `${item.title || item.id} (${value})`;
      const selectedAttribute = value === selected || item.id === selected ? " selected" : "";
      options.push(`<option value="${escapeAttribute(value)}"${selectedAttribute}>${escapeHtml(label)}</option>`);
    });

  return options.join("");
}

function renderNavigation() {
  navigationItems.innerHTML = "";

  const items = normalizeNavigation(db.navigation).main;

  if (items.length === 0) {
    addNavigationRow();
    return;
  }

  items.forEach(addNavigationRow);
}

function addNavigationRow(item = {}) {
  const row = document.createElement("div");
  row.className = "navigation-item";

  row.innerHTML = `
    <label>
      Label
      <input class="navigation-label" type="text" value="${escapeAttribute(item.label || "")}" placeholder="Work">
    </label>
    <label>
      Page
      <select class="navigation-page">${pageOptionsHtml(item.page || "")}</select>
    </label>
    <label>
      Direct URL
      <input class="navigation-href" type="text" value="${escapeAttribute(item.href || "")}" placeholder="https://example.com">
    </label>
    <button class="remove-navigation-button" type="button">Remove</button>
  `;

  row.querySelector(".remove-navigation-button").addEventListener("click", () => {
    row.remove();

    if (!navigationItems.children.length) {
      addNavigationRow();
    }
  });

  navigationItems.append(row);
}

function readNavigationRows() {
  const main = [];

  for (const row of navigationItems.querySelectorAll(".navigation-item")) {
    const label = row.querySelector(".navigation-label").value.trim();
    const page = row.querySelector(".navigation-page").value.trim();
    const href = row.querySelector(".navigation-href").value.trim();

    if (!label && !page && !href) {
      continue;
    }

    main.push({ label, page, href: page ? "" : href });
  }

  return normalizeNavigation({ main });
}

function editPage(id) {
  const page = db.pages[id];

  if (!page) {
    return;
  }

  editingId = id;
  formTitle.textContent = `Edit ${id}`;
  pageType.value = page.type;
  template.value = page.template || "";
  published.checked = page.published;
  pageId.value = page.id;
  pageId.disabled = true;
  slug.value = page.slug;
  title.value = page.title;
  subtitle.value = page.subtitle;
  body.value = page.body;
  coverSrc.value = page.coverImage?.src || "";
  coverAlt.value = page.coverImage?.alt || "";
  coverCaption.value = page.coverImage?.caption || "";
  updatePreviewFromPath(coverPreview, coverSrc.value);
  imageFields.innerHTML = "";
  page.images.forEach(addImageRow);
}

function deletePage(id) {
  const page = db.pages[id];

  if (!page || !confirm(`Delete ${page.id}?`)) {
    return;
  }

  delete db.pages[id];
  deletedPageFiles.push(pageFilePath(id));
  db.meta.pages = db.meta.pages.filter((item) => item.id !== id);
  saveLocalDb();
  resetForm();
  renderPages();
  renderNavigation();
  setStatus(`Deleted ${id} locally. Save to GitHub when ready.`);
}

function formHasDraft() {
  return Boolean(
    editingId ||
      pageId.value.trim() ||
      template.value.trim() ||
      slug.value.trim() ||
      title.value.trim() ||
      subtitle.value.trim() ||
      body.value.trim() ||
      coverSrc.value.trim() ||
      coverFile.files[0] ||
      imageFields.children.length
  );
}

function upsertPage(event) {
  event?.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return false;
  }

  if (!validateRequiredConfiguredFields()) {
    return false;
  }

  const now = new Date().toISOString();
  const id = editingId || slugify(pageId.value.trim());
  const coverUpload = coverFile.files[0];

  if (coverUpload) {
    try {
      validateImageFile(coverUpload);
    } catch (error) {
      alert(error.message);
      return false;
    }

    coverSrc.value = assetFilePath(id, coverUpload, "cover");
  }

  const existing = db.pages[id];
  let images;

  try {
    images = readImageRows();
  } catch (error) {
    alert(error.message);
    return false;
  }

  const record = normalizePage({
    id,
    slug: slugify(slug.value.trim() || id),
    type: pageType.value,
    template: template.value.trim(),
    title: title.value.trim(),
    subtitle: subtitle.value.trim(),
    body: body.value.trim(),
    coverImage: coverSrc.value.trim()
      ? {
          id: "cover",
          src: coverSrc.value.trim(),
          alt: coverAlt.value.trim(),
          caption: coverCaption.value.trim(),
          pendingFile: coverFile.files[0] || null
        }
      : null,
    images,
    published: published.checked,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  });

  if (!record.id || !record.slug || !record.title) {
    return false;
  }

  db.pages[record.id] = record;
  upsertMetaItem(record);
  saveLocalDb();
  resetForm();
  renderPages();
  renderNavigation();
  const hasPendingUpload = Boolean(record.coverImage?.pendingFile || record.images.some((image) => image.pendingFile));
  setStatus(
    hasPendingUpload
      ? `Saved ${record.id} locally with pending image uploads. Save to GitHub before refreshing.`
      : `Saved ${record.id} locally. Save to GitHub when ready.`
  );
  return true;
}

function upsertMetaItem(page) {
  const index = db.meta.pages.findIndex((item) => item.id === page.id);
  const existing = db.meta.pages[index];
  const item = normalizeMetaItem(existing || {}, page, db.meta.pages.length);

  if (index >= 0) {
    db.meta.pages[index] = item;
  } else {
    db.meta.pages.push(item);
  }
}

function addImageRow(image = {}) {
  const item = document.createElement("div");
  item.className = "image-item";

  item.innerHTML = `
    <div class="image-item-header">
      <strong>Image</strong>
      <button class="remove-image-button" type="button">Remove</button>
    </div>
    <img class="image-preview" alt="">
    <label>
      Upload image
      <input class="image-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
    </label>
    <p class="field-note">Max 2 MB. JPG, PNG, WebP, or GIF.</p>
    <label>
      Image URL or repo path
      <input class="image-src" type="text" value="${escapeAttribute(image.src || "")}" placeholder="data/assets/page-1/image-1.jpg">
    </label>
    <label>
      Alt text
      <input class="image-alt" type="text" value="${escapeAttribute(image.alt || "")}" placeholder="Describe the image">
    </label>
    <label>
      Caption
      <input class="image-caption" type="text" value="${escapeAttribute(image.caption || "")}" placeholder="Optional caption">
    </label>
  `;

  item.querySelector(".remove-image-button").addEventListener("click", () => item.remove());
  item.querySelector(".image-file").addEventListener("change", () => previewSelectedImage(item));
  item.querySelector(".image-src").addEventListener("input", () => {
    updatePreviewFromPath(item.querySelector(".image-preview"), item.querySelector(".image-src").value);
  });
  imageFields.append(item);
  updatePreviewFromPath(item.querySelector(".image-preview"), image.src || "");
}

function previewSelectedImage(item) {
  const fileInput = item.querySelector(".image-file");
  const preview = item.querySelector(".image-preview");
  const file = fileInput.files[0];

  preview.removeAttribute("src");

  if (!file) {
    return;
  }

  try {
    validateImageFile(file);
  } catch (error) {
    alert(error.message);
    fileInput.value = "";
    return;
  }

  preview.src = URL.createObjectURL(file);
}

function updatePreviewFromPath(preview, path) {
  const src = path.trim();

  preview.removeAttribute("src");

  if (!src) {
    return;
  }

  preview.src = resolveImageSrc(src);
}

function resolveImageSrc(src) {
  if (/^(https?:|data:|blob:)/.test(src)) {
    return src;
  }

  return src.replace(/^\/+/, "");
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(value) {
  return String(value ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderPreviewImage(image) {
  if (!image?.src) {
    return "";
  }

  const caption = image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : "";

  return `<figure><img src="${escapeAttribute(resolveImageSrc(image.src))}" alt="${escapeAttribute(image.alt || "")}">${caption}</figure>`;
}

function currentFormRecordForPreview() {
  let images = [];

  try {
    images = readImageRows();
  } catch {
    images = [];
  }

  return {
    title: title.value.trim() || "Untitled",
    template: template.value.trim(),
    subtitle: subtitle.value.trim(),
    body: body.value.trim(),
    coverImage: coverSrc.value.trim()
      ? {
          src: coverFile.files[0] ? URL.createObjectURL(coverFile.files[0]) : coverSrc.value.trim(),
          alt: coverAlt.value.trim(),
          caption: coverCaption.value.trim()
        }
      : null,
    images
  };
}

function showPreview() {
  const record = currentFormRecordForPreview();
  const gallery = record.images.map(renderPreviewImage).join("");

  previewContent.innerHTML = `
    <h1>${escapeHtml(record.title)}</h1>
    ${record.subtitle ? `<p class="subtitle">${escapeHtml(record.subtitle)}</p>` : ""}
    ${renderPreviewImage(record.coverImage)}
    <article>${textToHtml(record.body)}</article>
    ${gallery ? `<div class="database-gallery">${gallery}</div>` : ""}
  `;
  previewPanel.hidden = false;
  previewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function readImageRows() {
  const id = editingId || slugify(pageId.value.trim());
  const images = [];

  for (const [index, item] of [...imageFields.querySelectorAll(".image-item")].entries()) {
    const file = item.querySelector(".image-file").files[0];
    const srcInput = item.querySelector(".image-src");

    if (file) {
      try {
        validateImageFile(file);
      } catch (error) {
        throw error;
      }

      srcInput.value = assetFilePath(id, file, `image-${index + 1}`);
    }

    const src = srcInput.value.trim();

    if (!src) {
      continue;
    }

    images.push({
      id: `image-${index + 1}`,
      src,
      alt: item.querySelector(".image-alt").value.trim(),
      caption: item.querySelector(".image-caption").value.trim(),
      pendingFile: file || null
    });
  }

  return images;
}

function exportJson() {
  db.navigation = readNavigationRows();
  saveLocalDb();
  const blob = new Blob([JSON.stringify(stripPendingFiles(db), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "page-db.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importJson(event) {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.addEventListener("load", () => {
    try {
      db = normalizeDb(JSON.parse(reader.result));
      validateDbPaths();
      metaSha = null;
      pageShas = {};
      deletedPageFiles = [];
      saveLocalDb();
      resetForm();
      renderPages();
      renderNavigation();
      setStatus(`Imported ${db.meta.pages.length} records locally. Save to GitHub when ready.`);
    } catch (error) {
      alert(`Could not import JSON: ${error.message}`);
    }
  });

  reader.readAsText(file);
  importFile.value = "";
}

title.addEventListener("input", () => {
  if (!slug.value.trim()) {
    slug.value = slugify(title.value);
  }

  if (!pageId.value.trim() && slug.value.trim()) {
    pageId.value = slug.value;
  }
});

coverFile.addEventListener("change", () => {
  const file = coverFile.files[0];

  coverPreview.removeAttribute("src");

  if (!file) {
    updatePreviewFromPath(coverPreview, coverSrc.value);
    return;
  }

  try {
    validateImageFile(file);
  } catch (error) {
    alert(error.message);
    coverFile.value = "";
    updatePreviewFromPath(coverPreview, coverSrc.value);
    return;
  }

  const id = editingId || slugify(pageId.value.trim()) || "page-1";
  coverSrc.value = assetFilePath(id, file, "cover");
  coverPreview.src = URL.createObjectURL(file);
});

coverSrc.addEventListener("input", () => {
  updatePreviewFromPath(coverPreview, coverSrc.value);
});

form.addEventListener("submit", upsertPage);
resetButton.addEventListener("click", resetForm);
addImageButton.addEventListener("click", () => addImageRow());
addMenuItemButton.addEventListener("click", () => addNavigationRow());
exportButton.addEventListener("click", exportJson);
importFile.addEventListener("change", importJson);
connectButton.addEventListener("click", connectRepository);
loadGithubButton.addEventListener("click", loadGithubDb);
saveGithubButton.addEventListener("click", saveGithubDb);
previewButton.addEventListener("click", showPreview);
closePreviewButton.addEventListener("click", () => {
  previewPanel.hidden = true;
});
rememberToken.addEventListener("change", () => {
  localStorage.setItem(rememberTokenKey, String(rememberToken.checked));

  if (!rememberToken.checked) {
    localStorage.removeItem(tokenKey);
  } else if (githubToken.value.trim()) {
    localStorage.setItem(tokenKey, githubToken.value.trim());
  }
});
forgetTokenButton.addEventListener("click", () => {
  githubToken.value = "";
  localStorage.removeItem(tokenKey);
  setStatus("Token forgotten on this browser.");
});

renderPages();
renderNavigation();
