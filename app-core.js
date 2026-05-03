// app-core.js — Firebase init, auth, global state, init, data fetch, helpers

// ---- top-level (orig lines 674-674) ----
Chart.register(ChartDataLabels);

// ---- top-level (orig lines 676-684) ----
const firebaseConfig = {
  apiKey: "AIzaSyCbgwrcjkFF8yf2S2zOFzIt8w18oqmI6oQ",
  authDomain: "fetgemfen-f9580.firebaseapp.com",
  projectId: "fetgemfen-f9580",
  storageBucket: "fetgemfen-f9580.firebasestorage.app",
  messagingSenderId: "220756328676",
  appId: "1:220756328676:web:def468b1b6a98474acecf1",
  databaseURL: "https://fetgemfen-f9580-default-rtdb.europe-west1.firebasedatabase.app"
};

// ---- top-level (orig lines 685-685) ----
firebase.initializeApp(firebaseConfig);

// ---- top-level (orig lines 686-686) ----
const database = firebase.database();

// ---- top-level (orig lines 687-687) ----
const auth = firebase.auth();

// ---- uConn (orig lines 689-693) ----
function uConn(online){
  const d=document.getElementById('connDot'),t=document.getElementById('connTxt'),b=document.getElementById('connBadge');if(!d||!t||!b)return;
  d.textContent='';
  if(online){t.textContent='Bağlı';b.className='nav-link conn-badge is-online';b.title='Firebase bağlantısı aktif';}
  else{t.textContent='Çevrimdışı';b.className='nav-link conn-badge is-offline';b.title='Firebase bağlantısı yok';}
}

// ---- top-level (orig lines 694-694) ----
database.ref('.info/connected').on('value',snap=>uConn(snap.val()===true));

// ---- top-level (orig lines 696-696) ----
const ADMIN_UID="YLozrXC5w4OmD4HRzjlgF80qPCp1";

function showStartup(message){
  document.body.classList.add('auth-pending');
  const loader = getEl('loader'), txt = getEl('l-txt');
  if(txt) txt.textContent = message || 'Oturum kontrol ediliyor...';
  if(loader) loader.style.display = 'flex';
}

function clearStartup(){
  document.body.classList.remove('auth-pending');
  const loader = getEl('loader');
  if(loader) loader.style.display = 'none';
}

function metaGrades(meta){
  if(!meta || !Array.isArray(meta.grades)) return [];
  return meta.grades.map(g => String(g).trim()).filter(Boolean);
}

function metaHasGrade(meta, grade){
  if(!grade) return true;
  const grades = metaGrades(meta);
  return !grades.length || grades.includes(String(grade).trim());
}

function metaIntersectsGrades(meta, grades){
  const wanted = [...(grades || [])].map(g => String(g).trim()).filter(Boolean);
  if(!wanted.length) return true;
  const existing = metaGrades(meta);
  return !existing.length || wanted.some(g => existing.includes(g));
}

function getSelectValueIfEnabled(id){
  const el = getEl(id);
  if(!el || el.selectedIndex < 0) return '';
  const opt = el.options[el.selectedIndex];
  if(opt && opt.disabled) return '';
  return el.value || '';
}

function getAnalysisDateValue(){
  const raw = getSelectValueIfEnabled('aDate');
  return raw === '__ALL__' ? '' : raw;
}

function getStudentExamDateValue(){
  const raw = getSelectValueIfEnabled('aExDate');
  return raw === '__ALL__' ? '' : raw;
}

function hasAnalysisDateSelection(){
  const el = getEl('aDate');
  if(!el) return false;
  return !!getSelectValueIfEnabled('aDate');
}

function hasStudentExamDateSelection(){
  const el = getEl('aExDate');
  if(!el) return false;
  return !!getSelectValueIfEnabled('aExDate');
}

function isStudentSingleExamSelection(){
  const raw = getSelectValueIfEnabled('aExDate');
  return !!raw && raw !== '__ALL__';
}

function showAnalysisHint(message){
  const res = getEl('anlRes');
  if(res) res.innerHTML = `<div class="alert alert-default-info"><i class="fas fa-info-circle me-2"></i>${escapeHtml(message)}</div>`;
  if(typeof applyExamColorToFilters === 'function') applyExamColorToFilters();
}

