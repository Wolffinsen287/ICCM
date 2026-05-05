import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, Timestamp, arrayUnion, setDoc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js';

// Utilities
const $ = (s) => document.querySelector(s);
const show = (el) => { if (!el) return; el.style.display = ''; };
const hide = (el) => { if (!el) return; el.style.display = 'none'; };

// Lightweight nav toggle for pages that don't include main.js
(function(){
  try{
    const nav = document.querySelector('.nav');
    const toggle = document.querySelector('.nav__toggle');
    const navLinks = document.querySelectorAll('.nav__link');
    if (!toggle) return;
    const closeMenu = ()=>{ if (nav) nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded','false'); };
    const openMenu = ()=>{ if (nav) nav.classList.add('is-open'); toggle.setAttribute('aria-expanded','true'); };
    toggle.addEventListener('click', ()=>{ nav?.classList.contains('is-open') ? closeMenu() : openMenu(); });
    navLinks.forEach(l=> l.addEventListener('click', ()=> closeMenu()));
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeMenu(); });
  }catch(e){ console.debug('nav toggle init error', e); }
})();

// Make nav behave like the main site: add solid background when scrolled
(function(){
  try{
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const setNavScrolled = ()=>{
      const force = !!document.querySelector('.devoc-profile') || !!document.querySelector('.admin-panel') || !!document.querySelector('.dev-article') || document.body.classList.contains('force-nav-scrolled');
      nav.classList.toggle('is-scrolled', force || window.scrollY > 10);
    };
    setNavScrolled();
    window.addEventListener('scroll', setNavScrolled, { passive: true });
  }catch(e){ console.debug('nav scroll init error', e); }
})();

// Update nav buttons according to auth state (shows Profile/Logout when signed in)
function updateNavAuthUI(user){
  try{
    const navLogin = document.getElementById('nav-login-btn');
    const navProfile = document.getElementById('nav-profile-btn');
    const navPerfilLink = document.getElementById('nav-perfil');
    const navLogout = document.getElementById('nav-logout-btn');
    const heroLogin = document.getElementById('hero-login-btn');
    if (user){
      if (navLogin) navLogin.classList.add('hidden');
      if (heroLogin) heroLogin.classList.add('hidden');
      if (navProfile) navProfile.classList.remove('hidden');
      if (navPerfilLink) navPerfilLink.classList.remove('hidden');
      if (navLogout) navLogout.classList.remove('hidden');
    } else {
      if (navLogin) navLogin.classList.remove('hidden');
      if (heroLogin) heroLogin.classList.remove('hidden');
      if (navProfile) navProfile.classList.add('hidden');
      if (navPerfilLink) navPerfilLink.classList.add('hidden');
      if (navLogout) navLogout.classList.add('hidden');
    }
    if (navLogout){ navLogout.addEventListener('click', async ()=>{ try{ await signOut(auth); location.reload(); } catch(err){ alert('Error al cerrar sesión: '+(err.message||err)); } }); }
  }catch(e){ console.debug('updateNavAuthUI error', e); }
}

onAuthStateChanged(auth, user => { updateNavAuthUI(user); });

function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return '' }
}

function htmlToText(html){ const tmp = document.createElement('div'); tmp.innerHTML = html || ''; return (tmp.textContent || tmp.innerText || '').trim(); }

function getParam(name){ return new URLSearchParams(location.search).get(name); }

