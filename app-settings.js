// app-settings.js — Settings CRUD, Excel upload wizard, DB exp/imp, PWA install

// ---- rTabS (orig lines 3629-3632) ----
function rTabS(){
  let t=getEl('tStu').querySelector('tbody');
  t.innerHTML=DB.s.map((s,idx)=>{
    let safeNo   = escapeHtml(s.no);
    let safeName = escapeHtml(s.name);
    let safeCls  = escapeHtml(s.class);
    let noArg    = jsArg(s.no);
    let delMsgArg= jsArg(`${s.no} numaralı öğrenci ve tüm sonuçları silinecek. Onaylıyor musunuz?`);
    return `<tr><td>${idx+1}</td><td>${safeNo}</td><td>${safeName}</td><td>${safeCls}</td><td><div class='btn-group btn-group-sm'><button class='btn btn-warning admin-only' onclick="eStu(${noArg})"><i class='fas fa-edit'></i></button><button class='btn btn-danger admin-only' onclick="cDel('student',${delMsgArg},${noArg})"><i class='fas fa-trash'></i></button></div></td></tr>`;
  }).join('');
}

// ---- filterSettingsStudents (orig lines 3634-3642) ----
function filterSettingsStudents() {
  let input = getEl('setStuSearch').value.toLocaleLowerCase('tr-TR');
  let rows = getEl('tStu').querySelectorAll('tbody tr');
  rows.forEach(row => {
      let no = row.cells[1].textContent.toLocaleLowerCase('tr-TR');
      let name = row.cells[2].textContent.toLocaleLowerCase('tr-TR');
      if(no.includes(input) || name.includes(input)) { row.style.display = ''; } else { row.style.display = 'none'; }
  });
}

// ---- rTabE (orig lines 3644-3652) ----
function rTabE(){
  let u = Object.keys(EXAM_META).map(bId => ({ examBatchId: bId, ...EXAM_META[bId] })).sort((a,b)=>{
    let dateCmp = srt(a.date, b.date); if(dateCmp !== 0) return dateCmp;
    let aGrade = (a.grades && a.grades.length > 0) ? Math.min(...a.grades.map(g=>parseInt(g)||99)) : 99;
    let bGrade = (b.grades && b.grades.length > 0) ? Math.min(...b.grades.map(g=>parseInt(g)||99)) : 99;
    return aGrade - bGrade;
  });
  getEl('tExA').innerHTML=`<table class="table table-sm table-hover text-nowrap"><thead><tr><th>#</th><th>Tarih</th><th>Tür</th><th>Sınıf Seviyesi</th><th>Yayınevi</th><th>Sayı</th><th>İşlem</th></tr></thead><tbody>${u.map((e,idx)=>{ let gl = (e.grades && e.grades.length > 0) ? [...e.grades].sort().join(', ') : 'Tümü'; let bIdArg = jsArg(e.examBatchId); return `<tr><td>${idx+1}</td><td>${escapeHtml(e.date)}</td><td>${escapeHtml(e.examType)}</td><td>${escapeHtml(gl)}</td><td>${escapeHtml(toTitleCase(e.publisher)||'—')}</td><td>${escapeHtml(e.count)}</td><td><div class="btn-group btn-group-sm"><button class="btn btn-warning admin-only" onclick="eExam(${bIdArg})" title="Düzenle"><i class='fas fa-edit'></i></button><button class="btn btn-danger admin-only" onclick="cDel('exam','Sınav tamamen silinecek. Onaylıyor musunuz?',${bIdArg})"><i class='fas fa-trash'></i></button></div></td></tr>`; }).join('')}</tbody></table>`;
}

// ---- eExam (orig lines 3654-3658) ----
function eExam(bId){
  let m = EXAM_META[bId]; if(!m) return;
  getEl('eExBatchId').value = bId; getEl('eExDate').value = m.date; getEl('eExType').value = m.examType; getEl('eExPub').value = m.publisher || '';
  showModal('mEditExam');
}

// ---- svExam (orig lines 3660-3689) ----
async function svExam(){
  let bId = getEl('eExBatchId').value, newDate = getEl('eExDate').value.trim(), newType = getEl('eExType').value.trim().toLocaleUpperCase('tr-TR'), newPub = getEl('eExPub').value.trim();
  if(!newDate || !newType){ showToast('Tarih ve tür zorunludur!','warning'); return; }
  if(!/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.test(newDate)){ showToast('Tarih formatı GG.AA.YYYY şeklinde olmalıdır! (Örn: 15.04.2024)', 'error'); return; }
  let m = EXAM_META[bId]; if(!m) return;
  let dupId = Object.keys(EXAM_META).find(id => {
    if(id === bId) return false; let em = EXAM_META[id]; if(em.examType !== newType || em.date !== newDate) return false;
    return metaIntersectsGrades(em, m.grades || []);
  });
  if(dupId){ showToast('Bu tarih ve tür kombinasyonu aynı sınıf seviyesi için zaten mevcut!','error'); return; }
  
  ld(1,'Sınav güncelleniyor...');
  try {
    EXAM_META[bId].date = newDate; EXAM_META[bId].examType = newType; EXAM_META[bId].publisher = newPub;
    await database.ref('db_v2/examMeta/'+bId).update({ date: newDate, examType: newType, publisher: newPub });
    if(CACHED_RESULTS[bId]){
      CACHED_RESULTS[bId] = CACHED_RESULTS[bId].map(e => ({...e, date: newDate, examType: newType, publisher: newPub}));
      await database.ref('db_v2/examResults/'+bId).set(CACHED_RESULTS[bId]);
    } else {
      let snap = await database.ref('db_v2/examResults/'+bId).once('value'), arr = snap.val() || [];
      let updated = arr.map(e => e ? ({...e, date: newDate, examType: newType, publisher: newPub}) : null);
      await database.ref('db_v2/examResults/'+bId).set(updated); CACHED_RESULTS[bId] = updated.filter(x=>x);
    }
    DB.e = DB.e.map(e => e.examBatchId === bId ? {...e, date: newDate, examType: newType, publisher: newPub} : e);
    rTabE(); uDrp(); uStat(); if(aNo) reqProfile(); else if(getEl('sonuclar').classList.contains('active-pane')) reqAnl();
    hideModal('mEditExam'); showToast('Sınav bilgileri güncellendi.','success');
  } catch(err){ showToast('Hata: '+err.message,'error'); }
  ld(0);
}

// ---- oMod (orig lines 3691-3691) ----
function oMod(id){showModal(id);}

