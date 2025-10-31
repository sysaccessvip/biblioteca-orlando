/**
 * script.js — Plantilla de arranque (sin lógica del reproductor)
 * - Aquí puedes pegar tu código JS completamente distinto.
 * - Incluye utilidades: carga dinámica de scripts/estilos, bus simple y helpers SW.
 */

/* ========== UTILIDADES ========== */

// Namespace global para acceder desde consola
window._app = window._app || {};
const APP = window._app;

// Cargar script dinámicamente (útil para módulos grandes)
APP.loadScript = function(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    if (opts.module) s.type = 'module';
    if (opts.defer) s.defer = true;
    s.async = !!opts.async;
    s.onload = () => resolve(s);
    s.onerror = (e) => reject(e);
    document.body.appendChild(s);
  });
};

// Cargar CSS dinámicamente
APP.loadCSS = function(url) {
  return new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url;
    l.onload = () => resolve(l);
    l.onerror = (e) => reject(e);
    document.head.appendChild(l);
  });
};

// Bus simple de eventos para desacoplar módulos
APP.bus = (function() {
  const map = new Map();
  return {
    on: (ev, fn) => { (map.get(ev) || map.set(ev,[])).get ? null : null; (map.get(ev) || map.set(ev,[])); map.get(ev).push(fn); },
    off: (ev, fn) => { const arr = map.get(ev) || []; map.set(ev, arr.filter(x=>x!==fn)); },
    emit: (ev, data) => { (map.get(ev) || []).slice().forEach(fn => { try{ fn(data); }catch(e){ console.warn('bus handler', e); } }); }
  };
})();

/* ========== SERVICE WORKER HELPERS ========== */

APP.sendToSW = async function(msg) {
  if(!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return null;
  return new Promise((resolve) => {
    const msgChan = new MessageChannel();
    msgChan.port1.onmessage = (ev) => resolve(ev.data);
    navigator.serviceWorker.controller.postMessage(msg, [msgChan.port2]);
  });
};

// Ejemplos:
// APP.sendToSW({type:'CACHE_URLS', payload:['/ruta1','/ruta2']});
// APP.sendToSW({type:'CLEAR_CACHES'});

/* ========== STORAGE SIMPLE ==========
   Útil para guardar configuración/localState de tu otro código.
*/
APP.storage = {
  get: (k, fallback=null) => {
    try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : fallback; } catch(e){ return fallback; }
  },
  set: (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){ console.warn('storage set', e); }
  },
  remove: (k) => { localStorage.removeItem(k); }
};


  
  /*************************************************************************
   * CONFIGURACIÓN DE FIREBASE
   *************************************************************************/
  const firebaseConfig = {
    apiKey: "AIzaSyAWLCfA5lWgQ2p5oNfsUkycd4mFkigaNbM",
    authDomain: "app-music-982d2.firebaseapp.com",
    databaseURL: "https://app-music-982d2-default-rtdb.firebaseio.com",
    projectId: "app-music-982d2",
    storageBucket: "app-music-982d2.firebasestorage.app",
    messagingSenderId: "238209799386",
    appId: "1:238209799386:web:b30508c352a13204aac1e3",
    measurementId: "G-1DVGVZB5P5"
  };
  firebase.initializeApp(firebaseConfig);

  const db = firebase.database();
  const storage = firebase.storage();
  const auth = firebase.auth();

  // Mantener sesión en el navegador (persistencia LOCAL) — mejora la estabilidad del login entre recargas
try {
  // Firebase v8: auth es firebase.auth(); usamos la constante que ya creaste.
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e => {
    // no fatal, sólo lo logueamos
    console.warn('No se pudo establecer persistencia de auth:', e);
  });
} catch (e) {
  console.warn('setPersistence no disponible o falló:', e);
}


/*********************************************************
 * AUTH FLOW: Login por email/password + verificación admin
 * - 3 intentos, bloqueo 15 min
 * - toggle mostrar/ocultar contraseña
 *********************************************************/
/*********************************************************
 * AUTH FLOW (mejorado) — evita flash del overlay al recargar
 *********************************************************/
const LOGIN_KEY_DONE = 'lib_auth_done';
const LOGIN_KEY_ATTEMPTS = 'lib_login_attempts';
const LOGIN_KEY_LOCK_UNTIL = 'lib_login_lock_until';

let loginAttempts = Number(localStorage.getItem(LOGIN_KEY_ATTEMPTS) || 0);
let loginLockUntil = Number(localStorage.getItem(LOGIN_KEY_LOCK_UNTIL) || 0);

// indicador para saber que onAuthStateChanged ya se ejecutó al menos una vez
let authInitialized = false;

function isLoginLocked(){
  return loginLockUntil && Date.now() < loginLockUntil;
}

