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
  const d=getEl('connDot'),t=getEl('connTxt'),b=getEl('connBadge');if(!d)return;
  if(online){d.textContent='🟢';t.textContent='Bağlı';b.className='nav-link text-success';}
  else{d.textContent='🔴';t.textContent='Çevrimdışı';b.className='nav-link text-danger';}
}

// ---- top-level (orig lines 694-694) ----
database.ref('.info/connected').on('value',snap=>uConn(snap.val()===true));

// ---- top-level (orig lines 696-696) ----
const ADMIN_UID="YLozrXC5w4OmD4HRzjlgF80qPCp1";

// ---- checkAuth (orig lines 698-721) ----
function checkAuth(){
  auth.onAuthStateChanged(user=>{
    if(user){
      getEl('loginScreen').style.display='none';
      getEl('mainApp').style.display='block';
      if(getEl('userEmail'))getEl('userEmail').textContent=user.email;
      if(getEl('sideUserEmail'))getEl('sideUserEmail').textContent=user.email;
      document.body.classList.remove('is-admin');
      if(user.uid===ADMIN_UID)document.body.classList.add('is-admin');
      init(); showPwaPopupIfReady();
      
      // Yenileme sonrası mevcut URL hash'ini oku ve o sekmede kal
      setTimeout(() => { 
        let hash = window.location.hash.replace('#', '');
        let validPanes = ['anasayfa_genel', 'anasayfa', 'sonuclar', 'rapor', 'ayarlar'];
        let targetPane = validPanes.includes(hash) ? hash : 'anasayfa_genel';
        
        // History'yi güncelle ve sekmeyi aktif et
        window.history.replaceState({ pane: targetPane }, '', '#' + targetPane);
        executeTabSwitch(targetPane, true); // UI'ı bu sekmeye geçir
      }, 100);

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
  const orgHTML='<i class="fas fa-sign-in-alt mr-2"></i>Giriş Yap';
  btn.innerHTML='<span class="spinner-border spinner-border-sm mr-2"></span>Giriş yapılıyor...';btn.disabled=true;
  auth.signInWithEmailAndPassword(em,pa).then(()=>{btn.innerHTML=orgHTML;btn.disabled=false;}).catch(e=>{
    btn.innerHTML=orgHTML;btn.disabled=false;
    err.className='alert alert-danger mt-3 mb-0';err.style.display='block';
    if(e.code.includes('user-not-found')||e.code.includes('wrong-password')||e.code.includes('invalid-credential')) err.innerHTML='<i class="fas fa-exclamation-circle mr-2"></i>Hatalı e-posta veya şifre.';
    else err.innerHTML='<i class="fas fa-times-circle mr-2"></i>Hata: '+e.message;
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
  getEl('forgotMsg').innerHTML = ''; jQuery('#mForgot').modal('show');
}

// ---- sendPasswordReset (orig lines 753-765) ----
function sendPasswordReset() {
  let em = getEl('forgotEmail').value.trim(), msg = getEl('forgotMsg');
  if(!em) { msg.innerHTML = '<span class="text-danger">E-posta adresi gerekli.</span>'; return; }
  auth.sendPasswordResetEmail(em).then(() => {
    msg.innerHTML = '<span class="text-success"><i class="fas fa-check-circle mr-1"></i>Sıfırlama bağlantısı gönderildi. Lütfen e-postanızı kontrol edin.</span>';
    setTimeout(() => jQuery('#mForgot').modal('hide'), 3000);
  }).catch(err => {
    let errMsg = 'Bir hata oluştu.';
    if(err.code === 'auth/user-not-found') errMsg = 'Bu e-posta ile kayıtlı kullanıcı bulunamadı.';
    else if(err.code === 'auth/invalid-email') errMsg = 'Geçersiz e-posta adresi.';
    msg.innerHTML = `<span class="text-danger"><i class="fas fa-times-circle mr-1"></i>${errMsg}</span>`;
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
const getEl=i=>document.getElementById(i);

// ---- top-level (orig lines 776-776) ----
let DB = { s: [], e: [] };

// ---- top-level (orig lines 777-777) ----
let EXAM_META = {};

// ---- top-level (orig lines 778-778) ----
let CACHED_RESULTS = {};

// ---- top-level (orig lines 779-779) ----
let aNo=null, c={h:null,a:null};

// ---- top-level (orig lines 780-780) ----
const cols=['#0d6efd','#e6194b','#1a7f4b','#d97706','#7c3aed','#f58231','#0ea5e9','#db2777'];

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
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span><span class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></span>`;
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
    let sData = snap.val(); DB.s = sData ? (Array.isArray(sData) ? sData.filter(x => x) : Object.values(sData).filter(x => x)) : [];
    _stuMapCache = null; // Map index'i yenile
    rTabS(); 
  });

  database.ref('db_v2/examMeta').on('value', async snap => {
    EXAM_META = snap.val() || {}; uDrp(); rTabE(); uStat();
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
  Object.keys(EXAM_META).forEach(bId => { let meta = EXAM_META[bId]; if(!meta.grades || (stGrade && meta.grades.includes(stGrade))) neededBatches.push(bId); });
  await fetchBatches(neededBatches); rH();
}

// ---- reqAnl (orig lines 873-940) ----
async function reqAnl() {
  let eT = getEl('aEx').value, dt = getEl('aDate') ? getEl('aDate').value : '', aT = getEl('aType').value, sub = getEl('aSub') ? getEl('aSub').value : '';
  let needed = [];

  // Risk analizi modu: fetch gerekmez, renderRiskPanel zaten uUI'dan çağrılıyor
  if(aT === 'risk') return;

  if(!eT){ getEl('anlRes').innerHTML=''; return; }

  // Hangi batch'lerin yüklenmesi gerektiğini belirle
  let lvlF = (aT==='class'||aT==='subject'||aT==='examdetail') && getEl('aLvl') ? getEl('aLvl').value : '';

  if(aT === 'student'){
    // Öğrenci analizi: öğrenci seçilmeli
    if(!aNo){ getEl('anlRes').innerHTML=''; return; }
    let st = getStuMap().get(aNo), stuGrade = st ? getGrade(st.class) : null;
    Object.keys(EXAM_META).forEach(bId => {
      let m = EXAM_META[bId];
      if(m.examType !== eT) return;
      if(stuGrade && m.grades && m.grades.length > 0 && !m.grades.includes(stuGrade)) return;
      needed.push(bId);
    });
  } else if(aT === 'class' || aT === 'subject'){
    // Sınıf/Ders analizi: öğrenci seçiminden bağımsız
    Object.keys(EXAM_META).forEach(bId => {
      let m = EXAM_META[bId];
      if(m.examType !== eT) return;
      if(lvlF && m.grades && m.grades.length > 0 && !m.grades.includes(lvlF)) return;
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
        if(lvlF && m.grades && m.grades.length > 0 && !m.grades.includes(lvlF)) return;
        needed.push(bId);
      });
    } else {
      // Tek sınav + önceki sınav (özet için)
      let allMatchingDates = [];
      Object.keys(EXAM_META).forEach(bId => {
        let m = EXAM_META[bId];
        if(m.examType !== eT) return;
        if(lvlF && m.grades && m.grades.length > 0 && !m.grades.includes(lvlF)) return;
        allMatchingDates.push(m.date);
      });
      allMatchingDates = [...new Set(allMatchingDates)].sort(srt);
      Object.keys(EXAM_META).forEach(bId => {
        let m = EXAM_META[bId];
        if(m.examType !== eT) return;
        if(lvlF && m.grades && m.grades.length > 0 && !m.grades.includes(lvlF)) return;
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
async function reqUI() { uUI(); await reqAnl(); }

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

// ---- buildStuMap: O(1) öğrenci araması için Map index ----
// DB.s değiştiğinde çağrılır; _stuMap._ts !== DB.s.length ile stale check yapılır
let _stuMapCache = null;
function getStuMap(){
  if(_stuMapCache && _stuMapCache._len === DB.s.length) return _stuMapCache._map;
  _stuMapCache = { _map: new Map(DB.s.map(s=>[s.no, s])), _len: DB.s.length };
  return _stuMapCache._map;
}