// ---- cMod (orig lines 3692-3692) ----
function cMod(id){hideModal(id);}

// ---- oModAdd (orig lines 3693-3693) ----
function oModAdd(){getEl('mSTit').textContent='Öğrenci Ekle';getEl('mSNo').value='';getEl('mSNo').disabled=false;getEl('mSNa').value='';getEl('mSCl').value='';oMod('mStu');}

// ---- eStu (orig lines 3694-3694) ----
function eStu(n){let s=getStuMap().get(n);if(s){getEl('mSTit').textContent='Öğrenci Düzenle';getEl('mSNo').value=s.no;getEl('mSNo').disabled=true;getEl('mSNa').value=s.name;getEl('mSCl').value=s.class;oMod('mStu');}}

// ---- cDel (orig lines 3695-3695) ----
function cDel(t,m,id=null){dInf={t,id};getEl('cTxt').textContent=m;oMod('mConf');}

// ---- xDel (orig lines 3697-3741) ----
async function xDel(){
  let t=dInf.t,id=dInf.id;
  if(t==='student'){
    // === FIX v11: Hayalet (orphan) veri temizliği — Firebase'deki TÜM sınav paketlerinden öğrenciyi sil ===
    DB.s = DB.s.filter(x => x.no !== id);
    try {
      await database.ref('db_v2/students').set(DB.s);
      // Önce bellekte hangi paketlerde geçtiğini bul (DB.e + CACHED_RESULTS); ayrıca güvenlik için EXAM_META anahtarlarını da tara
      let touchedBatches = new Set();
      DB.e.forEach(e => { if(e.studentNo === id && e.examBatchId) touchedBatches.add(e.examBatchId); });
      Object.keys(CACHED_RESULTS||{}).forEach(bId => { if((CACHED_RESULTS[bId]||[]).some(x => x.studentNo === id)) touchedBatches.add(bId); });
      // Geriye dönük tarama: bellekte yer almayan eski paketleri de Firebase'den kontrol et
      let allBatchIds = Object.keys(EXAM_META||{});
      let unloaded = allBatchIds.filter(b => !touchedBatches.has(b) && !CACHED_RESULTS[b]);
      let unloadedScans = await Promise.all(unloaded.map(bId => database.ref('db_v2/examResults/'+bId).once('value').then(snap => ({bId, val: snap.val()||[]})).catch(() => ({bId, val: []}))));
      unloadedScans.forEach(({bId, val}) => { if(Array.isArray(val) && val.some(x => x && x.studentNo === id)) touchedBatches.add(bId); });
      // Şimdi her etkilenen paketten öğrencinin kayıtlarını sil ve Firebase'e yaz
      let writePromises = [];
      touchedBatches.forEach(bId => {
        writePromises.push((async () => {
          let snap = await database.ref('db_v2/examResults/'+bId).once('value');
          let res = snap.val() || [];
          if(!Array.isArray(res)) return;
          let cleaned = res.filter(x => x && x.studentNo !== id);
          if(cleaned.length !== res.length){
            await database.ref('db_v2/examResults/'+bId).set(cleaned);
            CACHED_RESULTS[bId] = cleaned;
          }
        })());
      });
      await Promise.all(writePromises);
      // Bellek senkronizasyonu
      Object.keys(CACHED_RESULTS).forEach(bId => { CACHED_RESULTS[bId] = (CACHED_RESULTS[bId]||[]).filter(x => x.studentNo !== id); });
      DB.e = DB.e.filter(x => x.studentNo !== id);
      if(aNo === id) sAct(null);
      showToast('Öğrenci ve tüm sınav kayıtları silindi (' + touchedBatches.size + ' paket).', 'success');
    } catch(err){
      showToast('Öğrenci silindi ama bazı sınav kayıtları temizlenemedi: ' + err.message, 'warning');
    }
  }
  else if(t==='allStudents'){ await database.ref('db_v2/students').set([]); await database.ref('db_v2/examResults').remove(); await database.ref('db_v2/examMeta').remove(); DB.s=[]; CACHED_RESULTS={}; DB.e=[]; EXAM_META={}; sAct(null); rTabS(); rTabE(); uStat(); uDrp(); }
  else if(t==='exam'){ await database.ref('db_v2/examResults/'+id).remove(); await database.ref('db_v2/examMeta/'+id).remove(); if(CACHED_RESULTS[id]) delete CACHED_RESULTS[id]; delete EXAM_META[id]; DB.e = DB.e.filter(x => x.examBatchId !== id); rTabE(); uStat(); uDrp(); if(aNo) reqProfile(); else if(getEl('sonuclar').classList.contains('active-pane')) reqAnl(); }
  else if(t==='all'){ ld(1,'Sıfırlanıyor...'); await database.ref('db_v2').remove(); await database.ref('sinavDB').remove(); location.reload(); return; }
  cMod('mConf');
}

// ---- svStu (orig lines 3743-3766) ----
async function svStu(){
  let n=String(getEl('mSNo').value).trim(),nm=getEl('mSNa').value.trim(),cc=getEl('mSCl').value.trim();
  if(!n||!nm||!cc){showToast('Tüm alanları doldurun!','warning');return;}
  let s=getStuMap().get(n); 
  
  if(s){ 
    let oldClass = s.class; s.name=toTitleCase(nm); s.class=cc; 
    if (oldClass !== cc) {
      ld(1, 'Sınav kayıtları güncelleniyor...');
      try {
        let batchesToUpdate = new Set(); DB.e.forEach(e => { if (e.studentNo === n) batchesToUpdate.add(e.examBatchId); });
        let promises = [];
        batchesToUpdate.forEach(bId => { promises.push(database.ref('db_v2/examResults/' + bId).once('value').then(snap => { let res = snap.val() || []; let changed = false; let updated = res.map(e => { if (e && e.studentNo === n && e.studentClass !== cc) { changed = true; return { ...e, studentClass: cc }; } return e; }); if (changed) { if (CACHED_RESULTS[bId]) CACHED_RESULTS[bId] = updated.filter(x=>x); return database.ref('db_v2/examResults/' + bId).set(updated); } })); });
        await Promise.all(promises); DB.e = DB.e.map(e => e.studentNo === n ? { ...e, studentClass: cc } : e);
      } catch (err) { showToast('Sınıf güncellenirken hata oluştu: ' + err.message, 'error'); }
      ld(0);
    }
    if(aNo===n) reqProfile(); 
  } else{ DB.s.push({no:n,name:toTitleCase(nm),class:cc}); }
  
  await database.ref('db_v2/students').set(DB.s); rTabS(); uStat();
  if(aNo){ let upd=getStuMap().get(aNo); if(upd){ getEl('aBadge').innerHTML=`<span class="badge bg-success rounded-pill px-3 py-2"><i class="fas fa-check-circle me-1"></i>Seçili Öğrenci: ${escapeHtml(upd.name)} (${escapeHtml(upd.class)})</span>`; let ab=getEl('anlStuBadge'); if(ab) ab.innerHTML=`<span class="badge bg-success rounded-pill px-2 py-1 selected-student-pill"><i class="fas fa-check-circle me-1"></i>Seçili Öğrenci: ${escapeHtml(upd.name)} (${escapeHtml(upd.class)})</span>`; } }
  cMod('mStu'); showToast('Öğrenci bilgileri kaydedildi.', 'success');
}

