/* ---------- HTML snippets ---------- */
function selectedEditorText(){
  const ta=el('htmlArea');
  const start=ta.selectionStart ?? 0;
  const end=ta.selectionEnd ?? 0;
  return ta.value.slice(start,end);
}
function snippetTemplate(type,selection=''){
  const text=selection.trim();

  switch(type){
    case 'p':
      return `<p>${esc(text || 'New paragraph')}</p>`;
    case 'h2':
      return `<h2>${esc(text || 'New heading')}</h2>`;
    case 'lede':
      return `<p class="lede">${esc(text || 'Intro text')}</p>`;
    case 'button':
      return `<a class="btn" href="contact.html">${esc(text || 'Call to action')}</a>`;
    case 'list':
      if(text){
        const items=text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
        return `<ul>\n${items.map(x=>`  <li>${esc(x)}</li>`).join('\n')}\n</ul>`;
      }
      return `<ul>\n  <li>First item</li>\n  <li>Second item</li>\n</ul>`;
    case 'card':
      return `<div class="card">\n  <h3>${esc(text || 'Card title')}</h3>\n  <p>Card text.</p>\n</div>`;
    default:
      return '';
  }
}
function insertHtmlSnippet(type){
  const ta=el('htmlArea');
  if(!state.activeId || !ta) {
    toast('Select a fragment first','err');
    return;
  }
  const snippet=snippetTemplate(type,selectedEditorText());
  if(!snippet) return;
  insertAtCursor(ta,snippet);
  toast('Snippet inserted','ok');
}
