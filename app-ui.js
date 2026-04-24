// app-ui.js — Tabs, navigation, dropdowns, search, filters, charts, exports

// ---- top-level (orig lines 944-944) ----
let currentPane = 'anasayfa_genel';

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
    window.history.replaceState({ pane: 'anasayfa_genel' }, '', window.location.pathname);
    return;
  }
  // Masaüstü: normal popstate davranışı
  let targetPane = (e.state && e.state.pane) ? e.state.pane : 'anasayfa_genel';
  executeTabSwitch(targetPane, true);
});

// ---- sTab (orig lines 972-977) ----
function sTab(id, el) {
  try { if (window.event && window.event.preventDefault) window.event.preventDefault(); } catch(e){}
  if (id === currentPane) return false;
  executeTabSwitch(id, false);
  return false;
}

// ---- executeTabSwitch (orig lines 979-1019) ----
function executeTabSwitch(id, isPopState) {
  if(id === 'ayarlar' && !document.body.classList.contains('is-admin')) return;

  if (!isPopState) {
      let isMobile = window.innerWidth < 768;
      if (id === 'anasayfa_genel') {
          // Ana sayfaya dönerken history'yi temizle (back tuşu uygulamadan çıksın)
          window.history.replaceState({ pane: 'anasayfa_genel' }, '', window.location.pathname);
      } else if (isMobile) {
          // Mobilde her alt sayfaya geçişte yeni history kaydı oluştur
          // Böylece geri tuşu ana sayfaya geri döner
          window.history.pushState({ pane: id }, '', '#' + id);
      } else if (currentPane === 'anasayfa_genel') {
          window.history.pushState({pane: id}, '', '#' + id);
      } else {
          window.history.replaceState({pane: id}, '', '#' + id);
      }
  }
  currentPane = id;

  document.querySelectorAll('.pane').forEach(x=>x.classList.remove('active-pane')); 
  getEl(id).classList.add('active-pane');
  document.querySelectorAll('.nav-sidebar .nav-link').forEach(x=>x.classList.remove('active')); 
  
  let matchLink = document.getElementById('nav-' + id);
  if (matchLink) matchLink.classList.add('active');

  const titles={anasayfa_genel:'Ana Sayfa',anasayfa:'Öğrenci',sonuclar:'Sonuçlar & Analizler',rapor:'Toplu Rapor',ayarlar:'Ayarlar'};
  if(getEl('breadcrumb')) getEl('breadcrumb').textContent = titles[id] || id;

  if(id==='anasayfa_genel'){uStat();}
  if(id==='anasayfa'){if(aNo)reqProfile();}
  if(id==='sonuclar')reqUI();
  if(id==='rapor')raporInit();
  if(id==='ayarlar'){rTabS();rTabE();}
  
  if(window.innerWidth < 992){
      document.body.classList.remove('sidebar-open');
      document.body.classList.add('sidebar-collapse');
  }
}