// ---- expDB (orig lines 3768-3772) ----
async function expDB(){
  ld(1,'Yedek hazırlanıyor, lütfen bekleyin...');
  try { let resultsSnap = await database.ref('db_v2/examResults').once('value'); let payload = { _version: 2, _date: new Date().toISOString(), students: DB.s, examMeta: EXAM_META, examResults: resultsSnap.val() || {} }; let b = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}); let a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `TamYedek_${new Date().toLocaleDateString('tr-TR').replace(/\./g,'-')}.json`; a.click(); } catch(err) { showToast('Yedek alınamadı: ' + err.message, 'error'); }
  ld(0);
}

// ---- impDB (orig lines 3774-3786) ----
async function impDB(e){
  if(auth.currentUser.uid !== ADMIN_UID){ showToast('Bu işlem sadece admin tarafından yapılabilir.', 'error'); e.target.value = ''; return; }
  let f = e.target.files[0]; if(!f){ e.target.value=''; return; }
  if(!confirm('⚠️ Mevcut tüm verinin üzerine yazılacak.\nBu işlem geri alınamaz. Devam edilsin mi?')){ e.target.value=''; return; }
  let rd = new FileReader();
  rd.onload = async ev => {
    try {
      let p = JSON.parse(ev.target.result); if(typeof p !== 'object' || !Array.isArray(p.students)) throw new Error('Geçersiz yedek dosyası. students alanı bulunamadı.'); if(!p.examMeta || typeof p.examMeta !== 'object') throw new Error('Geçersiz yedek dosyası. examMeta alanı bulunamadı.');
      ld(1,'Veriler geri yükleniyor...'); await database.ref('db_v2').remove(); await database.ref('db_v2/students').set(p.students); await database.ref('db_v2/examMeta').set(p.examMeta); if(p.examResults && Object.keys(p.examResults).length > 0) await database.ref('db_v2/examResults').set(p.examResults);
      CACHED_RESULTS = {}; alert('✅ Geri yükleme tamamlandı. Sayfa yenilenecek.'); location.reload();
    } catch(err) { showToast('Geri yükleme başarısız: ' + err.message, 'error'); ld(0); }
  }; rd.readAsText(f); e.target.value = '';
}

// ---- cancelUpload (orig lines 3788-3788) ----
function cancelUpload() { PENDING_UPLOAD = null; getEl('fStu').value = ''; getEl('fEx').value = ''; wizardStep = 0; hideModal('mMappings'); hideModal('mUploadPreview'); }

// ---- backToMapping (orig lines 3789-3789) ----
function backToMapping() { hideModal('mUploadPreview'); showModal('mMappings'); }

