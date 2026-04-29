// app-ui.js — Tabs, navigation, dropdowns, search, filters, charts, exports

// ---- top-level (orig lines 944-944) ----
let currentPane = 'anasayfa_genel';
const VALID_PANES = ['anasayfa_genel', 'anasayfa', 'sonuclar', 'rapor', 'ayarlar'];

function normalizePaneId(id) {
  id = String(id || '').replace(/^#/, '');
  return VALID_PANES.includes(id) ? id : 'anasayfa_genel';
}

function paneFromLocation() {
  let hashPane = String(window.location.hash || '').replace('#', '');
  return normalizePaneId(hashPane || currentPane || 'anasayfa_genel');
}

function routeBase() {
  if(window.location.protocol === 'file:') return window.location.href.split('#')[0];
  return window.location.pathname + window.location.search;
}

function setPaneHistory(id, mode) {
  id = normalizePaneId(id);
  let url = id === 'anasayfa_genel' ? routeBase() : routeBase() + '#' + id;
  try {
    if(mode === 'push') window.history.pushState({ pane: id }, '', url);
    else window.history.replaceState({ pane: id }, '', url);
  } catch(err) {
    // file:// ve eski WebView davranışlarında history yazılamazsa hash yeterli.
    if(id === 'anasayfa_genel') {
      if(window.location.hash) window.location.hash = '';
    } else if(window.location.hash.replace('#', '') !== id) {
      window.location.hash = id;
    }
  }
}

function ensurePaneVisibility(preferredId) {
  let main = getEl('mainApp');
  if(main && main.style.display === 'none') return;
  let id = normalizePaneId(preferredId || paneFromLocation());
  if(id === 'ayarlar' && !document.body.classList.contains('is-admin')) id = 'anasayfa_genel';
  let active = document.querySelector('.pane.active-pane');
  let visible = active && active.getAttribute('aria-hidden') !== 'true' && active.style.display !== 'none';
  if(!active || !visible || active.id !== id) executeTabSwitch(id, true);
}

function handlePaneTaskError(id, err) {
  console.error('Sekme hazırlanırken hata:', id, err);
  if(typeof showToast === 'function') showToast('Sayfa hazırlanırken bir hata oluştu. İçerik paneli açık tutuldu.', 'warning');
  ensurePaneVisibility(id);
}

function runPaneTask(id, fn) {
  try {
    let result = fn();
    if(result && typeof result.catch === 'function') result.catch(err => handlePaneTaskError(id, err));
  } catch(err) {
    handlePaneTaskError(id, err);
  }
}

// ---- top-level (orig lines 945-970) ----
window.addEventListener('popstate', function(e) {
  let isMobile = window.innerWidth < 768;
  // Giriş ekranı görünüyorsa: tarayıcıyı kapat / bir önceki sayfaya git (zaten doğal davranış)
  let loginVisible = getEl('loginScreen') && getEl('loginScreen').style.display !== 'none';
  if(loginVisible) return; // Giriş ekranındaysa doğal davranışa bırak

  if(isMobile) {
    if(currentPane === 'anasayfa_genel') {
      // Ana sayfadayken geri → uygulamadan çık (tarayıcıya bırak)
      // history.back() sonsuz döngüye girmemek için kontrol
      if(e.state && e.state.pane === 'anasayfa_genel') {
        // Gerçekten çıkmak istiyoruz; window.history.go(-1) yerine Android'in doğal back'i zaten çalışacak
        return;
      }
      executeTabSwitch('anasayfa_genel', true);
      return;
    }
    // Diğer sayfalardayken → Ana sayfaya dön
    executeTabSwitch('anasayfa_genel', true);
    setPaneHistory('anasayfa_genel', 'replace');
    return;
  }
  // Masaüstü: normal popstate davranışı
  let targetPane = (e.state && e.state.pane) ? e.state.pane : paneFromLocation();
  executeTabSwitch(targetPane, true);
});

window.addEventListener('hashchange', function() {
  let loginVisible = getEl('loginScreen') && getEl('loginScreen').style.display !== 'none';
  if(loginVisible) return;
  executeTabSwitch(paneFromLocation(), true);
});

// ---- sTab (orig lines 972-977) ----
function sTab(id, el) {
  try {
    if (window.event && window.event.preventDefault) window.event.preventDefault();
    if (window.event) window.event.returnValue = false;
  } catch(e){}
  executeTabSwitch(id, false);
  return false;
}

function closeSidebarIfOpen() {
  if(window.innerWidth >= 992) return;
  const toggleBtn = document.querySelector('[data-lte-toggle="sidebar"]');
  if(document.body.classList.contains('sidebar-open') && toggleBtn) {
    try {
      toggleBtn.click();
      return;
    } catch(e) {}
  }
  document.body.classList.remove('sidebar-open');
  document.body.classList.add('sidebar-collapse');
  document.querySelectorAll('.sidebar-overlay,.sidebar-backdrop').forEach(el => el.remove());
}

// ---- executeTabSwitch (orig lines 979-1019) ----
function executeTabSwitch(id, isPopState) {
  id = normalizePaneId(id);
  if(id === 'ayarlar' && !document.body.classList.contains('is-admin')) id = 'anasayfa_genel';
  let targetPane = getEl(id);
  if(!targetPane) {
    id = 'anasayfa_genel';
    targetPane = getEl(id);
  }
  if(!targetPane) return false;

  if(currentPane === id && targetPane.classList.contains('active-pane') && !isPopState) {
    closeSidebarIfOpen();
    document.body.setAttribute('data-active-pane', id);
    setTimeout(() => ensurePaneVisibility(id), 0);
    return false;
  }

  if (!isPopState) {
      let isMobile = window.innerWidth < 768;
      if (id === 'anasayfa_genel') {
          // Ana sayfaya dönerken history'yi temizle (back tuşu uygulamadan çıksın)
          setPaneHistory('anasayfa_genel', 'replace');
      } else if (isMobile) {
          // Mobilde her alt sayfaya geçişte yeni history kaydı oluştur
          // Böylece geri tuşu ana sayfaya geri döner
          setPaneHistory(id, 'push');
      } else if (currentPane === 'anasayfa_genel') {
          setPaneHistory(id, 'push');
      } else {
          setPaneHistory(id, 'replace');
      }
  }
  currentPane = id;
  document.body.setAttribute('data-active-pane', id);

  document.querySelectorAll('.pane').forEach(x=>{
    x.classList.remove('active-pane');
    x.setAttribute('aria-hidden', 'true');
    x.style.display = 'none';
  });
  targetPane.classList.add('active-pane');
  targetPane.setAttribute('aria-hidden', 'false');
  targetPane.style.display = 'block';
  document.querySelectorAll('.sidebar-menu .nav-link').forEach(x=>x.classList.remove('active')); 
  
  let matchLink = document.getElementById('nav-' + id);
  if(matchLink && !matchLink.classList.contains('nav-link')) matchLink = matchLink.querySelector('.nav-link');
  if (matchLink) matchLink.classList.add('active');

  const titles={anasayfa_genel:'Ana Sayfa',anasayfa:'Öğrenci',sonuclar:'Sonuçlar & Analizler',rapor:'Toplu Rapor',ayarlar:'Ayarlar'};
  if(getEl('breadcrumb')) getEl('breadcrumb').textContent = titles[id] || id;

  if(id==='anasayfa_genel' && typeof uStat === 'function') runPaneTask(id, () => uStat());
  if(id==='anasayfa' && aNo && typeof reqProfile === 'function') runPaneTask(id, () => reqProfile());
  if(id==='sonuclar' && typeof reqUI === 'function') runPaneTask(id, () => reqUI());
  if(id==='rapor' && typeof raporInit === 'function') runPaneTask(id, () => raporInit());
  if(id==='ayarlar') runPaneTask(id, () => {
    if(typeof rTabS === 'function')rTabS();
    if(typeof rTabE === 'function')rTabE();
  });
  
  closeSidebarIfOpen();
  setTimeout(() => ensurePaneVisibility(id), 0);
}

window.addEventListener('load', () => setTimeout(() => ensurePaneVisibility(), 250));

// ---- sAct (orig lines 1021-1028) ----
async function sAct(no,clr=false){
  aNo=no; if(clr){let st=getStuMap().get(no); getEl('sInp').value=st?(st.name+' ('+st.class+')'):'';getEl('sRes').innerHTML='';getEl('sRes').style.display='none';}
  let s=getStuMap().get(aNo);
  getEl('aBadge').innerHTML=s?`<span class="badge bg-success rounded-pill px-3 py-2"><i class="fas fa-check-circle me-1"></i>Seçili Öğrenci: ${escapeHtml(s.name)} (${escapeHtml(s.class)})</span>`:'<span class="text-muted">Seçilmedi</span>';
  let ab=getEl('anlStuBadge'); if(ab)ab.innerHTML=s?`<span class="badge bg-success rounded-pill px-2 py-1 selected-student-pill"><i class="fas fa-check-circle me-1"></i>Seçili Öğrenci: ${escapeHtml(s.name)} (${escapeHtml(s.class)})</span>`:'';
  getEl('homeArea').innerHTML='';
  if(no) await reqProfile(); if(getEl('sonuclar').classList.contains('active-pane')) reqUI(); 
}

// ---- getGrade (orig lines 1531-1531) ----
function getGrade(cls){ let m=String(cls||'').match(/^(\d+)/); return m?m[1]:''; }

// ---- getBrVal (orig lines 1532-1532) ----
function getBrVal(){ let el=getEl('aBr'); if(!el) return ''; let v=el.value; return (v==='__ALL__'||!v)?'':v; }

// ---- mkChart (orig lines 1534-1551) ----
function mkChart(canvasId,labels,datasets,rev=false){
  let gCol='#e2e8f0';
  let txtCol='#475569';
  // === FIX: Aynı canvas üzerinde önceki Chart varsa yok et (memory leak ve render bozulmasını önler) ===
  try { let _prev = Chart.getChart && Chart.getChart(canvasId); if(_prev) _prev.destroy(); } catch(e){}
  let _cv = getEl(canvasId); if(!_cv) return null;
  return new Chart(_cv,{
    type:'bar', data:{labels,datasets}, plugins: [ChartDataLabels],
    options:{ 
      responsive:true,maintainAspectRatio:false, animation:false, 
      plugins:{
        legend:{ position:'top', labels:{ font:{size:10}, boxWidth:12, padding:6, generateLabels: function(chart) { let orig = Chart.defaults.plugins.legend.labels.generateLabels(chart); orig.forEach(lbl => { if(lbl.text && lbl.text.length > 20) lbl.text = lbl.text.substring(0,18)+'…'; }); return orig; } } },
        datalabels: { display: false }
      }, 
      scales:{ x:{grid:{color:gCol}, ticks:{font:{size:9}}}, y:{reverse:rev,min:rev?1:undefined,grid:{color:gCol}, ticks:{font:{size:9}}} } 
    }
  });
}

// ---- Yardımcı: HTML tablosunu SheetJS'e date-parse yapmadan dönüştür ----
function _tblToWsSafe(tbl){
  let aoa=[], rows=tbl.querySelectorAll('tr');
  rows.forEach(tr=>{
    let row=[], cells=tr.querySelectorAll('th,td');
    cells.forEach(td=>{
      let txt=(td.innerText||td.textContent||'').trim();
      row.push(txt);
    });
    aoa.push(row);
  });
  // aoa_to_sheet ile oluştur; tüm değerler string olarak gelir, raw:false ile parse etme
  let ws=XLSX.utils.aoa_to_sheet(aoa, {dense:false});
  // Tüm hücreleri string tipine zorla (sayısal görünen değerler dahil)
  let range=XLSX.utils.decode_range(ws['!ref']||'A1:A1');
  for(let R=range.s.r;R<=range.e.r;R++){
    for(let C=range.s.c;C<=range.e.c;C++){
      let ref=XLSX.utils.encode_cell({r:R,c:C});
      let cell=ws[ref];
      if(cell && cell.t!=='s'){ cell.t='s'; cell.v=String(cell.v); }
    }
  }
  // Sütun genişliklerini hesapla
  let wscols=[];
  for(let C=range.s.c;C<=range.e.c;C++){
    let maxW=6;
    for(let R=range.s.r;R<=range.e.r;R++){
      let cell=ws[XLSX.utils.encode_cell({r:R,c:C})];
      if(cell&&cell.v) maxW=Math.max(maxW,String(cell.v).length+2);
    }
    wscols.push({wch:Math.min(maxW,32)});
  }
  ws['!cols']=wscols;
  return ws;
}

// ---- xXL (orig lines 1553-1557) ----
function xXL(id,fn){
  let tbl=getEl(id), wb=XLSX.utils.book_new();
  let ws=_tblToWsSafe(tbl);
  XLSX.utils.book_append_sheet(wb,ws,'Rapor');
  XLSX.writeFile(wb,fn+'.xlsx');
}

// ---- xXLMul (orig lines 1559-1567) ----
function xXLMul(cId,fn){
  let wb=XLSX.utils.book_new(), ts=getEl(cId).getElementsByTagName('table');
  for(let i=0;i<ts.length;i++){
    let ws=_tblToWsSafe(ts[i]);
    XLSX.utils.book_append_sheet(wb,ws,ts[i].getAttribute('data-sh')||('Sayfa'+i));
  }
  XLSX.writeFile(wb,fn+'.xlsx');
}

// ---- xPR (Yeniden yazıldı: sınav türü renkleri inline, otomatik yön, sınav türü başına yeni sayfa, tablo başlık tekrarı) ----
// Yön kararı:
//   - Yatay (landscape): "Öğrenci (Sorgula)" sayfası (kCont = karne, pS sourceId'li 3 görünüm:
//     Ogrenci_Tek_Sinav / Ogrenci_Ders / Ogrenci_Veri) ve "Toplu Rapor" (raporCont).
//     Ayrıca pED/pEDAll çağrı tarafından zaten 'landscape' param ile gelir.
//   - Dikey (portrait): "Öğrenci Analizi" (pS + 'Ogrenci_Analizi'), Sınıf Analizi (pC),
//     Ders Analizi (pSubj), Sınav Özeti (pSummary, pGenSummary).
const _XPR_LANDSCAPE_IDS = new Set(['kCont','raporCont','raporRes']);
const _XPR_LANDSCAPE_TITLES = new Set(['Ogrenci_Tek_Sinav','Ogrenci_Ders','Ogrenci_Veri']);
function _xprIsLandscape(sourceId, title, orientation){
  if(orientation === 'landscape') return true;
  if(orientation === 'portrait')  return false;
  if(_XPR_LANDSCAPE_IDS.has(sourceId)) return true;
  if(_XPR_LANDSCAPE_TITLES.has(title)) return true;
  return false; // varsayılan dikey
}

// Sınav türü paleti — style.css'teki .exam-color-N ile birebir aynı (yeni pencerede style.css yok, inline yazıyoruz)
// Yeni palet: birbirinden net ayırt edilebilen, şık 8 renk.
const _XPR_EXAM_PALETTE = ['#2563eb','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#be185d','#4b5563'];

function _xprExamColorFor(el){
  // 1) Önce element veya en yakın atadan data-exam-color="0..7" oku
  let scope = el.closest && el.closest('[data-exam-color]');
  if(scope){
    let idx = parseInt(scope.getAttribute('data-exam-color'), 10);
    if(!isNaN(idx) && idx >= 0 && idx < _XPR_EXAM_PALETTE.length) return _XPR_EXAM_PALETTE[idx];
  }
  // 2) exam-color-N sınıfını ara
  let cl = (el.className && el.className.toString) ? el.className.toString() : '';
  let m = cl.match(/exam-color-(\d)/);
  if(m){ return _XPR_EXAM_PALETTE[parseInt(m[1],10)] || null; }
  let anc = el.closest && el.closest('[class*="exam-color-"]');
  if(anc){
    let m2 = (anc.className.toString()||'').match(/exam-color-(\d)/);
    if(m2) return _XPR_EXAM_PALETTE[parseInt(m2[1],10)] || null;
  }
  // 3) Computed --exam-color
  try {
    let cs = window.getComputedStyle(el);
    let v = (cs.getPropertyValue('--exam-color')||'').trim();
    if(v) return v;
  } catch(e){}
  return null;
}

function xPR(sourceId, title, btn, orientation) {
  // Chart tooltip temizliği (orijinal davranış korunuyor)
  if(window._karneCharts) window._karneCharts.forEach(ch => { try { ch.tooltip.setActiveElements([]); ch.update('none'); } catch(e){} });
  if(window._raporCharts) window._raporCharts.forEach(ch => { try { ch.tooltip.setActiveElements([]); ch.update('none'); } catch(e){} });
  try { if(c && c.a){ c.a.tooltip.setActiveElements([]); c.a.update('none'); } } catch(e){}
  try { if(c && c.h){ c.h.tooltip.setActiveElements([]); c.h.update('none'); } } catch(e){}

  // YÖN: explicit param > sourceId haritası > default portrait
  let isLandscape = _xprIsLandscape(sourceId, title, orientation);
  let isPortrait = !isLandscape;

  let sourceEl = getEl(sourceId);
  if(!sourceEl){ return; }
  let orig = btn ? btn.innerHTML : '';
  if(btn){ btn.innerHTML = "<i class='fas fa-spinner fa-spin me-1'></i>"; btn.disabled = true; }
  let winW = isLandscape ? 1200 : 900;
  let printWin = window.open('', '_blank', `width=${winW},height=820,scrollbars=yes`);
  if(!printWin){
    if(typeof showToast === 'function') showToast('Açılır pencere engellendi! Tarayıcıdan izin verin.', 'warning', 6000);
    if(btn){ btn.innerHTML = orig; btn.disabled = false; }
    return;
  }
  try {
    printWin.document.write('<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Rapor hazırlanıyor</title></head><body style="font-family:Arial,sans-serif;padding:20px;">Rapor hazırlanıyor...</body></html>');
    printWin.document.close();
  } catch(e){}

  // Canvas → PNG
  let canvasMap = [];
  sourceEl.querySelectorAll('canvas').forEach(cv => {
    try { canvasMap.push({ id: cv.id, url: cv.toDataURL('image/png', 1.0) }); } catch(e){}
  });

  // CSS link'leri (style.css HARİÇ — proje stilleri kasıtlı dışarıda; AdminLTE/FA içeride)
  let cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .filter(l => !l.href.includes('style.css'))
    .map(l => `<link rel="stylesheet" href="${l.href}">`).join('\n');

  let clone = sourceEl.cloneNode(true);

  // Canvas → IMG değişimi
  clone.querySelectorAll('canvas').forEach((cv, idx) => {
    let entry = canvasMap.find(m => m.id && m.id === cv.id) || canvasMap[idx];
    if(!entry){ cv.remove(); return; }
    let img = document.createElement('img');
    img.src = entry.url;
    img.className = 'print-chart-img';
    cv.parentElement.replaceChild(img, cv);
  });

  // Etkileşimli risk düğmelerini yazdırmada statik etikete çevir.
  clone.querySelectorAll('button.risk-badge').forEach(btn => {
    let span = document.createElement('span');
    span.className = btn.className;
    span.innerHTML = btn.innerHTML;
    span.setAttribute('title', btn.getAttribute('title') || '');
    btn.parentElement.replaceChild(span, btn);
  });

  // Yazdırılmaması gerekenleri at
  clone.querySelectorAll('.no-print, .d-flex.justify-content-end, .scroll-hint, button:not(.risk-badge), .btn:not(.risk-badge)').forEach(el => el.remove());
  clone.querySelectorAll('.report-header').forEach(el => el.style.display = 'flex');

  // ── SINAV TÜRÜ RENKLERİNİ INLINE YAZ ───────────────────────────────
  // Her .exam-type-block / .karne-bolum / üst seviye renkli kart için
  // gerçek hex rengi DOM'dan oku ve hem CSS değişkeni hem inline border olarak yapıştır.
  let srcBlocks   = sourceEl.querySelectorAll('.exam-type-block, .karne-bolum, [data-exam-color]');
  let cloneBlocks = clone.querySelectorAll('.exam-type-block, .karne-bolum, [data-exam-color]');
  cloneBlocks.forEach((el, idx) => {
    let src = srcBlocks[idx]; if(!src) return;
    let color = _xprExamColorFor(src);
    if(!color) return;
    el.style.setProperty('--exam-color', color);
    el.setAttribute('data-print-color', color);
    if(el.classList.contains('exam-type-block') || el.classList.contains('karne-bolum')){
      el.style.borderLeft  = `4px solid ${color}`;
      el.style.borderRight = `4px solid ${color}`;
      el.style.borderTop   = `1px solid #c7d0db`;
      el.style.borderBottom= `1px solid #c7d0db`;
      el.style.borderRadius= '6px';
      el.style.background  = '#fff';
      el.style.padding     = el.style.padding || '8px 10px';
    }
    // Bloğun içindeki tüm "kimlik" öğelerini sınav türü rengiyle boya
    // (varsayılan lacivert gradient/mavi başlıklar yerine).
    el.querySelectorAll('.report-header, .print-page-hdr').forEach(h => {
      h.style.background = '#f3f6fb';
      h.style.color = '#111827';
      h.style.borderLeft = `4px solid ${color}`;
      h.style.borderBottom = '1px solid #cbd5e1';
      h.querySelectorAll('*').forEach(child => child.style.color = '#111827');
    });
    el.querySelectorAll('.table thead th, table thead th').forEach(th => {
      th.style.background = '#f1f5f9';
      th.style.color = '#111827';
      th.style.borderBottom = `2px solid ${color}`;
    });
    el.querySelectorAll('tr.avg-row td').forEach(td => {
      td.style.background = `${color}1a`; // ~10% opacity
      td.style.color = color;
      td.style.borderTop = `2px solid ${color}80`;
    });
    el.querySelectorAll('.text-primary, .card-title, h3, h4, h5').forEach(t => {
      // Sadece sınav türü bloğunun "kimlik" başlıklarını boya
      t.style.color = color;
    });
    el.querySelectorAll('.card-header').forEach(ch => {
      ch.style.borderBottom = `2px solid ${color}`;
      ch.style.background = `${color}14`; // ~8% opacity
    });
    // Blok içindeki tüm kartlara sınav türü rengini şerit olarak da uygula
    el.querySelectorAll('.card').forEach(cd => {
      // Mevcut inline border varsa (cards loop'unda set edilecek) bozmamak için
      // sadece soldaki şeridi güçlendir.
      cd.style.borderLeft = `3px solid ${color}`;
    });
  });

  // ── KARTLARIN ÇERÇEVELERİNİ INLINE GARANTİLE ──────────────────────
  let srcCards   = sourceEl.querySelectorAll('.card, .home-stat-card, .boxplot-card, .trend-card, .info-box, .sec-card');
  let cloneCards = clone.querySelectorAll('.card, .home-stat-card, .boxplot-card, .trend-card, .info-box, .sec-card');
  cloneCards.forEach((el, idx) => {
    let src = srcCards[idx]; if(!src) return;
    let cs = window.getComputedStyle(src);
    // Renkli sol/sağ şerit varsa koru
    let leftW  = parseFloat(cs.borderLeftWidth)  || 0;
    let rightW = parseFloat(cs.borderRightWidth) || 0;
    let leftC  = (cs.borderLeftColor  && cs.borderLeftColor  !== 'rgba(0, 0, 0, 0)') ? cs.borderLeftColor  : '';
    let rightC = (cs.borderRightColor && cs.borderRightColor !== 'rgba(0, 0, 0, 0)') ? cs.borderRightColor : '';
    let topC   = (cs.borderTopColor   && cs.borderTopColor   !== 'rgba(0, 0, 0, 0)') ? cs.borderTopColor   : '#dee2e6';
    let topW   = parseFloat(cs.borderTopWidth)   || 1;
    // Sınav rengi var mı? (kart kendi exam-color-N taşıyor olabilir veya atasından miras alır)
    let exC = _xprExamColorFor(src);
    if(exC){
      if(leftW >= 2 || el.classList.contains('home-stat-card') || el.classList.contains('sec-card')){
        el.style.borderLeft  = `${Math.max(leftW,3)}px solid ${exC}`;
      } else if(leftW > 0){
        el.style.borderLeft  = `${leftW}px solid ${leftC || exC}`;
      }
      if(rightW >= 2 || el.classList.contains('sec-card')){
        el.style.borderRight = `${Math.max(rightW,3)}px solid ${exC}`;
      } else if(rightW > 0){
        el.style.borderRight = `${rightW}px solid ${rightC || exC}`;
      }
      if(topW >= 2){
        el.style.borderTop = `${topW}px solid ${exC}`;
      }
    } else {
      if(leftW > 0)  el.style.borderLeft  = `${leftW}px solid ${leftC || '#dee2e6'}`;
      if(rightW > 0) el.style.borderRight = `${rightW}px solid ${rightC || '#dee2e6'}`;
      if(topW > 0)   el.style.borderTop   = `${topW}px solid ${topC}`;
    }
    el.style.borderBottom = el.style.borderBottom || `1px solid #dee2e6`;
    el.style.background = (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') ? cs.backgroundColor : '#fff';
    if(cs.backgroundImage && cs.backgroundImage !== 'none') el.style.backgroundImage = cs.backgroundImage;
    el.style.boxShadow = 'none';
    el.style.borderRadius = cs.borderRadius || '4px';
  });

  // ── SAYFA KIRMA: Her sınav türü kendi sayfasında ──────────────────
  // Toplu rapor (öğrenciler arası): her wrapper yeni sayfa
  let wrappers = clone.querySelectorAll('.student-rapor-wrapper');
  wrappers.forEach((w, i) => {
    if(i > 0) w.style.cssText += ';page-break-before:always;break-before:page;';
    w.style.cssText += ';page-break-inside:auto;break-inside:auto;';
  });

  // .exam-type-block: her biri kendi sayfasında başlar (wrapper içinde ilk hariç, global ilk hariç)
  clone.querySelectorAll('.exam-type-block').forEach((blk, idx) => {
    let wrapper = blk.closest('.student-rapor-wrapper');
    let isFirst;
    if(wrapper){
      isFirst = wrapper.querySelector('.exam-type-block') === blk;
    } else {
      isFirst = (idx === 0);
    }
    if(!isFirst){
      blk.style.cssText += ';page-break-before:always;break-before:page;';
    }
    // Bloğun kendisi taşabilir; içerik tek sayfaya zaten sığacak şekilde tasarlandı
    blk.style.cssText += ';page-break-inside:auto;break-inside:auto;';
    // Blok içindeki kart/grafik/tablo birimleri parçalanmasın
    blk.querySelectorAll('.card, .chart-box, .boxplot-card, .trend-card, .info-box, .sec-card').forEach(el => {
      el.style.cssText += ';page-break-inside:avoid;break-inside:avoid;';
    });
    // Stu name (varsa) bloğun başına başlık olarak ekle
    let stuName  = blk.getAttribute('data-stu-name')  || '';
    let stuClass = blk.getAttribute('data-stu-class') || '';
    if(stuName && !blk.classList.contains('karne-bolum')){
      let hdr = document.createElement('div');
      hdr.className = 'report-header print-page-hdr';
      hdr.style.cssText = 'margin:0 0 8px 0;';
      hdr.innerHTML = `<span style="font-size:14px;"><i class="fas fa-user-graduate" style="margin-right:6px;"></i><strong>${escapeHtml(stuName)}</strong></span><span style="font-size:11px;">Sınıf: ${escapeHtml(stuClass)} &nbsp;|&nbsp; ${new Date().toLocaleDateString('tr-TR')}</span>`;
      blk.insertBefore(hdr, blk.firstChild);
    }
  });

  // .karne-bolum (exam-type-block değilse): her biri yeni sayfa (ilk hariç)
  clone.querySelectorAll('.karne-bolum').forEach((blk, idx) => {
    if(blk.classList.contains('exam-type-block')) return;
    if(idx > 0) blk.style.cssText += ';page-break-before:always;break-before:page;';
    blk.style.cssText += ';page-break-inside:auto;break-inside:auto;';
  });

  // Liste tabloları (pED, pEDAll vb.): satır içi kırma yok, thead her sayfada
  clone.querySelectorAll('table').forEach(tbl => {
    tbl.style.pageBreakInside = 'auto';
    tbl.style.breakInside = 'auto';
    tbl.style.width = '100%';
    tbl.style.borderCollapse = 'collapse';
  });
  clone.querySelectorAll('tbody tr').forEach(tr => {
    tr.style.pageBreakInside = 'avoid';
    tr.style.breakInside = 'avoid';
  });
  clone.querySelectorAll('thead').forEach(h => {
    h.style.display = 'table-header-group';
  });
  clone.querySelectorAll('tfoot').forEach(f => {
    f.style.display = 'table-footer-group';
  });

  // Sınav türü palet sabitleri yeni pencerede de class olarak çalışsın diye CSS bloğu üret
  let paletteCss = _XPR_EXAM_PALETTE.map((c,i) => `.exam-color-${i}{--exam-color:${c};}`).join('\n');

  let printHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
${cssLinks}
<style>
  *,*::before,*::after{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  html,body{width:100%;margin:0;padding:0;background:#fff;color:#212529;font-family:'Source Sans Pro',Arial,sans-serif;font-size:${isLandscape?'10px':'10.5px'};}
  @page{size:A4 ${isLandscape?'landscape':'portrait'};margin:8mm 7mm;}

  /* Sınav türü paleti (yeni pencerede style.css yok) */
  ${paletteCss}

  /* Grid */
  .row{display:flex !important;flex-wrap:wrap !important;width:100% !important;margin:0 -4px !important;}
  .col-12,.col-sm-12,.col-md-12,.col-lg-12{flex:0 0 100% !important;max-width:100% !important;padding:0 4px !important;}
  .col-6,.col-sm-6,.col-md-6,.col-lg-6{flex:0 0 50% !important;max-width:50% !important;padding:0 4px !important;}
  .col-md-4,.col-lg-4,.col-md-4.col-sm-12{flex:0 0 33.333% !important;max-width:33.333% !important;padding:0 4px !important;}
  .col-md-3,.col-sm-3{flex:0 0 25% !important;max-width:25% !important;padding:0 4px !important;}
  .col-md-2{flex:0 0 16.666% !important;max-width:16.666% !important;padding:0 4px !important;}

  .mb-1{margin-bottom:3px !important;} .mb-2{margin-bottom:5px !important;}
  .mb-3{margin-bottom:8px !important;} .mb-4{margin-bottom:12px !important;}
  .mt-2{margin-top:5px !important;} .mt-3{margin-top:8px !important;}
  .p-2{padding:5px !important;} .p-0{padding:0 !important;}

  /* Rapor başlığı (varsayılan; sınav türü blokları içindeki başlıklar inline ile sınav rengine boyanır) */
  .report-header{display:flex !important;align-items:center;justify-content:space-between;background:#f3f6fb !important;color:#111827 !important;padding:8px 14px;border-radius:5px;margin-bottom:8px;border-left:4px solid #64748b;border-bottom:1px solid #cbd5e1;}
  .report-header *{color:#111827 !important;}

  /* Tablolar — başlık her sayfada, satır içi kırma yok */
  .table{width:100% !important;border-collapse:collapse !important;font-size:${isLandscape?'8px':'9px'} !important;margin-bottom:5px;}
  .table th,.table td{border:1px solid #bbb !important;padding:2px 4px !important;color:#212529 !important;vertical-align:middle !important;}
  .table thead th{background:#f1f5f9 !important;color:#111827 !important;font-size:${isLandscape?'7.5px':'8.5px'} !important;font-weight:700;border-bottom:2px solid #cbd5e1 !important;}
  .scroll table thead th,.table-responsive table thead th{position:static !important;top:auto !important;z-index:auto !important;}
  thead{display:table-header-group !important;}
  tfoot{display:table-footer-group !important;}
  tbody tr{page-break-inside:avoid !important;break-inside:avoid !important;}
  .scroll,.list-scroll,.table-responsive{overflow:visible !important;max-height:none !important;}
  tr.highlight-row td{background:#fff3cd !important;font-weight:bold !important;}
  tr.absent-row td{background:#f8d7da !important;color:#721c24 !important;}
  tr.avg-row td{background:#e8eef7 !important;color:#1a5fa8 !important;font-weight:bold !important;border-top:2px solid #9cb3d8 !important;}

  /* Kartlar — inline border'ları KORU; sadece varsayılanları ver */
  .card{background:#fff;border:1px solid #dee2e6;border-radius:4px;margin-bottom:6px;display:block;box-shadow:none !important;background-clip:padding-box !important;}
  .card-header{background:#f5f5f5 !important;padding:5px 10px;border-bottom:1px solid #dee2e6;font-size:${isLandscape?'10px':'10.5px'};font-weight:600;}
  .card-body{padding:6px 8px;}
  .card-title{font-size:${isLandscape?'10.5px':'11px'} !important;margin:0;}

  /* Sınav türü blokları — inline renk gelir; varsayılan da ver */
  .exam-type-block,.karne-bolum{background:#fff;border:1px solid #c7d0db;border-left:4px solid var(--exam-color,#1a5fa8);border-right:4px solid var(--exam-color,#1a5fa8);border-radius:6px;padding:8px 10px;background-clip:padding-box !important;}
  .exam-type-block>h5,.karne-bolum>h5{font-size:11px !important;border-bottom:1px solid #d5dde7;padding-bottom:5px;margin:0 0 6px 0;color:var(--exam-color,#1a5fa8);}

  /* sec-card / home-stat-card */
  .sec-card,.home-stat-card{background:#fff;border:1px solid #e9ecef;border-left:3px solid var(--exam-color,#1a5fa8);border-right:3px solid var(--exam-color,#1a5fa8);border-radius:8px;padding:8px 10px;display:flex;align-items:center;gap:10px;min-height:60px;box-shadow:none !important;}
  .sec-card .sec-icon{flex-shrink:0;width:36px;height:36px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;color:#fff !important;background:var(--exam-color,#1a5fa8) !important;font-size:1em;}
  .sec-card.sec-pos .sec-icon{background:#198754 !important;}
  .sec-card.sec-neg .sec-icon{background:#dc3545 !important;}
  .sec-card.sec-neutral .sec-icon{background:#6c757d !important;}
  .sec-card .sec-label{font-size:0.7rem;font-weight:700;color:#6c757d;text-transform:uppercase;}
  .sec-card .sec-value{font-size:1rem;font-weight:700;color:#212529;line-height:1.2;}
  .sec-card .sec-sub{font-size:0.7rem;color:#6c757d;}
  .sec-card.sec-pos .sec-value{color:#198754;}
  .sec-card.sec-neg .sec-value{color:#dc3545;}

  /* Info-box */
  .info-box{display:flex !important;align-items:stretch;border-radius:5px;margin-bottom:4px;page-break-inside:avoid !important;break-inside:avoid !important;}
  .info-box-icon{display:flex !important;align-items:center;justify-content:center;width:44px !important;min-width:44px;font-size:1.1em;color:#fff;}
  .info-box-content{padding:5px 8px;flex:1;}
  .info-box-text{display:block;font-size:0.72em;font-weight:700;}
  .info-box-number{display:block;font-size:1.05em;font-weight:bold;margin:1px 0;}
  .info-box.bg-primary,.bg-primary{background:#1a5fa8 !important;color:#fff !important;}
  .info-box.bg-success,.bg-success{background:#198754 !important;color:#fff !important;}
  .info-box.bg-danger,.bg-danger{background:#dc3545 !important;color:#fff !important;}
  .info-box.bg-warning,.bg-warning{background:#e6a800 !important;color:#fff !important;}
  .info-box.bg-info,.bg-info{background:#0dcaf0 !important;color:#055160 !important;}
  .info-box.bg-secondary,.bg-secondary{background:#6c757d !important;color:#fff !important;}
  .info-box.bg-primary *,.info-box.bg-success *,.info-box.bg-danger *,.info-box.bg-warning *,.info-box.bg-info *,.info-box.bg-secondary *{color:inherit !important;}

  /* Trend kartı */
  .trend-card{background:#f5f7fa !important;border:1px solid #dee2e6;border-radius:6px;padding:6px 8px;margin-bottom:5px;page-break-inside:avoid !important;break-inside:avoid !important;}
  .trend-indicator{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:0.78em;font-weight:bold;}
  .trend-up{background:rgba(40,167,69,0.15) !important;color:#1e7e34 !important;}
  .trend-down{background:rgba(220,53,69,0.15) !important;color:#b02a37 !important;}
  .trend-stable{background:rgba(108,117,125,0.15) !important;color:#495057 !important;}

  /* Grafikler */
  .print-chart-img{max-width:100%;width:100%;max-height:${isLandscape?'150px':'180px'};height:auto;object-fit:contain;display:block;margin:2px auto 4px;}
  .chart-box{height:auto !important;margin-bottom:4px;page-break-inside:avoid !important;break-inside:avoid !important;}

  /* Box plot */
  .boxplot-card{background:#f8f9ff !important;border:1px solid #c8d4ee !important;border-radius:6px;padding:5px 8px;margin-top:3px;page-break-inside:avoid !important;break-inside:avoid !important;}
  .boxplot-title{font-size:9px;font-weight:700;color:#1a5fa8;margin-bottom:3px;}
  .boxplot-wrap{overflow:visible !important;}
  .boxplot-svg{max-height:${isLandscape?'110px':'140px'} !important;width:100% !important;height:auto !important;}

  /* Risk badge */
  .risk-badge{display:inline-flex;align-items:center;gap:2px;padding:1px 6px;border-radius:20px;font-size:0.68em;font-weight:600;white-space:nowrap;}
  .rb-abs{background:rgba(255,193,7,0.2) !important;color:#664d03 !important;}
  .rb-trend{background:rgba(220,53,69,0.12) !important;color:#842029 !important;}
  .rb-rank{background:rgba(108,117,125,0.12) !important;color:#495057 !important;}
  .rb-subj{background:rgba(111,66,193,0.12) !important;color:#4a1d8a !important;}

  /* Sınav türü blok başlığı (üst sayfada öğrenci adı) — sınav rengiyle */
  .print-page-hdr{display:flex !important;align-items:center;justify-content:space-between;background:linear-gradient(135deg,var(--exam-color,#334155),#111827) !important;color:#fff !important;padding:6px 12px;border-radius:4px;}
  .print-page-hdr *{color:#fff !important;}

  /* Tipografi */
  h4{font-size:12px !important;margin:5px 0;}
  h5{font-size:11px !important;margin:4px 0;}
  .text-primary{color:#1a5fa8 !important;}
  .text-success{color:#198754 !important;}
  .text-danger{color:#dc3545 !important;}
  .text-muted{color:#6c757d !important;}
  .small,small{font-size:0.82em;}
  .badge{display:inline-block;padding:1px 5px;border-radius:8px;font-size:0.72em;}
  .shadow-sm{box-shadow:none !important;}

  /* Sayfa kırma kuralları */
  .exam-type-block{page-break-inside:auto;break-inside:auto;}
  .karne-bolum{page-break-inside:auto;break-inside:auto;}
  .student-rapor-wrapper{page-break-inside:auto;break-inside:auto;}

  /* Gizle */
  .no-print,button:not(.risk-badge),.btn:not(.risk-badge),.scroll-hint,.d-flex.justify-content-end,#riskPanel,
  .app-sidebar,.app-header,.app-main>.overlay{display:none !important;}

  /* Tam genişlik */
  .app-wrapper,.app-main,.container-fluid{margin:0 !important;padding:0 !important;width:100% !important;max-width:100% !important;}
</style>
</head>
<body>
<div style="padding:0 2px;">${clone.outerHTML}</div>
<script>
(function(){
  var printed=false;
  function doPrint(){ if(printed) return; printed=true; window.print(); }
  function waitImages(){
    return Promise.all(Array.prototype.slice.call(document.images).map(function(img){
      if(img.complete) return Promise.resolve();
      return new Promise(function(resolve){ img.onload=resolve; img.onerror=resolve; });
    }));
  }
  function waitFonts(){
    return document.fonts && document.fonts.ready ? document.fonts.ready.catch(function(){}) : Promise.resolve();
  }
  window.addEventListener('load',function(){
    Promise.all([waitImages(), waitFonts()]).then(function(){ setTimeout(doPrint, 250); });
    setTimeout(doPrint, 2500);
  });
})();
<\/script>
</body>
</html>`;

  try {
    printWin.document.open();
    printWin.document.write(printHtml);
    printWin.document.close();
  } catch(err) {
    if(typeof showToast === 'function') showToast('Yazdırma penceresi hazırlanamadı: ' + err.message, 'error', 6000);
    if(btn){ btn.innerHTML = orig; btn.disabled = false; }
    return;
  }
  if(btn){ btn.innerHTML = orig; btn.disabled = false; }
}


// ---- debounceSearch (orig lines 1890-1890) ----
function debounceSearch(){clearTimeout(searchDebounceTimer);searchDebounceTimer=setTimeout(sSearch,280);}

// ---- sSearch (orig lines 1891-1897) ----
function sSearch(){
  let v=getEl('sInp').value.trim(),r=getEl('sRes'); if(!v){r.innerHTML='';r.style.display='none';return;}
  let trm=normTR(v).split(/\s+/), m=DB.s.filter(x=>{let txt=normTR(x.no+' '+x.name+' '+x.class);return trm.every(t=>txt.includes(t));});
  if(!m.length){r.innerHTML='<div class="s-item text-muted" role="status">Bulunamadı.</div>';r.style.display='block';return;}
  let h=''; m.slice(0,20).forEach(x=>{
    let noArg = jsArg(x.no), delMsgArg = jsArg(`${x.no} silinsin mi?`);
    h+=`<div class="s-item" role="option" tabindex="0" onclick="if(event.target.closest('button'))return;sAct(${noArg},true);" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();sAct(${noArg},true);}"><div class="s-info"><strong>${escapeHtml(x.no)}</strong> — ${escapeHtml(x.name)} <span class="text-muted">(${escapeHtml(x.class)})</span></div><div class="s-actions"><button class="btn btn-sm btn-warning admin-only" onclick="event.stopPropagation();eStu(${noArg})"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger admin-only" onclick="event.stopPropagation();cDel('student',${delMsgArg},${noArg})"><i class="fas fa-trash"></i></button></div></div>`;
  });
  r.innerHTML=h; r.style.display='block';
}

// ---- clrS (orig lines 1898-1898) ----
function clrS(){getEl('sInp').value='';getEl('sRes').innerHTML='';getEl('sRes').style.display='none';sAct(null,false);}

// ---- anlStuDoSearch (orig lines 1900-1900) ----
function anlStuDoSearch(){clearTimeout(anlDebounceTimer);anlDebounceTimer=setTimeout(execAnlStuSearch,280);}

// ---- execAnlStuSearch (orig lines 1901-1906) ----
function execAnlStuSearch(){
  let v=getEl('anlStuInp').value.trim(), res=getEl('anlStuRes'); if(!v){res.style.display='none';res.innerHTML='';return;}
  let trm=normTR(v).split(/\s+/), m=DB.s.filter(x=>{let txt=normTR(x.no+' '+x.name+' '+x.class);return trm.every(t=>txt.includes(t));});
  if(!m.length){res.innerHTML='<div class="anlStu-item text-muted" role="status">Bulunamadı.</div>';res.style.display='block';return;}
  res.innerHTML=m.slice(0,20).map(x=>`<div class="anlStu-item" role="option" tabindex="0" onclick="anlStuSelect(${jsArg(x.no)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();anlStuSelect(${jsArg(x.no)});}"><div class="anlStu-main"><strong>${escapeHtml(x.no)}</strong> — ${escapeHtml(x.name)} <span class="text-muted">(${escapeHtml(x.class)})</span></div></div>`).join(''); res.style.display='block';
}

// ---- anlStuSelect (orig lines 1907-1911) ----
function anlStuSelect(no){
  getEl('anlStuRes').style.display='none'; let s=getStuMap().get(no); if(s) getEl('anlStuInp').value=s.name+' ('+s.class+')'; aNo = no;
  let ab=getEl('anlStuBadge'); if(ab) ab.innerHTML=s?`<span class="badge bg-success rounded-pill px-2 py-1 selected-student-pill"><i class="fas fa-check-circle me-1"></i>Seçili Öğrenci: ${escapeHtml(s.name)} (${escapeHtml(s.class)})</span>`:'';
  getEl('aBadge').innerHTML=s?`<span class="badge bg-success rounded-pill px-3 py-2"><i class="fas fa-check-circle me-1"></i>Seçili Öğrenci: ${escapeHtml(s.name)} (${escapeHtml(s.class)})</span>`:'<span class="text-muted">Seçilmedi</span>'; reqUI(); 
}

// ---- anlStuClear (orig lines 1912-1912) ----
function anlStuClear(){ getEl('anlStuInp').value=''; getEl('anlStuRes').style.display='none'; getEl('anlStuRes').innerHTML=''; getEl('anlStuBadge').innerHTML=''; sAct(null,false); }

// ---- top-level (orig lines 1913-1913) ----
document.addEventListener('click',e=>{ let res=getEl('anlStuRes'),inp=getEl('anlStuInp'); if(res&&inp&&!res.contains(e.target)&&e.target!==inp)res.style.display='none'; let res2=getEl('sRes'),inp2=getEl('sInp'); if(res2&&inp2&&!res2.contains(e.target)&&e.target!==inp2)res2.style.display='none'; });

// ---- examColorIdx: sınav türü adından deterministik renk index'i (0-7) üretir ----
function examColorIdx(name){
  let s = String(name||''); let h = 0;
  for(let i=0;i<s.length;i++){ h = ((h<<5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h) % 8;
}
// ---- toExamLabel: "tyt deneme" -> "TYT Denemesi" gibi Türkçe-uyumlu Title Case + ek ----
function toExamLabel(t){
  let s = String(t||'').trim();
  if(!s) return '';
  // Kelime bazlı Title Case (Türkçe karakter güvenli)
  return s.split(/\s+/).map(w => {
    if(!w) return w;
    // Kısaltma gibi tamamı büyük harfse aynen bırak (TYT, AYT, KTT, LGS vb.)
    if(w.length <= 4 && w === w.toLocaleUpperCase('tr')) return w;
    let first = w.charAt(0).toLocaleUpperCase('tr');
    let rest  = w.slice(1).toLocaleLowerCase('tr');
    return first + rest;
  }).join(' ');
}

// ---- uStat (orig lines 1915-1921) ----
function uStat(){
  const g=getEl('dynamicStatsGrid'); if(!g) return;
  // Sınav türü -> { total, grades:{9:n,10:n,...} }
  const u = {};
  Object.values(EXAM_META).forEach(m => {
    const t = m.examType; if(!t) return;
    if(!u[t]) u[t] = { total:0, grades:{} };
    u[t].total += 1;
    // Sınıf seviyelerini m.grades veya m.grade'dan al
    let gs = [];
    if(Array.isArray(m.grades) && m.grades.length) gs = m.grades.map(String);
    else if(m.grade) gs = [String(m.grade)];
    gs.forEach(gr => {
      if(!gr) return;
      u[t].grades[gr] = (u[t].grades[gr]||0) + 1;
    });
  });

  const ic = ['fas fa-file-alt','fas fa-check-circle','fas fa-star','fas fa-trophy','fas fa-bookmark','fas fa-graduation-cap','fas fa-clipboard-list','fas fa-chart-line'];
  const entries = Object.entries(u).sort((a,b)=> a[0].localeCompare(b[0],'tr'));
  let h = '';
  entries.forEach(([t, info]) => {
    const colorIdx = examColorIdx(t);
    const label = toExamLabel(t);
    const gradeKeys = Object.keys(info.grades).sort((a,b)=> Number(a)-Number(b));
    const gradesHtml = gradeKeys.length
      ? gradeKeys.map(gr => `<span class="hsc-grade hsc-grade-link" onclick="goToAnaliz(${jsArg(t)},${jsArg(gr)})" title="${escapeHtml(label)} — ${escapeHtml(gr)}. Sınıf analizine git"><strong>${escapeHtml(gr)}. Sınıf:</strong> ${escapeHtml(info.grades[gr])} <small>Sınav</small> <i class="fas fa-arrow-right hsc-arrow"></i></span>`).join('')
      : '<span class="hsc-empty">Sınıf bilgisi yok</span>';
    
    h += `<div class="col-md-4 col-sm-6 col-12 mb-3">
      <div class="home-stat-card exam-color-${colorIdx}">
        <div class="hsc-head">
          <span class="hsc-title"><i class="${ic[colorIdx % ic.length]}"></i>${escapeHtml(label)}</span>
          <span class="hsc-count">${info.total} Sınav</span>
        </div>
        <div class="hsc-grades hsc-grades-grid">${gradesHtml}</div>
      </div>
    </div>`;
  });
  g.innerHTML = h;
}

// ---- goToAnaliz: Sistem Özeti'nden Sınav Analizi sayfasına yönlendirme ----
function goToAnaliz(examType, grade) {
  // 1. Sınav Analizi sayfasına geç
  sTab('sonuclar', document.getElementById('nav-sonuclar'));

  // 2. Filtreleri doldur (reqUI() çağrıldıktan sonra DOM hazır olur)
  setTimeout(() => {
    // Analiz Türü: Sınav Analizi (examdetail)
    let aTypeEl = getEl('aType');
    if (aTypeEl) { aTypeEl.value = 'examdetail'; }

    // reqUI çağrısı → sınıf ve şube dropdown'larını oluşturur
    uUI();

    setTimeout(() => {
      // Sınıf Seviyesi
      let aLvlEl = getEl('aLvl');
      if (aLvlEl) { aLvlEl.value = String(grade); }

      // Şube: Tümü (__ALL__)
      uBranches();
      setTimeout(() => {
        let aBrEl = getEl('aBr');
        if (aBrEl) { aBrEl.value = '__ALL__'; }

        // Sınav Türü
        uExamTypes();
        setTimeout(() => {
          let aExEl = getEl('aEx');
          if (aExEl) { aExEl.value = examType; }
          applyExamColorToFilters();

          // Veri: Genel Sınav Özeti (Tüm Sınavlar)
          uSub();
          setTimeout(() => {
            let aSubEl = getEl('aSub');
            if (aSubEl) { aSubEl.value = 'general_summary'; }
            _updateGDateVisibility();
            reqAnl();
          }, 80);
        }, 80);
      }, 80);
    }, 80);
  }, 150);
}

// ---- uDrp (orig lines 1923-1925) ----
function uDrp(){
  uExamTypes(); if(aNo){ let s=getStuMap().get(aNo); if(s&&getEl('anlStuInp'))getEl('anlStuInp').value=s.name+' ('+s.class+')'; }
}

// ---- uBranches (orig lines 1927-1945) ----
function uBranches(){
  // Sınıf Seviyesi'ne göre yalnızca o seviyede öğrencisi olan şubeleri DB.s'den listele
  let aT = getEl('aType') ? getEl('aType').value : '';
  if(!(aT==='class'||aT==='subject'||aT==='examdetail')) return;
  let brSel = getEl('aBr'); if(!brSel) return;
  let lvlF = getEl('aLvl') ? getEl('aLvl').value : '';
  let prev = brSel.value, branches = new Set();
  // DB.s üzerinden şube tespiti (her zaman çalışır, DB.e yüklenmesine gerek yok)
  DB.s.forEach(s => {
    let m = String(s.class||'').match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/);
    if(!m) return;
    if(lvlF && m[1] !== lvlF) return;
    branches.add(m[2].toLocaleUpperCase('tr-TR'));
  });
  let sorted = [...branches].sort();
  brSel.innerHTML = optionHtml('', 'Şube Seç', !prev, true) + optionHtml('__ALL__', 'Tümü', prev==='__ALL__') + sorted.map(x=>optionHtml(x, x, prev===x)).join('');
  if(prev==='__ALL__' || sorted.includes(prev)) brSel.value = prev;
  else brSel.value = '';
}

// ---- uExamTypes (orig lines 1947-1986) ----
function uExamTypes(){
  let types=new Set();
  let aT = getEl('aType') ? getEl('aType').value : '';
  let lvlF = (aT==='class'||aT==='subject'||aT==='examdetail') && getEl('aLvl') ? getEl('aLvl').value : '';
  let brF  = (aT==='class'||aT==='subject'||aT==='examdetail') ? getBrVal() : '';

  if(lvlF || brF){
    // EXAM_META.grades üzerinden filtrele — DB.e yüklenmesine gerek yok
    // Eğer brF seçili ise: o şubede öğrenci var mı kontrol et + EXAM_META'dan grade ile eşleştir
    let lvlsInBranch = new Set();
    if(brF){
      DB.s.forEach(s => {
        let m = String(s.class||'').match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/);
        if(!m) return;
        if(lvlF && m[1]!==lvlF) return;
        if(m[2].toLocaleUpperCase('tr-TR')===brF) lvlsInBranch.add(m[1]);
      });
    }
    Object.values(EXAM_META).forEach(m => {
      if(!m.examType) return;
      if(lvlF){
        // sınav bu seviyeyi kapsıyor mu?
        if(!metaHasGrade(m, lvlF)) return;
      }
      if(brF){
        // bu şubede öğrenci olan sınıf seviyelerinden en az biri sınavın kapsamında mı?
        if(lvlsInBranch.size === 0) return; // o şubede hiç öğrenci yok
        if(!metaIntersectsGrades(m, lvlsInBranch)) return;
      }
      types.add(m.examType);
    });
  } else {
    Object.values(EXAM_META).forEach(m => types.add(m.examType));
  }
  let sortedTypes = [...types].sort(), prev=getEl('aEx').value;
  getEl('aEx').innerHTML=optionHtml('', 'Sınav Türü Seç', !(prev && sortedTypes.includes(prev)), true)+sortedTypes.map(x=>optionHtml(x, x)).join('');
  if(sortedTypes.includes(prev)) getEl('aEx').value=prev;
  else if(prev){ getEl('aEx').value=''; }
}

// ---- analysis filter memory ----
const ANALYSIS_SUB_STORAGE_KEY = 'sinavAnalizi.analysisSubMemory.v1';
const ANALYSIS_SUB_MEMORY = (() => {
  try { return JSON.parse(localStorage.getItem(ANALYSIS_SUB_STORAGE_KEY) || '{}') || {}; }
  catch(e) { return {}; }
})();

function _saveAnalysisSubMemory(){
  try { localStorage.setItem(ANALYSIS_SUB_STORAGE_KEY, JSON.stringify(ANALYSIS_SUB_MEMORY)); } catch(e){}
}

function _analysisSubKeys(){
  let aT = getEl('aType') ? getEl('aType').value : '';
  let eT = getEl('aEx') ? getEl('aEx').value : '';
  let single = (aT === 'student' && getEl('aExDate') && getEl('aExDate').value) ? 'single' : 'all';
  let lvl = (getEl('aLvl') && getEl('aLvl').value) || '';
  let br = (getEl('aBr') && getEl('aBr').value) || '';
  let primary = `${aT}|${eT || '*'}|${single}|${lvl || '*'}|${br || '*'}`;
  return [
    primary,
    `${aT}|${eT || '*'}|${single}|${lvl || '*'}|*`,
    `${aT}|${eT || '*'}|${single}|*|*`,
    `${aT}|${eT || '*'}|*|*|*`,
    `${aT}|*|${single}|*|*`,
    `${aT}|*|*|*|*`,
    `${aT}|${eT}|${single}`,
    `${aT}|${eT}`,
    `${aT}|*|${single}`,
    `${aT}|*`
  ];
}

function _rememberAnalysisSub(value){
  let el = getEl('aSub');
  let val = value !== undefined ? value : (el ? el.value : '');
  if(!val) return;
  let keys = _analysisSubKeys();
  if(keys.length) ANALYSIS_SUB_MEMORY[keys[0]] = val;
  _saveAnalysisSubMemory();
}

function _preferredAnalysisSub(defaultVal){
  let el = getEl('aSub');
  let cur = el ? el.value : '';
  if(cur) return cur;
  for(let k of _analysisSubKeys()){
    if(ANALYSIS_SUB_MEMORY[k]) return ANALYSIS_SUB_MEMORY[k];
  }
  return defaultVal || '';
}

function _applyAnalysisSubValue(defaultVal, preferredOverride){
  let el = getEl('aSub'); if(!el) return '';
  let preferred = preferredOverride !== undefined ? preferredOverride : _preferredAnalysisSub(defaultVal);
  let options = [...el.options];
  let validPreferred = preferred && options.some(o => o.value === preferred && !o.disabled);
  let validDefault = defaultVal && options.some(o => o.value === defaultVal && !o.disabled);
  if(validPreferred) el.value = preferred;
  else if(validDefault) el.value = defaultVal;
  else if(options.length && options[0].disabled) options[0].selected = true;
  else if(options.length) el.value = options[0].value;
  if(validPreferred) _rememberAnalysisSub(el.value);
  return el.value;
}

function _selectedOptionText(id){
  let el = getEl(id);
  if(!el || el.selectedIndex < 0) return '';
  let opt = el.options[el.selectedIndex];
  if(!opt || opt.disabled) return '';
  return (opt.textContent || '').trim();
}

function updateFilterSummary(){
  let box = getEl('filterSummary'); if(!box) return;
  box.hidden = true;
  box.innerHTML = '';
}

function resetAnalysisFilters(){
  aNo = null;
  ['anlStuInp','anlStuRes','anlStuBadge','aBadge'].forEach(id => {
    let el = getEl(id); if(!el) return;
    if(id.endsWith('Inp')) el.value = '';
    else if(id.endsWith('Res')) { el.innerHTML = ''; el.style.display = 'none'; }
    else el.innerHTML = id === 'aBadge' ? '<span class="text-muted">Seçilmedi</span>' : '';
  });
  if(getEl('aType')) getEl('aType').value = 'student';
  ['aLvl','aBr','aEx','aDate','aExDate','aSub','riskGradeFilter','riskBranchFilter','riskExTypeFilter','riskLevelFilter'].forEach(_resetSel);
  if(getEl('anlRes')) getEl('anlRes').innerHTML = '';
  uUI();
  applyExamColorToFilters();
  updateFilterSummary();
  reqAnl();
}

function onRiskFilterChange(rebuild){
  if(rebuild) _populateRiskFilterDropdowns();
  renderRiskPanel();
  applyExamColorToFilters();
  updateFilterSummary();
}

// ---- uSub (orig lines 1988-2043) ----
function uSub(){
  let aT=getEl('aType')?getEl('aType').value:'', t=getEl('aEx').value, s=new Set();
  let lvlF = (aT==='class'||aT==='subject'||aT==='examdetail') && getEl('aLvl') ? getEl('aLvl').value : '';
  let brF  = (aT==='class'||aT==='subject'||aT==='examdetail') ? getBrVal() : '';
  let dtF  = (aT==='class'||aT==='subject'||aT==='examdetail') && getEl('aDate') ? getEl('aDate').value : '';

  // Ders listesini her zaman EXAM_META'dan al (DB.e yüklenmesine gerek yok)
  Object.values(EXAM_META).forEach(m => {
    if(m.examType !== t || !m.subjects) return;
    if(dtF && m.date !== dtF) return;
    if(!metaHasGrade(m, lvlF)) return;
    m.subjects.forEach(subj => s.add(subj.toLocaleLowerCase('tr-TR')));
  });
  // Eğer DB.e yüklüyse ve şube filtresi varsa, şube kısıtını da uygula
  if(brF && DB.e.length > 0){
    let filteredS = new Set();
    DB.e.forEach(x => {
      if(x.examType !== t || !x.subs) return;
      if(dtF && x.date !== dtF) return;
      let m = String(x.studentClass||'').match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m) return;
      if(lvlF && m[1] !== lvlF) return;
      if(m[2].toLocaleUpperCase('tr-TR') !== brF) return;
      Object.keys(x.subs).forEach(subj => filteredS.add(subj.toLocaleLowerCase('tr-TR')));
    });
    // Sadece şube filtresiyle kesişimi al
    s = new Set([...s].filter(x => filteredS.has(x)));
  }
  
  if(aT === 'student' || aT === 'class') {
    // === Tek-sınav modunda öğrenci analizi varsayılanı 'summary'; toplu modda 'totalNet'; sınıf analizinde 'score' ===
    let _aExDateRaw = (getEl('aExDate')||{}).value || '';
    let _isSingleExam = (aT === 'student') && !!_aExDateRaw;
    let _defaultVal = (aT === 'class') ? 'score' : (_isSingleExam ? 'summary' : 'totalNet');
    let _selVal = _preferredAnalysisSub(_defaultVal);
    let o = optionHtml('', 'Veri Seç', !_selVal, true);
    if(_isSingleExam) o += optionHtml('summary', 'Sınav Özeti', _selVal==='summary');
    o += optionHtml('totalNet', 'Toplam Net', _selVal==='totalNet') + optionHtml('score', 'Puan', _selVal==='score');
    if (aT === 'student') { o += optionHtml('rank_c', 'Sınıf Sıralaması', _selVal==='rank_c') + optionHtml('rank_i', 'Kurum Sıralaması', _selVal==='rank_i') + optionHtml('rank_g', 'Genel Sıralama', _selVal==='rank_g'); }
    [...s].sort().forEach(x=> o += optionHtml(`s_${x}`, `${toTitleCase(x)} Neti`, _selVal==='s_'+x)); getEl('aSub').innerHTML = o;
    _applyAnalysisSubValue(_defaultVal, _selVal);
  } else if (aT === 'examdetail') {
    // === FIX: uSub varsayılanı — examdetail için varsayılan 'summary' (Sınav Özeti) ===
    let prev = _preferredAnalysisSub('summary');
    let _validVals = ['summary','general_summary','list_single','list_all'];
    let _selVal = _validVals.includes(prev) ? prev : 'summary';
    getEl('aSub').innerHTML = optionHtml('summary', 'Sınav Özeti (Tek Sınav)', _selVal==='summary') + optionHtml('general_summary', 'Sınav Özeti (Tüm Sınavlar)', _selVal==='general_summary') + optionHtml('list_single', 'Toplu Liste (Tek Sınav)', _selVal==='list_single') + optionHtml('list_all', 'Toplu Liste (Tüm Sınavlar)', _selVal==='list_all');
    _applyAnalysisSubValue('summary', _selVal);
  } else if (aT === 'subject') {
    let prev = _preferredAnalysisSub(''), opts = [...s].sort().map(x=>optionHtml(x, toTitleCase(x))).join('');
    let ph = optionHtml('', 'Ders Seç', !prev, true);
    getEl('aSub').innerHTML = opts ? (ph + opts) : optionHtml('', 'Ders bulunamadı', true, true);
    _applyAnalysisSubValue('', prev);
  } else {
    getEl('aSub').innerHTML=optionHtml('', 'Veri Seç', true, true)+[...s].sort().map(x=>optionHtml(x, toTitleCase(x))).join('');
    _applyAnalysisSubValue('');
  }
}

// ---- _updateGDateVisibility (orig lines 2046-2056) ----
function _updateGDateVisibility() {
  let t = getEl('aType') ? getEl('aType').value : '';
  let sub = getEl('aSub') ? getEl('aSub').value : '';
  if(t === 'examdetail') {
    getEl('gDate').style.display = (sub === 'general_summary' || sub === 'list_all') ? 'none' : 'block';
  } else if(t === 'student') {
    getEl('gDate').style.display = 'none';
  } else if(t === 'class' || t === 'subject') {
    getEl('gDate').style.display = 'block';
  }
}

// ---- _resetSel (orig lines 2059-2063) ----
function _resetSel(id){
  let el = getEl(id); if(!el) return;
  el.value = '';
  if(el.options.length && el.options[0].disabled){ el.options[0].selected = true; }
}

// ---- onLvlChange (orig lines 2064-2067) ----
function onLvlChange(){
  let _prevEx = getEl('aEx') ? getEl('aEx').value : '';
  _rememberAnalysisSub();
  _resetSel('aBr'); _resetSel('aDate');
  uBranches(); uExamTypes();
  // Önceki sınav türü yeni filtreden sonra hâlâ geçerliyse koru
  if(_prevEx && [...getEl('aEx').options].some(o => o.value === _prevEx)) {
    getEl('aEx').value = _prevEx;
  } else {
    _resetSel('aEx');
  }
  uExamDates(); uSub(); _updateGDateVisibility(); reqAnl();
}

// ---- onBrChange (orig lines 2068-2071) ----
function onBrChange(){
  let _prevEx = getEl('aEx') ? getEl('aEx').value : '';
  _rememberAnalysisSub();
  _resetSel('aDate');
  uExamTypes();
  // Önceki sınav türü yeni filtreden sonra hâlâ geçerliyse koru
  if(_prevEx && [...getEl('aEx').options].some(o => o.value === _prevEx)) {
    getEl('aEx').value = _prevEx;
  } else {
    _resetSel('aEx');
  }
  uExamDates(); uSub(); _updateGDateVisibility(); reqAnl();
}

// ---- onExTypeChange (orig lines 2072-2075) ----
function onExTypeChange(){
  let _aT = getEl('aType') ? getEl('aType').value : '';
  if(_aT === 'student' && !aNo){
    // Sınav türüne tıklandı ama öğrenci seçilmedi — uyarı ver ve dropdown'ı sıfırla
    showToast('Lütfen öğrenci seçiniz!', 'warning', 3000);
    getEl('aEx').value = '';
    return;
  }
  _rememberAnalysisSub();
  _resetSel('aDate');
  // Öğrenci modunda yeni sınav seçim dropdown'ı da sıfırlanır
  let _aExDate = getEl('aExDate'); if(_aExDate) _aExDate.value = '';
  uExamDates(); uStudentExamDates(); uSub(); _updateGDateVisibility();
  applyExamColorToFilters(); reqAnl();
}

// ---- onExDateStudentChange: Öğrenci modu — tek sınav/Tümü ayrımı ----
function onExDateStudentChange(){
  let _aT = getEl('aType') ? getEl('aType').value : '';
  if(_aT === 'student' && !aNo){
    showToast('Lütfen öğrenci seçiniz!', 'warning', 3000);
    let _el = getEl('aExDate'); if(_el) _el.value = '';
    return;
  }
  // aExDate boş = Tümü (toplu mod); dolu = tek sınav modu
  // Veri (aSub) listesine 'Sınav Özeti' eklensin/çıkarılsın diye uSub'u tazele
  _rememberAnalysisSub();
  uSub();
  applyExamColorToFilters();
  reqAnl();
}

// ---- uStudentExamDates: Öğrenci modunda aExDate dropdown'unu doldurur ----
// Seçilen sınav türüne ait sınavları tarih + yayınevi ile listeler.
// En üstte "Tümü" seçeneği, altında tarihe göre (en yeni en üstte) sıralı liste.
function uStudentExamDates(){
  let el = getEl('aExDate'); if(!el) return;
  let aT = getEl('aType') ? getEl('aType').value : '';
  let eT = getEl('aEx')   ? getEl('aEx').value   : '';
  if(aT !== 'student' || !eT){
    el.innerHTML = optionHtml('', 'Tümü');
    el.value = '';
    return;
  }
  // Öğrenci seçiliyse sınıf seviyesine göre filtrele
  let stuGrade = null;
  if(aNo){ let st = getStuMap().get(aNo); if(st) stuGrade = getGrade(st.class); }
  let entries = [];
  Object.values(EXAM_META).forEach(m => {
    if(m.examType !== eT) return;
    if(!metaHasGrade(m, stuGrade)) return;
    entries.push({ date: m.date, publisher: m.publisher || '' });
  });
  // Unique (date+publisher), sonra tarih DESC sırala (en yeni en üstte)
  let seen = new Set(), unique = [];
  entries.forEach(x => { let k = x.date+'||'+x.publisher; if(!seen.has(k)){ seen.add(k); unique.push(x); } });
  unique.sort((a,b) => srt(b.date, a.date)); // DESC
  let prev = el.value;
  let opts = optionHtml('', 'Tümü') + unique.map(x => {
    let pub = x.publisher ? ` (${toTitleCase(x.publisher)})` : '';
    return optionHtml(`${x.date}||${x.publisher}`, `${x.date}${pub}`);
  }).join('');
  el.innerHTML = opts;
  // Önceki seçim geçerliyse koru, değilse Tümü
  if(prev && [...el.options].some(o=>o.value===prev)) el.value = prev;
  else el.value = '';
}

// ---- applyExamColorToFilters: Sınav türü rengini filtre alanına ve analiz sonucuna uygular ----
function applyExamColorToFilters(){
  let aT = getEl('aType') ? getEl('aType').value : '';
  let eT = getEl('aEx')   ? getEl('aEx').value   : '';
  let riskET = (getEl('riskExTypeFilter')||{}).value || '';
  let filter = getEl('anlFilterCard');
  let res    = getEl('anlRes');
  let risk   = getEl('riskPanel');
  let aExWrap = getEl('aEx') ? getEl('aEx').closest('.aex-wrap') : null;

  // Eski sınıfları temizle
  [filter, res, risk, aExWrap].forEach(el => {
    if(!el) return;
    for(let i=0;i<8;i++) el.classList.remove('exam-color-'+i);
    el.removeAttribute('data-exam-color');
    if(aExWrap && el === aExWrap) el.removeAttribute('data-active');
  });

  let activeType = aT === 'risk' ? riskET : eT;
  if(!activeType) return;
  let idx = (typeof examColorIdx === 'function') ? examColorIdx(activeType) : 0;

  [filter, res].forEach(el => {
    if(!el) return;
    el.classList.add('exam-color-'+idx);
    el.setAttribute('data-exam-color', String(idx));
  });
  // Risk paneli sadece risk modunda ve riskExTypeFilter doluysa renk alır
  if(risk){
    if(aT === 'risk' && riskET){
      risk.classList.add('exam-color-'+idx);
      risk.setAttribute('data-exam-color', String(idx));
    }
  }
  // Dropdown yan badge
  if(aExWrap && aT !== 'risk'){
    aExWrap.classList.add('exam-color-'+idx);
    aExWrap.setAttribute('data-active','1');
  }
}

// ---- onDateChange (orig lines 2076-2079) ----
function onDateChange(){
  _rememberAnalysisSub();
  uSub(); _updateGDateVisibility(); reqAnl();
}

// ---- uExamDates (orig lines 2081-2109) ----
function uExamDates(){
  // === FIX: uExamDates filtreleri tutarlı hale getirildi ===
  // - examdetail/summary VE list_single için aNo varsa öğrencinin sınıf seviyesi filtre olarak uygulanır
  // - subject/class için seçili sınıf seviyesi filtre olarak uygulanır
  // - examdetail için seçili sınıf seviyesi (aLvl) varsa o da filtreye eklenir
  let t=getEl('aEx').value, dates=[], datePublisherMap = {}, aT = getEl('aType') ? getEl('aType').value : '', sub = getEl('aSub') ? getEl('aSub').value : '';
  let stuGrade = null;
  if(aNo && aT === 'examdetail' && (sub === 'summary' || sub === 'list_single')) {
    let st = getStuMap().get(aNo); if(st) stuGrade = getGrade(st.class);
  }
  let lvlGrade = '';
  // === FIX: examdetail/subject/class için seçili sınıf seviyesi (aLvl) her zaman filtre ===
  if(aT === 'subject' || aT === 'class' || aT === 'examdetail') {
    lvlGrade = getEl('aLvl') ? getEl('aLvl').value : '';
  }

  Object.values(EXAM_META).forEach(m => {
    if(m.examType !== t) return;
    if(!metaHasGrade(m, stuGrade)) return;
    if(!metaHasGrade(m, lvlGrade)) return;
    dates.push(m.date); if(m.publisher) datePublisherMap[m.date] = m.publisher;
  });
  
  dates = [...new Set(dates)].sort((a,b)=>srt(b,a)); let prev=getEl('aDate').value;
  let prefixOpt = (aT === 'class' || aT === 'subject')
    ? optionHtml('', 'Tüm Sınavlar', !prev)
    : optionHtml('', 'Sınav Seç', !prev, true);
  getEl('aDate').innerHTML = prefixOpt + dates.map(x => { let pub = datePublisherMap[x] ? ` (${toTitleCase(datePublisherMap[x])})` : ''; return optionHtml(x, `${x}${pub}`); }).join('');
  if(dates.includes(prev)) getEl('aDate').value=prev;
  else if(aT === 'class' || aT === 'subject') getEl('aDate').value='';
  else if(aT === 'examdetail' && dates.length > 0) getEl('aDate').value = dates[0]; // en yeni sınavı varsayılan seç
  else getEl('aDate').value = '';
}

// ---- uUI (orig lines 2111-2172) ----
function uUI(){
  let t=getEl('aType').value;
  let isRisk = t === 'risk';

  // Risk modunda ana filtre alanlarını gizle, diğerlerinde normal davran
  getEl('gStu').style.display=(t==='student')?'block':'none';
  getEl('gLvl').style.display=(t==='class'||t==='examdetail'||t==='subject')?'block':'none';
  getEl('gBr').style.display=(t==='class'||t==='subject'||t==='examdetail')?'block':'none';

  // Risk modunda sınav türü, tarih, veri filtrelerini gizle
  let aExWrapper = getEl('aEx') ? getEl('aEx').closest('.mb-3')?.parentElement : null;
  if(aExWrapper) aExWrapper.style.display = isRisk ? 'none' : '';
  getEl('gDate').style.display = isRisk ? 'none' : (t==='student' ? 'none' : 'block');
  getEl('gSub').style.display = isRisk ? 'none' : 'block';
  // Öğrenci modunda yeni "Sınav Seç" dropdown'ı (aExDate) görünür
  let gExDateEl = getEl('gExDate');
  if(gExDateEl) gExDateEl.style.display = (!isRisk && t === 'student') ? 'block' : 'none';

  // Risk filtre slotları
  ['gRiskGrade','gRiskBranch','gRiskExType','gRiskLevel'].forEach(id => {
    let el = getEl(id); if(el) el.style.display = isRisk ? 'block' : 'none';
  });

  // anlRes ve riskPanel görünürlüğü
  getEl('anlRes').style.display = isRisk ? 'none' : 'block';
  getEl('riskPanel').style.display = isRisk ? 'block' : 'none';

  if(!isRisk){
    // gDate ve gSub görünürlüğü ve etiketleri
    if(t==='class'){
      getEl('gDate').style.display='block';
      let dateLbl=getEl('lblDate'); if(dateLbl) dateLbl.textContent='Sınav Seç';
      getEl('gSub').style.display='block'; getEl('lblSub').textContent='Veri';
    } else if(t==='subject'){
      getEl('gDate').style.display='block';
      let dateLbl=getEl('lblDate'); if(dateLbl) dateLbl.textContent='Sınav Seç';
      getEl('gSub').style.display='block'; getEl('lblSub').textContent='Ders';
    } else if(t==='examdetail'){
      getEl('gSub').style.display='block'; getEl('lblSub').textContent='Veri';
      let sub=getEl('aSub')?getEl('aSub').value:'';
      getEl('gDate').style.display=(sub==='general_summary'||sub==='list_all')?'none':'block';
      let dateLbl=getEl('lblDate'); if(dateLbl) dateLbl.textContent='Sınav Seç';
    } else if(t==='student'){
      getEl('gDate').style.display='none';
      getEl('gSub').style.display='block'; getEl('lblSub').textContent='Veri';
    }

    if(t==='class'){
      let l=new Set(),b=new Set(); DB.s.forEach(s=>{let m=s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/);if(m){l.add(m[1]);b.add(m[2].toLocaleUpperCase('tr-TR'));}});
      let _pL=getEl('aLvl').value, _pB=getEl('aBr').value;
      getEl('aLvl').innerHTML=optionHtml('', 'Sınıf Seviyesi Seç', !_pL, true)+[...l].sort((a,b)=>parseInt(a)-parseInt(b)).map(x=>optionHtml(x, `${x}. Sınıf`)).join('');
      if(_pL && [...l].includes(_pL)) getEl('aLvl').value=_pL;
    } else if (t==='examdetail' || t==='subject') {
      let l=new Set(); DB.s.forEach(s=>{ let m=s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(m) l.add(m[1]); });
      let _pL=getEl('aLvl').value;
      getEl('aLvl').innerHTML=optionHtml('', 'Sınıf Seviyesi Seç', !_pL, true)+[...l].sort((a,b)=>parseInt(a)-parseInt(b)).map(x=>optionHtml(x, `${x}. Sınıf`)).join('');
      if(_pL && [...l].includes(_pL)) getEl('aLvl').value=_pL;
    }
    uBranches(); uExamTypes(); uExamDates(); uSub(); uStudentExamDates();
  } else {
    // Risk modunda filtre dropdown'larını doldur
    _populateRiskFilterDropdowns();
    renderRiskPanel();
  }
  let aExSel = getEl('aEx');
  if(aExSel) {
    let locked = (t === 'student' && !aNo);
    aExSel.disabled = locked;
    aExSel.title = locked ? 'Önce öğrenci seçin' : '';
  }
  applyExamColorToFilters();
  updateFilterSummary();
}

// ---- _populateRiskFilterDropdowns (orig lines 2174-2220) ----
function _populateRiskFilterDropdowns() {
  // Sınıf Seviyesi
  let gradeEl = getEl('riskGradeFilter');
  if(gradeEl) {
    let prevG = gradeEl.value;
    let grades = new Set();
    DB.s.forEach(s => { let m = s.class.match(/^(\d+)/); if(m) grades.add(m[1]); });
    gradeEl.innerHTML = optionHtml('', 'Tüm Sınıflar') + [...grades].sort((a,b)=>parseInt(a)-parseInt(b)).map(g=>optionHtml(g, `${g}. Sınıf`)).join('');
    if(prevG && [...grades].includes(prevG)) gradeEl.value = prevG;
  }
  // Şube (sınıf seviyesine göre filtreli)
  let branchEl = getEl('riskBranchFilter');
  if(branchEl) {
    let prevB = branchEl.value;
    let gradeF = getEl('riskGradeFilter') ? getEl('riskGradeFilter').value : '';
    let branches = new Set();
    DB.s.forEach(s => { let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(m && (!gradeF||m[1]===gradeF)) branches.add(m[2].toLocaleUpperCase('tr-TR')); });
    branchEl.innerHTML = optionHtml('', 'Tüm Şubeler') + [...branches].sort().map(b=>optionHtml(b, `${b} Şubesi`)).join('');
    if(prevB && [...branches].includes(prevB)) branchEl.value = prevB;
  }
  // Sınav Türü — mevcut risk sonuçlarından veya seçili sınıf/şubeye uygun EXAM_META'dan
  let exTypeEl = getEl('riskExTypeFilter');
  if(exTypeEl) {
    let prevET = exTypeEl.value;
    let gradeF = getEl('riskGradeFilter') ? getEl('riskGradeFilter').value : '';
    let risks = (_riskCache && _riskCache.results) ? _riskCache.results : [];
    let allTypes;
    if(risks.length > 0) {
      // Risk cache'den — sınıf/şube filtresine göre kısalt
      let filteredRisks = risks;
      if(gradeF) filteredRisks = filteredRisks.filter(r => { let m=String(r.cls||'').match(/^(\d+)/); return m && m[1]===gradeF; });
      allTypes = [...new Set(filteredRisks.flatMap(r=>r.examTypes))].sort();
    }
    if(!allTypes || !allTypes.length) {
      // EXAM_META'dan sınıf seviyesine göre filtreli
      let typesFromMeta = new Set();
      Object.values(EXAM_META).forEach(m => {
        if(!m.examType) return;
        if(!metaHasGrade(m, gradeF)) return;
        typesFromMeta.add(m.examType);
      });
      allTypes = [...typesFromMeta].sort();
    }
    exTypeEl.innerHTML = optionHtml('', 'Tüm Sınav Türleri') + allTypes.map(t=>optionHtml(t, t)).join('');
    if(prevET && allTypes.includes(prevET)) exTypeEl.value = prevET;
  }
}

// ---- handleSubChange (orig lines 2222-2230) ----
function handleSubChange(){ 
  let t = getEl('aType').value, sub = getEl('aSub').value;
  if(t === 'student' && !aNo){
    showToast('Lütfen öğrenci seçiniz!', 'warning', 3000);
    let _sub = getEl('aSub'); if(_sub) { _sub.value = ''; if(_sub.options.length && _sub.options[0].disabled) _sub.options[0].selected = true; }
    return;
  }
  _rememberAnalysisSub(sub);
  if(t === 'examdetail') { 
    getEl('gDate').style.display = (sub === 'general_summary' || sub === 'list_all') ? 'none' : 'block'; 
    uExamDates(); 
  } 
  _updateGDateVisibility();
  reqAnl(); 
}