// ---- checkAuth (orig lines 698-721) ----
function checkAuth(){
  let settled = false;
  const loaderDelay = setTimeout(() => {
    if(!settled) showStartup('Oturum kontrol ediliyor...');
  }, 2500);
  const authTimeout = setTimeout(() => {
    if(settled) return;
    const login = getEl('loginScreen'), app = getEl('mainApp');
    const loginHidden = !login || getComputedStyle(login).display === 'none';
    const appHidden = !app || getComputedStyle(app).display === 'none';
    if(login && app && loginHidden && appHidden){
      clearStartup();
      login.style.display = 'flex';
    }
  }, 7000);
  auth.onAuthStateChanged(user=>{
    settled = true;
    clearTimeout(loaderDelay);
    clearTimeout(authTimeout);
    clearStartup();
    if(user){
      getEl('loginScreen').style.display='none';
      getEl('mainApp').style.display='';
      if(getEl('userEmail'))getEl('userEmail').textContent=user.email;
      document.body.classList.remove('is-admin');
      if(user.uid===ADMIN_UID)document.body.classList.add('is-admin');
      
      // Yenileme sonrası mevcut URL hash'ini oku ve o sekmede kal
      setTimeout(() => { 
        let targetPane = typeof paneFromLocation === 'function' ? paneFromLocation() : (window.location.hash.replace('#', '') || 'anasayfa_genel');
        if(targetPane === 'ayarlar' && !document.body.classList.contains('is-admin')) targetPane = 'anasayfa_genel';
        
        // History'yi güncelle ve sekmeyi aktif et
        if(typeof setPaneHistory === 'function') {
          setPaneHistory(targetPane, 'replace');
        } else {
          let base = window.location.protocol === 'file:' ? window.location.href.split('#')[0] : (window.location.pathname + window.location.search);
          try { window.history.replaceState({ pane: targetPane }, '', targetPane === 'anasayfa_genel' ? base : base + '#' + targetPane); } catch(e) {}
        }
        executeTabSwitch(targetPane, true); // UI'ı bu sekmeye geçir
        if(typeof ensurePaneVisibility === 'function') ensurePaneVisibility(targetPane);
      }, 100);
      init().catch(err => {
        console.error('Başlatma hatası:', err);
        if(typeof showToast === 'function') showToast('Veriler yüklenirken hata oluştu. Menü ve sayfa geçişleri açık tutuldu.', 'error');
        if(typeof ensurePaneVisibility === 'function') ensurePaneVisibility();
        ld(0);
      });
      showPwaPopupIfReady();

    }else{
      getEl('loginScreen').style.display='flex';
      getEl('mainApp').style.display='none';
      document.body.classList.remove('is-admin');
    }
  });
}

// ---- login (orig lines 723-736) ----
function login(){
  const em=getEl('loginEmail').value.trim(),pa=getEl('loginPass').value;
  const err=getEl('loginError'),btn=getEl('btnLogin');
  err.style.display='none';
  if(!em||!pa){err.textContent='E-posta ve şifre gerekli.';err.style.display='block';return;}
  const orgHTML='<i class="fas fa-sign-in-alt me-2"></i>Giriş Yap';
  btn.innerHTML='<span class="spinner-border spinner-border-sm me-2"></span>Giriş yapılıyor...';btn.disabled=true;
  auth.signInWithEmailAndPassword(em,pa).then(()=>{btn.innerHTML=orgHTML;btn.disabled=false;}).catch(e=>{
    btn.innerHTML=orgHTML;btn.disabled=false;
    err.className='alert alert-danger mt-3 mb-0';err.style.display='block';
    if(e.code.includes('user-not-found')||e.code.includes('wrong-password')||e.code.includes('invalid-credential')) err.innerHTML='<i class="fas fa-exclamation-circle me-2"></i>Hatalı e-posta veya şifre.';
    else err.innerHTML='<i class="fas fa-times-circle me-2"></i>Hata: '+escapeHtml(e.message);
  });
}

// ---- logout (orig lines 738-738) ----
function logout(){ auth.signOut(); location.reload(); }

// ---- togglePassword (orig lines 740-744) ----
function togglePassword(){
  let inp = getEl('loginPass'), icon = getEl('togglePassIcon');
  if(inp.type === 'password'){ inp.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); } 
  else { inp.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}

