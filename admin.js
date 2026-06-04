let repoOwner = "";
let repoName = "";
let repoApiBase = "";
let branch = "main";
let metaPath = "data/meta.json";
let navigationPath = "data/navigation.json";
let pagesDir = "data/pages";
let assetsDir = "data/assets";
let previewUrl = "";
let actionsUrl = "";
let maxImageSize = 2 * 1024 * 1024;
let allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
let lastLoadedHeadSha = null;
let lastSavedHeadSha = null;
let editingId = null;
let deletedPageFiles = [];

const configPath = "admin.config.json";
const storageKey = "json-site-admin-db";
const tokenKey = "json-site-admin-token";
const repoUrlKey = "json-site-admin-repo-url";

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
const coverFile = document.querySelector("#coverFile");
const coverPreview = document.querySelector("#coverPreview");
const coverSrc = document.querySelector("#coverSrc");
const coverAlt = document.querySelector("#coverAlt");
const coverCaption = document.querySelector("#coverCaption");
const imageFields = document.querySelector("#imageFields");
const navigationItems = document.querySelector("#navigationItems");
const pageList = document.querySelector("#pageList");
const countBadge = document.querySelector("#countBadge");
const statusText = document.querySelector("#statusText");
const repoSummary = document.querySelector("#repoSummary");
const dataSummary = document.querySelector("#dataSummary");
const siteSummary = document.querySelector("#siteSummary");
const buildSummary = document.querySelector("#buildSummary");
const githubToken = document.querySelector("#githubToken");
const repoUrl = document.querySelector("#repoUrl");
const connectButton = document.querySelector("#connectButton");
const loadButton = document.querySelector("#loadButton");
const saveButton = document.querySelector("#saveButton");
const saveLocalButton = document.querySelector("#saveLocalButton");
const clearButton = document.querySelector("#clearButton");
const addImageButton = document.querySelector("#addImageButton");
const addMenuItemButton = document.querySelector("#addMenuItemButton");

const requiredElements = {
  form,
  pageType,
  template,
  navigationItems,
  statusText,
  connectButton,
  loadButton,
  saveButton
};
const missingElements = Object.entries(requiredElements).filter(([, element]) => !element).map(([name]) => name);

if (missingElements.length) {
  throw new Error(`Admin HTML is missing required elements: ${missingElements.join(", ")}`);
}

githubToken.value = localStorage.getItem(tokenKey) || "";
repoUrl.value = localStorage.getItem(repoUrlKey) || "";

let db = loadLocalDb();

function emptyDb() {
  return { meta: { version: 1, pages: [] }, navigation: { main: [] }, pages: {} };
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

function saveLocalDb() {
  localStorage.setItem(currentStorageKey(), JSON.stringify(stripPendingFiles(db), null, 2));
}

function stripPendingFiles(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => (key === "pendingFile" ? undefined : item)));
}

function setStatus(message) {
  statusText.textContent = message;
}