// ---- sAct (orig lines 1021-1028) ----
async function sAct(no,clr=false){
  aNo=no; if(clr){let st=DB.s.find(x=>x.no===no); getEl('sInp').value=st?(st.name+' ('+st.class+')'):'';getEl('sRes').innerHTML='';getEl('sRes').style.display='none';}
  let s=DB.s.find(x=>x.no===aNo);
  getEl('aBadge').innerHTML=s?`<span class="badge badge-success badge-pill px-3 py-2"><i class="fas fa-check-circle mr-1"></i>Seçili Öğrenci: ${s.name} (${s.class})</span>`:'<span class="text-muted">Seçilmedi</span>';
  let ab=getEl('anlStuBadge'); if(ab)ab.innerHTML=s?`<span class="badge badge-success badge-pill px-2 py-1" style="font-size:0.8em;"><i class="fas fa-check-circle mr-1"></i>Seçili Öğrenci: ${s.name} (${s.class})</span>`:'';
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

// ---- xPR (yeniden yazıldı: mobil+masaüstü, tek-sayfa garantisi, renk/çerçeve garantisi) ----
function xPR(sourceId, title, btn, orientation) {
  if (window._karneCharts) window._karneCharts.forEach(ch => { try { ch.tooltip.setActiveElements([]); ch.update('none'); } catch (e) {} });
  if (window._raporCharts) window._raporCharts.forEach(ch => { try { ch.tooltip.setActiveElements([]); ch.update('none'); } catch (e) {} });
  if (typeof c !== 'undefined') {
    if (c.a) { try { c.a.tooltip.setActiveElements([]); c.a.update('none'); } catch (e) {} }
    if (c.h) { try { c.h.tooltip.setActiveElements([]); c.h.update('none'); } catch (e) {} }
  }

  const portraitSources = ['pS', 'pC', 'pSubj', 'pSummary', 'pGenSummary'];
  const isPortrait = orientation === 'portrait' || portraitSources.includes(sourceId);
  const orig = btn.innerHTML;
  btn.innerHTML = "<i class='fas fa-spinner fa-spin mr-1'></i>";
  btn.disabled = true;

  const sourceEl = document.getElementById(sourceId);
  if (!sourceEl) { btn.innerHTML = orig; btn.disabled = false; return; }

  // Canvas → PNG
  const canvasMap = [];
  sourceEl.querySelectorAll('canvas').forEach(cv => {
    try { canvasMap.push({ id: cv.id || null, url: cv.toDataURL('image/png', 1.0) }); } catch (e) {}
  });

  const clone = sourceEl.cloneNode(true);

  let cIdx = 0;
  clone.querySelectorAll('canvas').forEach(cv => {
    let entry = cv.id ? canvasMap.find(m => m.id === cv.id) : null;
    if (!entry) entry = canvasMap[cIdx];
    cIdx++;
    if (!entry) { cv.remove(); return; }
    const img = document.createElement('img');
    img.src = entry.url;
    img.className = 'print-chart-img';
    img.alt = '';
    cv.parentElement.replaceChild(img, cv);
  });

  clone.querySelectorAll('.no-print, .d-flex.justify-content-end, .scroll-hint').forEach(el => el.remove());
  clone.querySelectorAll('.report-header').forEach(el => el.style.display = 'flex');

  // CSS değişkenlerini (--exam-color) okuyup INLINE hex'e çevir (mobil garantisi)
  const readVar = (el, name) => {
    try { const v = getComputedStyle(el).getPropertyValue(name).trim(); return v || null; } catch (e) { return null; }
  };
  const realBlocks = sourceEl.querySelectorAll('.exam-type-block, .karne-bolum, .sec-card, [data-exam-color]');
  const cloneBlocks = clone.querySelectorAll('.exam-type-block, .karne-bolum, .sec-card, [data-exam-color]');
  realBlocks.forEach((real, i) => {
    const cl = cloneBlocks[i];
    if (!cl) return;
    const examColor = readVar(real, '--exam-color') || '#1a5fa8';
    cl.style.setProperty('--exam-color', examColor);
    if (cl.classList.contains('exam-type-block') || cl.classList.contains('karne-bolum')) {
      cl.style.borderTop = '3px solid ' + examColor;
      cl.style.borderLeft = '2px solid ' + examColor;
      cl.style.borderRight = '2px solid ' + examColor;
      cl.style.borderBottom = '1px solid #d0d7e2';
      cl.style.borderRadius = '6px';
      cl.style.background = '#ffffff';
      cl.style.webkitPrintColorAdjust = 'exact';
      cl.style.printColorAdjust = 'exact';
    }
    if (cl.classList.contains('sec-card')) {
      cl.style.borderLeft = '3px solid ' + examColor;
      cl.style.borderRight = '3px solid ' + examColor;
      cl.style.webkitPrintColorAdjust = 'exact';
      cl.style.printColorAdjust = 'exact';
    }
  });

  // SAYFA KIRMA — her sınav türü / karne TEK SAYFA
  const examBlocks = clone.querySelectorAll('.exam-type-block');
  examBlocks.forEach((blk, idx) => {
    const stuName  = blk.getAttribute('data-stu-name')  || '';
    const stuClass = blk.getAttribute('data-stu-class') || '';
    const wrapper  = blk.closest('.student-rapor-wrapper');
    let isFirstInScope = false;
    if (wrapper) {
      const siblings = wrapper.querySelectorAll('.exam-type-block');
      isFirstInScope = (siblings[0] === blk);
    } else {
      isFirstInScope = (idx === 0);
    }

    blk.style.pageBreakInside = 'avoid';
    blk.style.breakInside = 'avoid';
    blk.style.overflow = 'hidden';
    blk.classList.add('print-fit-block');

    if (isFirstInScope) {
      blk.style.pageBreakBefore = 'auto';
      blk.style.breakBefore = 'auto';
    } else {
      const isKarne = blk.classList.contains('karne-bolum');
      if (stuName && !isKarne) {
        const hdr = document.createElement('div');
        hdr.className = 'report-header print-page-hdr';
        hdr.style.cssText = 'margin:0 0 8px 0; page-break-before:always; break-before:page;';
        hdr.innerHTML = '<span style="font-size:14px;color:#fff;"><i class="fas fa-user-graduate mr-2"></i><strong>' + stuName + '</strong></span><span style="font-size:11px;color:#fff;">Sınıf: ' + stuClass + ' | ' + new Date().toLocaleDateString('tr-TR') + '</span>';
        blk.parentNode.insertBefore(hdr, blk);
        blk.style.pageBreakBefore = 'auto';
        blk.style.breakBefore = 'auto';
      } else {
        blk.style.pageBreakBefore = 'always';
        blk.style.breakBefore = 'page';
      }
    }
  });

  clone.querySelectorAll('.student-rapor-wrapper').forEach((w, i) => {
    if (i > 0) { w.style.pageBreakBefore = 'always'; w.style.breakBefore = 'page'; }
    w.style.pageBreakInside = 'auto';
    w.style.breakInside = 'auto';
  });

  clone.querySelectorAll('.karne-bolum').forEach((blk, idx) => {
    if (blk.classList.contains('exam-type-block')) return;
    if (idx > 0) { blk.style.pageBreakBefore = 'always'; blk.style.breakBefore = 'page'; }
    blk.style.pageBreakInside = 'avoid';
    blk.style.breakInside = 'avoid';
    blk.classList.add('print-fit-block');
  });

  if (sourceId === 'pED' || sourceId === 'pEDAll') {
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
    clone.querySelectorAll('thead').forEach(h => { h.style.display = 'table-header-group'; });
    clone.querySelectorAll('tfoot').forEach(f => { f.style.display = 'table-footer-group'; });
  }

  const printHtml = '<!DOCTYPE html>\n<html lang="tr">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + title + '</title>\n<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">\n<style>\n  *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }\n  html, body { width: 100% !important; min-width: 0 !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; background: #fff !important; color: #212529 !important; font-family: "Source Sans Pro", Arial, sans-serif; font-size: 10px; -webkit-text-size-adjust: 100%; }\n  @page { margin: 7mm 6mm; size: ' + (isPortrait ? "A4 portrait" : "A4 landscape") + '; }\n  .row { display: flex !important; flex-wrap: wrap !important; width: 100% !important; margin: 0 -5px !important; }\n  .col-6, .col-sm-6, .col-md-6, .col-lg-6 { flex: 0 0 50% !important; max-width: 50% !important; width: 50% !important; padding: 0 5px !important; }\n  .col-md-3, .col-sm-3 { flex: 0 0 25% !important; max-width: 25% !important; width: 25% !important; padding: 0 5px !important; }\n  .col-md-4, .col-lg-4, .col-md-4.col-sm-12 { flex: 0 0 33.333% !important; max-width: 33.333% !important; width: 33.333% !important; padding: 0 5px !important; }\n  .col-12, .col-sm-12, .col-lg-12 { flex: 0 0 100% !important; max-width: 100% !important; padding: 0 5px !important; }\n  .col-md-2 { flex: 0 0 16.666% !important; max-width: 16.666% !important; width: 16.666% !important; padding: 0 5px !important; }\n  .mb-1{margin-bottom:3px!important}.mb-2{margin-bottom:5px!important}.mb-3{margin-bottom:7px!important}.mb-4{margin-bottom:9px!important}\n  .mt-2{margin-top:5px!important}.mt-3{margin-top:7px!important}\n  .p-2{padding:5px!important}.p-0{padding:0!important}\n  .report-header { display: flex !important; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #1a5fa8, #0d47a1) !important; background-color: #1a5fa8 !important; color: #fff !important; padding: 8px 12px; border-radius: 5px; margin-bottom: 8px; }\n  .report-header *, .report-header span, .report-header strong, .report-header i { color: #fff !important; }\n  .table { width: 100% !important; border-collapse: collapse !important; font-size: 7.5px !important; margin-bottom: 4px; }\n  .table th, .table td { border: 1px solid #bbb !important; padding: 1.5px 2.5px !important; color: #212529 !important; vertical-align: middle !important; }\n  .table thead th { background: #1a5fa8 !important; color: #fff !important; font-size: 7px !important; font-weight: 700; }\n  thead { display: table-header-group; }\n  tbody tr { page-break-inside: avoid !important; break-inside: avoid !important; }\n  .scroll, .table-responsive { overflow: visible !important; }\n  tr.highlight-row td { background: #fff3cd !important; font-weight: bold !important; }\n  tr.absent-row td    { background: #f8d7da !important; color: #721c24 !important; }\n  tr.avg-row td       { background: #e8eef7 !important; color: #1a5fa8 !important; font-weight: bold !important; border-top: 2px solid #9cb3d8 !important; }\n  .card { border: 1px solid #ccc !important; border-radius: 4px; margin-bottom: 6px; display: block; box-shadow: none !important; background: #fff !important; }\n  .card-header { background: #f5f5f5 !important; padding: 4px 8px; border-bottom: 1px solid #ccc; font-size: 10px; }\n  .card-body { padding: 5px 8px !important; }\n  .exam-type-block, .karne-bolum { background: #fff !important; border-radius: 6px !important; padding: 8px 10px !important; margin-bottom: 6px !important; page-break-inside: avoid !important; break-inside: avoid !important; overflow: hidden; }\n  .exam-type-block.karne-bolum { padding: 8px 10px !important; margin: 0 0 8px 0 !important; }\n  .exam-type-block > h5, .karne-bolum > h5 { color: #1a5fa8; border-bottom: 1px solid #ccd; padding-bottom: 4px; margin: 0 0 6px 0 !important; font-size: 11px !important; }\n  .info-box { display: flex !important; align-items: stretch; border-radius: 5px; margin-bottom: 3px !important; page-break-inside: avoid !important; break-inside: avoid !important; overflow: hidden; }\n  .info-box-icon { display: flex !important; align-items: center; justify-content: center; width: 44px !important; min-width: 44px; font-size: 1.1em; }\n  .info-box-content { padding: 4px 7px; flex: 1; }\n  .info-box-text { display: block; font-size: 0.72em; font-weight: 700; }\n  .info-box-number { display: block; font-size: 1.05em; font-weight: bold; margin: 1px 0; }\n  .progress-description { display: block; font-size: 0.68em; }\n  .info-box[style*="linear-gradient"] *, .info-box[style*="background:#6c757d"] * { color: #fff !important; }\n  .bg-primary { background: #1a5fa8 !important; color: #fff !important; }\n  .bg-success { background: #198754 !important; color: #fff !important; }\n  .bg-danger  { background: #dc3545 !important; color: #fff !important; }\n  .bg-warning { background: #e6a800 !important; color: #fff !important; }\n  .bg-info    { background: #0dcaf0 !important; color: #055160 !important; }\n  .trend-card { background: #f5f7fa !important; border-radius: 6px; padding: 5px 8px !important; margin-bottom: 5px !important; page-break-inside: avoid !important; break-inside: avoid !important; }\n  .trend-indicator { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 20px; font-size: 0.78em; font-weight: bold; }\n  .trend-up    { background: #d4edda !important; color: #1e7e34 !important; }\n  .trend-down  { background: #f8d7da !important; color: #b02a37 !important; }\n  .trend-stable{ background: #e2e3e5 !important; color: #495057 !important; }\n  .border-left { border-left: 1px solid #ccc; }\n  .sec-card { background: #fff !important; border: 1px solid #e9ecef !important; border-radius: 8px !important; padding: 6px 8px !important; min-height: 0 !important; display: flex; align-items: center; gap: 8px; box-shadow: none !important; page-break-inside: avoid !important; break-inside: avoid !important; }\n  .sec-card .sec-icon { flex-shrink: 0; width: 32px; height: 32px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.95em; color: #fff !important; background: #1a5fa8 !important; }\n  .sec-card.sec-pos .sec-icon { background: #198754 !important; }\n  .sec-card.sec-neg .sec-icon { background: #dc3545 !important; }\n  .sec-card.sec-neutral .sec-icon { background: #6c757d !important; }\n  .sec-card .sec-label { font-size: 0.68rem; font-weight: 700; color: #6c757d; text-transform: uppercase; letter-spacing: 0.3px; }\n  .sec-card .sec-value { font-size: 0.95rem; font-weight: 700; color: #212529; line-height: 1.15; margin-top: 2px; word-break: break-word; }\n  .sec-card.sec-pos .sec-value { color: #198754 !important; }\n  .sec-card.sec-neg .sec-value { color: #dc3545 !important; }\n  .sec-card .sec-sub { font-size: 0.68rem; color: #6c757d; margin-top: 1px; }\n  .sec-card .sec-chip { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 10px; font-size: 0.68rem; font-weight: 700; margin-top: 2px; }\n  .sec-card.sec-pos .sec-chip  { background: #d4edda !important; color: #0f5132 !important; }\n  .sec-card.sec-neg .sec-chip  { background: #f8d7da !important; color: #842029 !important; }\n  .sec-card.sec-neutral .sec-chip { background: #e2e3e5 !important; color: #495057 !important; }\n  .print-chart-img { max-width: 100%; width: 100%; max-height: ' + (isPortrait ? "150px" : "115px") + '; height: auto; object-fit: contain; display: block; margin: 2px auto 4px; }\n  .chart-box { height: auto !important; margin-bottom: 4px; page-break-inside: avoid !important; break-inside: avoid !important; }\n  .boxplot-card { background: #f8f9ff !important; border: 1px solid #c8d4ee !important; border-radius: 6px; padding: 5px 7px; margin-top: 3px; page-break-inside: avoid !important; break-inside: avoid !important; }\n  .boxplot-title { font-size: 9px; font-weight: 700; color: #1a5fa8; margin-bottom: 2px; }\n  .boxplot-wrap { overflow: visible !important; }\n  .boxplot-svg { max-height: ' + (isPortrait ? "110px" : "90px") + ' !important; width: 100% !important; height: auto !important; }\n  .risk-badge { display: inline-flex; align-items: center; gap: 2px; padding: 1px 5px; border-radius: 20px; font-size: 0.68em; font-weight: 600; white-space: nowrap; }\n  .rb-abs    { background: #fff3cd !important; color: #664d03 !important; }\n  .rb-trend  { background: #f8d7da !important; color: #842029 !important; }\n  .rb-rank   { background: #e2e3e5 !important; color: #495057 !important; }\n  .rb-subj   { background: #e6dcf2 !important; color: #4a1d8a !important; }\n  h4 { font-size: 12px !important; margin: 5px 0; }\n  h5 { font-size: 11px !important; margin: 4px 0; }\n  h3.card-title { font-size: 11px !important; }\n  .text-primary { color: #1a5fa8 !important; }\n  .text-success { color: #198754 !important; }\n  .text-danger  { color: #dc3545 !important; }\n  .text-muted   { color: #6c757d !important; }\n  .font-weight-bold { font-weight: bold; }\n  .small, small { font-size: 0.8em; }\n  .badge { display: inline-block; padding: 1px 5px; border-radius: 8px; font-size: 0.72em; }\n  .badge-info { background: #cff4fc !important; color: #055160 !important; }\n  .shadow-sm { box-shadow: none !important; }\n  .no-print, button, .btn, .scroll-hint, .d-flex.justify-content-end, #riskPanel, .main-sidebar, .main-header, .content-wrapper > .overlay { display: none !important; }\n  .wrapper, .content-wrapper, .container-fluid { margin-left: 0 !important; padding-left: 0 !important; width: 100% !important; max-width: 100% !important; }\n  .print-fit-block { transform-origin: top left; }\n</style>\n</head>\n<body>\n<div id="printRoot" style="padding:0 3px;">' + clone.outerHTML + '</div>\n<script>\n(function(){\n  var pageH_mm = ' + (isPortrait ? 297 : 210) + ';\n  var pageW_mm = ' + (isPortrait ? 210 : 297) + ';\n  var marginV_mm = 14, marginH_mm = 12;\n  var mmToPx = function(mm){ return mm * 96 / 25.4; };\n  var pageContentH = mmToPx(pageH_mm - marginV_mm);\n  var pageContentW = mmToPx(pageW_mm - marginH_mm);\n  function waitImgs(cb){\n    var imgs = Array.from(document.images);\n    if(!imgs.length) return cb();\n    var done = 0, total = imgs.length, finished = false;\n    var check = function(){ done++; if(done >= total && !finished){ finished = true; cb(); } };\n    imgs.forEach(function(img){\n      if(img.complete && img.naturalWidth > 0) return check();\n      img.addEventListener("load", check);\n      img.addEventListener("error", check);\n    });\n    setTimeout(function(){ if(!finished){ finished = true; cb(); } }, 4000);\n  }\n  function autoShrink(){\n    var blocks = document.querySelectorAll(".print-fit-block");\n    blocks.forEach(function(blk){\n      blk.style.transform = "none"; blk.style.width = "";\n      var h = blk.scrollHeight, w = blk.scrollWidth;\n      var scaleH = h > pageContentH ? (pageContentH / h) : 1;\n      var scaleW = w > pageContentW ? (pageContentW / w) : 1;\n      var scale = Math.min(scaleH, scaleW, 1);\n      if(scale < 0.55) scale = 0.55;\n      if(scale < 0.999){\n        blk.style.transform = "scale(" + scale + ")";\n        blk.style.transformOrigin = "top left";\n        blk.style.width = (100 / scale) + "%";\n      }\n    });\n  }\n  function waitFonts(cb){ if(document.fonts && document.fonts.ready){ document.fonts.ready.then(cb, cb); } else { cb(); } }\n  function trigger(){\n    waitImgs(function(){\n      waitFonts(function(){\n        requestAnimationFrame(function(){\n          requestAnimationFrame(function(){\n            autoShrink();\n            requestAnimationFrame(function(){ setTimeout(function(){ window.print(); }, 120); });\n          });\n        });\n      });\n    });\n  }\n  if(document.readyState === "complete") trigger();\n  else window.addEventListener("load", trigger);\n})();\n<\/script>\n</body>\n</html>';

  const winFeatures = 'width=' + (isPortrait ? 900 : 1200) + ',height=800,scrollbars=yes';
  let printWin = null;
  try { printWin = window.open('', '_blank', winFeatures); } catch (e) {}

  if (printWin && printWin.document) {
    printWin.document.open();
    printWin.document.write(printHtml);
    printWin.document.close();
    btn.innerHTML = orig;
    btn.disabled = false;
    return;
  }

  if (typeof showToast === 'function') showToast('Açılır pencere engellendi, dahili yazdırmaya geçiliyor…', 'info', 3500);
  let iframe = document.getElementById('__xprFrame');
  if (iframe) iframe.remove();
  iframe = document.createElement('iframe');
  iframe.id = '__xprFrame';
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const idoc = iframe.contentDocument || iframe.contentWindow.document;
  idoc.open();
  idoc.write(printHtml);
  idoc.close();
  setTimeout(() => { try { iframe.remove(); } catch (e) {} }, 60000);
  btn.innerHTML = orig;
  btn.disabled = false;
}

// ---- debounceSearch (orig lines 1890-1890) ----
function debounceSearch(){clearTimeout(searchDebounceTimer);searchDebounceTimer=setTimeout(sSearch,280);}

// ---- sSearch (orig lines 1891-1897) ----
function sSearch(){
  let v=getEl('sInp').value.trim(),r=getEl('sRes'); if(!v){r.innerHTML='';r.style.display='none';return;}
  let trm=normTR(v).split(/\s+/), m=DB.s.filter(x=>{let txt=normTR(x.no+' '+x.name+' '+x.class);return trm.every(t=>txt.includes(t));});
  if(!m.length){r.innerHTML='<div class="s-item text-muted">Bulunamadı.</div>';r.style.display='block';return;}
  let h=''; m.slice(0,20).forEach(x=>h+=`<div class="s-item" onclick="if(event.target.closest('button'))return;sAct('${x.no}',true);"><div class="s-info"><strong>${x.no}</strong> — ${x.name} <span class="text-muted">(${x.class})</span></div><div class="s-actions"><button class="btn btn-sm btn-warning admin-only" onclick="event.stopPropagation();eStu('${x.no}')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger admin-only" onclick="event.stopPropagation();cDel('student','${x.no} silinsin mi?','${x.no}')"><i class="fas fa-trash"></i></button></div></div>`);
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
  if(!m.length){res.innerHTML='<div class="anlStu-item text-muted">Bulunamadı.</div>';res.style.display='block';return;}
  res.innerHTML=m.slice(0,20).map(x=>`<div class="anlStu-item" onclick="anlStuSelect('${x.no}')"><div style="flex:1; min-width:0;"><strong>${x.no}</strong> — ${x.name} <span class="text-muted">(${x.class})</span></div></div>`).join(''); res.style.display='block';
}

// ---- anlStuSelect (orig lines 1907-1911) ----
function anlStuSelect(no){
  getEl('anlStuRes').style.display='none'; let s=DB.s.find(x=>x.no===no); if(s) getEl('anlStuInp').value=s.name+' ('+s.class+')'; aNo = no;
  let ab=getEl('anlStuBadge'); if(ab) ab.innerHTML=s?`<span class="badge badge-success badge-pill px-2 py-1" style="font-size:0.8em;"><i class="fas fa-check-circle mr-1"></i>Seçili Öğrenci: ${s.name} (${s.class})</span>`:'';
  getEl('aBadge').innerHTML=s?`<span class="badge badge-success badge-pill px-3 py-2"><i class="fas fa-check-circle mr-1"></i>Seçili Öğrenci: ${s.name} (${s.class})</span>`:'<span class="text-muted">Seçilmedi</span>'; reqUI(); 
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
      ? gradeKeys.map(gr => `<span class="hsc-grade"><strong>${gr}. Sınıf:</strong> ${info.grades[gr]} <small>Sınav</small></span>`).join('')
      : '<span class="hsc-empty">Sınıf bilgisi yok</span>';
    
    h += `<div class="col-md-4 col-sm-6 col-12 mb-3">
      <div class="home-stat-card exam-color-${colorIdx}">
        <div class="hsc-head">
          <span class="hsc-title"><i class="${ic[colorIdx % ic.length]}"></i>${label}</span>
          <span class="hsc-count" style="font-weight: bold;">${info.total} Sınav</span>
        </div>
        <div class="hsc-grades" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">${gradesHtml}</div>
      </div>
    </div>`;
  });
  g.innerHTML = h;
}