// ---- openForgotPassword (orig lines 746-751) ----
function openForgotPassword(e) {
  e.preventDefault();
  let em = getEl('loginEmail').value.trim();
  if(em) getEl('forgotEmail').value = em;
  getEl('forgotMsg').innerHTML = ''; showModal('mForgot');
}

// ---- sendPasswordReset (orig lines 753-765) ----
function sendPasswordReset() {
  let em = getEl('forgotEmail').value.trim(), msg = getEl('forgotMsg');
  if(!em) { msg.innerHTML = '<span class="text-danger">E-posta adresi gerekli.</span>'; return; }
  auth.sendPasswordResetEmail(em).then(() => {
    msg.innerHTML = '<span class="text-success"><i class="fas fa-check-circle me-1"></i>Sıfırlama bağlantısı gönderildi. Lütfen e-postanızı kontrol edin.</span>';
    setTimeout(() => hideModal('mForgot'), 3000);
  }).catch(err => {
    let errMsg = 'Bir hata oluştu.';
    if(err.code === 'auth/user-not-found') errMsg = 'Bu e-posta ile kayıtlı kullanıcı bulunamadı.';
    else if(err.code === 'auth/invalid-email') errMsg = 'Geçersiz e-posta adresi.';
    msg.innerHTML = `<span class="text-danger"><i class="fas fa-times-circle me-1"></i>${errMsg}</span>`;
  });
}

// ---- applyTheme (orig lines 767-772) ----
function applyTheme(){
  Chart.defaults.color='#475569';
  if(c.h)c.h.update();if(c.a)c.a.update();
  if(window._karneCharts) window._karneCharts.forEach(ch=>ch.update());
  if(window._raporCharts) window._raporCharts.forEach(ch=>ch.update());
}

// ---- toggleTheme (orig lines 773-773) ----
function toggleTheme(){ /* no-op: dark mode removed */ }

// ---- top-level (orig lines 775-775) ----
function getEl(i){return document.getElementById(i);}

function cleanupModalState(){
  if(document.querySelector('.modal.show')) return;
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}

function getModal(id, options) {
  const el = getEl(id);
  if(!el || !window.bootstrap || !window.bootstrap.Modal) return null;
  return window.bootstrap.Modal.getOrCreateInstance(el, options || {});
}

function showModal(id, options) {
  const el = getEl(id);
  const modal = getModal(id, options);
  if(modal) {
    modal.show();
    return;
  }
  if(!el) return;
  el.style.display = 'block';
  el.removeAttribute('aria-hidden');
  el.setAttribute('aria-modal', 'true');
  el.classList.add('show');
  document.body.classList.add('modal-open');
}

function hideModal(id) {
  const el = getEl(id);
  const modal = getModal(id);
  if(modal) {
    modal.hide();
    setTimeout(cleanupModalState, 200);
    return;
  }
  if(!el) return;
  el.classList.remove('show');
  el.setAttribute('aria-hidden', 'true');
  el.removeAttribute('aria-modal');
  el.style.display = 'none';
  cleanupModalState();
}

document.addEventListener('hidden.bs.modal', cleanupModalState);

// ---- top-level (orig lines 776-776) ----
let DB = { s: [], e: [] };

// ---- top-level (orig lines 777-777) ----
let EXAM_META = {};

// ---- top-level (orig lines 778-778) ----
let CACHED_RESULTS = {};

// ---- top-level (orig lines 779-779) ----
let aNo=null, c={h:null,a:null};

// ---- top-level (orig lines 780-780) ----
const cols=['#2563eb','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#be185d','#4b5563'];

// ---- top-level (orig lines 781-781) ----
let dInf={},searchDebounceTimer=null,anlDebounceTimer=null,chartTimer=null;

// ---- top-level (orig lines 782-782) ----
let currentExcelData=[], currentUploadType='', currentHeaders=[], PENDING_UPLOAD=null;

// ---- ld (orig lines 784-784) ----
function ld(s,m="İşlem yapılıyor..."){getEl('l-txt').textContent=m;getEl('loader').style.display=s?'flex':'none';}