// --- Index (Listado) ---
async function initIndex(){
  const listEl = $('#list');
  const spinner = $('#spinner');
  const empty = $('#empty-state');
  const search = $('#search');
  let all = [];
  let filtered = [];
  const pageSize = 10;
  let currentPage = 1;
  let userReadSet = new Set();
  let isAdminUser = false;

  async function refreshUserInfo(){
    userReadSet = new Set();
    isAdminUser = false;
    if (auth.currentUser){
      try{
        const udoc = await getDoc(doc(db,'users', auth.currentUser.uid));
        if (udoc.exists()){
          const data = udoc.data();
          (data.readingHistory||[]).forEach(h => { if (h && h.devotionalId) userReadSet.add(h.devotionalId); });
          isAdminUser = data.role === 'admin';
        }
      }catch(e){ console.debug('refreshUserInfo error', e); }
    }
    const fab = document.getElementById('fab-new'); if (fab) fab.style.display = isAdminUser ? '' : 'none';
    renderPage(currentPage);
  }

  const q = query(collection(db,'devocionales'), where('published','==', true), orderBy('date','desc'));
  spinner && show(spinner);
  try {
    const snap = await getDocs(q);
    all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // mark today's devotional
    const todayKey = new Date().toISOString().slice(0,10);
    all.forEach(a => {
      try{
        const dt = a.date && a.date.toDate ? a.date.toDate() : new Date(a.date);
        a._isToday = dt.toISOString().slice(0,10) === todayKey;
      }catch(e){ a._isToday = false; }
    });
    filtered = all.slice();
    // load user info (badges & fab) then render
    await refreshUserInfo();
    renderPage(1);
  } catch (e){
    console.error('initIndex error', e);
    const msg = e && e.message ? e.message : String(e);
    const urlMatch = msg.match(/https?:\/\/[^\s)]+/);
    let linkHTML = '';
    if (urlMatch) { const url = urlMatch[0]; linkHTML = ` <br><a href="${url}" target="_blank" rel="noopener">Crear índice requerido en la consola de Firebase</a>`; }
    listEl.innerHTML = `<p class="muted">Error al cargar devocionales: ${msg}. ${linkHTML} (La creación del índice puede tardar unos minutos)</p>`;
  }
  spinner && hide(spinner);

  function renderPage(page){
    currentPage = page;
    // ensure today's devotional pinned on top
    const sorted = filtered.slice().sort((a,b)=> (b._isToday?1:0) - (a._isToday?1:0));
    listEl.innerHTML = '';
    const start = (page-1)*pageSize;
    const pageItems = sorted.slice(start, start+pageSize);
    if (pageItems.length === 0) { show(empty); } else { hide(empty); }
    pageItems.forEach(d => {
      const a = document.createElement('a'); a.className='dev-card'; a.href = `ver.html?id=${d.id}`; if (d._isToday) a.classList.add('dev-card--today');
      if (d.image_url) a.innerHTML = `<div style="overflow:hidden;border-radius:10px;margin-bottom:8px"><img src="${d.image_url}" alt=""/></div>`;
      const excerptText = (htmlToText(d.body)||'').slice(0,120) + (d.body && htmlToText(d.body).length>120 ? '…' : '');
      const metaHtml = `<div class="dev-card__meta"><span>${formatDate(d.date)}</span><span class="dev-card__ref">${d.scripture_reference||''}</span></div>`;
      const titleHtml = `<h3 class="dev-card__title">${d.title||''}</h3>`;
      const excerptHtml = `<p class="dev-card__excerpt">${excerptText}</p>`;
      const badgeHtml = (userReadSet.has(d.id)) ? `<div class="dev-card__badge">Leído</div>` : '';
      a.innerHTML += metaHtml + titleHtml + excerptHtml + badgeHtml;
      listEl.appendChild(a);
    });
    renderPagination();
  }

  function renderPagination(){
    const container = $('#pagination');
    if (!container) return;
    const total = Math.ceil(filtered.length / pageSize) || 1;
    container.innerHTML = '';
    for(let i=1;i<=total;i++){
      const btn = document.createElement('button'); btn.textContent = i; btn.className='button';
      if (i === currentPage) btn.style.opacity = '0.6';
      btn.addEventListener('click', ()=> renderPage(i));
      container.appendChild(btn);
    }
  }

  search && search.addEventListener('input', (e)=>{
    const q = (e.target.value||'').toLowerCase().trim();
    if (!q) filtered = all.slice();
    else filtered = all.filter(d => (d.title||'').toLowerCase().includes(q) || (d.scripture_reference||'').toLowerCase().includes(q));
    renderPage(1);
  });

  // update user info when auth state changes (so badges/fab appear)
  onAuthStateChanged(auth, user => { refreshUserInfo(); });
}