function updateLoginUiState(){
  const attemptsEl = document.getElementById('loginAttempts');
  const lockMsg = document.getElementById('loginLockMsg');
  const loginBtn = document.getElementById('loginBtn');

  if(attemptsEl) attemptsEl.textContent = `Intentos: ${loginAttempts} / 3`;
  if(isLoginLocked()){
    const remaining = Math.max(0, Math.ceil((loginLockUntil - Date.now())/1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    if(lockMsg) lockMsg.textContent = `Bloqueado: ${mins}m ${secs}s`;
    if(loginBtn) loginBtn.disabled = true;
    if(!updateLoginUiState._timer){
      updateLoginUiState._timer = setInterval(()=> {
        if(!isLoginLocked()){
          clearInterval(updateLoginUiState._timer);
          updateLoginUiState._timer = null;
          loginLockUntil = 0;
          localStorage.removeItem(LOGIN_KEY_LOCK_UNTIL);
          loginAttempts = 0;
          localStorage.removeItem(LOGIN_KEY_ATTEMPTS);
          updateLoginUiState();
        } else {
          const rem = Math.max(0, Math.ceil((loginLockUntil - Date.now())/1000));
          const m = Math.floor(rem/60); const s = rem%60;
          if(lockMsg) lockMsg.textContent = `Bloqueado: ${m}m ${s}s`;
        }
      }, 1000);
    }
  } else {
    if(lockMsg) lockMsg.textContent = '';
    if(loginBtn) loginBtn.disabled = false;
  }
}

function showLoginOverlay(){ 
  const o = document.getElementById('loginOverlay');
  if(o){ o.style.display = 'flex'; document.body.classList.add('no-scroll'); updateLoginUiState(); }
}
function hideLoginOverlay(){
  const o = document.getElementById('loginOverlay');
  if(o){ o.style.display = 'none'; document.body.classList.remove('no-scroll'); }
}

/* onAuthStateChanged: cuando Firebase informa, actuamos.
   IMPORTANTE: NO mostrar el overlay antes de que este callback sea llamado */
auth.onAuthStateChanged(async (user) => {
  authInitialized = true;
  try {
    if(user && user.uid){
      // verificar si es admin en Realtime DB
      const s = await db.ref('admins/' + user.uid).once('value');
      const isAdmin = !!s.val();
      if(isAdmin){
        // login valido; ocultar overlay y marcar como ya visto
        localStorage.setItem(LOGIN_KEY_DONE, user.uid);
        loginAttempts = 0;
        localStorage.removeItem(LOGIN_KEY_ATTEMPTS);
        hideLoginOverlay();
        showToast('Acceso concedido. Bienvenido.');
        return;
      } else {
        // autenticado pero no admin -> cerrar sesión y mostrar overlay
        try { await auth.signOut(); } catch(e){}
        localStorage.removeItem(LOGIN_KEY_DONE);
        showToast('Cuenta no autorizada (no es admin).');
        showLoginOverlay();
        return;
      }
    } else {
      // no autenticado (o sesión caducada) -> mostrar overlay para login
      showLoginOverlay();
    }
  } catch(e){
    console.warn('auth.onAuthStateChanged error', e);
    // en caso de error de DB, mostramos el overlay (mejor que dejar al usuario sin poder loguear)
    showLoginOverlay();
  }
});


// DOM ready: bind form y toggle password
document.addEventListener('DOMContentLoaded', ()=> {
  const form = document.getElementById('loginForm');
  const emailEl = document.getElementById('loginEmail');
  const pwdEl = document.getElementById('loginPassword');
  const toggleBtn = document.getElementById('togglePwdBtn');
  const eyeIcon = document.getElementById('eyeIcon');

  // Toggle mostrar / ocultar contraseña
  if(toggleBtn && pwdEl && eyeIcon){
    toggleBtn.addEventListener('click', () => {
      if(pwdEl.type === 'password'){
        pwdEl.type = 'text';
        toggleBtn.setAttribute('aria-label','Ocultar contraseña');
        // ojo tachado icon
        eyeIcon.innerHTML = `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><line x1="2" y1="2" x2="22" y2="22"></line>`;
      } else {
        pwdEl.type = 'password';
        toggleBtn.setAttribute('aria-label','Mostrar contraseña');
        eyeIcon.innerHTML = `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>`;
      }
      pwdEl.focus();
    });
  }

  if(form){
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if(isLoginLocked()){
        showToast('Bloqueado. Espera un momento.');
        updateLoginUiState();
        return;
      }

      const email = (emailEl?.value || '').trim();
      const password = (pwdEl?.value || '').trim();

      if(!email || !password){
        showToast('Ingresa correo y contraseña');
        return;
      }

      try {
        const res = await auth.signInWithEmailAndPassword(email, password);
        const uid = res.user.uid;
        // verificar admins
        const snap = await db.ref('admins/' + uid).once('value');
        if(snap && snap.val()){
          // admin OK
          localStorage.setItem(LOGIN_KEY_DONE, uid);
          loginAttempts = 0;
          localStorage.removeItem(LOGIN_KEY_ATTEMPTS);
          localStorage.removeItem(LOGIN_KEY_LOCK_UNTIL);
          hideLoginOverlay();
          showToast('Acceso concedido');
        } else {
          await auth.signOut();
          showToast('Cuenta válida pero no es administrador');
        }
        updateLoginUiState();
      } catch(err){
        console.warn('Login error', err);
        loginAttempts = Number(localStorage.getItem(LOGIN_KEY_ATTEMPTS) || 0) + 1;
        localStorage.setItem(LOGIN_KEY_ATTEMPTS, loginAttempts);
        if(loginAttempts >= 3){
          loginLockUntil = Date.now() + (15 * 60 * 1000); // 15 minutos
          localStorage.setItem(LOGIN_KEY_LOCK_UNTIL, loginLockUntil);
          showToast('Demasiados intentos. Bloqueado 15 minutos.');
        } else {
          showToast(`Credenciales incorrectas. Intento ${loginAttempts} de 3.`);
        }
        // refrescar UI
        loginLockUntil = Number(localStorage.getItem(LOGIN_KEY_LOCK_UNTIL) || 0);
        updateLoginUiState();
      }
    });
  }

  // Si no hay sesión activa, mostrar overlay (onAuthStateChanged también lo hace)
  // Evitar flash del overlay: NO mostramos el overlay inmediatamente.
  // onAuthStateChanged se encargará de mostrarlo/ocultarlo cuando Firebase esté listo.
  // Añadimos un fallback: si onAuthStateChanged no se dispara en X ms,
  // mostramos el overlay *solo* si no había un login previo guardado (para evitar flash).
  (function waitForAuthInitFallback(){
    const doneUid = localStorage.getItem(LOGIN_KEY_DONE);
    const maxWaitMs = 5000; // tiempo máximo de espera antes de fallback (5s)
    const start = Date.now();

    // Si onAuthStateChanged ya corrió (authInitialized = true), no hacemos nada.
    if(authInitialized) return;

    const checker = setInterval(() => {
      if(authInitialized){
        clearInterval(checker);
        return;
      }
      // si pasó el tiempo máximo:
      if(Date.now() - start > maxWaitMs){
        clearInterval(checker);
        // Si previamente guardamos que el usuario ya inició sesión en este dispositivo,
        // NO mostramos el overlay para evitar el flash (onAuthStateChanged llegará pronto).
        if(doneUid){
          console.debug('Auth init lento, pero existe LOGIN_KEY_DONE -> no mostrar overlay para evitar flash');
          return;
        }
        // Si no hay marca de login previo, mostramos overlay (usuario probablemente no autenticado)
        showLoginOverlay();
      }
    }, 250);
  })();

});


  // DEFAULT COVER (imagen por defecto si no se encuentra portada)
  const DEFAULT_COVER_URL = 'https://via.placeholder.com/280x400?text=Sin+portada';

  // Variable para almacenar portada detectada por ISBN (OpenLibrary / Google Books)
  window.detectedCoverUrl = null;

  /*************************************************************************
   * UTILIDADES UI
   *************************************************************************/
  function showToast(msg, timeout = 2400){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    if(t._timer) clearTimeout(t._timer);
    t._timer = setTimeout(()=> { t.classList.remove('show'); }, timeout);
  }

  function showConfirm(message, onYes){
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmText').textContent = message;
    modal.style.display = 'flex';
    function cleanup(){
      modal.style.display = 'none';
      yesBtn.removeEventListener('click', yesHandler);
      noBtn.removeEventListener('click', noHandler);
    }
    const yesBtn = document.getElementById('confirmYesBtn');
    const noBtn = document.getElementById('confirmNoBtn');
    function yesHandler(){ cleanup(); if(typeof onYes === 'function') onYes(); }
    function noHandler(){ cleanup(); }
    yesBtn.addEventListener('click', yesHandler);
    noBtn.addEventListener('click', noHandler);
  }

  /*************************************************************************
   * Estado app
   *************************************************************************/
  let currentSection = 'home';
  let booksCache = [];
  let filteredBooks = [];
  let currentPage = 1;
  let perPage = parseInt(document.getElementById('perPageSelect').value || 12);
  // Nuevo: control de edición
  let editingBookId = null;

  // --- BIND: búsqueda en la sección LIBRARY ---
  (function bindLibrarySearch(){
    const filterInputEl = document.getElementById('filterInput');
    const clearFilterBtnEl = document.getElementById('clearFilterBtn');

    if(filterInputEl){
      filterInputEl.addEventListener('input', () => {
        applyFilter();
      });
      filterInputEl.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') {
          e.preventDefault();
          applyFilter();
        }
      });
    }

    if(clearFilterBtnEl){
      clearFilterBtnEl.addEventListener('click', () => {
        clearFilter();
        filterInputEl?.focus();
      });
    }
  })();

  /*************************************************************************
   * Perfil (localStorage)
   *************************************************************************/
  function loadProfile(){
    const name = localStorage.getItem('lib_profile_name') || '';
    const photo = localStorage.getItem('lib_profile_photo') || '';
    const titleEl = document.getElementById('appTitle');
    const avatarImg = document.getElementById('topAvatarImg');

    if(name){
      titleEl.textContent = name;
      document.getElementById('welcomeTitle').textContent = `Bienvenido, ${name}`;
      document.getElementById('profileName').value = name;
    } else {
      titleEl.textContent = 'Mi Biblioteca';
      document.getElementById('welcomeTitle').textContent = 'Bienvenido a tu biblioteca';
      document.getElementById('profileName').value = '';
    }
    if(photo){
      avatarImg.src = photo;
      avatarImg.style.display = 'block';
    } else {
      avatarImg.style.display = 'none';
      avatarImg.src = '';
    }
  }

  function saveProfile(){
    const name = document.getElementById('profileName').value.trim();
    const file = document.getElementById('profilePhoto').files[0];
    if(file){
      const reader = new FileReader();
      reader.onload = function(e){
        localStorage.setItem('lib_profile_photo', e.target.result);
        if(name) localStorage.setItem('lib_profile_name', name);
        loadProfile();
        showToast('Perfil guardado');
      };
      reader.readAsDataURL(file);
    } else {
      if(name) localStorage.setItem('lib_profile_name', name);
      loadProfile();
      showToast('Perfil guardado');
    }
  }
  function clearProfile(){
    localStorage.removeItem('lib_profile_name');
    localStorage.removeItem('lib_profile_photo');
    loadProfile();
    showToast('Perfil eliminado');
  }

  // -- Limpia el formulario de "Añadir libro" (incluye file inputs de forma fiable)
  function resetAddForm(){
    // campos texto / date / select
    const fields = ['title','authors','isbn','tags','description','manualIsbnInput','qrIsbnInput','readingStart','readingEnd','rating'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if(el) {
        if(el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
      }
    });



    
    // limpiar nuevos campos de páginas / progreso
    try {
      const t = document.getElementById('totalPages'); if(t) t.value = '';
      const c = document.getElementById('currentPage'); if(c) c.value = '';
      const f = document.getElementById('finishedReading'); if(f) f.checked = false;
    } catch(e){}

    // inputs tipo file (se reemplazan para asegurarnos de que quedan totalmente limpios)
    ['coverFile','bookFile','isbnImageInput','profilePhoto'].forEach(id => {
      const old = document.getElementById(id);
      if(!old) return;
      try {
        const clone = old.cloneNode(true);
        clone.value = '';
        old.parentNode.replaceChild(clone, old);
      } catch(e){
        try { old.value = ''; } catch(e2) {}
      }
    });


    // limpiar campo de URL de portada
try { const urlIn = document.getElementById('coverUrlInput'); if(urlIn) urlIn.value = ''; } catch(e){}


    // restablecer texto de ayuda u otros elementos puntuales
    const imageHelp = document.getElementById('imageHelp');
    if(imageHelp) imageHelp.textContent = 'Sube una foto del código ISBN (barra) o del QR para autocompletar.';
    // limpiar detected cover y preview
    window.detectedCoverUrl = null;
    try {
      const img = document.getElementById('coverPreviewImg');
      if (img) {
        img.src = '';
        img.style.display = 'none';
      }
    } catch (e) { /* ignore */ }

    // limpiar preview externo si existe
    try { const ext = document.getElementById('isbnExternalPreview'); if(ext) ext.style.display = 'none'; } catch(e){}

    // -------------------------
    // Reiniciar estado de edición
    editingBookId = null;
    const saveBtn = document.getElementById('saveBookBtn');
    if(saveBtn) { saveBtn.textContent = 'Guardar libro'; }
    // -------------------------
  }

  // --- Verificar duplicados (cache local + DB si hay ISBN) ---
  function normalizeIsbn(isbn){
    return (isbn || '').replace(/[^0-9xX]/g, '').toLowerCase();
  }
  function normalizeText(s){
    return (s || '').trim().toLowerCase();
  }

  async function checkDuplicate(isbn, title, authors){
    const nisbn = normalizeIsbn(isbn);
    const ntitle = normalizeText(title);
    const nauth = normalizeText(authors);

    // 1) Si hay ISBN: buscar en cache local por ISBN normalizado
    if(nisbn){
      const foundLocal = booksCache.find(b => normalizeIsbn(b.isbn) === nisbn);
      if(foundLocal) return { exists: true, reason: 'isbn', id: foundLocal.id };
      // 2) Verificar en la base de datos (remote) por exact match del campo isbn
      try {
        const snap = await db.ref('books').orderByChild('isbn').equalTo(isbn).once('value');
        const val = snap.val();
        if(val){
          const key = Object.keys(val)[0];
          return { exists: true, reason: 'isbn', id: key };
        }
      } catch(e){
        console.warn('checkDuplicate db error', e);
      }
    }

    // 3) Si no hay ISBN o no se encontró: comprobar por título+autor en cache local
    if(ntitle){
      const foundLocalTA = booksCache.find(b => normalizeText(b.title) === ntitle && normalizeText(b.authors) === nauth);
      if(foundLocalTA) return { exists: true, reason: 'title_author', id: foundLocalTA.id };
    }

    // no existe
    return { exists: false };
  }

  /*************************************************************************
   * openSection (declarada temprano)
   *************************************************************************/
  function openSection(name){
    currentSection = name;
    const sections = document.querySelectorAll('.section');
    sections.forEach(s => s.style.display = s.id === name ? 'block' : 'none');
    const bn = document.getElementById('bottomNav');
    if(bn){
      bn.querySelectorAll('.bn-item').forEach(it => it.classList.toggle('active', it.dataset.section === name));
    }
    if(name === 'library') renderBooksPage(1);
    else if(name === 'categories') buildCategories();
    document.body.classList.remove('no-scroll');
  }

  /*************************************************************************
   * Procesamiento de imagen subida (BarcodeDetector -> Quagga -> jsQR)
   *************************************************************************/
  function loadImageFromFile(file){
    return new Promise((resolve,reject)=>{
      const img = new Image();
      const reader = new FileReader();
      reader.onload = function(e){
        img.onload = ()=> resolve(img);
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function processUploadedIsbnImage(file){
    showToast('Procesando imagen...');
    // 1) BarcodeDetector (if available)
    try {
      if('BarcodeDetector' in window){
        try {
          const supported = await (new BarcodeDetector()).getSupportedFormats();
          const detector = new BarcodeDetector({ formats: supported });
          // create image bitmap to detect
          const bitmap = await createImageBitmap(file);
          const barcodes = await detector.detect(bitmap);
          if(barcodes && barcodes.length){
            const code = barcodes[0].rawValue || barcodes[0].displayValue;
            if(code){ onDetectedCode(String(code)); return; }
          }
        } catch(e){
          console.warn('BarcodeDetector error', e);
        }
      }
    } catch(e){ /* ignore */ }

    // 2) QuaggaJS fallback (great for EAN-13 barcodes/ISBN)
    try {
      const dataUrl = await new Promise((res, rej)=>{
        const fr = new FileReader();
        fr.onload = ()=> res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });

      if(window.Quagga){
        await new Promise((resolve, reject) => {
          try {
            Quagga.decodeSingle({
              src: dataUrl,
              numOfWorkers: 0,
              locate: true,
              inputStream: { size: 800 },
              decoder: { readers: ["ean_reader","ean_8_reader","code_128_reader","upc_reader"] }
            }, function(result){
              if(result && result.codeResult && result.codeResult.code){
                const code = result.codeResult.code;
                onDetectedCode(String(code));
                resolve(true);
              } else {
                resolve(false);
              }
            });
          } catch(err){
            console.warn('Quagga decode error', err);
            resolve(false);
          }
        }).then(found => {
          if(found) return;
        });
      }
    } catch(e){
      console.warn('Quagga fallback error', e);
    }

    // 3) jsQR fallback for QR codes
    try {
      const img = await loadImageFromFile(file);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      // scale down if huge
      const max = 1200;
      if(canvas.width > max){
        const ratio = max / canvas.width;
        canvas.width = Math.round(canvas.width * ratio);
        canvas.height = Math.round(canvas.height * ratio);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
      const qr = jsQR(imageData.data, canvas.width, canvas.height);
      if(qr && qr.data){
        onDetectedCode(qr.data);
        return;
      }
    } catch(e){
      console.warn('jsQR fallback error', e);
    }

    showToast('No se pudo detectar código en la imagen.');
  }

  /*************************************************************************
   * onDetectedCode / onIsbnDetected
   *************************************************************************/
  function onDetectedCode(code){
    console.log('Código detectado:', code);
    try {
      const url = new URL(code, location.href);
      const isbnParam = url.searchParams.get('isbn') || (url.hash && url.hash.includes('isbn=') ? url.hash.split('isbn=')[1] : null);
      const bookParam = url.searchParams.get('book') || (url.hash && url.hash.includes('book=') ? url.hash.split('book=')[1] : null);
      if(isbnParam) { onIsbnDetected(isbnParam); return; }
      if(bookParam) { showBookDetailById(bookParam); return; }
    } catch(e){}
    const digits = code.replace(/[^0-9Xx]/g,'');
    if(digits.length >= 10) { onIsbnDetected(digits); return; }
    showDetail({title:'Código detectado', raw:code}, true);
  }

  // variable global para ePub renderer
  window.currentRendition = null;
  window.currentBook = null;

  // Abre lector embebido (PDF/EPUB) o muestra info si no hay archivo
  async function openReader(bookId){
    if(!bookId) return showToast('ID inválido');
    try {
      const snap = await db.ref('books/' + bookId).once('value');
      const b = snap.val();
      if(!b) return showToast('Libro no encontrado');
      const fileUrl = b.fileUrl;
      if(!fileUrl){
        showDetail({bookId, ...b}, false, ()=>{});
        return;
      }

      const urlNoQuery = fileUrl.split('?')[0].toLowerCase();
      if(urlNoQuery.endsWith('.pdf')){
        renderPdf(fileUrl, b);
        return;
      } else if(urlNoQuery.endsWith('.epub') || urlNoQuery.endsWith('.epub3')){
        await renderEpub(fileUrl, b);
        return;
      } else {
        const ext = urlNoQuery.split('.').pop();
        if(['txt','html'].includes(ext)){
          const content = document.getElementById('detailContent');
          content.innerHTML = `<div class="reader-controls"><button class="reader-ghost" id="closeReaderBtn">Cerrar lector</button><div class="small muted">Visor: ${ext.toUpperCase()}</div></div>
            <iframe class="pdf-viewer" src="${fileUrl}" frameborder="0"></iframe>`;
          document.getElementById('detailModal').style.display = 'block';
          document.body.classList.add('no-scroll');
          document.getElementById('closeReaderBtn').addEventListener('click', ()=> { document.getElementById('detailModal').style.display='none'; document.body.classList.remove('no-scroll'); });
          return;
        }
        window.open(fileUrl, '_blank');
      }
    } catch(err){
      console.error('openReader error', err);
      showToast('Error abriendo el lector: ' + (err.message || err));
    }
  }

  // Busca en Google Books por ISBN y devuelve un objeto con datos útiles (si encuentra)
  async function fetchGoogleBooksByIsbn(isbn){
    try {
      if(!isbn) return null;
      const q = encodeURIComponent(`isbn:${isbn}`);
      const url = `https://www.googleapis.com/books/v1/volumes?q=${q}`;
      const res = await fetch(url);
      if(!res.ok) return null;
      const json = await res.json();
      if(!json || !json.items || !json.items.length) return null;

      const v = json.items[0].volumeInfo || {};
      const title = v.title || '';
      const authors = Array.isArray(v.authors) ? v.authors.join(', ') : (v.authors || '');
      const description = v.description || v.subtitle || '';
      let cover = null;
      if(v.imageLinks){
        cover = v.imageLinks.thumbnail || v.imageLinks.smallThumbnail || v.imageLinks.large || null;
        if(cover && cover.indexOf('http:') === 0) cover = cover.replace('http:', 'https:');
      }
      const pageCount = v.pageCount || null;

      return { title, authors, description, coverUrl: cover, pageCount, source: 'google' };
    } catch(e){
      console.warn('fetchGoogleBooksByIsbn error', e);
      return null;
    }
  }

  // Renderiza PDF embebido en el modal
  function renderPdf(url, bookMeta){
    const content = document.getElementById('detailContent');
    content.innerHTML = `
      <div class="reader-controls">
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="reader-ghost" id="closeReaderBtn">Cerrar lector</button>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700">${escapeHtml(bookMeta?.title || 'Documento')}</div>
          <div class="small muted">${escapeHtml(bookMeta?.authors || '')}</div>
        </div>
      </div>
      <object class="pdf-viewer" data="${url}" type="application/pdf" width="100%" height="80vh">
        <p>Tu navegador no puede mostrar el PDF. <a href="${url}" target="_blank">Abrir en nueva pestaña</a></p>
      </object>
    `;
    document.getElementById('detailModal').style.display = 'block';
    document.body.classList.add('no-scroll');
    document.getElementById('closeReaderBtn').addEventListener('click', ()=> {
      document.getElementById('detailModal').style.display = 'none';
      document.body.classList.remove('no-scroll');
    });
  }

  // Renderiza EPUB usando ePub.js
  async function renderEpub(url, bookMeta){
    const content = document.getElementById('detailContent');

    content.innerHTML = `
      <div class="reader-controls">
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="reader-ghost" id="prevPageBtn">Anterior</button>
          <button class="reader-ghost" id="nextPageBtn">Siguiente</button>
          <button class="reader-ghost" id="closeReaderBtn">Cerrar lector</button>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700">${escapeHtml(bookMeta?.title || 'EPUB')}</div>
          <div class="small muted">${escapeHtml(bookMeta?.authors || '')}</div>
        </div>
      </div>
      <div id="epubReader"></div>
    `;

    document.getElementById('detailModal').style.display = 'block';
    document.body.classList.add('no-scroll');

    try {
      if(window.currentRendition){ window.currentRendition.destroy(); window.currentRendition = null; window.currentBook = null; }
    } catch(e){ console.warn('destroy rendition', e); }

    try {
      const book = ePub(url);
      const rendition = book.renderTo("epubReader", {
        width: "100%",
        height: "80vh"
      });
      window.currentBook = book;
      window.currentRendition = rendition;
      await rendition.display();

      document.getElementById('prevPageBtn').addEventListener('click', ()=> {
        try{ window.currentRendition.prev(); } catch(e){ console.warn(e); }
      });
      document.getElementById('nextPageBtn').addEventListener('click', ()=> {
        try{ window.currentRendition.next(); } catch(e){ console.warn(e); }
      });
      document.getElementById('closeReaderBtn').addEventListener('click', ()=> {
        try { window.currentRendition.destroy(); window.currentRendition = null; window.currentBook = null; } catch(e){}
        document.getElementById('detailModal').style.display = 'none';
        document.body.classList.remove('no-scroll');
      });
    } catch(e){
      console.error('ePub render error', e);
      showToast('No fue posible cargar ePub en el lector. Se abrirá en nueva pestaña.');
      window.open(url, '_blank');
    }
  }

  async function onIsbnDetected(isbn){
    const clean = (isbn || '').replace(/[^0-9Xx]/g,'');
    document.getElementById('isbn').value = clean;
    // reset detected cover/pages
    window.detectedCoverUrl = null;
    try {
      document.getElementById('imageHelp').textContent = 'Buscando datos de libro...';

      // 1) Intentar OpenLibrary
      let gotSomething = false;
      try {
        const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`);
        const json = await res.json().catch(()=>null);
        const key = `ISBN:${clean}`;
        if(json && json[key]){
          const data = json[key];
          if(data.title) document.getElementById('title').value = data.title || '';
          if(data.authors) document.getElementById('authors').value = (data.authors ? data.authors.map(a=>a.name).join(', ') : '');
          if(data.notes || data.excerpts) document.getElementById('description').value = data.notes ? (typeof data.notes === 'string' ? data.notes : '') : (data.excerpts ? data.excerpts.map(e=>e.text).join('\n') : '');

if(data.number_of_pages){
  const tp = Number(data.number_of_pages);
  if(!Number.isNaN(tp) && tp > 0) {
    const totalIn = document.getElementById('totalPages');
    // SOLO rellenar si el campo está vacío (no sobrescribir edición del usuario)
    if(totalIn && !totalIn.value) totalIn.value = tp;
  }
}

          let olCover = (data.cover && (data.cover.large||data.cover.medium||data.cover.small)) || `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`;
          // Si OL devuelve algo, lo usamos como detectedCoverUrl (no forzamos default aquí)
          window.detectedCoverUrl = olCover;
          gotSomething = true;
        }
      } catch(e){ console.warn('OpenLibrary error', e); }

      // 2) Google Books (si hace falta info de pages o cover)
      try {
        const g = await fetchGoogleBooksByIsbn(clean);
        if(g){
          if(!document.getElementById('title').value && g.title) document.getElementById('title').value = g.title;
          if(!document.getElementById('authors').value && g.authors) document.getElementById('authors').value = g.authors;
          if(!document.getElementById('description').value && g.description) document.getElementById('description').value = g.description;
          if(g.coverUrl) window.detectedCoverUrl = window.detectedCoverUrl || g.coverUrl;

          if(g.pageCount){
            const totalIn = document.getElementById('totalPages');
            if(totalIn && !totalIn.value) totalIn.value = Number(g.pageCount);
          }
          gotSomething = true;
        }
      } catch(e){ console.warn('Google Books error', e); }

      try { const img = document.getElementById('coverPreviewImg'); if(img && window.detectedCoverUrl){ img.src = window.detectedCoverUrl; img.style.display='block'; } else if(img){ img.style.display='none'; } } catch(e){}

      openSection('add');
      if(!gotSomething){
        showToast('No se encontraron datos en OpenLibrary/Google. Completa manualmente.');
      } else {
        showToast('Datos autocompletados si estaban disponibles.');
      }

    } catch(e){
      console.warn(e);
      showToast('Error consultando datos externos: ' + (e.message || e));
      openSection('add');
    } finally {
      document.getElementById('imageHelp').textContent = 'Sube una foto del código ISBN (barra) o del QR para autocompletar.';
    }
  }

  // Helper: lee File -> dataURL (base64)
  function readFileAsDataURL(file){
    return new Promise((resolve, reject) => {
      if(!file) return resolve(null);
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = (e) => reject(e);
      fr.readAsDataURL(file);
    });
  }

  /*************************************************************************
   * Guardar libro en Firebase
   * - Si no se sube portada y no hay detectedCoverUrl ni OL, se guarda DEFAULT_COVER_URL
   *************************************************************************/
async function saveBook(){
  const saveBtn = document.getElementById('saveBookBtn');
  if(saveBtn && saveBtn.disabled) return;
  if(saveBtn){
    saveBtn.disabled = true;
    saveBtn._oldText = saveBtn.textContent;
    saveBtn.textContent = (editingBookId ? 'Guardando cambios...' : 'Guardando...');
  }

  try {
// Verificar que el usuario esté autenticado y sea admin antes de permitir escritura
if(!auth.currentUser || !auth.currentUser.uid){
  showToast('Debes iniciar sesión como administrador para guardar cambios.');
  if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = saveBtn._oldText || (editingBookId ? 'Guardar cambios' : 'Guardar libro'); }
  return;
}
const currentUid = auth.currentUser.uid;
const adminSnap = await db.ref('admins/' + currentUid).once('value');
if(!adminSnap.exists() || !adminSnap.val()){
  showToast('Tu cuenta no tiene permisos de administrador para guardar.');
  if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = saveBtn._oldText || (editingBookId ? 'Guardar cambios' : 'Guardar libro'); }
  return;
}


    const title = (document.getElementById('title')?.value || '').trim();
    const authors = (document.getElementById('authors')?.value || '').trim();
    const isbn = (document.getElementById('isbn')?.value || '').trim();
    const tagsRaw = (document.getElementById('tags')?.value || '').trim();
    const description = (document.getElementById('description')?.value || '').trim();
    const coverFile = document.getElementById('coverFile')?.files?.[0];
    const bookFile = document.getElementById('bookFile')?.files?.[0];

    const coverUrlInputVal = (document.getElementById('coverUrlInput')?.value || '').trim();

    const readingStart = document.getElementById('readingStart')?.value || '';
    const readingEnd = document.getElementById('readingEnd')?.value || '';
    const rating = document.getElementById('rating')?.value || '';

    const totalPagesVal = document.getElementById('totalPages')?.value || '';
    const currentPageVal = document.getElementById('currentPage')?.value || '';
    const finishedVal = !!document.getElementById('finishedReading')?.checked;

    if(!title && !isbn){
      showToast('Introduce al menos título o ISBN');
      if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = saveBtn._oldText || (editingBookId ? 'Guardar cambios' : 'Guardar libro'); }
      return;
    }

    try {
      const dup = await checkDuplicate(isbn, title, authors);
      if(dup.exists){
        if(!(editingBookId && dup.id && dup.id === editingBookId)){
          if(dup.reason === 'isbn') showToast('Este libro ya fue agregado (ISBN duplicado).');
          else showToast('Este libro ya fue agregado (título y autor coinciden).');
          if(dup.id) setTimeout(()=> showBookDetailById(dup.id), 300);
          if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = saveBtn._oldText || (editingBookId ? 'Guardar cambios' : 'Guardar libro'); }
          return;
        }
      }
    } catch(e){
      console.warn('checkDuplicate error', e);
    }

    // Datos comunes (no incluyen coverUrl/fileUrl)
    const data = {
      title: title || '',
      authors: authors || '',
      isbn: isbn || '',
      tags: tagsRaw ? tagsRaw.split(',').map(t=>t.trim()).filter(Boolean) : [],
      description: description || '',
      readingStart: readingStart || null,
      readingEnd: readingEnd || null,
      rating: rating || '',
      totalPages: totalPagesVal ? Number(totalPagesVal) : null,
      currentPage: currentPageVal ? Number(currentPageVal) : null,
      finishedReading: finishedVal
    };

    if(editingBookId){
      // --- MODO EDICIÓN ---
      const bookRef = db.ref('books/' + editingBookId);
      try {
        await bookRef.update(data);
      } catch(e){
        console.error('Error actualizando datos', e);
      }

      // PORTADA: prioridad archivo > URL pegada > detectedCoverUrl (si difiere) > no tocar
      if(coverFile){
        try {
          const coverDataUrl = await readFileAsDataURL(coverFile);
          if(coverDataUrl){
            await bookRef.update({ coverUrl: coverDataUrl, coverName: coverFile.name || null, coverType: coverFile.type || null });
          }
        } catch(e){ console.error('Error subiendo nueva portada', e); }
      } else if(coverUrlInputVal){
        try {
          await bookRef.update({ coverUrl: coverUrlInputVal, coverName: null, coverType: 'url' });
        } catch(e){ console.warn('Error guardando coverUrlInput', e); }
      } else if(window.detectedCoverUrl){
        try {
          const snap = await bookRef.once('value'); const existing = snap.val() || {};
          if(window.detectedCoverUrl && window.detectedCoverUrl !== existing.coverUrl){
            await bookRef.update({ coverUrl: window.detectedCoverUrl });
          }
        } catch(e){ console.warn('Error guardando detectedCoverUrl en edición', e); }
      }

      // archivo del libro
      if(bookFile){
        try {
          const fileDataUrl = await readFileAsDataURL(bookFile);
          if(fileDataUrl){
            await bookRef.update({ fileUrl: fileDataUrl, fileName: bookFile.name || null, fileType: bookFile.type || null });
          }
        } catch(e){
          console.error('Error subiendo nuevo archivo', e);
          showToast('Error al procesar el archivo del libro (revisa consola).');
        }
      }

      try { await bookRef.update({ updatedAt: Date.now() }); } catch(e){}

      showToast('Cambios guardados');
      editingBookId = null;
      if(saveBtn) saveBtn.textContent = saveBtn._oldText || 'Guardar libro';
      resetAddForm();
      loadBooks();
      openSection('library');

    } else {
      // --- NUEVO LIBRO ---
      try {
        const bookRef = db.ref('books').push();
        const bookId = bookRef.key;
        const newData = Object.assign({}, data, { createdAt: Date.now() });
        await bookRef.set(newData);

        // PORTADA: prioridad archivo > URL pegada > detectedCoverUrl > OL fallback
        if(coverFile){
          try {
            const coverDataUrl = await readFileAsDataURL(coverFile);
            if(coverDataUrl){
              await db.ref(`books/${bookId}`).update({ coverUrl: coverDataUrl, coverName: coverFile.name || null, coverType: coverFile.type || null });
            }
          } catch(e){ console.error('Error guardando cover file', e); }
        } else if(coverUrlInputVal){
          try { await db.ref(`books/${bookId}`).update({ coverUrl: coverUrlInputVal, coverName: null, coverType: 'url' }); } catch(e){ console.warn('Error guardando coverUrlInput', e); }
        } else if(window.detectedCoverUrl){
          try { await db.ref(`books/${bookId}`).update({ coverUrl: window.detectedCoverUrl }); } catch(e){ console.warn('Error guardando detectedCoverUrl', e); }
        } else if(isbn){
          try { const olUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`; await db.ref(`books/${bookId}`).update({ coverUrl: olUrl }); } catch(e){ console.warn('OL fallback error', e); }
        }

        // archivo del libro
        if(bookFile){
          try {
            const fileDataUrl = await readFileAsDataURL(bookFile);
            if(fileDataUrl){
              await db.ref(`books/${bookId}`).update({
                fileUrl: fileDataUrl,
                fileName: bookFile.name || null,
                fileType: bookFile.type || null
              });
            }
          } catch(errFile){
            console.error('Error leyendo archivo del libro a dataURL:', errFile);
            showToast('Error al procesar el archivo del libro (revisa consola).');
          }
        }

        // Generar enlace interno y guardar
        try {
          const appLink = `${location.origin}${location.pathname}#book=${bookId}`;
          await db.ref(`books/${bookId}`).update({ qrLink: appLink });
        } catch(e){ console.warn('qrLink write error', e); }

        showToast('Libro guardado');
        resetAddForm();
        await loadBooks(); // recargar caché/lista
        loadBooks();

        openSection('library');

      } catch(err){
        console.error('saveBook nuevo error', err);
        showToast('Error guardando libro: ' + (err && err.message ? err.message : err));
      }
    }

  } catch(err){
    console.error('saveBook global error', err);
    showToast('Error guardando libro: ' + (err && err.message ? err.message : err));
  } finally {
    if(saveBtn){
      saveBtn.disabled = false;
      saveBtn.textContent = saveBtn._oldText || (editingBookId ? 'Guardar cambios' : 'Guardar libro');
    }
  }
}

        setTimeout(()=> {
  try { showBookDetailById(bookId); } catch(e){ console.warn('showBookDetailById after save failed', e); }
}, 200);

  /*************************************************************************
   * Buscar por ISBN (Open Library)
   *************************************************************************/
  async function fetchByIsbn(){
    const isbnField = document.getElementById('isbn');
    const isbn = isbnField.value.trim();
    if(!isbn) { showToast('Introduce ISBN a buscar'); return; }
    onIsbnDetected(isbn);
  }

  /*************************************************************************
   * Cargar / listar libros (Realtime DB)
   *************************************************************************/
  async function loadBooks(){
    try {
      const snap = await db.ref('books').orderByChild('createdAt').once('value');
      const val = snap.val() || {};
      const arr = Object.keys(val).map(k => ({ id:k, ...val[k] }));
      arr.sort((a,b)=> (b.createdAt || 0) - (a.createdAt || 0));
      booksCache = arr;
      filteredBooks = arr.slice();
      document.getElementById('totalBooks').textContent = booksCache.length;
      renderRecent();
      renderBooksPage(1);
      buildCategories();
      loadProfile();


// si el usuario está viendo la sección POR-TERMINAR, actualizar su lista
if(currentSection === 'por-terminar'){
  try { renderPorTerminar(porTermPage || 1); } catch(e){ console.warn('renderPorTerminar update failed', e); }
}


// Si el usuario está viendo la sección POR-AÑO, actualizarla
if(currentSection === 'por-ano'){
  try {
    // forzar recálculo de años y render
    renderPorAnoSelector();
    renderPorAno(document.getElementById('porAnoSelect')?.value || '', porAnoPage || 1);
  } catch(e){ console.warn('Actualizar por-ano falló', e); }
}



    } catch(err){
      console.error('Error loading books', err);
    }
  }

  function renderRecent(){
    const recentDiv = document.getElementById('recentBooks');
    if(!recentDiv) return;
    recentDiv.innerHTML = '';

    const top = (booksCache || []).slice(0,5);

    top.forEach(b=>{
      const el = document.createElement('div');
      el.className = 'book';

      const ratingHtml = renderRatingBadge(b.rating);
      const progressHtml = formatProgressHtml(b);
      const datesLabel = (b.readingStart || b.readingEnd) ? `<div class="small muted">` +
        (b.readingStart ? `Inicio: ${escapeHtml(b.readingStart)}` : '') +
        (b.readingStart && b.readingEnd ? ' · ' : '') +
        (b.readingEnd ? `Fin: ${escapeHtml(b.readingEnd)}` : '') +
        `</div>` : '';

      const coverToShow = b.coverUrl || DEFAULT_COVER_URL;

      el.innerHTML = `
      <div class="cover">${coverToShow ? `<img src="${coverToShow}" alt="Portada" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" />` : '<div style="padding:6px;text-align:center">Portada</div>'}</div>
      <div class="meta" style="margin-top:8px;"><strong>${escapeHtml(b.title||'Sin título')}</strong></div>
      <div class="small muted" style="margin-top:4px">${escapeHtml((b.authors||'').split(',')[0]||'Autor desconocido')}</div>
      ${ratingHtml}
      ${progressHtml}
      ${datesLabel}
      <div class="card-actions">
        <button class="btn action-btn" title="Ver" aria-label="Ver libro" onclick="openBookDetail('${b.id}')">
          <!-- OJO SVG -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>

        <button class="ghost action-btn" title="QR" aria-label="Generar QR" onclick="generateQrFor('${b.id}')">
          <!-- QR SVG -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3"  y="3" width="6" height="6"></rect>
            <rect x="15" y="3" width="6" height="6"></rect>
            <rect x="3"  y="15" width="6" height="6"></rect>
            <path d="M15 15h4v4h-4z"></path>
            <path d="M11 3h2v2h-2zM11 7h2v2h-2zM7 11h2v2H7z"></path>
          </svg>
        </button>

        <button class="ghost action-btn" title="Editar" aria-label="Editar libro" onclick="openEditBook('${b.id}')">
          <!-- LÁPIZ SVG -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 21l3-1 11-11 1-3-3 1-11 11-1 3z"></path>
            <path d="M14 6l4 4"></path>
          </svg>
        </button>
      </div>
    `;

      recentDiv.appendChild(el);
    });
  }

  function renderBooksPage(page){
    currentPage = page;
    const start = (page-1)*perPage;
    const pageBooks = filteredBooks.slice(start, start+perPage);
    const container = document.getElementById('booksList');
    container.innerHTML = '';
    pageBooks.forEach(b=>{
      const el = document.createElement('div');
      el.className = 'book';
      const ratingHtml = renderRatingBadge(b.rating);
      const progressHtml = formatProgressHtml(b);
      const datesHtml = (b.readingStart || b.readingEnd) ? `<div class="small muted" style="margin-top:6px">` +
        (b.readingStart ? `Inicio: ${escapeHtml(b.readingStart)}` : '') +
        (b.readingStart && b.readingEnd ? ' · ' : '') +
        (b.readingEnd ? `Fin: ${escapeHtml(b.readingEnd)}` : '') +
        `</div>` : '';

      const coverToShow = b.coverUrl || DEFAULT_COVER_URL;

      el.innerHTML = `
      <div class="cover">${coverToShow ? `<img src="${coverToShow}" alt="Portada" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" />` : '<div style="padding:6px;text-align:center">Portada</div>'}</div>
      <div class="meta"><strong>${escapeHtml(b.title||'Sin título')}</strong></div>
      <div class="small muted">${escapeHtml(b.authors||'')}</div>
      <div class="tags">${(b.tags||[]).slice(0,3).map(t=>`<div class="tag">${escapeHtml(t)}</div>`).join('')}</div>
      ${ratingHtml}
      ${progressHtml}
      ${datesHtml}
      <div class="card-actions">
        <button class="btn action-btn" title="Ver" aria-label="Ver libro" onclick="openBookDetail('${b.id}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>

        <button class="ghost action-btn" title="QR" aria-label="Generar QR" onclick="generateQrFor('${b.id}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3"  y="3" width="6" height="6"></rect>
            <rect x="15" y="3" width="6" height="6"></rect>
            <rect x="3"  y="15" width="6" height="6"></rect>
            <path d="M15 15h4v4h-4z"></path>
            <path d="M11 3h2v2h-2zM11 7h2v2h-2zM7 11h2v2H7z"></path>
          </svg>
        </button>

        <button class="ghost action-btn" title="Editar" aria-label="Editar libro" onclick="openEditBook('${b.id}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 21l3-1 11-11 1-3-3 1-11 11-1 3z"></path>
            <path d="M14 6l4 4"></path>
          </svg>
        </button>
      </div>
    `;

      container.appendChild(el);
    });

    const totalPages = Math.max(1, Math.ceil(filteredBooks.length / perPage));
    const pag = document.getElementById('pagination');
    pag.innerHTML = '';
    for(let i=1;i<=totalPages;i++){
      const btn = document.createElement('button');
      btn.className = 'pager-btn' + (i===page ? ' active' : '');
      btn.textContent = i;
      btn.addEventListener('click', ()=> renderBooksPage(i));
      pag.appendChild(btn);
    }
  }

  /*************************************************************************
   * Filtrado y categorías
   *************************************************************************/
  function applyFilter(){
    const qRaw = document.getElementById('filterInput')?.value?.trim() || '';
    const q = qRaw.toLowerCase();

    if(!q){
      filteredBooks = booksCache.slice();
      renderBooksPage(1);
      return;
    }

    const digits = q.replace(/[^0-9x]/g, '');

    filteredBooks = booksCache.filter(b => {
      if(digits && digits.length >= 6){
        const bi = (b.isbn || '').toLowerCase().replace(/[^0-9x]/g, '');
        if(bi && bi.includes(digits)) return true;
      }
      if((b.title || '').toLowerCase().includes(q)) return true;
      if((b.authors || '').toLowerCase().includes(q)) return true;
      if((b.isbn || '').toLowerCase().includes(q)) return true;
      if((b.tags || []).join(' ').toLowerCase().includes(q)) return true;

      return false;
    });

    renderBooksPage(1);
  }

  function clearFilter(){ if(document.getElementById('filterInput')) document.getElementById('filterInput').value=''; filteredBooks = booksCache.slice(); renderBooksPage(1); }

  function buildCategories(){
    const tags = {};
    booksCache.forEach(b => (b.tags||[]).forEach(t => tags[t] = (tags[t]||0)+1));
    const list = document.getElementById('categoriesList');
    const datalist = document.getElementById('tagsList');
    if(datalist) datalist.innerHTML = '';
    if(list) list.innerHTML = '';
    Object.entries(tags).sort((a,b)=>b[1]-a[1]).forEach(([tag,count])=>{
      if(datalist){
        const opt = document.createElement('option');
        opt.value = tag;
        datalist.appendChild(opt);
      }
      if(list){
        const btn = document.createElement('button');
        btn.className = 'ghost';
        btn.style.margin = '6px';
        btn.textContent = `${tag} (${count})`;
        btn.addEventListener('click', ()=> {
          filteredBooks = booksCache.filter(b => (b.tags || []).indexOf(tag) !== -1);
          renderBooksPage(1);
          openSection('library');
        });
        list.appendChild(btn);
      }
    });
    if(Object.keys(tags).length === 0 && list) list.innerHTML = '<div class="muted">No hay categorías aún</div>';
  }


/* ---------- POR-TERMINAR: lógica independiente (no toca 'library') ---------- */
// Página actual para la vista "por-terminar" (no confundir con currentPage de library)
let porTermPage = 1;

// Calcula arreglo de libros pendientes y lo ordena por progreso (más cerca del final primero)
function getPendingSortedList(){
  const arr = (booksCache || []).filter(b => {
    try {
      if(!b) return false;
      // Excluir terminados
      if(!!b.finishedReading) return false;
      // incluir todo lo demás (si no hay data de páginas también se incluye)
      return true;
    } catch(e){
      return true;
    }
  });

  // función de progreso 0..1
  function progress(b){
    const curr = Number(b && (b.currentPage || 0)) || 0;
    const total = Number(b && (b.totalPages || 0)) || 0;
    if(total > 0) return Math.min(1, Math.max(0, curr / total));
    if(curr > 0) return 0.5; // heurística: avance conocido pero sin total
    return 0; // sin progreso conocido
  }

  // Ordenar por: progreso descendente (más cerca de terminar primero).
  // Si empate, ordenar por "páginas restantes ascendentes" si hay total; si no, por updatedAt/createdAt recientes.
  arr.sort((a,b) => {
    const pa = progress(a);
    const pb = progress(b);
    if(pb !== pa) return pb - pa; // mayor progreso primero

    // desempate: si ambos tienen total -> menos páginas restantes primero
    const atotal = Number(a.totalPages || 0), btotal = Number(b.totalPages || 0);
    const acurr = Number(a.currentPage || 0), bcurr = Number(b.currentPage || 0);
    if(atotal > 0 && btotal > 0){
      const arem = Math.max(0, atotal - acurr);
      const brem = Math.max(0, btotal - bcurr);
      if(arem !== brem) return arem - brem; // menos resto primero
    }

    // fallback por fecha (más reciente primero)
    const ta = Number(a.updatedAt || a.createdAt || 0);
    const tb = Number(b.updatedAt || b.createdAt || 0);
    return tb - ta;
  });

  return arr;
}

// Renderiza la lista "por-terminar" paginada (usa la variable perPage existente)
function renderPorTerminar(page = 1){
  porTermPage = page;
  const all = getPendingSortedList();
  const start = (page - 1) * perPage;
  const pageItems = all.slice(start, start + perPage);

  const container = document.getElementById('porTerminarList');
  const pagEl = document.getElementById('porTerminarPagination');
  const totalEl = document.getElementById('porTerminarTotal');

  if(totalEl) totalEl.textContent = all.length;

  if(!container) return;
  container.innerHTML = '';

  if(pageItems.length === 0){
    container.innerHTML = '<div class="muted">No hay libros pendientes por terminar.</div>';
  } else {
    pageItems.forEach(b => {
      const cover = b.coverUrl || DEFAULT_COVER_URL;
      // calcular progreso y porcentaje
      const curr = Number(b.currentPage || 0);
      const total = Number(b.totalPages || 0);
      const pct = (total > 0 && curr > 0) ? Math.round((curr/total)*100) : (curr > 0 ? '—' : '');
      // item
      const div = document.createElement('div');
      div.className = 'book';
      div.innerHTML = `
        <div class="cover">${cover ? `<img src="${cover}" alt="Portada" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" />` : 'Portada'}</div>
        <div class="meta"><strong>${escapeHtml(b.title || 'Sin título')}</strong></div>
        <div class="small muted">${escapeHtml((b.authors||'').split(',')[0]||'Autor desconocido')}</div>
        <div class="small muted" style="margin-top:6px">${ curr > 0 ? `Página ${escapeHtml(String(curr))}${ total > 0 ? ` de ${escapeHtml(String(total))}` : '' }` : '' } ${ (pct !== '' && pct !== '—') ? `(${pct}%)` : (pct === '—' ? '(avance)' : '') }</div>
        <div class="card-actions" style="margin-top:8px">
          <button class="btn action-btn" title="Ver detalle" onclick="openBookDetail('${b.id}')">Ver</button>
          <button class="ghost action-btn" title="Marcar como terminado" onclick="markAsFinished('${b.id}')">Marcar leído</button>
        </div>
      `;
      container.appendChild(div);
    });
  }

  // paginación simple
  if(pagEl){
    pagEl.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(all.length / perPage));
    for(let i=1;i<=totalPages;i++){
      const btn = document.createElement('button');
      btn.className = 'pager-btn' + (i === page ? ' active' : '');
      btn.textContent = i;
      btn.addEventListener('click', ()=> renderPorTerminar(i));
      pagEl.appendChild(btn);
    }
  }
}

// Acción rápida: marcar libro como terminado (actualiza DB)
async function markAsFinished(bookId){
  if(!bookId) return showToast('ID inválido');
  showConfirm('Marcar este libro como leído?', async () => {
    try {
      await db.ref('books/' + bookId).update({ finishedReading: true, updatedAt: Date.now() });
      showToast('Libro marcado como leído');
      // actualizar la vista actual
      if(currentSection === 'por-terminar') renderPorTerminar(porTermPage);
      // recargar lista general
      loadBooks();
    } catch(e){
      console.error('markAsFinished error', e);
      showToast('Error marcando libro como leído');
    }
  });
}


  /*************************************************************************
   * Detalles / QR / Descarga
   *************************************************************************/
  window.openBookDetail = async function(bookId){
    showBookDetailById(bookId);
  };

async function showBookDetailById(bookId){
  try {
    const snap = await db.ref('books/' + bookId).once('value');
    const b = snap.val();
    if(!b) return showToast('Libro no encontrado');
    // delegamos la renderización (incluyendo QR) a showDetail
    showDetail({ bookId, ...b }, false);
  } catch(err) {
    console.error('showBookDetailById error', err);
    showToast('Error mostrando detalle');
  }
}


  async function openEditBook(bookId){
    if(!bookId) return showToast('ID inválido');
    try {
      // Preferimos usar cache si existe
      let book = (booksCache || []).find(x => x.id === bookId) || null;
      if(!book){
        const snap = await db.ref('books/' + bookId).once('value');
        book = snap.val();
        if(book) book.id = bookId;
      }

      if(!book) return showToast('Libro no encontrado');

      // Reiniciar form y setear campos
      resetAddForm();

      // Rellenar campos (no podemos rellenar inputs file por seguridad)
      document.getElementById('title').value = book.title || '';
      document.getElementById('authors').value = book.authors || '';
      document.getElementById('isbn').value = book.isbn || '';
      document.getElementById('tags').value = (book.tags || []).join(', ');
      document.getElementById('description').value = book.description || '';
      document.getElementById('readingStart').value = book.readingStart || '';
      document.getElementById('readingEnd').value = book.readingEnd || '';
      document.getElementById('rating').value = book.rating || '';
      if(document.getElementById('totalPages')) document.getElementById('totalPages').value = book.totalPages || '';
      if(document.getElementById('currentPage')) document.getElementById('currentPage').value = book.currentPage || '';
      if(document.getElementById('finishedReading')) document.getElementById('finishedReading').checked = !!book.finishedReading;

      // Mostrar preview de portada si existe (si no, mostrar default)
try {
  const img = document.getElementById('coverPreviewImg');
  const coverUrlIn = document.getElementById('coverUrlInput');
  if(img){
    if(book.coverUrl){
      img.src = book.coverUrl;
      img.style.display = 'block';
      window.detectedCoverUrl = book.coverUrl;
      if(coverUrlIn) coverUrlIn.value = book.coverUrl;
    } else {
      img.src = '';
      img.style.display = 'none';
      window.detectedCoverUrl = null;
      if(coverUrlIn) coverUrlIn.value = '';
    }
  }
} catch(e){}


      // Setear editingBookId para indicar modo edición
      editingBookId = bookId;

      // Cambiar texto del botón Guardar
      const saveBtn = document.getElementById('saveBookBtn');
      if(saveBtn) saveBtn.textContent = 'Guardar cambios';

      // Abrir sección añadir y focus
      openSection('add');
      setTimeout(()=> { document.getElementById('title')?.focus(); }, 80);

      showToast('Editando libro — realiza cambios y guarda');
    } catch(e){
      console.error('openEditBook error', e);
      showToast('No fue posible cargar datos para edición');
    }
  }



function showDetail(data, simple=false, onOpen){
  const modal = document.getElementById('detailModal');
  const content = document.getElementById('detailContent');
  if(simple){
    // detalle simple (debug)
    content.innerHTML = `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
    modal.style.display = 'block';
    document.body.classList.add('no-scroll');
    if(onOpen) onOpen();
    return;
  }

  const progHtml = formatProgressHtml(data);
  content.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <div id="bookCoverBox"></div>
        <!-- contenedor QR (aseguramos que exista aquí) -->
        <div id="bookQrBox" style="margin-top:12px"></div>
      </div>
      <div style="flex:2;min-width:260px">
        <h2>${escapeHtml(data.title||'Sin título')}</h2>
        <div class="muted">Autor(es): ${escapeHtml(data.authors||'')}</div>

        <div style="margin-top:8px">${escapeHtml(data.description||'')}</div>

        <div style="margin-top:8px" class="small muted">ISBN: ${escapeHtml(data.isbn||'')}</div>

        <div style="margin-top:8px">
          ${data.rating ? `<div class="small">Calificación: <strong>${escapeHtml(formatRatingLabel(data.rating))}</strong></div>` : ''}
          ${(data.readingStart || data.readingEnd) ? `<div class="small muted">` +
            (data.readingStart ? `Inicio: ${escapeHtml(data.readingStart)}` : '') +
            (data.readingStart && data.readingEnd ? ' · ' : '') +
            (data.readingEnd ? `Fin: ${escapeHtml(data.readingEnd)}` : '') +
            `</div>` : ''}
          ${progHtml}
        </div>

        <div style="margin-top:12px">
          <button class="btn" id="bookFileBtn" style="display:none">Abrir archivo</button>
          <button class="ghost" id="copyQrLinkBtn">Copiar enlace</button>
          <button class="ghost" id="deleteBookBtn">Eliminar</button>
        </div>
      </div>
    </div>
  `;

  // Mostrar modal
  modal.style.display = 'block';
  document.body.classList.add('no-scroll');

  // Small delay para asegurarnos que el DOM quedó en el modal
  setTimeout(()=>{
    // Renderizar portada en bookCoverBox
    try {
      const coverBox = document.getElementById('bookCoverBox');
      if(coverBox){
        const coverToShow = data.coverUrl || '';
        coverBox.innerHTML = coverToShow ? `<img src="${coverToShow}" style="max-width:140px;border-radius:8px" />` : `<div style="width:140px;height:200px;background:#efe6d8;border-radius:8px;display:flex;align-items:center;justify-content:center">Sin portada</div>`;
      }
    } catch(e){ console.warn('cover render error', e); }

    // Renderizar QR en bookQrBox:
    try {
      const qdiv = document.getElementById('bookQrBox');
      if(qdiv){
        qdiv.innerHTML = ''; // limpiar
        // preferir qrLink si viene en data, si no usar link por id
        const qrText = data.qrLink || `${location.origin}${location.pathname}#book=${data.bookId || data.id || ''}`;
        try {
          // new QRCode puede fallar si la librería no está cargada, por eso try/catch
          new QRCode(qdiv, { text: qrText, width: 160, height: 160 });
        } catch(err){
          console.warn('QR render failed', err);
          qdiv.innerHTML = `<div class="small muted">No fue posible generar QR.</div>`;
        }
      }
    } catch(e){ console.warn('qr container error', e); }

    // Botón abrir archivo (si aplica)
    const snapBtn = document.getElementById('bookFileBtn');
    if(snapBtn){
      snapBtn.style.display = (data.fileUrl ? 'inline-block' : 'none');
      snapBtn.onclick = function(){
        if(data.fileUrl) {
          openReader(data.bookId || data.id || '');
        } else if(data.coverUrl) {
          window.open(data.coverUrl, '_blank');
        } else {
          showToast('No hay archivo disponible');
        }
      };
    }

    // Botón copiar enlace
    const copyBtn = document.getElementById('copyQrLinkBtn');
    if(copyBtn){
      copyBtn.onclick = function(){
        const link = data.qrLink || `${location.origin}${location.pathname}#book=${data.bookId || data.id || ''}`;
        navigator.clipboard.writeText(link).then(()=> showToast('Enlace copiado')).catch(()=> showToast('No se pudo copiar'));
      };
    }

    // Botón eliminar
    const delBtn = document.getElementById('deleteBookBtn');
    if(delBtn){
      delBtn.onclick = function(){ deleteBook(data.bookId || data.id || ''); };
    }

    if(typeof onOpen === 'function') onOpen();

  }, 80);
}



  window.generateQrFor = function(bookId){ showBookDetailById(bookId); };

  function copyLink(text){
    if(!text) { showToast('No hay enlace'); return; }
    navigator.clipboard.writeText(text).then(()=> showToast('Enlace copiado')).catch(()=> showToast('No se pudo copiar'));
  }

  async function deleteBook(bookId){
    if(!bookId) return showToast('ID inválido');

    showConfirm('¿Eliminar este libro permanentemente?', async ()=> {
      try {
        await db.ref('books/' + bookId).remove();

        try {
          if(window.currentRendition){
            try { window.currentRendition.destroy(); } catch(e){ }
            window.currentRendition = null;
            window.currentBook = null;
          }
        } catch(e){ console.warn('Error al destruir rendition:', e); }

        const dm = document.getElementById('detailModal');
        if(dm) dm.style.display = 'none';

        const cm = document.getElementById('confirmModal');
        if(cm) cm.style.display = 'none';

        try { document.body.classList.remove('no-scroll'); } catch(e){}

        try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch(e){}

        showToast('El libro fue eliminado');

        loadBooks();
      } catch(err){
        console.error('Error eliminando libro', err);
        showToast('Error eliminando libro: ' + (err.message || err));
        const cm = document.getElementById('confirmModal');
        if(cm) cm.style.display = 'none';
        try { document.body.classList.remove('no-scroll'); } catch(e){}
      }
    });
  }

  async function downloadFile(bookId){
    const snap = await db.ref('books/' + bookId).once('value');
    const b = snap.val();
    if(!b) return showToast('No hay datos del libro');
    if(b.fileUrl){
      if(b.fileUrl.startsWith('data:')){
        const a = document.createElement('a');
        a.href = b.fileUrl;
        a.download = b.fileName || 'archivo';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(b.fileUrl, '_blank');
      }
      return;
    }
    if(b.coverUrl){
      window.open(b.coverUrl, '_blank');
      return;
    }
    showToast('No hay archivo disponible');
  }

  // escapeHtml arreglado (antes devolvía entidades incorrectas)
  function escapeHtml(s){
    if(!s && s !== 0) return '';
    return String(s).replace(/[&<>"']/g, function(c){
      return ({'&':'&','<':'<','>':'>','"':'"',"'":"'"}[c]);
    });
  }

  // Genera SVG de una estrella (reutilizable)
  function _starSvg(){
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 .587l3.668 7.431L23.5 9.75l-5.668 5.522L19.336 24 12 19.897 4.664 24l1.504-8.728L.5 9.75l7.832-1.732L12 .587z"></path>
    </svg>`;
  }

  // Renderiza el cartel (badge) con estrellas y etiqueta legible
  function renderRatingBadge(rating){
    if(!rating) return '';
    const map = { malo:1, regular:2, bueno:3, muy_bueno:4 };
    const filled = map[rating] || 0;
    const total = 4;
    let starsHtml = '<span class="stars" aria-hidden="true">';
    for(let i=1;i<=total;i++){
      const cls = i <= filled ? 'star filled' : 'star empty';
      starsHtml += `<span class="${cls}">${_starSvg()}</span>`;
    }
    starsHtml += '</span>';
    return `<div class="rating-badge ${rating}">${starsHtml}<span class="label">${escapeHtml(formatRatingLabel(rating))}</span></div>`;
  }

  function formatRatingLabel(code){
    switch(code){
      case 'malo': return 'Malo';
      case 'regular': return 'Regular';
      case 'bueno': return 'Bueno';
      case 'muy_bueno': return 'Muy bueno';
      default: return '';
    }
  }

  // Formatea el HTML de progreso de lectura para un libro b
  function formatProgressHtml(b){
    try {
      if(b && b.finishedReading) {
        return `<div class="small muted" style="margin-top:6px">Leído ✓</div>`;
      }
      const curr = Number(b && (b.currentPage || 0));
      const total = Number(b && (b.totalPages || 0));
      if(curr > 0 && total > 0){
        const pct = Math.round((curr / total) * 100);
        const p = (pct > 100) ? 100 : ((pct < 0) ? 0 : pct);
        return `<div class="small muted" style="margin-top:6px">Página ${escapeHtml(String(curr))} de ${escapeHtml(String(total))} (${p}%)</div>`;
      }
      if(curr > 0 && !total){
        return `<div class="small muted" style="margin-top:6px">Página ${escapeHtml(String(curr))}</div>`;
      }
      return '';
    } catch(e){
      console.warn('formatProgressHtml', e);
      return '';
    }
  }

  /******************************
   * Export / Import Backup JSON
   ******************************/
  function _createBackupObject(){
    const booksById = {};
    (booksCache || []).forEach(b => {
      const copy = Object.assign({}, b);
      delete copy._internal;
      booksById[b.id] = copy;
    });

    const profile = {
      name: localStorage.getItem('lib_profile_name') || '',
      photo: localStorage.getItem('lib_profile_photo') || ''
    };

    return {
      meta: {
        exportedAt: new Date().toISOString(),
        app: 'Mi Biblioteca',
        version: 1
      },
      books: booksById,
      profile
    };
  }

  function _downloadJSON(filename, obj){
    const dataStr = JSON.stringify(obj, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 5000);
  }

  function exportBackup(){
    try {
      showToast('Generando respaldo...');
      const backup = _createBackupObject();
      const name = `respaldo-biblioteca-${(new Date()).toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
      _downloadJSON(name, backup);
      showToast('Respaldo descargado');
    } catch(e){
      console.error('exportBackup error', e);
      showToast('Error generando respaldo: ' + (e.message || e));
    }
  }

  function _readJsonFile(file){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const json = JSON.parse(fr.result);
          resolve(json);
        } catch(err){ reject(err); }
      };
      fr.onerror = reject;
      fr.readAsText(file);
    });
  }

  async function importBackupFile(file, options = { replace: false }){
    try {
      showToast('Procesando archivo de respaldo...');
      const json = await _readJsonFile(file);
      if(!json || typeof json !== 'object' || !json.books){
        showToast('Archivo inválido: no contiene estructura esperada.');
        return;
      }

      if(options.replace){
        await new Promise((resolve) => {
          showConfirm('ATENCIÓN: Se reemplazarán TODOS los datos en la base de datos. ¿Continuar?', async () => {
            try {
              await db.ref('books').set(json.books);
              resolve();
            } catch(e){
              console.error('import replace error', e);
              showToast('Error al reemplazar datos: ' + (e.message || e));
              resolve();
            }
          });
        });
      } else {
        try {
          await db.ref('books').update(json.books);
        } catch(e){
          console.error('import merge error', e);
          showToast('Error al fusionar datos: ' + (e.message || e));
        }
      }

      if(json.profile){
        if(json.profile.name) localStorage.setItem('lib_profile_name', json.profile.name);
        if(json.profile.photo) localStorage.setItem('lib_profile_photo', json.profile.photo);
        loadProfile();
      }

      showToast('Importación finalizada. Actualizando lista...');
      loadBooks();
    } catch(e){
      console.error('importBackupFile error', e);
      showToast('Error leyendo respaldo: ' + (e.message || e));
    }
  }

  /*************************************************************************
   * BIND UI
   *************************************************************************/
  document.getElementById('addQuickBtn').addEventListener('click', ()=> {
    resetAddForm();
    openSection('add');
    setTimeout(()=> { document.getElementById('title')?.focus(); }, 60);
  });

  document.getElementById('processImageBtn').addEventListener('click', ()=> {
    const f = document.getElementById('isbnImageInput').files[0];
    if(!f){ showToast('Selecciona una imagen primero'); return; }
    processUploadedIsbnImage(f);
  });