// ---- showToast (orig lines 786-794) ----
function showToast(message, type = 'info', duration = 4000) {
  const container = getEl('toastContainer');
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span><span class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'slideOutRight 0.3s ease-out forwards'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ---- toTitleCase (orig lines 796-799) ----
function toTitleCase(str) {
  if (!str) return '';
  return String(str).toLocaleLowerCase('tr-TR').split(' ').map(word => word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1)).join(' ');
}

// ---- init (orig lines 801-851) ----
async function init(){
  applyTheme(false);
  // ld(1,'Sistem altyapısı hazırlanıyor...'); // Bu satırı sildik/kapattık

  let v2Snap = await database.ref('db_v2/students').once('value');
  if (!v2Snap.exists()) {
    ld(1, 'Veritabanı yeni nesil altyapıya geçiriliyor (Sadece 1 kez yapılır)...');
    let oldSnap = await database.ref('sinavDB').once('value'), oldDB = oldSnap.val();
    if (oldDB && oldDB.s && oldDB.e) {
      let cleanStudents = oldDB.s.filter(x => x !== null);
      await database.ref('db_v2/students').set(cleanStudents);
      let meta = {}, results = {};
      oldDB.e.forEach(ex => {
        if(!ex) return; let bId = ex.examBatchId;
        if(!meta[bId]) { meta[bId] = { date: ex.date, examType: ex.examType, publisher: ex.publisher || '', count: 0, subjects: [], grades: [] }; results[bId] = []; }
        meta[bId].count++; results[bId].push(ex);
        let stGrade = getGrade(ex.studentClass);
        if(stGrade && !meta[bId].grades.includes(stGrade)) meta[bId].grades.push(stGrade);
        if(!ex.abs && ex.subs) meta[bId].subjects = Array.from(new Set([...meta[bId].subjects, ...Object.keys(ex.subs)]));
      });
      if(Object.keys(meta).length > 0) {
        await database.ref('db_v2/examMeta').set(meta); await database.ref('db_v2/examResults').set(results);
      }
    } else { await database.ref('db_v2/students').set([]); }
  }

  database.ref('db_v2/students').on('value', snap => { 
    let sData = snap.val(); DB.s = (sData ? (Array.isArray(sData) ? sData.filter(x => x) : Object.values(sData).filter(x => x)) : []).map(s => s ? {...s, name: toTitleCase(s.name)} : s);
    _stuMapCache = null; // Map index'i yenile
    rTabS(); 
    if(getEl('rapor') && getEl('rapor').classList.contains('active-pane') && typeof raporInit === 'function') raporInit();
  });

  database.ref('db_v2/examMeta').on('value', async snap => {
    EXAM_META = snap.val() || {}; uDrp(); rTabE(); uStat();
    if(getEl('rapor') && getEl('rapor').classList.contains('active-pane') && typeof raporInit === 'function') raporInit();
    if(getEl('sonuclar').classList.contains('active-pane')) reqAnl();
    if(aNo) reqProfile();
    // examResults'i examMeta ile paralel cek — panel diger bolumlerle birlikte acilsin
    let allIds = Object.keys(EXAM_META);
    let missing = allIds.filter(bId => !CACHED_RESULTS[bId]);
    if(missing.length > 0) {
      await Promise.all(missing.map(bId =>
        database.ref('db_v2/examResults/' + bId).once('value').then(s => { CACHED_RESULTS[bId] = s.val() || []; })
      ));
    }
    let validNos = new Set(DB.s.map(s => s.no));
    let allE = [];
    allIds.forEach(bId => { if(CACHED_RESULTS[bId]) allE = allE.concat(CACHED_RESULTS[bId]); });
    DB.e = allE.filter(e => e && e.studentNo && validNos.has(e.studentNo));
    _riskCache = null;
    if(getEl('sonuclar') && getEl('sonuclar').classList.contains('active-pane') && typeof uUI === 'function') uUI();
    if(getEl('rapor') && getEl('rapor').classList.contains('active-pane') && typeof raporInit === 'function') raporInit();
    renderRiskPanel();
    ld(0);
  });
}