// ---- upl (orig lines 3791-3829) ----
function upl(e, t) {
  let f = e.target.files[0]; if(!f) return;
  // === FIX: XLSX yükleme kırılganlığı — uzantı, boyut, sayfa ve başlık doğrulamaları ===
  let validExt = /\.(xlsx|xls|xlsm|csv)$/i;
  if(!validExt.test(f.name)) { showToast('Sadece Excel/CSV dosyaları yüklenebilir (.xlsx, .xls, .xlsm, .csv).', 'error'); e.target.value=''; return; }
  if(f.size > 25 * 1024 * 1024) { showToast('Dosya çok büyük (>25MB). Lütfen daha küçük bir dosya kullanın.', 'error'); e.target.value=''; return; }
  ld(1, 'Dosya Analiz Ediliyor...'); currentUploadType = t;
  setTimeout(() => {
    let rd = new FileReader();
    rd.onerror = () => { ld(0); e.target.value=''; showToast('Dosya okunamadı.', 'error'); };
    rd.onload = ev => {
      try {
        if(!ev || !ev.target || !ev.target.result) throw new Error('Dosya içeriği okunamadı.');
        let wb;
        try { wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array', cellDates:false, raw:true}); }
        catch(parseErr) { throw new Error('Excel dosyası bozuk veya tanınmıyor: ' + parseErr.message); }
        if(!wb || !wb.SheetNames || !wb.SheetNames.length) throw new Error('Dosyada hiç sayfa (sheet) bulunamadı.');
        // İlk dolu sayfayı bul (boş ilk sayfa varsa atla)
        let sheetName = null, sheet = null;
        for(let sn of wb.SheetNames) {
          let s = wb.Sheets[sn];
          if(s && s['!ref']) { sheetName = sn; sheet = s; break; }
        }
        if(!sheet) throw new Error('Dosyadaki tüm sayfalar boş görünüyor.');
        currentExcelData = XLSX.utils.sheet_to_json(sheet, {defval: '', raw: false});
        if(!Array.isArray(currentExcelData) || !currentExcelData.length) throw new Error('Sayfada veri satırı bulunamadı.');
        let range; try { range = XLSX.utils.decode_range(sheet['!ref']); } catch(rErr) { throw new Error('Sayfa aralığı çözümlenemedi.'); }
        currentHeaders = [];
        for(let C = range.s.c; C <= range.e.c; C++){
          let cell = sheet[XLSX.utils.encode_cell({c:C, r:range.s.r})];
          if(cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') currentHeaders.push(String(cell.v).trim());
        }
        if(!currentHeaders.length) throw new Error('Başlık satırı bulunamadı (ilk satır boş).');
        buildMappingUI(); ld(0); showModal('mMappings', {backdrop: 'static'});
      } catch(err) { ld(0); getEl('fStu').value=''; getEl('fEx').value=''; showToast('Hata: ' + (err && err.message ? err.message : 'Bilinmeyen hata'), 'error'); }
    };
    try { rd.readAsArrayBuffer(f); } catch(rErr) { ld(0); e.target.value=''; showToast('Dosya okunamadı: ' + rErr.message, 'error'); }
  }, 100);
}

// ---- buildOptions (orig lines 3831-3834) ----
function buildOptions(headers, selectedGuess, allowEmpty) {
  let html = allowEmpty ? optionHtml('', '-- Boş Geç --') : optionHtml('', '-- Seçiniz --');
  headers.forEach(h => { let sel = !!(selectedGuess && selectedGuess !== '' && (h.toLocaleLowerCase('tr-TR') === selectedGuess.toLocaleLowerCase('tr-TR') || h.toLocaleLowerCase('tr-TR').includes(selectedGuess.toLocaleLowerCase('tr-TR')))); html += optionHtml(h, h, sel); }); return html;
}

// ---- top-level (orig lines 3836-3836) ----
let wizardStep = 0;

// ---- buildMappingUI (orig lines 3838-3853) ----
function buildMappingUI() {
  let b = getEl('mMappingsBody'), h = currentHeaders;
  if(currentUploadType === 's') {
    let saved = JSON.parse(localStorage.getItem('map_s') || '{}');
    b.innerHTML = `<div class="alert alert-info py-2 mapping-info"><i class="fas fa-info-circle me-1"></i> Excel dosyanızdaki sütunları sistemdeki alanlarla eşleştirin.</div>
      <div class="wizard-section"><h6><i class="fas fa-id-card me-1"></i> Temel Alanlar</h6>
        <div class="mb-3"><label class="form-label">Öğrenci No Sütunu</label><select id="map_s_no" class="form-select">${buildOptions(h, saved.no || 'no')}</select></div>
        <div class="mb-3"><label class="form-label">Ad Soyad Sütunu</label><select id="map_s_name" class="form-select">${buildOptions(h, saved.name || 'ad')}</select></div>
        <div class="mb-0"><label class="form-label">Sınıf Sütunu</label><select id="map_s_cls" class="form-select">${buildOptions(h, saved.cls || 'sınıf')}</select></div>
      </div>`;
    getEl('mMappingsFooter').innerHTML = `<button type="button" class="btn btn-secondary" onclick="cancelUpload()">İptal</button><button type="button" class="btn btn-primary" onclick="processMappings()">Onayla ve Analiz Et <i class="fas fa-arrow-right ms-1"></i></button>`;
  } else {
    wizardStep = 0; renderWizardStep();
    getEl('mMappingsFooter').innerHTML = `<button type="button" class="btn btn-secondary" onclick="cancelUpload()">İptal</button><div class="ms-auto d-flex mapping-footer-actions"><button type="button" class="btn btn-outline-secondary" id="wizBtnBack" onclick="wizardNav(-1)" style="display:none;"><i class="fas fa-arrow-left me-1"></i>Geri</button><button type="button" class="btn btn-primary" id="wizBtnNext" onclick="wizardNav(1)">İleri <i class="fas fa-arrow-right ms-1"></i></button><button type="button" class="btn btn-success" id="wizBtnDone" onclick="processMappings()" style="display:none;">Onayla ve Analiz Et <i class="fas fa-check ms-1"></i></button></div>`;
  }
}

// ---- top-level (orig lines 3855-3855) ----
const WIZARD_STEPS = [ { id:'wiz-step-0', title:'1. Sınav Genel Bilgileri' }, { id:'wiz-step-1', title:'2. Sabit Excel Sütunları' }, { id:'wiz-step-2', title:'3. Ders Netleri Eşleştirmesi' }, { id:'wiz-step-3', title:'4. Dereceler (İsteğe Bağlı)' } ];

// ---- renderWizardStep (orig lines 3857-3891) ----
function renderWizardStep() {
  let h = currentHeaders, saved = {}; try { saved = JSON.parse(localStorage.getItem('map_e') || '{}'); } catch(e){}
  let today = new Date().toISOString().split('T')[0], [y,m,d] = today.split('-'), trDate = `${d}.${m}.${y}`, b = getEl('mMappingsBody');

  let progHtml = `<div class="wizard-progress"><div class="wizard-step-row">${WIZARD_STEPS.map((s,i) => `<div class="wizard-step-label ${i===wizardStep?'is-active':i<wizardStep?'is-complete':''}">${i<wizardStep?'✓ ':''}${s.title}</div>`).join('')}</div><div class="progress"><div class="progress-bar bg-primary wizard-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(((wizardStep+1)/WIZARD_STEPS.length)*100)}"></div></div></div>`;

  let stepHtml = '';
  if(wizardStep === 0) {
    stepHtml = `<div class="wizard-section"><h6><i class="fas fa-tag me-1"></i> Sınav Genel Bilgileri (Zorunlu)</h6>
      <div class="row"><div class="col-md-4"><div class="mb-3"><label class="form-label">Sınav Türü <small class="text-muted">(Örn: TYT)</small></label><input type="text" id="map_e_type" class="form-control" placeholder="TYT" value="${escapeHtml(saved.type||'')}"></div></div><div class="col-md-4"><div class="mb-3"><label class="form-label">Tarih <small class="text-muted">(GG.AA.YYYY)</small></label><input type="text" id="map_e_date" class="form-control" placeholder="15.04.2024" value="${escapeHtml(saved.date||trDate)}"></div></div><div class="col-md-4"><div class="mb-3"><label class="form-label">Yayınevi <small class="text-muted">(İsteğe Bağlı)</small></label><input type="text" id="map_e_pub" class="form-control" placeholder="MEB" value="${escapeHtml(saved.pub||'')}"></div></div></div>
      <div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="map_e_mark_absent" ${saved.markAbsent?'checked':''}><label class="form-check-label" for="map_e_mark_absent">Dosyada olmayan sınıf öğrencilerini <strong>katılmadı</strong> olarak işaretle</label><div class="form-text">Kısmi/filtreli Excel yüklemelerinde bu seçenek kapalı kalmalıdır.</div></div></div>`;
  } else if(wizardStep === 1) {
    stepHtml = `<div class="wizard-section"><h6><i class="fas fa-columns me-1"></i> Sabit Excel Sütunları</h6>
      <div class="row"><div class="col-md-4"><div class="mb-3"><label class="form-label">Öğrenci No Sütunu <span class="text-danger">*</span></label><select id="map_e_no" class="form-select">${buildOptions(h, saved.no||'no')}</select></div></div><div class="col-md-4"><div class="mb-3"><label class="form-label">Toplam Net Sütunu <span class="text-danger">*</span></label><select id="map_e_tnet" class="form-select">${buildOptions(h, saved.tnet||'toplam')}</select></div></div><div class="col-md-4"><div class="mb-3"><label class="form-label">Toplam Puan Sütunu <span class="text-danger">*</span></label><select id="map_e_score" class="form-select">${buildOptions(h, saved.score||'puan')}</select></div></div></div></div>`;
  } else if(wizardStep === 2) {
    stepHtml = `<div class="wizard-section"><div class="d-flex justify-content-between align-items-center mb-3"><h6 class="mb-0 border-0"><i class="fas fa-book-open me-1"></i> Ders Netleri Eşleştirmesi</h6><button class="btn btn-success btn-sm" onclick="addSubjectRow()"><i class="fas fa-plus me-1"></i>Ders Ekle</button></div><p class="text-muted wizard-subject-note">Sadece analize dahil etmek istediğiniz dersleri seçin ve isimlendirin. Eşleştirilmeyenler tabloda — olarak görünür.</p><div id="subjectMapContainer"></div></div>`;
  } else if(wizardStep === 3) {
    stepHtml = `<div class="wizard-section"><h6><i class="fas fa-medal me-1"></i> Dereceler (İsteğe Bağlı)</h6><p class="text-muted wizard-note">Sınıf ve Kurum sıralaması artık sistem tarafından otomatik hesaplanmaktadır. Buradan yalnızca İlçe, İl ve Genel sıralamayı Excel'den alabilirsiniz.</p>
      <div class="row"><div class="col-md-6"><div class="mb-3"><label class="form-label"><i class="fas fa-city me-1"></i>İlçe Sırası Sütunu</label><select id="map_e_dR" class="form-select">${buildOptions(h, saved.dR||'ilçe sıra', true)}</select></div></div><div class="col-md-6"><div class="mb-3"><label class="form-label">İlçe Kişi Sayısı Sütunu</label><select id="map_e_dP" class="form-select">${buildOptions(h, saved.dP||'', true)}</select></div></div><div class="col-md-6"><div class="mb-3"><label class="form-label"><i class="fas fa-map-marker-alt me-1"></i>İl Sırası Sütunu</label><select id="map_e_pR" class="form-select">${buildOptions(h, saved.pR||'il sıra', true)}</select></div></div><div class="col-md-6"><div class="mb-3"><label class="form-label">İl Kişi Sayısı Sütunu</label><select id="map_e_pP" class="form-select">${buildOptions(h, saved.pP||'', true)}</select></div></div><div class="col-md-6"><div class="mb-3"><label class="form-label"><i class="fas fa-globe-europe me-1"></i>Genel Sırası Sütunu</label><select id="map_e_gR" class="form-select">${buildOptions(h, saved.gR||'genel sıra', true)}</select></div></div><div class="col-md-6"><div class="mb-3"><label class="form-label">Genel Kişi Sayısı Sütunu</label><select id="map_e_gP" class="form-select">${buildOptions(h, saved.gP||'', true)}</select></div></div></div></div>`;
  }
  
  b.innerHTML = progHtml + stepHtml;
  let progBar = b.querySelector('.wizard-progress-bar');
  if(progBar) progBar.style.width = `${((wizardStep+1)/WIZARD_STEPS.length)*100}%`;
  
  if(wizardStep === 2) {
    let savedSubs = []; try { savedSubs = JSON.parse(localStorage.getItem('map_e') || '{}').subs || []; } catch(e){}
    if(savedSubs.length > 0) { savedSubs.forEach(s => addSubjectRow(s.col, s.name)); } else {
      let trCol = h.find(x => x.toLocaleLowerCase('tr-TR').includes('türkçe') || x.toLocaleLowerCase('tr-TR') === 'tr'), matCol = h.find(x => x.toLocaleLowerCase('tr-TR').includes('matematik') || x.toLocaleLowerCase('tr-TR') === 'mat');
      if(trCol) addSubjectRow(trCol, 'Türkçe'); if(matCol) addSubjectRow(matCol, 'Matematik'); if(!trCol && !matCol) addSubjectRow();
    }
  }

  let btnBack = getEl('wizBtnBack'), btnNext = getEl('wizBtnNext'), btnDone = getEl('wizBtnDone');
  if(btnBack) btnBack.style.display = wizardStep > 0 ? 'inline-block' : 'none';
  if(btnNext) btnNext.style.display = wizardStep < WIZARD_STEPS.length - 1 ? 'inline-block' : 'none';
  if(btnDone) btnDone.style.display = wizardStep === WIZARD_STEPS.length - 1 ? 'inline-block' : 'none';
}

// ---- wizardNav (orig lines 3893-3893) ----
function wizardNav(dir) { saveWizardStepData(); wizardStep = Math.max(0, Math.min(WIZARD_STEPS.length - 1, wizardStep + dir)); renderWizardStep(); }

// ---- saveWizardStepData (orig lines 3895-3902) ----
function saveWizardStepData() {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('map_e') || '{}'); } catch(e){}
  if(wizardStep === 0) { let t = getEl('map_e_type'), d = getEl('map_e_date'), p = getEl('map_e_pub'), ma = getEl('map_e_mark_absent'); if(t) saved.type = t.value; if(d) saved.date = d.value; if(p) saved.pub = p.value; if(ma) saved.markAbsent = ma.checked; }
  else if(wizardStep === 1) { let no = getEl('map_e_no'), tn = getEl('map_e_tnet'), sc = getEl('map_e_score'); if(no) saved.no = no.value; if(tn) saved.tnet = tn.value; if(sc) saved.score = sc.value; }
  else if(wizardStep === 2) { let rows = document.querySelectorAll('.subj-map-row'), subs = []; rows.forEach(r => { let c = r.querySelector('.map-subj-col').value, n = r.querySelector('.map-subj-name').value.trim(); if(c && n) subs.push({col:c,name:n}); }); saved.subs = subs; }
  else if(wizardStep === 3) { ['dR','dP','pR','pP','gR','gP'].forEach(k => { let el = getEl('map_e_'+k); if(el) saved[k] = el.value; }); ['cR','cP','iR','iP'].forEach(k => { delete saved[k]; }); }
  try { localStorage.setItem('map_e', JSON.stringify(saved)); } catch(e) {}
}