// ---- uDrp (orig lines 1923-1925) ----
function uDrp(){
  uExamTypes(); if(aNo){ let s=DB.s.find(x=>x.no===aNo); if(s&&getEl('anlStuInp'))getEl('anlStuInp').value=s.name+' ('+s.class+')'; }
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
  brSel.innerHTML = `<option value="" disabled${prev?'':' selected'}>Şube Seç</option><option value="__ALL__"${prev==='__ALL__'?' selected':''}>Tümü</option>`+sorted.map(x=>`<option value="${x}"${prev===x?' selected':''}>${x}</option>`).join('');
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
      let gs = (m.grades && m.grades.length) ? m.grades : null;
      if(lvlF){
        // sınav bu seviyeyi kapsıyor mu?
        if(gs && !gs.includes(lvlF)) return;
      }
      if(brF){
        // bu şubede öğrenci olan sınıf seviyelerinden en az biri sınavın kapsamında mı?
        if(lvlsInBranch.size === 0) return; // o şubede hiç öğrenci yok
        if(gs && ![...lvlsInBranch].some(g=>gs.includes(g))) return;
      }
      types.add(m.examType);
    });
  } else {
    Object.values(EXAM_META).forEach(m => types.add(m.examType));
  }
  let sortedTypes = [...types].sort(), prev=getEl('aEx').value;
  getEl('aEx').innerHTML='<option value="" disabled' + (prev && sortedTypes.includes(prev) ? '' : ' selected') + '>Sınav Türü Seç</option>'+sortedTypes.map(x=>`<option value="${x}">${x}</option>`).join('');
  if(sortedTypes.includes(prev)) getEl('aEx').value=prev;
  else if(prev){ getEl('aEx').value=''; }
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
    if(lvlF){
      let gs = (m.grades && m.grades.length) ? m.grades : null;
      if(gs && !gs.includes(lvlF)) return;
    }
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
    let _prev = getEl('aSub').value;
    // === Tek-sınav modunda öğrenci analizi varsayılanı 'summary'; toplu modda 'totalNet'; sınıf analizinde 'score' ===
    let _aExDateRaw = (getEl('aExDate')||{}).value || '';
    let _isSingleExam = (aT === 'student') && !!_aExDateRaw;
    let _defaultVal = (aT === 'class') ? 'score' : (_isSingleExam ? 'summary' : 'totalNet');
    if(_prev === 'summary' && !_isSingleExam) _prev = '';
    let _selVal = _prev || _defaultVal;
    let o = `<option value="" disabled${_selVal?'':' selected'}>Veri Seç</option>`;
    if(_isSingleExam) o += `<option value="summary"${_selVal==='summary'?' selected':''}>Sınav Özeti</option>`;
    o += `<option value="totalNet"${_selVal==='totalNet'?' selected':''}>Toplam Net</option><option value="score"${_selVal==='score'?' selected':''}>Puan</option>`;
    if (aT === 'student') { o += `<option value="rank_c"${_selVal==='rank_c'?' selected':''}>Sınıf Sıralaması</option><option value="rank_i"${_selVal==='rank_i'?' selected':''}>Kurum Sıralaması</option><option value="rank_g"${_selVal==='rank_g'?' selected':''}>Genel Sıralama</option>`; }
    [...s].sort().forEach(x=> o += `<option value="s_${x}"${_selVal==='s_'+x?' selected':''}>${toTitleCase(x)} Neti</option>`); getEl('aSub').innerHTML = o;
    if(_selVal) { let _opt=[...getEl('aSub').options].find(o=>o.value===_selVal); if(_opt) getEl('aSub').value=_selVal; }
  } else if (aT === 'examdetail') {
    // === FIX: uSub varsayılanı — examdetail için varsayılan 'summary' (Sınav Özeti) ===
    let prev = getEl('aSub').value;
    let _validVals = ['summary','general_summary','list_single','list_all'];
    let _selVal = _validVals.includes(prev) ? prev : 'summary';
    getEl('aSub').innerHTML = `<option value="summary"${_selVal==='summary'?' selected':''}>Sınav Özeti (Tek Sınav)</option><option value="general_summary"${_selVal==='general_summary'?' selected':''}>Genel Sınav Özeti (Tüm Sınavlar)</option><option value="list_single"${_selVal==='list_single'?' selected':''}>Toplu Liste (Tek Sınav)</option><option value="list_all"${_selVal==='list_all'?' selected':''}>Toplu Liste (Tüm Sınavlar)</option>`;
    getEl('aSub').value = _selVal;
  } else if (aT === 'subject') {
    let prev = getEl('aSub').value, opts = [...s].sort().map(x=>`<option value="${x}">${toTitleCase(x)}</option>`).join('');
    let ph = `<option value="" disabled${prev?'':' selected'}>Ders Seç</option>`;
    getEl('aSub').innerHTML = opts ? (ph + opts) : '<option value="" disabled selected>Ders bulunamadı</option>';
    if([...s].includes(prev)) getEl('aSub').value = prev;
  } else {
    getEl('aSub').innerHTML='<option value="" disabled selected>Veri Seç</option>'+[...s].sort().map(x=>`<option value="${x}">${toTitleCase(x)}</option>`).join('');
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
  _resetSel('aBr'); _resetSel('aEx'); _resetSel('aDate'); _resetSel('aSub');
  uBranches(); uExamTypes(); uExamDates(); uSub(); _updateGDateVisibility(); reqAnl();
}