// --- Ver devocional ---
async function initVer(){
  const id = getParam('id');
  if (!id) return;
  const spinner = $('#spinner');
  spinner && show(spinner);
  try {
    const docRef = doc(db,'devocionales', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()){ $('#devocional').innerHTML = '<p>Devocional no encontrado.</p>'; return; }
    const d = snap.data();
    if (!d.published){ $('#devocional').innerHTML = '<p>Este devocional no está publicado.</p>'; }
    $('#title').textContent = d.title || '';
    $('#meta').textContent = formatDate(d.date) || '';
    $('#author').textContent = d.author ? `Autor: ${d.author}` : '';
    $('#scripture').innerHTML = `<strong>${d.scripture_reference||''}</strong><div style="margin-top:6px">${d.scripture_text||''}</div>`;
    if (d.image_url) $('#image').innerHTML = `<img src="${d.image_url}" alt=""/>`;
    $('#body').innerHTML = d.body || '';

    // mark as read (auto + manual). Uses client Timestamp.now() inside arrayUnion to avoid serverTimestamp sentinel errors.
    async function markAsRead(){
      if (!auth.currentUser) return; // logged-out users handled elsewhere
      try{
        const userRef = doc(db,'users', auth.currentUser.uid);
        // don't duplicate: check if already present
        const udoc = await getDoc(userRef);
        if (udoc.exists()){
          const hist = udoc.data().readingHistory || [];
          if (hist.find(h=> h && h.devotionalId === id)) return; // already marked
        }
        await updateDoc(userRef, { readingHistory: arrayUnion({ devotionalId: id, title: d.title||'', dateRead: Timestamp.now() }) });
        const mr = $('#mark-read'); if (mr) { mr.textContent = 'Leído'; mr.classList.add('button--muted'); }
      }catch(err){ console.error('markAsRead error', err); }
    }

    $('#mark-read') && $('#mark-read').addEventListener('click', async ()=>{
      if (!auth.currentUser){
        if (confirm('Debes iniciar sesión para marcar como leído. ¿Ir a iniciar sesión?')){
          location.href = `login.html?next=${encodeURIComponent(location.href)}`;
        }
        return;
      }
      await markAsRead();
    });

    // Auto mark when the user is signed in
    if (auth.currentUser){ markAsRead().catch(e=> console.debug('auto mark error', e)); }

    // share
    $('#share') && $('#share').addEventListener('click', ()=>{
      navigator.clipboard && navigator.clipboard.writeText(location.href).then(()=> alert('Enlace copiado al portapapeles')); 
    });

    // prev/next navigation
    const allSnap = await getDocs(query(collection(db,'devocionales'), where('published','==', true), orderBy('date','desc')));
    const arr = allSnap.docs.map(s => ({ id: s.id, ...s.data() }));
    const idx = arr.findIndex(x => x.id === id);
    const nav = $('#nav-prevnext');
    if (nav){
      nav.innerHTML = '';
      if (idx > 0) nav.appendChild(linkTo(arr[idx-1], 'Anterior'));
      if (idx < arr.length-1) nav.appendChild(linkTo(arr[idx+1], 'Siguiente'));
    }

    // --- Notes: load and autosave per-user notes under users/{uid}/notes/{devotionalId}
    const noteEditor = $('#note-editor');
    const noteStatus = $('#note-status');
    const saveBtn = $('#save-note');
    let noteSaveTimer = null;

    async function loadNoteForUser(){
      if (!noteEditor) return;
      noteEditor.disabled = true;
      if (!auth.currentUser){
        noteEditor.placeholder = 'Inicia sesión para guardar notas personales.';
        noteEditor.value = localStorage.getItem(`note_${id}`) || '';
        if (noteStatus) noteStatus.textContent = 'Inicia sesión para sincronizar notas';
        noteEditor.disabled = false;
        return;
      }
      try{
        const noteRef = doc(db, 'users', auth.currentUser.uid, 'notes', id);
        const s = await getDoc(noteRef);
        if (s.exists()){
          noteEditor.value = s.data().content || '';
          const updated = s.data().updatedAt;
          if (noteStatus) noteStatus.textContent = updated ? `Guardado ${formatDate(updated)}` : 'Guardado';
        } else {
          noteEditor.value = localStorage.getItem(`note_${id}`) || '';
          if (noteStatus) noteStatus.textContent = 'Sin guardado';
        }
      } catch(err){ console.error('loadNote error', err); if (noteStatus) noteStatus.textContent = 'Error al cargar nota'; }
      finally{ noteEditor.disabled = false; }
    }

    function scheduleSaveNote(){
      if (!noteEditor) return;
      if (noteStatus) noteStatus.textContent = 'Escribiendo...';
      if (noteSaveTimer) clearTimeout(noteSaveTimer);
      noteSaveTimer = setTimeout(()=> saveNote(false), 1500);
    }

    async function saveNote(manual){
      if (!noteEditor) return;
      if (!auth.currentUser){
        // fallback: keep local copy and prompt to login
        localStorage.setItem(`note_${id}`, noteEditor.value || '');
        if (noteStatus) noteStatus.textContent = manual ? 'Guardado localmente (inicia sesión para sincronizar)' : 'Guardado localmente';
        return;
      }
      try{
        if (noteStatus) noteStatus.textContent = 'Guardando...';
        const noteRef = doc(db, 'users', auth.currentUser.uid, 'notes', id);
        await setDoc(noteRef, { devotionalId: id, content: noteEditor.value || '', updatedAt: serverTimestamp() }, { merge: true });
        // refresh saved timestamp
        const saved = await getDoc(noteRef);
        const updated = saved.exists() ? saved.data().updatedAt : null;
        if (noteStatus) noteStatus.textContent = updated ? `Guardado ${formatDate(updated)}` : 'Guardado';
        localStorage.removeItem(`note_${id}`);
      } catch(err){ console.error('saveNote error', err); if (noteStatus) noteStatus.textContent = 'Error al guardar'; }
    }

    if (noteEditor){ noteEditor.addEventListener('input', scheduleSaveNote); }
    if (saveBtn){ saveBtn.addEventListener('click', ()=> saveNote(true)); }
    // refresh notes when auth state changes
    onAuthStateChanged(auth, ()=> loadNoteForUser());
    // initial load
    await loadNoteForUser();
    // if opened with #notas, focus editor
    if (location.hash && location.hash.includes('notas')){ try{ noteEditor && noteEditor.focus(); }catch(e){} }

  } catch (e){ console.error('initVer error', e); $('#devocional').innerHTML = `<p class="muted">Error al cargar el devocional: ${e.message || e}</p>`; }
  spinner && hide(spinner);

  function linkTo(item, text){ const a = document.createElement('a'); a.href = `ver.html?id=${item.id}`; a.textContent = text + ': ' + (item.title||''); a.className='button'; a.style.marginRight='8px'; return a; }
}