// ---- addSubjectRow (orig lines 3904-3910) ----
function addSubjectRow(selectedCol = '', typedName = '') {
  let div = document.createElement('div'); div.className = 'subj-map-row';
  let html = `<select class="form-select form-select-sm map-subj-col">${optionHtml('', '-- Excel Sütunu Seçin --')}`;
  currentHeaders.forEach(h => { html += optionHtml(h, h, h === selectedCol); });
  html += `</select><i class="fas fa-arrow-right text-muted mx-2 "></i><input type="text" class="form-control form-control-sm map-subj-name" placeholder="Sistemde Görünecek Ad (Örn: Türkçe)" value="${escapeHtml(toTitleCase(typedName))}"><button class="btn btn-danger btn-sm btn-remove" onclick="this.parentElement.remove()" title="Sil"><i class="fas fa-trash"></i></button>`;
  div.innerHTML = html; getEl('subjectMapContainer').appendChild(div);
}

// ---- processMappings (orig lines 3912-3989) ----
function processMappings() {
  let d = currentExcelData, previewHtml = '';
  if(currentUploadType === 's') {
    let cNo = getEl('map_s_no').value, cName = getEl('map_s_name').value, cCls = getEl('map_s_cls').value;
    if(!cNo || !cName || !cCls) { showToast('Lütfen tüm temel alanları eşleştirin.', 'warning'); return; }
    try { localStorage.setItem('map_s', JSON.stringify({no: cNo, name: cName, cls: cCls})); } catch(e) {}

    let newStus = [], existingNos = [], invalidRows = [];
    d.forEach((r, i) => {
      let n = String(r[cNo]||'').trim(), nm = String(r[cName]||'').trim(), cc = String(r[cCls]||'').trim();
      if(!n || !nm || !cc) { invalidRows.push({ rowNum: i + 2, data: `${n || '—'} - ${nm || '—'}`, reason: 'Eksik Alan' }); return; }
      if(getStuMap().get(n)) existingNos.push(n); else newStus.push({no:n, name:toTitleCase(nm), class:cc});
    });

    if(newStus.length === 0 && existingNos.length === 0) { showToast('Geçerli veri bulunamadı.', 'error'); return; }

    previewHtml = `<h5 class="text-primary border-bottom pb-2 mb-3">Öğrenci Listesi Analizi</h5>
      <div class="row"><div class="col-md-4"><div class="preview-box"><strong>Eklenecek Yeni:</strong><br><span class="text-success preview-count-lg">${newStus.length} Kişi</span></div></div>
      <div class="col-md-4"><div class="preview-box warning"><strong>Zaten Kayıtlı (Atlanacak):</strong><br><span class="text-warning preview-count-lg">${existingNos.length} Kişi</span></div></div>
      <div class="col-md-4"><div class="preview-box danger"><strong>Hatalı/Eksik Satır:</strong><br><span class="text-danger preview-count-lg">${invalidRows.length} Satır</span></div></div></div>`;
    if(existingNos.length > 0) previewHtml += `<div class="alert alert-warning mt-2 preview-alert"><strong>Sistemde Zaten Olan Numaralar:</strong> ${existingNos.slice(0,20).map(escapeHtml).join(', ')}${existingNos.length>20?'...':''}</div>`;
    if(invalidRows.length > 0) previewHtml += `<div class="table-responsive mt-3 preview-error-table"><table class="table table-sm table-striped mb-0"><thead><tr><th class="preview-col-row">Satır</th><th>Okunan Veri</th><th>Hata Nedeni</th></tr></thead><tbody>${invalidRows.map(err => `<tr><td><strong>${escapeHtml(err.rowNum)}</strong></td><td>${escapeHtml(err.data)}</td><td class="text-danger">${escapeHtml(err.reason)}</td></tr>`).join('')}</tbody></table></div>`;
    PENDING_UPLOAD = { type: 's', data: newStus };

  } else {
    let _sv = {}; try { _sv = JSON.parse(localStorage.getItem('map_e') || '{}'); } catch(e) {}
    let eType = (getEl('map_e_type') ? getEl('map_e_type').value.trim() : (_sv.type||'')).toLocaleUpperCase('tr-TR');
    let eDate = getEl('map_e_date') ? getEl('map_e_date').value.trim() : (_sv.date || ''), ePub = getEl('map_e_pub') ? getEl('map_e_pub').value.trim() : (_sv.pub || '');
    let cNo = getEl('map_e_no') ? getEl('map_e_no').value : (_sv.no || ''), cTnet = getEl('map_e_tnet') ? getEl('map_e_tnet').value : (_sv.tnet || ''), cScore = getEl('map_e_score') ? getEl('map_e_score').value : (_sv.score || '');
    
    saveWizardStepData(); let _saved = {}; try { _saved = JSON.parse(localStorage.getItem('map_e') || '{}'); } catch(e) {}
    if(!eType) { showToast('Lütfen Sınav Türünü girin (Adım 1).', 'warning'); return; } 
    if(!eDate) { showToast('Lütfen Sınav Tarihini girin (Adım 1).', 'warning'); return; }
    if(!/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.test(eDate)){ showToast('Tarih formatı GG.AA.YYYY şeklinde olmalıdır! (Örn: 15.04.2024)', 'error'); return; }
    if(!cNo)   { showToast('Lütfen Öğrenci No sütununu seçin (Adım 2).', 'warning'); return; } if(!cTnet) { showToast('Lütfen Toplam Net sütununu seçin (Adım 2).', 'warning'); return; }
    if(!cScore){ showToast('Lütfen Puan sütununu seçin (Adım 2).', 'warning'); return; }

    let subRows = document.querySelectorAll('.subj-map-row'), subsMap = []; subRows.forEach(r => { let c = r.querySelector('.map-subj-col').value, n = r.querySelector('.map-subj-name').value.trim(); if(c && n) subsMap.push({col: c, name: n}); });
    if(subsMap.length === 0) { let _lsSubs = []; try { _lsSubs = JSON.parse(localStorage.getItem('map_e') || '{}').subs || []; } catch(e) {} if(_lsSubs.length > 0) subsMap = _lsSubs; }
    if(subsMap.length === 0) { showToast('En az bir ders neti eşleştirmelisiniz (Adım 3).', 'warning'); return; }

    saveWizardStepData(); let finalSaved = {}; try { finalSaved = JSON.parse(localStorage.getItem('map_e') || '{}'); } catch(e){}
    let markAbsent = !!finalSaved.markAbsent;
    let cRank = { cR: '', cP: '', iR: '', iP: '', dR: finalSaved.dR||'', dP: finalSaved.dP||'', pR: finalSaved.pR||'', pP: finalSaved.pP||'', gR: finalSaved.gR||'', gP: finalSaved.gP||'' };

    let gradesFound = new Set();
    d.forEach(r => { let no = String(r[cNo]||'').trim(); if(no) { let st = getStuMap().get(no); if(st) { let gr = getGrade(st.class); if(gr) gradesFound.add(gr); } } });
    let existsId = Object.keys(EXAM_META).find(id => { let em = EXAM_META[id]; if(em.examType !== eType || em.date !== eDate) return false; return metaIntersectsGrades(em, gradesFound); });
    let bId = existsId || Date.now().toString();
    let cl=new Set(), sn=new Set(), validResults = [], missingStus = [], invalidRows = [], subjectsFound = new Set(), seenStudentNos = new Set();

    d.forEach((r, i) => {
      let no = String(r[cNo]||'').trim(), st = getStuMap().get(no), net = r[cTnet];
      if(!no) { invalidRows.push({ rowNum: i + 2, no: '—', reason: 'Numara Boş' }); return; }
      if(!st) { missingStus.push(no); return; } 
      if(net === undefined || net === null || net === '') { invalidRows.push({ rowNum: i + 2, no: no, reason: 'Toplam Net Yok' }); return; }
      if(seenStudentNos.has(no)) { invalidRows.push({ rowNum: i + 2, no: no, reason: `Mükerrer Öğrenci` }); return; }
      seenStudentNos.add(no); cl.add(st.class); sn.add(no);
      let getRank = (col) => { if(!col) return '-'; let v = r[col]; return (v !== undefined && v !== null && v !== '') ? String(v) : '-'; };
      let ex = { examBatchId:bId, studentNo:st.no, studentClass:st.class, date:eDate, examType:eType, publisher:toTitleCase(ePub), totalNet:pN(r[cTnet]), score:pN(r[cScore]), cR:getRank(cRank.cR), cP:getRank(cRank.cP), iR:getRank(cRank.iR), iP:getRank(cRank.iP), dR:getRank(cRank.dR), dP:getRank(cRank.dP), pR:getRank(cRank.pR), pP:getRank(cRank.pP), gR:getRank(cRank.gR), gP:getRank(cRank.gP), abs:false, subs:{} };
      subsMap.forEach(sm => { let rawVal = r[sm.col]; if(rawVal !== undefined && rawVal !== null && rawVal !== '') { ex.subs[toTitleCase(sm.name)] = {net: pN(rawVal)}; subjectsFound.add(toTitleCase(sm.name)); } });
      validResults.push(ex);
    });

    let clsGroups = {}, instGroups = {};
    validResults.filter(x=>!x.abs).forEach(x => { if(!clsGroups[x.studentClass]) clsGroups[x.studentClass] = []; clsGroups[x.studentClass].push(x); let gr = getGrade(x.studentClass); if(!instGroups[gr]) instGroups[gr] = []; instGroups[gr].push(x); });
    Object.values(clsGroups).forEach(arr => { arr.sort((a,b) => (b.score||0) - (a.score||0)); arr.forEach((r, idx) => { r.cR = String(idx+1); r.cP = String(arr.length); }); });
    Object.values(instGroups).forEach(arr => { arr.sort((a,b) => (b.score||0) - (a.score||0)); arr.forEach((r, idx) => { r.iR = String(idx+1); r.iP = String(arr.length); }); });
    let absentCount = 0, notInFileCount = 0;
    DB.s.forEach(s => {
      if(cl.has(s.class) && !sn.has(s.no)) {
        if(markAbsent) {
          validResults.push({ examBatchId:bId, studentNo:s.no, studentClass:s.class, date:eDate, examType:eType, publisher:toTitleCase(ePub), totalNet:0, score:0, cR:'-', cP:'-', iR:'-', iP:'-', dR:'-', dP:'-', pR:'-', pP:'-', gR:'-', gP:'-', abs:true, subs:{} });
          absentCount++;
        } else {
          notInFileCount++;
        }
      }
    });
    if(validResults.length === 0) { showToast('Sisteme eklenecek geçerli bir sınav sonucu bulunamadı.', 'error'); return; }
    let overwriteWarning = existsId ? `<div class="alert alert-danger mt-3"><strong><i class="fas fa-exclamation-triangle me-2"></i>DİKKAT!</strong> Sistemde <b>${eDate}</b> tarihli bir <b>${eType}</b> sınavı zaten var. Onaylarsanız, eski veriler tamamen silinip bu dosyadaki verilerle değiştirilecektir!</div>` : '';
    let missingFromFileLabel = markAbsent ? 'Katılmadı:' : 'Dosyada Yok:';
    let missingFromFileClass = markAbsent ? 'text-warning' : 'text-muted';
    let missingFromFileTitle = markAbsent ? 'Sınıf listesinde olup dosyada bulunmayanlar. Katılmadı olarak işaretlenecek.' : 'Sınıf listesinde olup dosyada bulunmayanlar. Devamsız sayılmayacak ve kayıt oluşturulmayacak.';
    let missingFromFileCount = markAbsent ? absentCount : notInFileCount;
    previewHtml = `<h5 class="text-primary border-bottom pb-2 mb-3">Sınav Analizi: <strong>${escapeHtml(eType)}</strong> - ${escapeHtml(eDate)} <small class="text-muted">(${escapeHtml(toTitleCase(ePub)||'Yayınevi Yok')})</small></h5>
      <div class="row"><div class="col-md-3"><div class="preview-box compact"><strong>Geçerli Sonuç:</strong><br><span class="text-success preview-count-md">${validResults.length - absentCount} Kişi</span></div></div><div class="col-md-3"><div class="preview-box compact ${markAbsent?'warning':''}" title="${missingFromFileTitle}"><strong>${missingFromFileLabel}</strong><br><span class="${missingFromFileClass} preview-count-md">${missingFromFileCount} Kişi</span></div></div><div class="col-md-3"><div class="preview-box compact danger" title="Dosyada olan ama sistemde kaydı olmayanlar."><strong>Sistemde Yok:</strong><br><span class="text-danger preview-count-md">${missingStus.length} Kişi</span></div></div><div class="col-md-3"><div class="preview-box compact danger danger-strong" title="Excel hataları."><strong>Hatalı Satır:</strong><br><span class="text-danger preview-count-md">${invalidRows.length} Satır</span></div></div></div>${overwriteWarning}`;
    if(missingStus.length > 0) previewHtml += `<div class="alert alert-warning mt-2 preview-alert"><strong>Sistemde Bulunamayan Numaralar (Atlanacak):</strong> ${missingStus.slice(0,20).map(escapeHtml).join(', ')}${missingStus.length>20?'...':''}</div>`;
    if(invalidRows.length > 0) previewHtml += `<div class="table-responsive mt-3 preview-error-table"><table class="table table-sm table-striped mb-0"><thead><tr><th class="preview-col-row">Satır</th><th class="preview-col-no">Öğrenci No</th><th>Hata Nedeni (Yüklenmeyecek)</th></tr></thead><tbody>${invalidRows.map(err => `<tr><td><strong>${escapeHtml(err.rowNum)}</strong></td><td>${escapeHtml(err.no)}</td><td class="text-danger">${escapeHtml(err.reason)}</td></tr>`).join('')}</tbody></table></div>`;
    PENDING_UPLOAD = { type: 'e', existsId: existsId, bId: bId, bD: eDate, bT: eType, bPub: toTitleCase(ePub), newResults: validResults, subjects: Array.from(subjectsFound), grades: Array.from(gradesFound), markAbsent: markAbsent, omittedStudents: notInFileCount };
  }
  getEl('uploadPreviewBody').innerHTML = previewHtml; hideModal('mMappings'); showModal('mUploadPreview', {backdrop: 'static'});
}