function renderLink(container, href, label) {
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

function parseRepoUrl(value) {
  const input = value.trim().replace(/\.git$/, "");
  const match = input.match(/github\.com\/([^\/]+)\/([^\/#?]+)/) || input.match(/^([^\/]+)\/([^\/]+)$/);

  if (!match) {
    throw new Error("Enter a GitHub repository URL like https://github.com/owner/repo.");
  }

  return { owner: match[1], name: match[2] };
}

function validateRepoPath(value, label = "path") {
  const safePath = String(value || "").trim().replace(/^\/+/, "");

  if (!safePath) {
    throw new Error(`Invalid ${label}: path is empty.`);
  }

  if (/^(https?:|data:|blob:)/i.test(safePath)) {
    throw new Error(`Invalid ${label}: repository paths cannot be URLs.`);
  }

  if (safePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid ${label}: ${safePath}`);
  }

  return safePath;
}

function validatePathInDir(value, dir, label = "path") {
  const safePath = validateRepoPath(value, label);
  const safeDir = validateRepoPath(dir, `${label} base`);

  if (safePath !== safeDir && !safePath.startsWith(`${safeDir}/`)) {
    throw new Error(`Invalid ${label}: ${safePath} must be inside ${safeDir}/.`);
  }

  return safePath;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pageFilePath(id) {
  return `${pagesDir}/${id}.json`;
}

function assetFilePath(pageIdValue, file, fallbackName) {
  const extensions = {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp"
  };
  const extension = extensions[file.type] || `.${file.name.split(".").pop().toLowerCase()}`;

  return `${assetsDir}/${pageIdValue}/${fallbackName}${extension}`;
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

  next.meta = value.meta?.pages
    ? {
        version: Number(value.meta.version) || 1,
        pages: value.meta.pages.map((item, index) => normalizeMetaItem(item, next.pages[item.id], index)).filter((item) => item.id)
      }
    : {
        version: 1,
        pages: Object.values(next.pages).map((page, index) => normalizeMetaItem({}, page, index))
      };
  next.navigation = normalizeNavigation(value.navigation);

  return next;
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

function getToken() {
  const token = githubToken.value.trim();

  if (token) {
    localStorage.setItem(tokenKey, token);
  }

  return token;
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

function explainGithubError(error) {
  if (error.status === 401) {
    return "Bad or expired token.";
  }

  if (error.status === 403) {
    return "Token is valid, but it does not have Contents: Read and write permission.";
  }

  if (error.status === 404) {
    return "GitHub cannot find this repo, file, or token access.";
  }

  return error.message;
}

function isMissingFileError(error) {
  return error.status === 404 && error.payload?.message === "Not Found";
}

async function loadRepoInfo() {
  const payload = await githubRequest(repoApiBase);
  branch = payload.default_branch || branch;
}

async function githubJsonRequest(path, options = {}) {
  return githubRequest(`${repoApiBase}${path}`, options);
}

async function getBranchRef() {
  return githubJsonRequest(`/git/ref/heads/${branch}`);
}

async function getHeadSha() {
  const ref = await getBranchRef();
  return ref.object.sha;
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
    body: JSON.stringify({ base_tree: baseTreeSha, tree })
  });
}

async function createCommit(message, treeSha, parentSha) {
  return githubJsonRequest("/git/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] })
  });
}

async function updateBranchRef(commitSha) {
  return githubJsonRequest(`/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commitSha, force: false })
  });
}

async function loadGithubFile(repoPath) {
  return githubRequest(`${repoApiBase}/contents/${repoPath}?ref=${encodeURIComponent(branch)}`);
}

async function loadOptionalJson(repoPath, fallback) {
  try {
    const payload = await loadGithubFile(repoPath);
    return JSON.parse(decodeBase64(payload.content));
  } catch (error) {
    if (isMissingFileError(error)) {
      return fallback;
    }
    throw error;
  }
}

function applyConfig(config) {
  metaPath = validateRepoPath(config.paths?.meta || "data/meta.json", "meta path");
  navigationPath = validateRepoPath(config.paths?.navigation || "data/navigation.json", "navigation path");
  pagesDir = validateRepoPath(config.paths?.pages || "data/pages", "pages path");
  assetsDir = validateRepoPath(config.paths?.assets || "data/assets", "assets path");
  maxImageSize = Number(config.uploads?.maxImageSize) || maxImageSize;
  allowedImageTypes = Array.isArray(config.uploads?.allowedImageTypes) ? config.uploads.allowedImageTypes.map(String) : allowedImageTypes;
  previewUrl = String(config.site?.previewUrl || "").trim();
  actionsUrl = `https://github.com/${repoOwner}/${repoName}/actions`;
  renderContentTypes(config.contentTypes || []);
  dataSummary.textContent = `${metaPath}, ${navigationPath}, ${pagesDir}, ${assetsDir}`;
  renderLink(siteSummary, previewUrl, previewUrl || "Not configured");
  renderLink(buildSummary, actionsUrl, "Actions");
}

function renderContentTypes(contentTypes) {
  const current = pageType.value;
  pageType.innerHTML = "";
  const types = contentTypes.length ? contentTypes : [{ type: "page", label: "Page" }, { type: "gallery", label: "Gallery" }];

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
    const payload = await loadGithubFile(configPath);
    applyConfig(JSON.parse(decodeBase64(payload.content)));
    db = loadLocalDb();
    renderAll();
    setStatus(`Connected to ${repoOwner}/${repoName}.`);
  } catch (error) {
    setStatus(`Connect failed: ${explainGithubError(error)}`);
  } finally {
    setBusy(false);
  }
}