// --- Login / Register ---
function initLogin(){
  const loginForm = $('#login-form');
  const registerForm = $('#register-form');
  const showRegisterLink = $('#link-show-register');
  const showLoginLink = $('#link-show-login');

  // Show register form when user clicks the inline link
  showRegisterLink && showRegisterLink.addEventListener('click', (e)=>{ e.preventDefault(); hide(loginForm); show(registerForm); });
  showLoginLink && showLoginLink.addEventListener('click', (e)=>{ e.preventDefault(); show(loginForm); hide(registerForm); });

  $('#login-btn') && $('#login-btn').addEventListener('click', async ()=>{
    const email = $('#login-email').value; const password = $('#login-password').value;
    try { await signInWithEmailAndPassword(auth, email, password); const next = getParam('next') || 'perfil.html'; location.href = next; } catch (e){ alert('Error al iniciar sesión: '+(e.message||e)); }
  });

  $('#register-btn') && $('#register-btn').addEventListener('click', async ()=>{
    const name = $('#reg-name').value; const email = $('#reg-email').value; const password = $('#reg-password').value;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db,'users', cred.user.uid), { name, email, role: 'member', createdAt: serverTimestamp(), readingHistory: [] });
      const next = getParam('next') || 'perfil.html'; location.href = next;
    } catch (e){ alert('Error al crear cuenta: '+(e.message||e)); }
  });

  $('#forgot') && $('#forgot').addEventListener('click', async (e)=>{
    e.preventDefault(); const email = $('#login-email').value; if (!email) return alert('Ingresa tu correo para reestablecer.');
    try { await sendPasswordResetEmail(auth,email); alert('Correo de recuperación enviado.'); } catch (err){ alert('Error: '+(err.message||err)); }
  });
}

