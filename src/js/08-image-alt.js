/* ---------- image insert / alt text ---------- */
let pendingMediaInsert = null;

function openAltDialog(media) {
  pendingMediaInsert = media;
  el('altImageName').textContent = media.name || media.url || '';
  el('altTextInput').value = MediaUtils.altFromFilename(media.name);
  el('altDecorative').checked = false;
  el('altTextInput').disabled = false;
  el('altModal').classList.add('show');
  setTimeout(() => el('altTextInput').select(), 0);
}

function closeAltDialog() {
  el('altModal').classList.remove('show');
  pendingMediaInsert = null;
}

function confirmAltInsert() {
  if (!pendingMediaInsert) return;
  const decorative = el('altDecorative').checked;
  const alt = decorative ? '' : el('altTextInput').value.trim();
  const tag = EditorUtils.imgTag({ url: pendingMediaInsert.url, alt });
  insertAtCursor(el('htmlArea'), tag);
  closeAltDialog();
  el('mediaModal').classList.remove('show');
  toast('Image inserted', 'ok');
}