// ---- fetchBatches (orig lines 853-862) ----
async function fetchBatches(batchIds) {
  let promises = [];
  batchIds.forEach(bId => { if(!CACHED_RESULTS[bId]) { promises.push( database.ref('db_v2/examResults/' + bId).once('value').then(snap => { CACHED_RESULTS[bId] = snap.val() || []; }) ); } });
  if(promises.length > 0) { ld(1, 'Sonuçlar indiriliyor...'); await Promise.all(promises); ld(0); }
  // === FIX: DB.e'yi tüm cache'teki verilerden yeniden oluştur (sadece istenen batch değil) ===
  let allE = [];
  Object.keys(CACHED_RESULTS).forEach(bId => { if(CACHED_RESULTS[bId]) allE = allE.concat(CACHED_RESULTS[bId]); });
  let validNos = new Set(DB.s.map(s => s.no));
  DB.e = allE.filter(e => e && e.studentNo && validNos.has(e.studentNo));
}

// ---- reqProfile (orig lines 866-871) ----
async function reqProfile() {
  if(!aNo) return;
  let st = getStuMap().get(aNo), stGrade = st ? getGrade(st.class) : null, neededBatches = [];
  Object.keys(EXAM_META).forEach(bId => { let meta = EXAM_META[bId]; if(metaHasGrade(meta, stGrade)) neededBatches.push(bId); });
  await fetchBatches(neededBatches); rH();
}

// ---- reqAnl (orig lines 873-940) ----
async function reqAnl() {
  let eT = getEl('aEx').value, dt = getAnalysisDateValue(), aT = getEl('aType').value, sub = getSelectValueIfEnabled('aSub');
  let needed = [];
  if(typeof updateFilterSummary === 'function') updateFilterSummary();

  // Risk analizi modu: fetch gerekmez, renderRiskPanel zaten uUI'dan çağrılıyor
  if(aT === 'risk') { if(typeof applyExamColorToFilters === 'function') applyExamColorToFilters(); return; }

  if(aT === 'student'){
    if(!aNo){
      showAnalysisHint('Analiz oluşturmak için öğrenci seçin.');
      return;
    }
    if(!eT){
      showAnalysisHint('Analiz oluşturmak için sınav türünü seçin.');
      return;
    }
    if(!hasStudentExamDateSelection()){
      showAnalysisHint('Analiz oluşturmak için sınav seçin ya da "Tüm Sınavlar" seçeneğini kullanın.');
      return;
    }
    if(!sub){
      showAnalysisHint('Analiz oluşturmak için veri türünü seçin.');
      return;
    }
  }

  let lvlF = (aT==='class'||aT==='subject'||aT==='examdetail') && getEl('aLvl') ? getEl('aLvl').value : '';
  let brRawF = (aT==='class'||aT==='subject'||aT==='examdetail') && getEl('aBr') ? getEl('aBr').value : '';
  if((aT === 'class' || aT === 'subject' || aT === 'examdetail') && !lvlF){
    showAnalysisHint('Analiz oluşturmak için sınıf seviyesini seçin.');
    return;
  }
  if((aT === 'class' || aT === 'subject' || aT === 'examdetail') && !brRawF){
    showAnalysisHint('Analiz oluşturmak için şube seçin ya da "Tümü" seçeneğini kullanın.');
    return;
  }
  if((aT === 'class' || aT === 'subject' || aT === 'examdetail') && !eT){
    showAnalysisHint('Analiz oluşturmak için sınav türünü seçin.');
    return;
  }
  if((aT === 'class' || aT === 'subject') && !sub){
    showAnalysisHint(aT === 'subject' ? 'Analiz oluşturmak için dersi seçin.' : 'Analiz oluşturmak için veri türünü seçin.');
    return;
  }
  if((aT === 'class' || aT === 'subject') && !hasAnalysisDateSelection()){
    showAnalysisHint('Analiz oluşturmak için sınav seçin ya da "Tüm Sınavlar" seçeneğini kullanın.');
    return;
  }
  if(aT === 'examdetail' && !hasAnalysisDateSelection()){
    showAnalysisHint('Analiz oluşturmak için sınav seçin ya da "Tüm Sınavlar" seçeneğini kullanın.');
    return;
  }
  if(aT === 'examdetail' && !sub){
    showAnalysisHint('Analiz oluşturmak için veri türünü seçin.');
    return;
  }

  if(!eT){
    if(typeof applyExamColorToFilters === 'function') applyExamColorToFilters();
    if(typeof rAnl === 'function') rAnl();
    else getEl('anlRes').innerHTML='';
    return;
  }

  // Hangi batch'lerin yüklenmesi gerektiğini belirle
  if(aT === 'student'){
    // Öğrenci analizi: öğrenci seçilmeli
    if(!aNo){ getEl('anlRes').innerHTML=''; return; }
    let st = getStuMap().get(aNo), stuGrade = st ? getGrade(st.class) : null;
    Object.keys(EXAM_META).forEach(bId => {
      let m = EXAM_META[bId];
      if(m.examType !== eT) return;
      if(!metaHasGrade(m, stuGrade)) return;
      needed.push(bId);
    });
  } else if(aT === 'class' || aT === 'subject'){
    // Sınıf/Ders analizi: öğrenci seçiminden bağımsız
    Object.keys(EXAM_META).forEach(bId => {
      let m = EXAM_META[bId];
      if(m.examType !== eT) return;
      if(!metaHasGrade(m, lvlF)) return;
      if(dt && m.date !== dt) return;
      needed.push(bId);
    });
  } else if(aT === 'examdetail'){
    // Sınav analizi: öğrenci seçiminden bağımsız
    if(sub === 'general_summary' || sub === 'list_all'){
      // Tüm sınavlar
      Object.keys(EXAM_META).forEach(bId => {
        let m = EXAM_META[bId];
        if(m.examType !== eT) return;
        if(!metaHasGrade(m, lvlF)) return;
        needed.push(bId);
      });
    } else {
      // Tek sınav + önceki sınav (özet için)
      let allMatchingDates = [];
      Object.keys(EXAM_META).forEach(bId => {
        let m = EXAM_META[bId];
        if(m.examType !== eT) return;
        if(!metaHasGrade(m, lvlF)) return;
        allMatchingDates.push(m.date);
      });
      allMatchingDates = [...new Set(allMatchingDates)].sort(srt);
      Object.keys(EXAM_META).forEach(bId => {
        let m = EXAM_META[bId];
        if(m.examType !== eT) return;
        if(!metaHasGrade(m, lvlF)) return;
        if(m.date === dt){ needed.push(bId); }
        else if(sub === 'summary'){
          let ci = allMatchingDates.indexOf(dt);
          let prevDate = ci > 0 ? allMatchingDates[ci-1] : null;
          if(prevDate && m.date === prevDate) needed.push(bId);
        }
      });
    }
  }

  if(needed.length > 0) await fetchBatches(needed); 
  rAnl();
}