// ---- confirmUpload (orig lines 3991-4001) ----
async function confirmUpload() {
  if(!PENDING_UPLOAD) return cancelUpload(); hideModal('mUploadPreview'); ld(1, 'Veriler buluta gönderiliyor, lütfen bekleyin...');
  try {
    if(PENDING_UPLOAD.type === 's') { DB.s = DB.s.concat(PENDING_UPLOAD.data); await database.ref('db_v2/students').set(DB.s); rTabS(); uStat(); showToast(`${PENDING_UPLOAD.data.length} yeni öğrenci sisteme başarıyla eklendi.`, 'success'); } 
    else if (PENDING_UPLOAD.type === 'e') {
      if(PENDING_UPLOAD.existsId) { await database.ref('db_v2/examResults/' + PENDING_UPLOAD.existsId).remove(); await database.ref('db_v2/examMeta/' + PENDING_UPLOAD.existsId).remove(); delete CACHED_RESULTS[PENDING_UPLOAD.existsId]; }
      await database.ref('db_v2/examResults/' + PENDING_UPLOAD.bId).set(PENDING_UPLOAD.newResults); 
      await database.ref('db_v2/examMeta/' + PENDING_UPLOAD.bId).set({ date: PENDING_UPLOAD.bD, examType: PENDING_UPLOAD.bT, publisher: PENDING_UPLOAD.bPub, count: PENDING_UPLOAD.newResults.length, subjects: PENDING_UPLOAD.subjects, grades: PENDING_UPLOAD.grades }); showToast('Sınav sonuçları sisteme başarıyla kaydedildi.', 'success');
    }
  } catch(err) { showToast('Kayıt sırasında hata oluştu: ' + err.message, 'error'); } cancelUpload(); ld(0);
}