// --- Perfil ---
async function initPerfil(){
  onAuthStateChanged(auth, async user=>{
    if (!user){ location.href = `login.html?next=${encodeURIComponent(location.href)}`; return; }
    try {
      const uDoc = await getDoc(doc(db,'users', user.uid));
      const data = uDoc.exists() ? uDoc.data() : { name: user.displayName||'', email: user.email, createdAt: null, readingHistory: [] };

      // Profile header (name, email, since, avatar)
      const nameEl = $('#profile-title'); const emailEl = $('#profile-email'); const sinceEl = $('#profile-since'); const avatarEl = $('#avatar');
      if (nameEl) nameEl.textContent = data.name || user.displayName || '';
      if (emailEl) emailEl.textContent = data.email || user.email || '';
      if (sinceEl) sinceEl.textContent = `Miembro desde: ${formatDate(data.createdAt)}`;
      if (avatarEl){
        const initials = ((data.name||user.displayName||user.email||'').split(/\s+/).map(p=>p[0]).slice(0,2).join('')||'U').toUpperCase();
        avatarEl.textContent = initials;
      }

      // Stats
      const totalRead = (data.readingHistory||[]).length;
      const streak = calcStreak(data.readingHistory||[]);
      const now = new Date(); const weekAgo = new Date(now); weekAgo.setDate(now.getDate()-6);
      const readsThisWeek = (data.readingHistory||[]).filter(h=>{
        try{ const d = h.dateRead && h.dateRead.toDate ? h.dateRead.toDate() : new Date(h.dateRead); return d >= weekAgo; }catch(e){ return false }
      }).length;
      const statRead = $('#stat-read'); const statStreak = $('#stat-streak'); const statWeek = $('#stat-week');
      if (statRead) statRead.textContent = String(totalRead);
      if (statStreak) statStreak.textContent = String(streak);
      if (statWeek) statWeek.textContent = String(readsThisWeek);

      // Continue reading (last read)
      const continueEl = $('#continue');
      if (data.readingHistory && data.readingHistory.length>0){
        const sorted = (data.readingHistory||[]).slice().sort((a,b)=> (b.dateRead && b.dateRead.seconds? b.dateRead.seconds:0) - (a.dateRead && a.dateRead.seconds? a.dateRead.seconds:0));
        const lastItem = sorted[0];
        if (continueEl){
          continueEl.classList.remove('hidden');
          continueEl.innerHTML = `<div class="continue-card"><div class="label">CONTINUAR LEYENDO</div><h4>${(lastItem.title||'Devocional')}</h4><a href="ver.html?id=${lastItem.devotionalId}">→ Leer ahora</a></div>`;
        }
      } else { if (continueEl) { continueEl.classList.add('hidden'); continueEl.innerHTML = ''; } }

      // History list — fetch scripture refs for better display (best-effort)
      const historyEl = $('#history');
      historyEl && (historyEl.innerHTML = '');
      const sortedAll = (data.readingHistory||[]).slice().sort((a,b)=> (b.dateRead && b.dateRead.seconds? b.dateRead.seconds:0) - (a.dateRead && a.dateRead.seconds? a.dateRead.seconds:0));
      if (!sortedAll || sortedAll.length===0){ if (historyEl) historyEl.innerHTML = '<div class="muted">No hay historial.</div>'; }
      else {
        const histPromises = sortedAll.map(async h => {
          let refText = '';
          try{ const s = await getDoc(doc(db,'devocionales', h.devotionalId)); if (s.exists()) refText = s.data().scripture_reference || ''; }catch(e){}
          return { h, refText };
        });
        const histData = await Promise.all(histPromises);
        histData.forEach(item => {
          const h = item.h; const refText = item.refText || '';
          const row = document.createElement('div'); row.className = 'card-row';
          row.innerHTML = `<div class="meta">${formatDate(h.dateRead)}</div><div class="title">${refText? `<div class="muted-ref" style="color:var(--devo-accent);font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${refText}</div>`: ''}<a href="ver.html?id=${h.devotionalId}">${h.title||'Devocional'}</a></div><div class="cta">→</div>`;
          if (historyEl) {
            historyEl.appendChild(row);
            const a = row.querySelector('a');
            if (a) row.addEventListener('click', (ev)=>{ if (ev.target && ev.target.tagName && ev.target.tagName.toLowerCase()==='a') return; window.location = a.href; });
          }
        });
      }

      // Notes (users/{uid}/notes)
      try{
        const notesEl = $('#notes');
        if (notesEl){
          notesEl.innerHTML = 'Cargando notas...';
          const notesSnap = await getDocs(collection(db, 'users', user.uid, 'notes'));
          if (!notesSnap || notesSnap.empty){ notesEl.innerHTML = '<div class="muted">Aún no tienes notas guardadas. Puedes añadir notas mientras lees un devocional.</div>'; }
          else{
            const noteDocs = notesSnap.docs.map(d=> ({ id: d.id, ...d.data() }));
            const titlePromises = noteDocs.map(n => getDoc(doc(db,'devocionales', n.id)).then(s=> s.exists()? s.data().title : '').catch(()=> ''));
            const titles = await Promise.all(titlePromises);
            notesEl.innerHTML = '';
            noteDocs.forEach((n,i)=>{
              const row = document.createElement('div'); row.className='card-row';
              const snippet = (n.content||'').slice(0,60);
              row.innerHTML = `<div class="meta">${formatDate(n.updatedAt)}</div><div class="title"><a href="ver.html?id=${n.id}#notas">${titles[i] || 'Devocional'}</a><div class="muted" style="margin-top:6px">${snippet}${(n.content||'').length>60? '…':''}</div></div><div class="cta">→</div>`;
              notesEl.appendChild(row);
              const a = row.querySelector('a');
              if (a) row.addEventListener('click', (ev)=>{ if (ev.target && ev.target.tagName && ev.target.tagName.toLowerCase()==='a') return; window.location = a.href; });
            });
          }
        }
      } catch(err){ console.error('load notes error', err); const ne = $('#notes'); if (ne) ne.innerHTML = '<div class="muted">Error al cargar notas.</div>'; }

      $('#logout') && $('#logout').addEventListener('click', async ()=>{ await signOut(auth); location.href='index.html'; });
    } catch (e){ console.error(e); }
  });

  function calcStreak(history){
    if (!history || history.length===0) return 0;
    const days = new Set(history.map(h=>{
      const d = h.dateRead && h.dateRead.toDate ? h.dateRead.toDate() : new Date(h.dateRead);
      return d.toISOString().slice(0,10);
    }));
    let count = 0; let d = new Date();
    while (days.has(d.toISOString().slice(0,10))){ count++; d.setDate(d.getDate()-1); }
    return count;
  }
}