// Preview cuando el usuario pega una URL o presiona "Usar URL"
const coverUrlInputEl = document.getElementById('coverUrlInput');
const coverPreviewImgEl = document.getElementById('coverPreviewImg');
const useCoverUrlBtn = document.getElementById('useCoverUrlBtn');

if(coverUrlInputEl){
  // actualizar preview en cada cambio (user-friendly)
  coverUrlInputEl.addEventListener('input', () => {
    const v = (coverUrlInputEl.value || '').trim();
    if(v){
      coverPreviewImgEl.src = v;
      coverPreviewImgEl.style.display = 'block';
      // marca la URL como la portada seleccionada
      window.detectedCoverUrl = v;
    } else {
      // si borra el campo, ocultar preview (no tocar detectedCoverUrl si había archivo)
      coverPreviewImgEl.src = '';
      coverPreviewImgEl.style.display = 'none';
      window.detectedCoverUrl = null;
    }
  });
}

if(useCoverUrlBtn){
  useCoverUrlBtn.addEventListener('click', () => {
    const v = (coverUrlInputEl?.value || '').trim();
    if(!v) { showToast('Pega una URL válida primero'); return; }
    // fuerza preview (y guarda en detectedCoverUrl para que saveBook la use si no hay archivo)
    coverPreviewImgEl.src = v;
    coverPreviewImgEl.style.display = 'block';
    window.detectedCoverUrl = v;
    showToast('URL de portada aplicada (no olvides guardar el libro)');
  });
}