// ---- onBrChange (orig lines 2068-2071) ----
function onBrChange(){
  _resetSel('aEx'); _resetSel('aDate'); _resetSel('aSub');
  uExamTypes(); uExamDates(); uSub(); _updateGDateVisibility(); reqAnl();
}

// ---- onExTypeChange (orig lines 2072-2075) ----
function onExTypeChange(){
  _resetSel('aDate'); _resetSel('aSub');
  // Öğrenci modunda yeni sınav seçim dropdown'ı da sıfırlanır
  let _aExDate = getEl('aExDate'); if(_aExDate) _aExDate.value = '';
  uExamDates(); uStudentExamDates(); uSub(); _updateGDateVisibility();
  applyExamColorToFilters(); reqAnl();
}

// ---- onExDateStudentChange: Öğrenci modu — tek sınav/Tümü ayrımı ----
function onExDateStudentChange(){
  // aExDate boş = Tümü (toplu mod); dolu = tek sınav modu
  // Veri (aSub) listesine 'Sınav Özeti' eklensin/çıkarılsın diye uSub'u tazele
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
    el.innerHTML = '<option value="">Tümü</option>';
    el.value = '';
    return;
  }
  // Öğrenci seçiliyse sınıf seviyesine göre filtrele
  let stuGrade = null;
  if(aNo){ let st = DB.s.find(x=>x.no===aNo); if(st) stuGrade = getGrade(st.class); }
  let entries = [];
  Object.values(EXAM_META).forEach(m => {
    if(m.examType !== eT) return;
    if(stuGrade && m.grades && m.grades.length > 0 && !m.grades.includes(stuGrade)) return;
    entries.push({ date: m.date, publisher: m.publisher || '' });
  });
  // Unique (date+publisher), sonra tarih DESC sırala (en yeni en üstte)
  let seen = new Set(), unique = [];
  entries.forEach(x => { let k = x.date+'||'+x.publisher; if(!seen.has(k)){ seen.add(k); unique.push(x); } });
  unique.sort((a,b) => srt(b.date, a.date)); // DESC
  let prev = el.value;
  let opts = '<option value="">Tümü</option>' + unique.map(x => {
    let pub = x.publisher ? ` (${toTitleCase(x.publisher)})` : '';
    return `<option value="${x.date}||${x.publisher}">${x.date}${pub}</option>`;
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

  if(!eT) return;
  let idx = (typeof examColorIdx === 'function') ? examColorIdx(eT) : 0;

  [filter, res].forEach(el => {
    if(!el) return;
    el.classList.add('exam-color-'+idx);
    el.setAttribute('data-exam-color', String(idx));
  });
  // Risk paneli sadece risk modunda ve riskExTypeFilter doluysa renk alır
  if(risk){
    let riskET = (getEl('riskExTypeFilter')||{}).value || '';
    if(aT === 'risk' && riskET){
      let rIdx = (typeof examColorIdx === 'function') ? examColorIdx(riskET) : 0;
      risk.classList.add('exam-color-'+rIdx);
      risk.setAttribute('data-exam-color', String(rIdx));
    }
  }
  // Dropdown yan badge
  if(aExWrap){
    aExWrap.classList.add('exam-color-'+idx);
    aExWrap.setAttribute('data-active','1');
  }
}

// ---- onDateChange (orig lines 2076-2079) ----
function onDateChange(){
  _resetSel('aSub');
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
    let st = DB.s.find(x=>x.no===aNo); if(st) stuGrade = getGrade(st.class);
  }
  let lvlGrade = '';
  // === FIX: examdetail/subject/class için seçili sınıf seviyesi (aLvl) her zaman filtre ===
  if(aT === 'subject' || aT === 'class' || aT === 'examdetail') {
    lvlGrade = getEl('aLvl') ? getEl('aLvl').value : '';
  }

  Object.values(EXAM_META).forEach(m => {
    if(m.examType !== t) return;
    if(stuGrade && m.grades && m.grades.length > 0 && !m.grades.includes(stuGrade)) return;
    if(lvlGrade && m.grades && m.grades.length > 0 && !m.grades.includes(lvlGrade)) return;
    dates.push(m.date); if(m.publisher) datePublisherMap[m.date] = m.publisher;
  });
  
  dates = [...new Set(dates)].sort(srt); let prev=getEl('aDate').value;
  let placeholderOpt = `<option value="" disabled${prev?'':' selected'}>Sınav Seç</option>`;
  let allOpt = (aT === 'class' || aT === 'subject') ? '<option value="">Tüm Sınavlar</option>' : '';
  getEl('aDate').innerHTML = placeholderOpt + allOpt + dates.map(x => { let pub = datePublisherMap[x] ? ` (${toTitleCase(datePublisherMap[x])})` : ''; return `<option value="${x}">${x}${pub}</option>`; }).join('');
  if(dates.includes(prev)) getEl('aDate').value=prev;
  else if(aT === 'class' || aT === 'subject') getEl('aDate').value='';
  else if(aT === 'examdetail' && dates.length > 0) getEl('aDate').value = dates[dates.length - 1]; // en son sınavı varsayılan seç
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
  let aExWrapper = getEl('aEx') ? getEl('aEx').closest('.form-group').parentElement : null;
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
      getEl('aLvl').innerHTML=`<option value="" disabled${_pL?'':' selected'}>Sınıf Seviyesi Seç</option>`+[...l].sort((a,b)=>parseInt(a)-parseInt(b)).map(x=>`<option value="${x}">${x}. Sınıf</option>`).join('');
      if(_pL && [...l].includes(_pL)) getEl('aLvl').value=_pL;
    } else if (t==='examdetail' || t==='subject') {
      let l=new Set(); DB.s.forEach(s=>{ let m=s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(m) l.add(m[1]); });
      let _pL=getEl('aLvl').value;
      getEl('aLvl').innerHTML=`<option value="" disabled${_pL?'':' selected'}>Sınıf Seviyesi Seç</option>`+[...l].sort((a,b)=>parseInt(a)-parseInt(b)).map(x=>`<option value="${x}">${x}. Sınıf</option>`).join('');
      if(_pL && [...l].includes(_pL)) getEl('aLvl').value=_pL;
    }
    uBranches(); uExamTypes(); uExamDates(); uSub();
  } else {
    // Risk modunda filtre dropdown'larını doldur
    _populateRiskFilterDropdowns();
    renderRiskPanel();
  }
}