async function loadGithubDb() {
  try {
    ensureConnected();
    setBusy(true);
    await loadRepoInfo();
    lastLoadedHeadSha = await getHeadSha();
    const metaPayload = await loadGithubFile(metaPath);
    const meta = JSON.parse(decodeBase64(metaPayload.content));
    const navigation = await loadOptionalJson(navigationPath, { main: [] });
    const nextPages = {};

    for (const item of meta.pages || []) {
      const itemFile = validatePathInDir(item.file || pageFilePath(item.id), pagesDir, `page file for ${item.id}`);
      const pagePayload = await loadGithubFile(itemFile);
      const page = normalizePage(JSON.parse(decodeBase64(pagePayload.content)));
      nextPages[page.id] = page;
    }

    db = normalizeDb({ meta, navigation, pages: nextPages });
    deletedPageFiles = [];
    saveLocalDb();
    clearForm();
    renderAll();
    setStatus(`Loaded ${db.meta.pages.length} records.`);
  } catch (error) {
    setStatus(`Load failed: ${explainGithubError(error)}`);
  } finally {
    setBusy(false);
  }
}

function ensureConnected() {
  if (!repoApiBase) {
    throw new Error("Connect to a repository first.");
  }
}

function validateImageFile(file) {
  if (!allowedImageTypes.includes(file.type)) {
    throw new Error(`${file.name} is not an allowed image type.`);
  }

  if (file.size > maxImageSize) {
    throw new Error(`${file.name} is too large.`);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function fileToBase64(file) {
  const dataUrl = await fileToDataUrl(file);
  return dataUrl.split(",")[1] || "";
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
      files.push({ image: page.coverImage, file: page.coverImage.pendingFile, path: page.coverImage.src, label: `cover image for ${page.id}` });
    }

    for (const image of page.images) {
      if (image.pendingFile) {
        files.push({ image, file: image.pendingFile, path: image.src, label: `image for ${page.id}` });
      }
    }
  }

  return files;
}

function validateDbPaths() {
  validateRepoPath(metaPath, "meta path");
  validateRepoPath(navigationPath, "navigation path");

  for (const item of db.meta.pages) {
    item.file = validatePathInDir(item.file || pageFilePath(item.id), pagesDir, `page file for ${item.id}`);
  }

  for (const path of deletedPageFiles) {
    validatePathInDir(path, pagesDir, "deleted page file");
  }
}

async function commitDatabaseChanges() {
  db.navigation = readNavigationRows();
  validateDbPaths();
  const pendingFiles = collectPendingFiles();
  const ref = await getBranchRef();
  const parentSha = ref.object.sha;
  const parentCommit = await getGitCommit(parentSha);
  const treeEntries = [];

  for (const item of db.meta.pages) {
    const page = db.pages[item.id];

    if (!page) {
      continue;
    }

    const blob = await createBlob(jsonFileContent(page));
    treeEntries.push({ path: validatePathInDir(item.file, pagesDir, `page file for ${item.id}`), mode: "100644", type: "blob", sha: blob.sha });
  }

  const metaBlob = await createBlob(jsonFileContent(db.meta));
  treeEntries.push({ path: validateRepoPath(metaPath, "meta path"), mode: "100644", type: "blob", sha: metaBlob.sha });

  const navigationBlob = await createBlob(jsonFileContent(db.navigation));
  treeEntries.push({ path: validateRepoPath(navigationPath, "navigation path"), mode: "100644", type: "blob", sha: navigationBlob.sha });

  for (const item of pendingFiles) {
    validateImageFile(item.file);
    const blob = await createBlob(await fileToBase64(item.file), "base64");
    treeEntries.push({ path: validatePathInDir(item.path, assetsDir, item.label), mode: "100644", type: "blob", sha: blob.sha });
  }

  for (const repoPath of deletedPageFiles) {
    treeEntries.push({ path: validatePathInDir(repoPath, pagesDir, "deleted page file"), mode: "100644", type: "blob", sha: null });
  }

  const tree = await createTree(parentCommit.tree.sha, treeEntries);

  if (tree.sha === parentCommit.tree.sha) {
    return { changed: false, sha: parentSha };
  }

  const commit = await createCommit("Update site data", tree.sha, parentSha);
  await updateBranchRef(commit.sha);
  pendingFiles.forEach((item) => delete item.image.pendingFile);
  deletedPageFiles = [];
  lastSavedHeadSha = commit.sha;
  lastLoadedHeadSha = commit.sha;
  saveLocalDb();
  return { changed: true, sha: commit.sha };
}