// Si selecciona un archivo, mostrar preview y limpiar campo URL (prioridad archivo)
document.getElementById('coverFile')?.addEventListener('change', async (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if(!f){
    // si quita el archivo, no hacemos nada más
    return;
  }
  // leer como dataURL para preview
  try {
    const dataUrl = await readFileAsDataURL(f);
    if(dataUrl){
      coverPreviewImgEl.src = dataUrl;
      coverPreviewImgEl.style.display = 'block';
      // limpiar campo URL para evitar confusiones (archivo tiene prioridad)
      if(coverUrlInputEl) coverUrlInputEl.value = '';
      // marcar detectedCoverUrl con dataURL temporalmente
      window.detectedCoverUrl = dataUrl;
    }
  } catch(e){
    console.warn('Error preview coverFile', e);
    showToast('No fue posible previsualizar la imagen seleccionada');
  }
});


  document.getElementById('manualIsbnBtnHome').addEventListener('click', ()=> {
    const manual = document.getElementById('manualIsbnInput').value.trim();
    if(!manual) { showToast('Introduce un ISBN'); return; }
    onDetectedCode(manual);
  });
  document.getElementById('genQrIsbnBtn').addEventListener('click', ()=> {
    const isbn = document.getElementById('qrIsbnInput').value.trim();
    if(!isbn) { showToast('Introduce un ISBN'); return; }
    // Genera un QR con el enlace interno apuntando al ISBN (comportamiento simple)
    const qdiv = document.getElementById('qrGenBox');
    qdiv.innerHTML = '';
    new QRCode(qdiv, {
      text: `${location.origin}${location.pathname}#isbn=${encodeURIComponent(isbn)}`,
      width:140, height:140
    });
  });

  /*********************************************************
 * INTEGRACIÓN IBERLIBRO (scrape via CORS proxy) -> autocompleta form
 * - Usa AllOrigins como proxy CORS: https://api.allorigins.win/raw?url=
 * - Si falla, cae en el comportamiento actual (onIsbnDetected -> OpenLibrary/Google)
 *********************************************************/