// --- Admin panel ---
async function initAdmin(){
  const statusEl = document.getElementById('admin-status');
  function setAdminStatus(msg, variant = 'neutral'){
    if (!statusEl) return;
    statusEl.classList.remove('admin-status--ok','admin-status--warn','admin-status--error','admin-status--neutral');
    statusEl.classList.add('admin-status--' + variant);
    statusEl.innerHTML = msg;
  }

  // Verify admin
  onAuthStateChanged(auth, async user=>{
    if (!user) return location.href = `login.html?next=${encodeURIComponent(location.href)}`;
    try{
      const uDoc = await getDoc(doc(db,'users', user.uid));
      const role = uDoc.exists() ? uDoc.data().role : null;
      console.debug('initAdmin: uid, role', user.uid, role, uDoc.exists() ? uDoc.data() : null);
      setAdminStatus(`<div><strong>Usuario:</strong> <span class="admin-uid">${user.uid}</span></div><div class="muted">role: ${role || 'no definido'}</div>`, role === 'admin' ? 'ok' : 'warn');

      if (role !== 'admin'){
        // delay redirect so the admin-status is visible for debugging
        setAdminStatus(`<div><strong>Usuario:</strong> <span class="admin-uid">${user.uid}</span></div><div class="muted">role: ${role || 'no definido'} — Necesitas role: "admin". Serás redirigido.</div>`, 'warn');
        setTimeout(()=> location.href = `login.html?next=${encodeURIComponent(location.href)}`, 2200);
        return;
      }

      // load list
      await loadAdminList();

      // handlers
      $('#save').addEventListener('click', saveDevotional);
      $('#clear').addEventListener('click', ()=>{ document.getElementById('dev-form').reset(); $('#editingId').value=''; });
    } catch (e){ console.error(e); setAdminStatus('Error al verificar permisos: ' + (e.message||e), 'error'); }
  });

  async function loadAdminList(){
    const list = $('#admin-list'); list.innerHTML = 'Cargando...';
    const snap = await getDocs(query(collection(db,'devocionales'), orderBy('date','desc')));
    const items = snap.docs.map(s=>({ id: s.id, ...s.data() }));
    if (items.length===0){ list.innerHTML = '<div class="muted">No hay devocionales.</div>'; return; }
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>Título</th><th>Fecha</th><th>Publicado</th><th>Acciones</th></tr></thead>`;
    const tb = document.createElement('tbody');
    items.forEach(it=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${it.title||''}</td><td>${formatDate(it.date)}</td><td>${it.published? 'Sí':'No'}</td><td></td>`;
      const actions = tr.querySelector('td:last-child');
      const editBtn = document.createElement('button'); editBtn.textContent='Editar'; editBtn.className='button button--secondary'; editBtn.addEventListener('click', ()=> fillFormForEdit(it));
      const toggleBtn = document.createElement('button'); toggleBtn.textContent = it.published? 'Despublicar':'Publicar'; toggleBtn.className = 'button'; toggleBtn.addEventListener('click', ()=> togglePublished(it.id, !it.published));
      const delBtn = document.createElement('button'); delBtn.textContent='Eliminar'; delBtn.className='button button--danger'; delBtn.addEventListener('click', ()=> deleteDevotional(it.id));
      actions.appendChild(editBtn); actions.appendChild(toggleBtn); actions.appendChild(delBtn);
      tb.appendChild(tr);
    });
    table.appendChild(tb); list.innerHTML=''; list.appendChild(table);
  }

  function fillFormForEdit(it){
    $('#editingId').value = it.id; $('#title').value = it.title||''; $('#date').value = it.date ? (it.date.toDate? it.date.toDate().toISOString().slice(0,10): new Date(it.date).toISOString().slice(0,10)) : '';
    $('#ref').value = it.scripture_reference||''; $('#scripture_text').value = it.scripture_text||''; $('#body').value = it.body||''; $('#published').value = it.published? 'true':'false';
    window.__currentImageUrl = it.image_url||'';
  }

  async function saveDevotional(){
    const statusEl = $('#admin-status');
    const saveBtn = $('#save');
    const id = $('#editingId').value;
    const title = $('#title').value;
    const dateVal = $('#date').value;
    const refText = $('#ref').value;
    const scripture_text = $('#scripture_text').value;
    const body = $('#body').value;
    const published = $('#published').value === 'true';
    const file = $('#image').files && $('#image').files[0];
    let imageUrl = window.__currentImageUrl || '';

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }
    setAdminStatus('Guardando devocional...', 'neutral');

    try{
      console.log('saveDevotional starting', { id, title });
      if (file){
        const r = sRef(storage, `devocionales_images/${Date.now()}_${file.name}`);
        await uploadBytes(r, file);
        imageUrl = await getDownloadURL(r);
        console.log('Imagen subida', imageUrl);
      }

      const payload = { title, date: Timestamp.fromDate(new Date(dateVal || Date.now())), scripture_reference: refText, scripture_text, body, image_url: imageUrl, author: 'Pastor', published };
      if (id){
        await updateDoc(doc(db,'devocionales', id), payload);
        setAdminStatus('Devocional actualizado.', 'ok');
        console.log('Devocional actualizado', id);
      } else {
        const newRef = await addDoc(collection(db,'devocionales'), payload);
        setAdminStatus('Devocional creado.', 'ok');
        console.log('Devocional creado', newRef.id);
      }

      document.getElementById('dev-form').reset(); window.__currentImageUrl = '';
      await loadAdminList();
    } catch (e){
      console.error('Error saving devotional', e);
      setAdminStatus('Error al guardar: ' + (e.message || e), 'error');
      alert('Error al guardar devocional: ' + (e.message || e));
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Publicar / Guardar'; }
    }
  }

  async function deleteDevotional(id){ if (!confirm('¿Eliminar este devocional?')) return; try{ await deleteDoc(doc(db,'devocionales', id)); alert('Eliminado.'); await loadAdminList(); }catch(e){console.error(e); alert('Error al eliminar.');} }

  async function togglePublished(id, want){ try{ await updateDoc(doc(db,'devocionales', id), { published: want }); await loadAdminList(); } catch(e){ console.error(e); alert('Error.'); } }
}

// Auto-init based on page
document.addEventListener('DOMContentLoaded', ()=>{
  try{ if (document.getElementById('list')) initIndex(); } catch(e){}
  try{ if (document.getElementById('devocional')) initVer(); } catch(e){}
  try{ if (document.getElementById('login-form') || document.getElementById('register-form')) initLogin(); } catch(e){}
  try{ if (document.getElementById('profile')) initPerfil(); } catch(e){}
  try{ if (document.getElementById('admin-panel')) initAdmin(); } catch(e){}
});