// ---- reqUI (orig lines 942-942) ----
async function reqUI() {
  const typeEl = getEl('aType');
  const currentType = typeEl ? typeEl.value : '';
  const previousType = typeEl ? (typeEl.dataset.lastType || '') : '';
  if(previousType && previousType !== currentType && typeof _resetSel === 'function'){
    ['aLvl','aBr','aEx','aDate','aExDate','aSub'].forEach(_resetSel);
    if(getEl('anlRes')) getEl('anlRes').innerHTML = '';
  }
  if(typeEl) typeEl.dataset.lastType = currentType;
  uUI();
  if(typeof updateFilterSummary === 'function') updateFilterSummary();
  await reqAnl();
}

// ---- normTR (orig lines 1030-1030) ----
function normTR(s){return String(s||'').toLocaleLowerCase('tr-TR').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c');}

// ---- pN (orig lines 1031-1031) ----
function pN(v){let n=parseFloat(String(v||0).replace(',','.'));return isNaN(n)?0:n;}

// ---- srt (orig lines 1033-1045) ----
function srt(a,b){
  // === FIX: Tarihler her zaman GG.AA.YYYY -> Date olarak karşılaştırılır (string sıralama yok) ===
  let parseDate = (dStr) => {
    if(!dStr) return new Date(0);
    let s = String(dStr).trim();
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if(m) return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
    let m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(m2) return new Date(parseInt(m2[1]), parseInt(m2[2])-1, parseInt(m2[3]));
    let d = new Date(s); return isNaN(d.getTime()) ? new Date(0) : d;
  };
  return parseDate(a) - parseDate(b);
}

// ---- linRegSlope (orig lines 1050-1057) ----
function linRegSlope(values){
  let arr = (values||[]).filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number);
  let n = arr.length; if(n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for(let i = 0; i < n; i++){ sumX += i; sumY += arr[i]; sumXY += i*arr[i]; sumXX += i*i; }
  let denom = (n*sumXX - sumX*sumX); if(denom === 0) return 0;
  return (n*sumXY - sumX*sumY) / denom;
}

// ---- linRegR2: Regresyonun açıklayıcılığı (0=gürültü, 1=mükemmel trend) ----
function linRegR2(values){
  let arr = (values||[]).filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number);
  let n = arr.length; if(n < 2) return 0;
  let meanY = arr.reduce((a,b)=>a+b,0)/n;
  let slope = linRegSlope(arr);
  // intercept
  let sumX = (n*(n-1))/2;
  let intercept = meanY - slope*(sumX/n);
  let ssTot = arr.reduce((a,v)=>a+Math.pow(v-meanY,2),0);
  if(ssTot===0) return 1;
  let ssRes = arr.reduce((a,v,i)=>a+Math.pow(v-(intercept+slope*i),2),0);
  return Math.max(0, Math.min(1, 1 - ssRes/ssTot));
}