// ---- top-level (orig lines 4003-4007) ----
const APP_CACHE_NAME = 'sinav-analizi-adminlte4-r47';

let APP_BOOTED = false;
function bootApp(){
  if(APP_BOOTED) return;
  APP_BOOTED = true;
  checkAuth();
  document.body.addEventListener('click', function(e){
    if(!document.body.classList.contains('sidebar-open')) return;
    var sidebar = document.querySelector('.app-sidebar');
    var toggleBtn = document.querySelector('[data-lte-toggle="sidebar"]');
    if(sidebar && !sidebar.contains(e.target) && toggleBtn && !toggleBtn.contains(e.target)){
      if(typeof closeSidebarIfOpen === 'function') closeSidebarIfOpen();
      else {
        document.body.classList.remove('sidebar-open');
        document.body.classList.add('sidebar-collapse');
        document.querySelectorAll('.sidebar-overlay,.sidebar-backdrop').forEach(el => el.remove());
      }
    }
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js?v=adminlte4-r47', { scope: './' })
      .then(reg => { console.log('SW kayıtlı:', reg.scope); reg.update(); })
      .catch(err => console.error('SW hatası:', err));
  }
  if (window.caches) {
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('sinav-analizi-') && key !== APP_CACHE_NAME).map(key => caches.delete(key))))
      .catch(err => console.warn('Eski önbellek temizlenemedi:', err));
  }
}

