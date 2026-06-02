let repoOwner = "";
let repoName = "";
let metaPath = "data/meta.json";
let pagesDir = "data/pages";
let assetsDir = "data/assets";
const configPath = "admin.config.json";
const maxImageSize = 2 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const storageKey = "github-json-page-db-v2";
const tokenKey = "github-json-page-db-token";
const repoUrlKey = "github-json-page-db-repo-url";
let repoApiBase = "";

const form = document.querySelector("#pageForm");
const formTitle = document.querySelector("#formTitle");
const pageType = document.querySelector("#pageType");
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
const repoUrl = document.querySelector("#repoUrl");
const forgetTokenButton = document.querySelector("#forgetTokenButton");
const statusText = document.querySelector("#statusText");
const repoSummary = document.querySelector("#repoSummary");
const configSummary = document.querySelector("#configSummary");
const dataSummary = document.querySelector("#dataSummary");

let db = loadLocalDb();
let editingId = null;
let metaSha = null;
let pageShas = {};
let deletedPageFiles = [];
let branch = "main";

githubToken.value = localStorage.getItem(tokenKey) || "";
repoUrl.value = localStorage.getItem(repoUrlKey) || "";

function emptyDb() {
  return { meta: { version: 1, pages: [] }, pages: {} };
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
  metaPath = config.paths?.meta || "data/meta.json";
  pagesDir = config.paths?.pages || "data/pages";
  assetsDir = config.paths?.assets || "data/assets";
  configSummary.textContent = `${config.name || "Configured site"} (${configPath})`;
  dataSummary.textContent = `${metaPath}, ${pagesDir}, ${assetsDir}`;
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
    setStatus(`Loading ${configPath}...`);
    const payload = await loadGithubFile(configPath);
    const config = JSON.parse(decodeBase64(payload.content));
    applyConfig(config);
    db = loadLocalDb();
    resetForm();
    renderPages();
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

  return next;
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
    slug: String(item.slug || page?.slug || id),
    type: String(item.type || page?.type || "page"),
    title: String(item.title || page?.title || id),
    subtitle: String(item.subtitle || page?.subtitle || ""),
    published: Boolean(item.published ?? page?.published ?? true),
    order: Number(item.order ?? index + 1),
    file: String(item.file || pageFilePath(id)),
    updatedAt: String(item.updatedAt || page?.updatedAt || new Date().toISOString())
  };
}

function normalizePage(page) {
  const id = String(page?.id || "page-1");

  return {
    id,
    slug: String(page?.slug || id),
    type: page?.type === "gallery" ? "gallery" : "page",
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

  if (token) {
    localStorage.setItem(tokenKey, token);
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

async function loadGithubDb() {
  try {
    ensureConnected();
    setBusy(true);
    setStatus("Checking GitHub repository...");
    await loadRepoInfo();

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
      pageShas = {};
      deletedPageFiles = [];
      saveLocalDb();
      resetForm();
      renderPages();
      setStatus(`${metaPath} does not exist yet. Add a page, then Save to GitHub to create it.`);
      return;
    }

    const meta = JSON.parse(decodeBase64(metaPayload.content));
    const nextPages = {};
    const nextPageShas = {};

    for (const item of meta.pages || []) {
      setStatus(`Loading ${item.file || pageFilePath(item.id)}...`);
      const pagePayload = await loadGithubFile(item.file || pageFilePath(item.id));
      const page = normalizePage(JSON.parse(decodeBase64(pagePayload.content)));
      nextPages[page.id] = page;
      nextPageShas[page.id] = pagePayload.sha;
    }

    db = {
      meta: normalizeMeta(meta, nextPages),
      pages: nextPages
    };
    metaSha = metaPayload.sha;
    pageShas = nextPageShas;
    deletedPageFiles = [];
    saveLocalDb();
    resetForm();
    renderPages();
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

    setBusy(true);
    setStatus("Checking GitHub repository...");
    await loadRepoInfo();

    const previousMeta = await getExistingFile(metaPath);
    metaSha = previousMeta?.sha || metaSha;

    await uploadPendingImages();

    for (const path of deletedPageFiles) {
      const previousPage = await getExistingFile(path);

      if (!previousPage) {
        continue;
      }

      setStatus(`Deleting ${path}...`);
      await deleteGithubFile(path, previousPage.sha, `Delete ${path}`);
    }

    deletedPageFiles = [];

    for (const item of db.meta.pages) {
      const page = db.pages[item.id];

      if (!page) {
        continue;
      }

      setStatus(`Saving ${item.file}...`);
      const previousPage = await getExistingFile(item.file);
      const payload = await saveGithubFile(item.file, page, previousPage?.sha || pageShas[item.id], `Update ${item.id}`);
      pageShas[item.id] = payload.content.sha;
    }

    setStatus(`Saving ${metaPath}...`);
    const metaPayload = await saveGithubFile(metaPath, db.meta, metaSha, "Update page index");
    metaSha = metaPayload.content.sha;
    saveLocalDb();
    setStatus(`Saved ${db.meta.pages.length} records to GitHub: ${metaPayload.commit.sha.slice(0, 7)}.`);
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

function editPage(id) {
  const page = db.pages[id];

  if (!page) {
    return;
  }

  editingId = id;
  formTitle.textContent = `Edit ${id}`;
  pageType.value = page.type;
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
  setStatus(`Deleted ${id} locally. Save to GitHub when ready.`);
}

function formHasDraft() {
  return Boolean(
    editingId ||
      pageId.value.trim() ||
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
      metaSha = null;
      pageShas = {};
      deletedPageFiles = [];
      saveLocalDb();
      resetForm();
      renderPages();
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
exportButton.addEventListener("click", exportJson);
importFile.addEventListener("change", importJson);
connectButton.addEventListener("click", connectRepository);
loadGithubButton.addEventListener("click", loadGithubDb);
saveGithubButton.addEventListener("click", saveGithubDb);
forgetTokenButton.addEventListener("click", () => {
  githubToken.value = "";
  localStorage.removeItem(tokenKey);
  setStatus("Token forgotten on this browser.");
});

renderPages();