// ---- linRegRMSE: Regresyon doğrusundan kalıntıların RMSE'si (Standart Hata) ----
// "Sürpriz Payı": öğrencinin sınav sonucu, trend doğrusunun tahmininden ortalama
// olarak ne kadar sapıyor? Düşük = trend güvenilir, yüksek = sürpriz dolu.
// İstatistiksel olarak: sqrt(SSres / (n-2)). En az 3 veri gerekir.
function linRegRMSE(values){
  let arr = (values||[]).filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number);
  let n = arr.length; if(n < 3) return null;
  let meanY = arr.reduce((a,b)=>a+b,0)/n;
  let slope = linRegSlope(arr);
  let sumX = (n*(n-1))/2;
  let intercept = meanY - slope*(sumX/n);
  let ssRes = arr.reduce((a,v,i)=>a+Math.pow(v-(intercept+slope*i),2),0);
  // n-2: regresyon iki parametre (slope + intercept) tahmin ettiği için serbestlik derecesi
  return Math.sqrt(ssRes / (n - 2));
}

// ---- ewma: Üstel Ağırlıklı Hareketli Ortalama (son windowSize sınav baz alınır) ----
// alpha: düzeltme faktörü (varsayılan 0.5 — son sınavın ağırlığı daha yüksek)
function ewma(values, windowSize, alpha){
  let arr = (values||[]).filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number);
  if(!arr.length) return null;
  alpha = alpha || 0.5;
  windowSize = windowSize || 3;
  // Son windowSize sınava kısıtla
  let window_ = arr.slice(-windowSize);
  let result = window_[0];
  for(let i = 1; i < window_.length; i++){
    result = alpha * window_[i] + (1 - alpha) * result;
  }
  return result;
}

// ---- calcZScore: Bir değerin popülasyon içindeki z-skorunu hesapla ----
function calcZScore(value, population){
  let arr = (population||[]).filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number);
  let n = arr.length; if(n < 2) return 0;
  let mean = arr.reduce((a,b)=>a+b,0)/n;
  let variance = arr.reduce((a,v)=>a+Math.pow(v-mean,2),0)/n;
  let std = Math.sqrt(variance);
  if(std===0) return 0;
  return (value - mean) / std;
}

// ---- escapeHtml: XSS koruması için HTML özel karakterleri kaçış ----
function escapeHtml(str){
  if(str===null||str===undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#x27;')
    .replace(/\//g,'&#x2F;');
}

function jsArg(value){
  return escapeHtml(JSON.stringify(String(value ?? '')));
}

function optionHtml(value, label, selected = false, disabled = false){
  return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeHtml(label)}</option>`;
}

function safeFileName(value, fallback = 'rapor'){
  let s = String(value || fallback).trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
  return (s || fallback).slice(0, 120);
}

// ---- buildStuMap: O(1) öğrenci araması için Map index ----
// DB.s değiştiğinde çağrılır; _stuMap._ts !== DB.s.length ile stale check yapılır
let _stuMapCache = null;
function getStuMap(){
  if(_stuMapCache && _stuMapCache._len === DB.s.length) return _stuMapCache._map;
  _stuMapCache = { _map: new Map(DB.s.map(s=>[s.no, s])), _len: DB.s.length };
  return _stuMapCache._map;
}