if(document.readyState === 'complete') bootApp();
else window.addEventListener('load', bootApp);

// ---- top-level (orig lines 4009-4009) ----
let deferredInstallPrompt = null, pwaPopupTimer = null, userLoggedIn = false;

// ---- top-level (orig lines 4010-4010) ----
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstallPrompt = e; if (userLoggedIn) showPwaPopupIfReady(); });

// ---- top-level (orig lines 4011-4011) ----
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; document.getElementById('installBtnWrapper').style.display = 'none'; closePwaPopup(); showToast('Uygulama başarıyla yüklendi!', 'success'); });

// ---- showPwaPopupIfReady (orig lines 4013-4016) ----
function showPwaPopupIfReady() {
  userLoggedIn = true; if (!deferredInstallPrompt) return; document.getElementById('installBtnWrapper').style.display = 'block';
  setTimeout(() => { const popup = document.getElementById('pwaInstallPopup'), bar = popup.querySelector('.pwa-progress'); bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = 'pwaBar 4s linear forwards'; popup.style.animation = 'popupSlideDown 0.4s ease-out'; popup.style.display = 'flex'; pwaPopupTimer = setTimeout(() => closePwaPopup(), 4000); }, 1500);
}

// ---- closePwaPopup (orig lines 4017-4017) ----
function closePwaPopup() { const popup = document.getElementById('pwaInstallPopup'); if (!popup || popup.style.display === 'none') return; clearTimeout(pwaPopupTimer); popup.style.animation = 'popupSlideUp 0.3s ease-in forwards'; setTimeout(() => { popup.style.display = 'none'; popup.style.animation = ''; }, 300); }

// ---- triggerInstall (orig lines 4018-4018) ----
function triggerInstall(e) { e.preventDefault(); closePwaPopup(); if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); deferredInstallPrompt.userChoice.then(choice => { if (choice.outcome === 'accepted') showToast('Uygulama yükleniyor...', 'info'); deferredInstallPrompt = null; document.getElementById('installBtnWrapper').style.display = 'none'; }); }