/**
 * Autocompleta el formulario de añadir libro con los datos que encuentre.
 * Solo escribirá en campos vacíos (para no sobrescribir edición del usuario),
 * excepto descripción (si está vacía).
 */
function autofillBookForm(d){
  if(!d) return;
  const setIfEmpty = (id, val) => {
    try {
      const el = document.getElementById(id);
      if(!el) return;
      if(!el.value && (val !== undefined && val !== null)) el.value = val;
    } catch(e){}
  };
  setIfEmpty('title', d.title || '');
  setIfEmpty('authors', d.authors || '');
  setIfEmpty('description', d.description || '');
  // totalPages: solo si vacío y tenemos pageCount
  try {
    const tp = document.getElementById('totalPages');
    if(tp && !tp.value && d.pageCount) tp.value = d.pageCount;
  } catch(e){}
  // portada: si hay coverUrl y no hay portada ya (detectedCoverUrl o coverPreview)
  try {
    if(d.coverUrl && !window.detectedCoverUrl){
      window.detectedCoverUrl = d.coverUrl;
      const img = document.getElementById('coverPreviewImg');
      if(img){ img.src = d.coverUrl; img.style.display = 'block'; }
      const coverUrlIn = document.getElementById('coverUrlInput');
      if(coverUrlIn && !coverUrlIn.value) coverUrlIn.value = d.coverUrl;
    }
  } catch(e){}
  // ISBN13 -> campo isbn (solo si vacío)
  try {
    if(d.isbn13){
      const isbnEl = document.getElementById('isbn');
      if(isbnEl && !isbnEl.value) isbnEl.value = d.isbn13;
    }
  } catch(e){}
}



