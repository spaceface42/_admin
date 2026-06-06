/* ---------- prefill ---------- */
(function init(){
  const r=localStorage.getItem(LS_REPO), t=localStorage.getItem(LS_TOKEN);
  if(r) el('repoUrl').value=r;
  if(t){ try{ el('token').value=dec(t); }catch(e){} }
})();