// ---- _populateRiskFilterDropdowns (orig lines 2174-2220) ----
function _populateRiskFilterDropdowns() {
  // Sınıf Seviyesi
  let gradeEl = getEl('riskGradeFilter');
  if(gradeEl) {
    let prevG = gradeEl.value;
    let grades = new Set();
    DB.s.forEach(s => { let m = s.class.match(/^(\d+)/); if(m) grades.add(m[1]); });
    gradeEl.innerHTML = '<option value="">Tüm Sınıflar</option>' + [...grades].sort((a,b)=>parseInt(a)-parseInt(b)).map(g=>`<option value="${g}">${g}. Sınıf</option>`).join('');
    if(prevG && [...grades].includes(prevG)) gradeEl.value = prevG;
  }
  // Şube (sınıf seviyesine göre filtreli)
  let branchEl = getEl('riskBranchFilter');
  if(branchEl) {
    let prevB = branchEl.value;
    let gradeF = getEl('riskGradeFilter') ? getEl('riskGradeFilter').value : '';
    let branches = new Set();
    DB.s.forEach(s => { let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(m && (!gradeF||m[1]===gradeF)) branches.add(m[2].toLocaleUpperCase('tr-TR')); });
    branchEl.innerHTML = '<option value="">Tüm Şubeler</option>' + [...branches].sort().map(b=>`<option value="${b}">${b} Şubesi</option>`).join('');
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
        if(gradeF && m.grades && m.grades.length && !m.grades.includes(gradeF)) return;
        typesFromMeta.add(m.examType);
      });
      allTypes = [...typesFromMeta].sort();
    }
    exTypeEl.innerHTML = '<option value="">Tüm Sınav Türleri</option>' + allTypes.map(t=>`<option value="${t}">${t}</option>`).join('');
    if(prevET && allTypes.includes(prevET)) exTypeEl.value = prevET;
  }
}

// ---- handleSubChange (orig lines 2222-2230) ----
function handleSubChange(){ 
  let t = getEl('aType').value, sub = getEl('aSub').value; 
  if(t === 'examdetail') { 
    getEl('gDate').style.display = (sub === 'general_summary' || sub === 'list_all') ? 'none' : 'block'; 
    uExamDates(); 
  } 
  _updateGDateVisibility();
  reqAnl(); 
}