async function saveGithubDb() {
  try {
    ensureConnected();

    if (formHasDraft() && !upsertPage()) {
      return;
    }

    setBusy(true);
    const remoteHead = await getHeadSha();

    if (lastLoadedHeadSha && remoteHead !== lastLoadedHeadSha && remoteHead !== lastSavedHeadSha) {
      const ok = confirm(`Remote changed since last load.\n\nLoaded: ${lastLoadedHeadSha.slice(0, 7)}\nRemote: ${remoteHead.slice(0, 7)}\n\nSave on top of newest remote commit?`);

      if (!ok) {
        setStatus("Save cancelled. Load DB to review remote changes.");
        return;
      }
    }

    const result = await commitDatabaseChanges();
    setStatus(result.changed ? `Saved commit ${result.sha.slice(0, 7)}. Check Actions for deployment.` : "No Git changes to save.");
    renderLink(buildSummary, actionsUrl, "Actions");
  } catch (error) {
    setStatus(`Save failed: ${explainGithubError(error)}`);
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy) {
  connectButton.disabled = isBusy;
  loadButton.disabled = isBusy;
  saveButton.disabled = isBusy;
}

function clearForm() {
  editingId = null;
  form.reset();
  pageType.value = "page";
  template.value = "";
  published.checked = true;
  pageId.disabled = false;
  coverPreview.removeAttribute("src");
  imageFields.innerHTML = "";
  formTitle.textContent = "New Page";
}

function renderAll() {
  renderPages();
  renderNavigation();
}

function renderPages() {
  countBadge.textContent = `${db.meta.pages.length} ${db.meta.pages.length === 1 ? "record" : "records"}`;
  pageList.innerHTML = "";

  if (!db.meta.pages.length) {
    pageList.innerHTML = '<div class="meta">No records yet.</div>';
    return;
  }

  db.meta.pages
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((item) => {
      const row = document.createElement("article");
      row.className = "page-row";
      row.innerHTML = `
        <div>
          <h3>${escapeHtml(item.title || item.id)}</h3>
          <div class="meta">${escapeHtml(item.type)} / ${escapeHtml(item.slug)}</div>
        </div>
        <div class="actions">
          <button type="button" data-edit="${escapeHtml(item.id)}">Edit</button>
          <button class="delete-button" type="button" data-delete="${escapeHtml(item.id)}">Delete</button>
        </div>
      `;
      row.querySelector("[data-edit]").addEventListener("click", () => editPage(item.id));
      row.querySelector("[data-delete]").addEventListener("click", () => deletePage(item.id));
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
      const selectedAttr = value === selected || item.id === selected ? " selected" : "";
      options.push(`<option value="${escapeAttribute(value)}"${selectedAttr}>${escapeHtml(label)}</option>`);
    });

  return options.join("");
}

function renderNavigation() {
  navigationItems.innerHTML = "";
  const items = normalizeNavigation(db.navigation).main;

  if (!items.length) {
    addNavigationRow();
    return;
  }

  items.forEach(addNavigationRow);
}

function addNavigationRow(item = {}) {
  const row = document.createElement("div");
  row.className = "navigation-item";
  row.innerHTML = `
    <label>Label<input class="navigation-label" type="text" value="${escapeAttribute(item.label || "")}" placeholder="Work"></label>
    <label>Page<select class="navigation-page">${pageOptionsHtml(item.page || "")}</select></label>
    <label>Direct URL<input class="navigation-href" type="text" value="${escapeAttribute(item.href || "")}" placeholder="https://example.com"></label>
    <button class="remove-button" type="button">Remove</button>
  `;
  row.querySelector(".remove-button").addEventListener("click", () => {
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
  clearForm();
  renderAll();
  setStatus(`Deleted ${id} locally. Save to GitHub when ready.`);
}

function formHasDraft() {
  return Boolean(
    editingId ||
      pageId.value.trim() ||
      slug.value.trim() ||
      title.value.trim() ||
      subtitle.value.trim() ||
      template.value.trim() ||
      body.value.trim() ||
      coverSrc.value.trim() ||
      coverFile.files[0] ||
      imageFields.children.length
  );
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

function upsertPage(event) {
  event?.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
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

  let images;
  try {
    images = readImageRows();
  } catch (error) {
    alert(error.message);
    return false;
  }

  const existing = db.pages[id];
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
          pendingFile: coverUpload || null
        }
      : null,
    images,
    published: published.checked,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  });

  db.pages[record.id] = record;
  upsertMetaItem(record);
  saveLocalDb();
  clearForm();
  renderAll();
  setStatus(`Saved ${record.id} locally. Save to GitHub when ready.`);
  return true;
}

function addImageRow(image = {}) {
  const item = document.createElement("div");
  item.className = "image-item";
  item.innerHTML = `
    <div class="fieldset-heading">
      <strong>Image</strong>
      <button class="remove-button" type="button">Remove</button>
    </div>
    <img class="image-preview" alt="">
    <label>Upload image<input class="image-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"></label>
    <label>Image path or URL<input class="image-src" type="text" value="${escapeAttribute(image.src || "")}"></label>
    <label>Alt text<input class="image-alt" type="text" value="${escapeAttribute(image.alt || "")}"></label>
    <label>Caption<input class="image-caption" type="text" value="${escapeAttribute(image.caption || "")}"></label>
  `;
  item.querySelector(".remove-button").addEventListener("click", () => item.remove());
  item.querySelector(".image-file").addEventListener("change", () => previewSelectedImage(item));
  item.querySelector(".image-src").addEventListener("input", () => updatePreviewFromPath(item.querySelector(".image-preview"), item.querySelector(".image-src").value));
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

function updatePreviewFromPath(preview, src) {
  preview.removeAttribute("src");

  if (!src.trim()) {
    return;
  }

  preview.src = src.trim();
}

function readImageRows() {
  const id = editingId || slugify(pageId.value.trim());
  const images = [];

  for (const [index, item] of [...imageFields.querySelectorAll(".image-item")].entries()) {
    const file = item.querySelector(".image-file").files[0];
    const srcInput = item.querySelector(".image-src");

    if (file) {
      validateImageFile(file);
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

function escapeAttribute(value) {
  return String(value ?? "")
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
    return;
  }

  const id = editingId || slugify(pageId.value.trim()) || "page";
  coverSrc.value = assetFilePath(id, file, "cover");
  coverPreview.src = URL.createObjectURL(file);
});

coverSrc.addEventListener("input", () => updatePreviewFromPath(coverPreview, coverSrc.value));
form.addEventListener("submit", upsertPage);
clearButton.addEventListener("click", clearForm);
addImageButton.addEventListener("click", () => addImageRow());
addMenuItemButton.addEventListener("click", () => addNavigationRow());
connectButton.addEventListener("click", connectRepository);
loadButton.addEventListener("click", loadGithubDb);
saveButton.addEventListener("click", saveGithubDb);

renderAll();