/* ---------- Helpers para extraer URL de imagen (robusto) ---------- */
function getImageUrlFromImgElement(imgEl){
  if(!imgEl) return null;
  // comprobar varios atributos comunes usados para lazy loading
  const attrs = ['src','data-src','data-original','data-lazy','data-image','data-srcset','data-src-zoom'];
  let val = null;
  for(const a of attrs){
    try {
      if(imgEl.hasAttribute && imgEl.hasAttribute(a)){
        val = imgEl.getAttribute(a);
        if(val) break;
      }
    } catch(e){}
  }
  // si no hay, intentar srcset
  if(!val && imgEl.getAttribute){
    const ss = imgEl.getAttribute('srcset') || imgEl.getAttribute('data-srcset') || '';
    if(ss){
      // srcset: "url1 1x, url2 2x" -> coger el primer url
      const first = ss.split(',')[0].trim().split(' ')[0];
      if(first) val = first;
    }
  }
  // fallback: src property
  if(!val && imgEl.src) val = imgEl.src;
  if(!val) return null;

  // normalizar: si empieza con '//' => 'https:'; si es relativo => absolutizar al dominio de iberlibro
  val = val.trim();
  if(val.indexOf('//') === 0) val = 'https:' + val;
  if(val.indexOf('/') === 0 && !/^https?:\/\//i.test(val)) val = 'https://www.iberlibro.com' + val;
  // si contiene 'fivestar' o 'seller-rating' o 'shared/images' ignorar (no es portada)
  if(/fivestar|seller-rating|shared\/images|rating|star/i.test(val)) return null;

  return val;
}

/* ---------- Versión mejorada de fetchIberlibroByIsbn ---------- */
async function fetchIberlibroByIsbn(isbn){
  if(!isbn) return null;
  const clean = (isbn || '').replace(/[^0-9xX]/g,'').trim();
  if(clean.length < 10) return null;

  const searchUrl = `https://www.iberlibro.com/servlet/SearchResults?isbn=${encodeURIComponent(clean)}&nomobile=true`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;

  try { const s = document.getElementById('iberSearchStatus'); if(s) s.textContent = 'Consultando Iberlibro...'; } catch(e){}

  try {
    const res = await fetch(proxy);
    if(!res.ok) throw new Error('No se pudo obtener resultados de Iberlibro (search)');
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // BUSCAR: primer bloque de listado que contenga título y/o imagen
    // Intentamos localizar el bloque de resultado preferido (selector robusto)
    let resultNode = null;
    const selectors = [
      '.result-detail', '.srp-item', '.search-result', '.srp-listing', '[data-test-id="search-results"] li'
    ];
    for(const sel of selectors){
      const cand = doc.querySelector(sel);
      if(cand){
        resultNode = cand;
        break;
      }
    }

    // Si no hay resultNode, tomamos la sección del primer resultado visual
    if(!resultNode){
      resultNode = doc.querySelector('div[data-test-id="search-result"]') || doc.querySelector('article') || null;
    }

    // Función para intentar extraer imagen desde un nodo (busca img con varias estrategias)
    function findCoverUrlWithin(node){
      if(!node) return null;
      // Prioridad: img.srp-item-image o img dentro de .srp-image-holder
      const tryImgs = Array.from(node.querySelectorAll('img'));
      for(const img of tryImgs){
        const url = getImageUrlFromImgElement(img);
        if(url) return url;
      }
      return null;
    }

    // Intentar extraer título y autor desde resultNode
    let title = '', authors = '', isbn13 = null, coverUrl = null;
    if(resultNode){
      const titleEl = resultNode.querySelector('span[data-test-id="listing-title"]') ||
                      resultNode.querySelector('h2.title') ||
                      resultNode.querySelector('h2') ||
                      resultNode.querySelector('.title');
      const authorEl = resultNode.querySelector('p.author strong') ||
                       resultNode.querySelector('p.author a') ||
                       resultNode.querySelector('.author') ||
                       resultNode.querySelector('a[itemprop="author"]');

      if(titleEl) title = titleEl.textContent.trim();
      if(authorEl) authors = authorEl.textContent.trim();

      // intentar isbn13 desde enlaces dentro del bloque
      const isbnLinks = Array.from(resultNode.querySelectorAll('a[data-test-id="listing-isbn-link"]'));
      for(const a of isbnLinks){
        const txt = (a.textContent || '').replace(/[^0-9]/g,'');
        if(txt && txt.length >= 13 && txt.indexOf('978') === 0){ isbn13 = txt; break; }
      }
      // fallback: buscar texto ISBN13 en el bloque
      if(!isbn13){
        const txt = resultNode.textContent || '';
        const m = txt.match(/ISBN[^0-9]*(1[03])?:?\s*([0-9\-]{10,17})/i);
        if(m && m[2]) isbn13 = m[2].replace(/[^0-9]/g,'');
      }

      // imagen dentro del bloque
      coverUrl = findCoverUrlWithin(resultNode);
    }

    // Si no se encontró imagen en el bloque, buscar en la página entera prioritizando srp-image-holder / srp-item-image
    if(!coverUrl){
      const imgsOrder = [
        'img.srp-item-image',
        '.srp-image-holder img',
        'img[src*="inventory"], img[src*="/pictures/"], img[src*="/images/"]',
        'img'
      ];
      for(const sel of imgsOrder){
        const img = doc.querySelector(sel);
        if(img){
          const c = getImageUrlFromImgElement(img);
          if(c){ coverUrl = c; break; }
        }
      }
    }

    // Si falta título/autores/ISBN, intentar usar nodos globales en la página
    if(!title) {
      const anyTitle = doc.querySelector('span[data-test-id="listing-title"], h2.title, h3.title, .title, h1');
      if(anyTitle) title = anyTitle.textContent.trim();
    }
    if(!authors) {
      const anyAuthor = doc.querySelector('p.author strong, p.author a, .author, a[itemprop="author"]');
      if(anyAuthor) authors = anyAuthor.textContent.trim();
    }
    if(!isbn13){
      const anyIsbnA = doc.querySelector('a[data-test-id="listing-isbn-link"]');
      if(anyIsbnA){
        const t = (anyIsbnA.textContent||'').replace(/[^0-9]/g,'');
        if(t && t.length>=13 && t.indexOf('978')===0) isbn13 = t;
      }
    }

    // Si no hay pageCount, intentar seguir al detalle para obtenerlo (y nueva oportunidad de imagen)
    let pageCount = null;
    // buscar enlace detalle dentro del bloque (prioritario)
    let detailHref = null;
    if(resultNode){
      const aDetail = resultNode.querySelector('a[itemprop="url"], a[data-test-id="listing-title"], a[href*="/servlet/BookDetails"], a[href*="/bd"], a[href*="/plp"], a[href*="/inventory/"], a[href*="/book/"]');
      if(aDetail){
        let h = aDetail.getAttribute('href') || '';
        if(h){
          if(h.startsWith('/')) detailHref = `https://www.iberlibro.com${h}`;
          else if(/^https?:\/\//.test(h)) detailHref = h;
          else detailHref = `https://www.iberlibro.com/${h}`;
        }
      }
    }
    // fallback: primer anchor relevante en documento
    if(!detailHref){
      const aAny = doc.querySelector('a[href*="/servlet/BookDetails"], a[href*="/bd"], a[href*="/plp"], a[href*="/inventory/"]');
      if(aAny){
        const h = aAny.getAttribute('href') || '';
        if(h){
          if(h.startsWith('/')) detailHref = `https://www.iberlibro.com${h}`;
          else if(/^https?:\/\//.test(h)) detailHref = h;
          else detailHref = `https://www.iberlibro.com/${h}`;
        }
      }
    }

    if(detailHref){
      try {
        const proxyDetail = `https://api.allorigins.win/raw?url=${encodeURIComponent(detailHref)}`;
        const r2 = await fetch(proxyDetail);
        if(r2.ok){
          const html2 = await r2.text();
          const doc2 = parser.parseFromString(html2, 'text/html');

          // intentar extraer pageCount desde el detalle
          const infoText = (doc2.querySelector('.result-detail, .product-details, #bookDetails, .bibinfo') || doc2.body).textContent || '';
          const mpp = infoText.match(/(\d{1,4})\s*(p[pá]ginas|páginas|pp\.|pages)/i);
          if(mpp && mpp[1]) pageCount = Number(mpp[1]);
          else {
            const m2 = infoText.match(/pages[:\s]*([0-9]{1,4})/i);
            if(m2 && m2[1]) pageCount = Number(m2[1]);
          }

          // re-intentar imagen desde detalle (a veces la portada solo está en la ficha)
          if(!coverUrl){
            const img2 = doc2.querySelector('img.srp-item-image, .srp-image-holder img, img[data-src], img[src*="inventory"], img.cover, img.bookImage, img[itemprop="image"]');
            if(img2){
              const iu = getImageUrlFromImgElement(img2);
              if(iu) coverUrl = iu;
            }
          }
        }
      } catch(e){
        console.warn('Error fetch detalle Iberlibro', e);
      }
    }

    // normalizar coverUrl (si empieza con // o relativo)
    if(coverUrl){
      coverUrl = coverUrl.trim();
      if(coverUrl.indexOf('//') === 0) coverUrl = 'https:' + coverUrl;
      if(coverUrl.indexOf('/') === 0) coverUrl = 'https://www.iberlibro.com' + coverUrl;
      // descartar si parece ser la imagen de rating/estrellas
      if(/fivestar|seller-rating|shared\/images|rating|star/i.test(coverUrl)){
        coverUrl = null;
      }
    }

    // mostrar estado
    try {
      const s = document.getElementById('iberSearchStatus');
      if(s) s.textContent = coverUrl ? 'Encontrado en Iberlibro (con portada)' : 'Encontrado en Iberlibro (sin portada detectada)';
    } catch(e){}

    return {
      title: title || '',
      authors: authors || '',
      description: '',
      pageCount: pageCount || null,
      coverUrl: coverUrl || null,
      isbn13: isbn13 || null
    };

  } catch(err){
    console.warn('fetchIberlibroByIsbn error (mejorado)', err);
    try { const s = document.getElementById('iberSearchStatus'); if(s) s.textContent = 'No fue posible obtener datos desde Iberlibro.'; } catch(e){}
    return null;
  }
}



/**
 * Bind botón de búsqueda Iberlibro
 */
document.addEventListener('DOMContentLoaded', ()=> {
  const btn = document.getElementById('searchIberBtn');
  const input = document.getElementById('searchIberIsbnInput');
  const status = document.getElementById('iberSearchStatus');

// listener para el botón Por terminar (bottom nav)
// lo colocamos después de initBottomNav o dentro DOMContentLoaded
const porBtn = document.getElementById('porTerminarBtn');
if(porBtn){
  porBtn.addEventListener('click', (ev) => {
    // Abrir la sección (initBottomNav/openSection puede activarla) y luego renderizar
    // Delay corto para dejar que openSection (si lo maneja initBottomNav) haga su trabajo.
    setTimeout(()=> {
      // establecer sección actual
      currentSection = 'por-terminar';
      // mostrar solo esa sección
      openSection('por-terminar');
      // renderizamos la lista de pendientes (página 1)
      renderPorTerminar(1);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e){}
    }, 60);
  });
}



  if(btn && input){
    btn.addEventListener('click', async () => {
      const isbn = (input.value || '').trim();
      if(!isbn){
        showToast('Introduce un ISBN para buscar en Iberlibro');
        return;
      }
      status.textContent = 'Iniciando búsqueda...';
      // intenta Iberlibro
      const data = await fetchIberlibroByIsbn(isbn);
      if(data){
        status.textContent = `Datos encontrados: ${data.title || 'Título no disponible'}`;
        // abrir sección añadir y rellenar form
        openSection('add');
        setTimeout(()=> {
          autofillBookForm(data);
          showToast('Formulario autocompletado (si estaba vacío).');
        }, 120);
      } else {
        // fallback: usar onIsbnDetected (OpenLibrary/GoogleBooks)
        status.textContent = 'No se encontró en Iberlibro, intentando OpenLibrary/Google...';
        try {
          onIsbnDetected(isbn);
        } catch(e){
          showToast('No fue posible autocompletar. Revisa la consola.');
          console.warn('fallback onIsbnDetected failed', e);
        }
      }
    });
  }
});


  document.getElementById('exportBackupBtn').addEventListener('click', (e) => {
    exportBackup();
  });

  const importInput = document.getElementById('importBackupInput');
  const importLabel = document.getElementById('importBackupLabel');
  if(importInput){
    importInput.addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      importLabel.textContent = f ? `Archivo: ${f.name}` : 'Seleccionar archivo .json';
    });
  }

  document.getElementById('importBackupBtn').addEventListener('click', async () => {
    const input = document.getElementById('importBackupInput');
    if(!input || !input.files || !input.files[0]) {
      showToast('Selecciona un archivo .json primero');
      return;
    }
    const file = input.files[0];
    const replace = !!document.getElementById('importReplaceCheckbox')?.checked;

    if(!replace){
      showConfirm('¿Importar respaldo y fusionarlo con los datos actuales?', async () => {
        await importBackupFile(file, { replace: false });
      });
    } else {
      await importBackupFile(file, { replace: true });
    }
  });

  document.getElementById('saveBookBtn').addEventListener('click', saveBook);
  document.getElementById('isbnFetchBtn').addEventListener('click', fetchByIsbn);
  document.getElementById('perPageSelect').addEventListener('change',(e)=>{ perPage = parseInt(e.target.value); renderBooksPage(1); });

  document.getElementById('clearLocal')?.addEventListener('click', ()=> { localStorage.clear(); showToast('Cache local limpiada'); });

  document.getElementById('closeDetail').addEventListener('click', ()=> {
    document.getElementById('detailModal').style.display = 'none';
    try { if(window.currentRendition) { window.currentRendition.destroy(); window.currentRendition = null; window.currentBook = null; } } catch(e){ console.warn(e); }
    document.body.classList.remove('no-scroll');
  });

  document.getElementById('closeAddBtn').addEventListener('click', ()=> openSection('home'));
  document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
  document.getElementById('clearProfileBtn').addEventListener('click', clearProfile);

  /*************************************************************************
   * Bottom nav init
   *************************************************************************/
  (function initBottomNav(){
    const bottomNav = document.getElementById('bottomNav');
    if(!bottomNav) return;
    const items = bottomNav.querySelectorAll('.bn-item');
    items.forEach(it => {
      it.addEventListener('click', ()=> {
        const sec = it.dataset.section;
        items.forEach(x=> x.classList.toggle('active', x === it));
        openSection(sec);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    items.forEach(x => x.classList.toggle('active', x.dataset.section === currentSection));
  })();



/* ---------- POR AÑO: lógica independiente ---------- */
let porAnoPage = 1;

// Extrae año robusto desde distintas formas (YYYY-MM-DD, ISO, timestamp, texto)
function extractYearFromString(s){
  if(!s) return null;
  // 1) buscar primer grupo de 4 dígitos que parezcan año
  const m = String(s).match(/(20\d{2}|19\d{2})/);
  if(m) return Number(m[1]);
  // 2) intentar Date parse (fallback)
  try {
    const d = new Date(s);
    if(!isNaN(d)) return d.getFullYear();
  } catch(e){}
  return null;
}

// Devuelve array de años (descendente) para poblar el selector.
// Basado en readingEnd, o si finishedReading && no readingEnd -> usar updatedAt/createdAt.
function getYearsRead(){
  const years = new Set();
  (booksCache || []).forEach(b => {
    try {
      if(b && b.readingEnd){
        const y = extractYearFromString(b.readingEnd);
        if(y) years.add(y);
      } else if(b && b.finishedReading){
        // si no hay readingEnd, usar timestamp si existe
        const t = Number(b.updatedAt || b.createdAt || 0);
        if(t && !Number.isNaN(t) && t > 0){
          years.add(new Date(t).getFullYear());
        }
      }
    } catch(e){}
  });
  const arr = Array.from(years).sort((a,b)=>b-a);
  return arr;
}

// Render selector de años (llama renderPorAno al final)
function renderPorAnoSelector(){
  const sel = document.getElementById('porAnoSelect');
  if(!sel) return;
  const years = getYearsRead();
  sel.innerHTML = '';
  if(years.length === 0){
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '-- sin años disponibles --';
    sel.appendChild(opt);
    document.getElementById('porAnoTotal').textContent = '0';
    renderPorAno('', 1); // limpia listado
    return;
  }
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  });
  // seleccionar el año actual si existe en la lista; si no, el primer año
  const currentYear = new Date().getFullYear();
  if(years.includes(currentYear)) sel.value = String(currentYear);
  else sel.value = String(years[0]);
  // disparar render
  renderPorAno(sel.value, 1);
}

// Filtra libros leídos en el año dado
function filterBooksByYear(year){
  if(!year) return [];
  const yNum = Number(year);
  return (booksCache || []).filter(b => {
    try {
      if(!b) return false;
      if(b.readingEnd){
        const y = extractYearFromString(b.readingEnd);
        if(y === yNum) return true;
      }
      // si no hay readingEnd pero está marcado como leído, podemos usar updatedAt/createdAt
      if(b.finishedReading){
        const t = Number(b.updatedAt || b.createdAt || 0);
        if(t && !Number.isNaN(t) && t > 0){
          if(new Date(t).getFullYear() === yNum) return true;
        }
      }
      return false;
    } catch(e){ return false; }
  });
}

// Renderiza la vista Por-Año (paginas usando perPage)
function renderPorAno(year, page = 1){
  porAnoPage = page;
  const list = filterBooksByYear(year);
  // ordenar por fecha de lectura (readingEnd) descendente, fallback por updatedAt/createdAt
  list.sort((a,b) => {
    const aTs = a.readingEnd ? (new Date(a.readingEnd)).getTime() : Number(a.updatedAt || a.createdAt || 0);
    const bTs = b.readingEnd ? (new Date(b.readingEnd)).getTime() : Number(b.updatedAt || b.createdAt || 0);
    return (bTs || 0) - (aTs || 0);
  });

  const container = document.getElementById('porAnoList');
  const pagEl = document.getElementById('porAnoPagination');
  const totalEl = document.getElementById('porAnoTotal');

  if(totalEl) totalEl.textContent = String(list.length || 0);

  if(!container) return;
  container.innerHTML = '';

  // paginado simple
  const start = (page - 1) * perPage;
  const pageItems = list.slice(start, start + perPage);

  if(pageItems.length === 0){
    container.innerHTML = '<div class="muted">No hay libros registrados para este año.</div>';
  } else {
    pageItems.forEach(b => {
      const cover = b.coverUrl || DEFAULT_COVER_URL;
      const readDateLabel = b.readingEnd ? String(b.readingEnd) : (b.updatedAt ? new Date(Number(b.updatedAt)).toISOString().slice(0,10) : '');
      const div = document.createElement('div');
      div.className = 'book';
      div.innerHTML = `
        <div class="cover">${cover ? `<img src="${cover}" alt="Portada" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" />` : 'Portada'}</div>
        <div class="meta"><strong>${escapeHtml(b.title || 'Sin título')}</strong></div>
        <div class="small muted">${escapeHtml((b.authors||'').split(',')[0] || 'Autor desconocido')}</div>
        <div class="small muted" style="margin-top:6px">Leído: ${escapeHtml(readDateLabel)}</div>
        <div class="card-actions" style="margin-top:8px">
          <button class="btn action-btn" title="Ver detalle" onclick="openBookDetail('${b.id}')">Ver</button>
        </div>
      `;
      container.appendChild(div);
    });
  }

  // paginación
  if(pagEl){
    pagEl.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(list.length / perPage));
    for(let i=1;i<=totalPages;i++){
      const btn = document.createElement('button');
      btn.className = 'pager-btn' + (i === page ? ' active' : '');
      btn.textContent = i;
      btn.addEventListener('click', ()=> renderPorAno(year, i));
      pagEl.appendChild(btn);
    }
  }
}

// Listener para el selector de año
document.addEventListener('DOMContentLoaded', ()=> {
  const sel = document.getElementById('porAnoSelect');
  if(sel){
    sel.addEventListener('change', (e) => {
      const year = e.target.value;
      renderPorAno(year, 1);
    });
  }
});

// Botón en bottom nav: abrir sección por-ano y cargar selector
document.addEventListener('DOMContentLoaded', ()=> {
  const btn = document.getElementById('porAnoBtn');
  if(btn){
    btn.addEventListener('click', () => {
      // mostrar sección independiente
      currentSection = 'por-ano';
      openSection('por-ano');
      // poblar selector y mostrar listado
      renderPorAnoSelector();
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e){}
    });
  }
});

// Si la lista de libros (booksCache) se actualiza y estamos viendo "por-ano", refrescar
// Añadir esto dentro de loadBooks() después de actualizar booksCache (ver instrucción abajo)



  /*************************************************************************
   * Realtime DB listener + initial load
   *************************************************************************/
  db.ref('books').on('value', function(){ loadBooks(); });
  loadBooks();

  // Esc key UX
  window.addEventListener('keydown', (e) => {
    if(e.key === 'Escape'){
      const dm = document.getElementById('detailModal');
      if(dm && dm.style.display === 'block'){ dm.style.display = 'none'; document.body.classList.remove('no-scroll'); }
      const cm = document.getElementById('confirmModal');
      if(cm && cm.style.display === 'flex'){ cm.style.display = 'none'; }
    }
  });

/**
 * Reemplaza/borra todo lo de abajo y pega aquí tu código JS.
 * Ejemplo mínimo de inicialización:
 */
document.addEventListener('DOMContentLoaded', function() {
  // Código de ejemplo — puedes borrar estas 4 líneas
  const root = document.getElementById('extrasRoot') || document.getElementById('app');
  if(root) {
    const p = document.createElement('p');
    p.textContent = 'Tu código JS puede inicializarse aquí (DOMContentLoaded).';
    p.style.textAlign = 'center';
    p.style.color = '#666';
    root.appendChild(p);
  }

  // Emite evento de arranque
  APP.bus.emit('app.ready', { ts: Date.now() });
});

/* --- FIN: PEGA TU CÓDIGO AQUÍ --- */

/* Exporta APP para debugging */
window._app = APP;
