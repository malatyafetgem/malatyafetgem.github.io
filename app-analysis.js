// app-analysis.js — Risk scoring, box plots, karne, rH, rAnl, rapor

// ---- top-level (orig lines 1079-1079) ----
let _riskCache = null;

// ---- top-level (orig lines 1081-1081) ----
const RISK_SEV_W = { high: 3, med: 2, low: 1 };

// ---- calcRiskScores (orig lines 1083-1256) ----
function calcRiskScores() {
  if(!DB.e.length || !DB.s.length) return [];

  let gradeOf = (no) => { let st = DB.s.find(x=>x.no===no); return st ? (String(st.class||'').match(/^(\d+)/)?.[1] || '') : ''; };

  // 1. Popülasyon Ortalamalarını (SınavTürü + SınıfSeviyesi + Tarih bazlı) önceden hesapla
  let popStats = {};
  DB.e.forEach(x => {
    if(x.abs) return;
    let gr = gradeOf(x.studentNo);
    if(!gr) return;
    let key = x.examType + '||' + gr + '||' + x.date; // Sınıf seviyesi ve Sınav Türü kesin ayrımı
    if(!popStats[key]) popStats[key] = { totalNets: [], subjs: {}, stus: 0 };
    popStats[key].totalNets.push(x.totalNet);
    popStats[key].stus++;
    if(x.subs) {
      Object.keys(x.subs).forEach(s => {
        if(!popStats[key].subjs[s]) popStats[key].subjs[s] = [];
        popStats[key].subjs[s].push(x.subs[s].net);
      });
    }
  });

  let getAvg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  let popAvgs = {};
  Object.keys(popStats).forEach(k => {
    let p = popStats[k];
    popAvgs[k] = { 
      totalNet: getAvg(p.totalNets), 
      subjs: Object.fromEntries(Object.entries(p.subjs).map(([s, arr]) => [s, getAvg(arr)]))
    };
  });

  // 2. Devamsızlık hesabı için (SınavTürü + SınıfSeviyesi bazlı) yapılan sınav tarihlerini bul
  let examDatesByGroup = {};
  DB.e.forEach(x => {
    let gr = gradeOf(x.studentNo);
    if(!gr) return;
    let key = x.examType + '||' + gr;
    if(!examDatesByGroup[key]) examDatesByGroup[key] = new Set();
    examDatesByGroup[key].add(x.date);
  });

  // 3. Öğrencilerin sınavlarını grupla
  let stuGroups = {};
  DB.e.forEach(x => {
    if(!stuGroups[x.studentNo]) stuGroups[x.studentNo] = {};
    if(!stuGroups[x.studentNo][x.examType]) stuGroups[x.studentNo][x.examType] = [];
    stuGroups[x.studentNo][x.examType].push(x);
  });

  let riskEntries = [];

  // 4. Rubrik Bazlı Hesaplama (Her Öğrencinin Her Sınav Türü İçin Ayrı Ayrı)
  Object.entries(stuGroups).forEach(([no, types]) => {
    let stu = DB.s.find(x=>x.no===no);
    if(!stu) return;
    let gr = gradeOf(no);
    if(!gr) return;
    
    Object.entries(types).forEach(([eType, exams]) => {
      let typeScore = 0; 
      let flags = [];
      
      exams.sort((a,b) => srt(a.date, b.date));
      let attended = exams.filter(x => !x.abs);
      let allDatesForGroup = [...(examDatesByGroup[eType + '||' + gr] || [])].sort(srt);
      let totalHeld = allDatesForGroup.length;
      
      // A) KATILIM / DEVAMSIZLIK RİSKİ KURALI (Maks 30 Puan)
      if(totalHeld >= 2) {
        let attRate = attended.length / totalHeld;
        let last2Dates = allDatesForGroup.slice(-2);
        let attendedLast2 = attended.filter(x => last2Dates.includes(x.date)).length;
        
        if(attRate < 0.50 || attendedLast2 === 0) {
          flags.push({ type:'abs', severity:'high', examType:eType, detail:`${eType}: Katılım çok düşük (%${Math.round(attRate*100)}) veya son 2 sınava girmedi.`, z: 30 });
          typeScore += 30;
        } else if (attRate <= 0.75) {
          flags.push({ type:'abs', severity:'med', examType:eType, detail:`${eType}: Katılım oranı düşük (%${Math.round(attRate*100)}).`, z: 15 });
          typeScore += 15;
        }
      }
      
      // B ve C Kriterleri için öğrencinin en az 2 sınava girmiş olması zorunludur
      if(attended.length >= 2) {
        let lastEx = attended[attended.length - 1];
        let prevEx = attended[attended.length - 2];
        
        // B) SIRALAMA GERİLEMESİ (Maks 40 Puan)
        let lastPct = (parseFloat(lastEx.iR) / parseFloat(lastEx.iP)) || null;
        let prevPct = (parseFloat(prevEx.iR) / parseFloat(prevEx.iP)) || null;
        
        if(lastPct !== null && prevPct !== null) {
          let delta = lastPct - prevPct; 
          if(delta >= 0.15) {
            flags.push({ type:'rank', severity:'high', examType:eType, detail:`${eType}: Kurum sıralamasında sert gerileme (%${Math.round(delta*100)} kayıp).`, z: 40 });
            typeScore += 40;
          } else if(delta >= 0.08) {
            flags.push({ type:'rank', severity:'med', examType:eType, detail:`${eType}: Kurum sıralamasında gerileme (%${Math.round(delta*100)} kayıp).`, z: 20 });
            typeScore += 20;
          }
        }
        
        // C) NORMALİZE EDİLMİŞ NET DÜŞÜŞÜ (Maks 30 Puan)
        let pKeyLast = eType + '||' + gr + '||' + lastEx.date;
        let pKeyPrev = eType + '||' + gr + '||' + prevEx.date;
        let aLast = popAvgs[pKeyLast];
        let aPrev = popAvgs[pKeyPrev];
        
        if(aLast && aPrev) {
          let dropScore = 0;
          let checkDrop = (valL, avgL, valP, avgP) => {
            if(!avgL || !avgP) return 0;
            return (valP / avgP) - (valL / avgL);
          };

          let totalDrop = checkDrop(lastEx.totalNet, aLast.totalNet, prevEx.totalNet, aPrev.totalNet);
          if(totalDrop >= 0.20) {
            flags.push({ type:'trend', severity:'high', examType:eType, detail:`${eType}: Genel netlerde ortalamaya göre ciddi düşüş.`, z: 30 });
            dropScore += 30;
          } else if(totalDrop >= 0.10) {
            flags.push({ type:'trend', severity:'med', examType:eType, detail:`${eType}: Genel netlerde ortalamaya göre düşüş.`, z: 15 });
            dropScore += 15;
          }

          if(dropScore < 30 && lastEx.subs && prevEx.subs) {
            let droppedSubjs = [];
            let maxSubjSeverity = null;
            Object.keys(lastEx.subs).forEach(s => {
              if(prevEx.subs[s]) {
                let d = checkDrop(lastEx.subs[s].net, aLast.subjs[s], prevEx.subs[s].net, aPrev.subjs[s]);
                if(d >= 0.20) { droppedSubjs.push(toTitleCase(s)); maxSubjSeverity = 'high'; }
                else if(d >= 0.10 && maxSubjSeverity !== 'high') { droppedSubjs.push(toTitleCase(s)); maxSubjSeverity = maxSubjSeverity || 'med'; }
              }
            });
            if(droppedSubjs.length > 0) {
              let sPts = maxSubjSeverity === 'high' ? 30 : 15;
              flags.push({ type:'subj', severity:maxSubjSeverity, examType:eType, detail:`${eType} Ders Düşüşü: ${droppedSubjs.join(', ')}`, z: sPts });
              dropScore += sPts;
            }
          }
          typeScore += Math.min(dropScore, 30);
        }
      }
      
      // Eğer bu sınav türü için öğrenci risk taşıyorsa listeye ekle
      if(typeScore > 0) {
        let topLevel = typeScore >= 70 ? 'high' : (typeScore >= 40 ? 'med' : 'low');
        
        let seenTypes = new Set();
        let uniqueFlags = [];
        flags.forEach(f => {
            let k = f.type + '|' + f.examType;
            if(!seenTypes.has(k)) { seenTypes.add(k); uniqueFlags.push(f); }
        });

        riskEntries.push({ 
          no: no, 
          name: stu.name, 
          cls: stu.class, 
          score: typeScore, 
          level: topLevel, 
          flags: uniqueFlags, 
          examTypes: [eType] // <-- Sadece filtrelenen Sınav Türü!
        });
      }
    });
  });

  riskEntries.sort((a,b) => b.score - a.score);
  _riskCache = { ts: Date.now(), results: riskEntries };
  return riskEntries;
}

// ---- renderRiskPanel (orig lines 1258-1340) ----
function renderRiskPanel() {
  let panelEl = getEl('riskPanel'); if(!panelEl) return;
  let risks = (_riskCache && _riskCache.results) ? _riskCache.results : calcRiskScores();
  // Veri yoksa içeriği temizle ama paneli gizleme (uUI yönetiyor)
  if(!risks.length) {
    let listEl2 = getEl('riskList'); if(listEl2) listEl2.innerHTML = '<div class="risk-empty"><i class="fas fa-info-circle mr-2"></i>Henüz yeterli sınav verisi bulunmuyor.</div>';
    ['riskCardHigh','riskCardMed','riskCardLow','riskCardTotal'].forEach(id => { let el=getEl(id); if(el) el.textContent='0'; });
    let badge = getEl('riskTotalBadge'); if(badge) badge.textContent = '';
    return;
  }

  // Filtreler
  let exTypeF = (getEl('riskExTypeFilter')||{}).value || '';
  let gradeF  = (getEl('riskGradeFilter')||{}).value  || '';
  let branchF = (getEl('riskBranchFilter')||{}).value || '';
  let levelF  = (getEl('riskLevelFilter')||{}).value  || '';

  // Sınıf adından grade ve şubeyi ayıkla (örn. "10-A" → grade:"10", branch:"A")
  function getGradeFromCls(cls) { let m = String(cls||'').match(/^(\d+)/); return m ? m[1] : ''; }
  function getBranchFromCls(cls) { let m = String(cls||'').match(/[A-Za-z]+$/); return m ? m[0].toUpperCase() : ''; }

  let filtered = risks.filter(r => {
    if(exTypeF && !r.examTypes.includes(exTypeF)) return false;
    if(gradeF  && getGradeFromCls(r.cls) !== gradeF) return false;
    if(branchF && getBranchFromCls(r.cls) !== branchF) return false;
    if(levelF  && r.level !== levelF) return false;
    return true;
  });

  // ExType dropdown zaten _populateRiskFilterDropdowns tarafından doldurulur
  // Burada sadece mevcut değerlerin geçerliliğini kontrol et

  // Özet kartlarını güncelle (filtreli sayılar)
  let hi = filtered.filter(r=>r.level==='high').length;
  let me = filtered.filter(r=>r.level==='med').length;
  let lo = filtered.filter(r=>r.level==='low').length;
  let tot = filtered.length;
  let cH=getEl('riskCardHigh'),cM=getEl('riskCardMed'),cL=getEl('riskCardLow'),cT=getEl('riskCardTotal');
  if(cH) cH.textContent = hi;
  if(cM) cM.textContent = me;
  if(cL) cL.textContent = lo;
  if(cT) cT.textContent = tot;

  // Badge toplam
  let badge = getEl('riskTotalBadge');
  if(badge) badge.textContent = tot + ' öğrenci riskte';

  // Uyarı kartları
  const levelIcon = { high:'fa-exclamation-circle', med:'fa-exclamation-triangle', low:'fa-info-circle' };
  const typeIcon  = { trend:'fa-chart-line', rank:'fa-sort-amount-up', subj:'fa-book', abs:'fa-calendar-times' };
  const typeLabel = { trend:'Düşüş Trendi', rank:'Sıra Gerileme', subj:'Ders Düşüşü', abs:'Devamsızlık' };

  let listEl = getEl('riskList');
  if(!filtered.length) {
    listEl.innerHTML = `<div class="risk-empty"><i class="fas fa-filter mr-2"></i>Seçili filtreye uyan riskli öğrenci bulunamadı.</div>`;
    return;
  }

  // Benzersiz flag türlerini grupla (bir öğrenci için en kötü flag önce)
  let html = filtered.map(r => {
    // Her flag türünden en kötü birini göster (max 4 rozet)
    let seen = new Set();
    let topFlags = r.flags.filter(f => { let k=f.type+'|'+f.examType; if(seen.has(k)) return false; seen.add(k); return true; })
                          .sort((a,b) => RISK_SEV_W[b.severity]-RISK_SEV_W[a.severity]).slice(0,4);
    let badgesHtml = topFlags.map(f => {
      let safeDetail = f.detail.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `<span class="risk-badge rb-${f.type}" title="${f.detail}" onclick="showToast('${safeDetail}', 'warning', 4000)" style="cursor:pointer;"><i class="fas ${typeIcon[f.type]}" style="font-size:0.8em;"></i>${typeLabel[f.type]}</span>`;
    }).join('');
    return `<div class="risk-card risk-${r.level}">
      <div class="risk-avatar"><i class="fas ${levelIcon[r.level]}"></i></div>
      <div class="risk-body">
        <div class="risk-name">${r.name}</div>
        <div class="risk-class"><i class="fas fa-school mr-1" style="font-size:0.75em;"></i>${r.cls} &nbsp;·&nbsp; ${r.examTypes.join(', ')}</div>
        <div class="risk-badges">${badgesHtml}</div>
      </div>
      <div class="risk-score-badge">
        <span>${r.score.toFixed(1)}</span>
        <small>risk puanı</small>
      </div>
    </div>`;
  }).join('');
  listEl.innerHTML = html;
}

// ---- setRiskLevel (orig lines 1342-1349) ----
function setRiskLevel(level) {
  let el = getEl('riskLevelFilter');
  if(!el) return;
  // Boş string = tümünü göster; aynı seviyeye tıklamak toggle yapar
  if(level === '') { el.value = ''; }
  else { el.value = (el.value === level) ? '' : level; }
  renderRiskPanel();
}

// ---- goToStudent (orig lines 1351-1356) ----
function goToStudent(no) {
  sAct(no, true);
  // Öğrenci sekmesine geç
  let navEl = getEl('nav-anasayfa');
  sTab('anasayfa', navEl);
}

// ---- calcBoxPlot (orig lines 1359-1381) ----
function calcBoxPlot(values) {
  // null/undefined önce filtrele, sonra sayıya çevir (Number(null)=0 tuzağından kaçın)
  let arr = (values||[]).filter(v => v !== null && v !== undefined).map(Number).filter(v => !isNaN(v)).sort((a,b) => a-b);
  if(arr.length === 0) return null;
  let n = arr.length;
  // Lineer interpolasyonlu quartile (numpy 'linear' yöntemi ile uyumlu)
  // Küçük n'de basit index kesme yerine interpolasyon kullan
  function quantile(sorted, p) {
    let idx = p * (sorted.length - 1);
    let lo = Math.floor(idx), hi = Math.ceil(idx), frac = idx - lo;
    if(lo === hi) return sorted[lo];
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  }
  let q1 = quantile(arr, 0.25);
  let median = quantile(arr, 0.5);
  let q3 = quantile(arr, 0.75);
  let iqr = q3 - q1;
  let whiskerLo = Math.max(arr[0], q1 - 1.5 * iqr);
  let whiskerHi = Math.min(arr[n-1], q3 + 1.5 * iqr);
  let outliers = arr.filter(v => v < whiskerLo || v > whiskerHi);
  let mean = arr.reduce((a,b)=>a+b,0)/n;
  return { min: arr[0], max: arr[n-1], q1, median, q3, mean, whiskerLo, whiskerHi, outliers, n };
}

// ---- mkBoxPlotSVG (orig lines 1388-1510) ----
function mkBoxPlotSVG(groups, studentVal, options) {
  options = options || {};
  let W = options.width || 520, H = options.height || 210;
  let marginLeft = 44, marginRight = 14, marginTop = 32, marginBottom = 44;
  let plotW = W - marginLeft - marginRight, plotH = H - marginTop - marginBottom;

  let stats = groups.map(g => ({ ...g, bp: calcBoxPlot(g.values) })).filter(g => g.bp);
  if(stats.length === 0) return '<div class="text-muted small text-center py-2">Kutu grafiği için yeterli veri yok.</div>';

  let allVals = stats.flatMap(g => g.bp ? [g.bp.min, g.bp.max, ...(g.bp.outliers||[])] : []);
  if(studentVal !== null && studentVal !== undefined) allVals.push(studentVal);
  let yMin = Math.min(...allVals), yMax = Math.max(...allVals);
  let pad = (yMax - yMin) * 0.15 || 3;
  yMin = yMin - pad; yMax = yMax + pad;

  let toY = v => marginTop + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // Arka plan bantları
  let bgBands = '';
  for(let i = 0; i < 5; i++) {
    let y1 = marginTop + (plotH / 5) * i;
    if(i % 2 === 1) bgBands += `<rect x="${marginLeft}" y="${y1.toFixed(1)}" width="${plotW}" height="${(plotH/5).toFixed(1)}" fill="rgba(0,0,0,0.018)"/>`;
  }

  // Grid + Y ekseni etiketleri
  let gridLines = '', gridLabels = '';
  let tickCount = 5;
  for(let i = 0; i <= tickCount; i++) {
    let v = yMin + (yMax - yMin) * (i / tickCount);
    let y = toY(v);
    gridLines += `<line x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${W - marginRight}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`;
    gridLabels += `<text x="${(marginLeft - 5).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="#8898aa">${v.toFixed(1)}</text>`;
  }

  // Kutular
  let boxWidth = Math.min(56, plotW / (stats.length * 2.0));
  let spacing = plotW / (stats.length + 1);
  let boxes = '';

  stats.forEach((g, i) => {
    let bp = g.bp;
    let cx = marginLeft + spacing * (i + 1);
    let color = g.color || '#0d6efd';
    let yQ1 = toY(bp.q1), yQ3 = toY(bp.q3), yMed = toY(bp.median);
    let yWLo = toY(bp.whiskerLo), yWHi = toY(bp.whiskerHi), yMean = toY(bp.mean);
    let bx = cx - boxWidth / 2;
    let boxH = Math.abs(yQ1 - yQ3);

    // Bıyık gövdesi
    boxes += `<line x1="${cx.toFixed(1)}" y1="${yQ3.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yWHi.toFixed(1)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,2" opacity="0.7"/>`;
    boxes += `<line x1="${cx.toFixed(1)}" y1="${yQ1.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yWLo.toFixed(1)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,2" opacity="0.7"/>`;
    // Bıyık uçları
    let capW = boxWidth * 0.35;
    boxes += `<line x1="${(cx-capW).toFixed(1)}" y1="${yWHi.toFixed(1)}" x2="${(cx+capW).toFixed(1)}" y2="${yWHi.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
    boxes += `<line x1="${(cx-capW).toFixed(1)}" y1="${yWLo.toFixed(1)}" x2="${(cx+capW).toFixed(1)}" y2="${yWLo.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;

    // IQR kutusu — dolgu + dışarı kenarlık
    boxes += `<rect x="${bx.toFixed(1)}" y="${Math.min(yQ1,yQ3).toFixed(1)}" width="${boxWidth.toFixed(1)}" height="${Math.max(boxH,2).toFixed(1)}" rx="3" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="2"/>`;

    // Medyan çizgisi
    boxes += `<line x1="${bx.toFixed(1)}" y1="${yMed.toFixed(1)}" x2="${(bx+boxWidth).toFixed(1)}" y2="${yMed.toFixed(1)}" stroke="#dc3545" stroke-width="2.5" stroke-linecap="round"/>`;

    // Ortalama nokta
    boxes += `<circle cx="${cx.toFixed(1)}" cy="${yMean.toFixed(1)}" r="4.5" fill="#fd7e14" stroke="#fff" stroke-width="1.5"/>`;

    // Aykırı değerler
    (bp.outliers||[]).forEach(ov => {
      boxes += `<circle cx="${cx.toFixed(1)}" cy="${toY(ov).toFixed(1)}" r="3" fill="none" stroke="#6f42c1" stroke-width="1.5"/>`;
    });

    // Öğrenci nokta (vurgulu)
    if(studentVal !== null && studentVal !== undefined && !isNaN(studentVal)) {
      let sy = toY(studentVal);
      boxes += `<circle cx="${cx.toFixed(1)}" cy="${sy.toFixed(1)}" r="7" fill="#dc3545" stroke="#fff" stroke-width="2" filter="url(#stuGlow)"/>`;
    }

    // X ekseni etiketi
    boxes += `<text x="${cx.toFixed(1)}" y="${(H - marginBottom + 15).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="#343a40">${g.label}</text>`;
    // Medyan değeri
    boxes += `<text x="${cx.toFixed(1)}" y="${(H - marginBottom + 27).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="#6c757d">Md:${bp.median.toFixed(1)}</text>`;
  });

  // Legend
  let lx = W - marginRight - 6;
  let hasStudent = studentVal !== null && studentVal !== undefined && !isNaN(studentVal);
  let legendItems = [];
  if(hasStudent) legendItems.push(`<circle cx="-10" cy="0" r="5" fill="#dc3545" stroke="#fff" stroke-width="1.5"/><text x="-2" y="4" font-size="9.5" fill="#555">Öğrenci</text>`);
  legendItems.push(`<line x1="-10" y1="0" x2="-2" y2="0" stroke="#dc3545" stroke-width="2.5" stroke-linecap="round"/><text x="-2" y="4" font-size="9.5" fill="#555">Medyan</text>`);
  legendItems.push(`<circle cx="-10" cy="0" r="4" fill="#fd7e14" stroke="#fff" stroke-width="1"/><text x="-2" y="4" font-size="9.5" fill="#555">Ort.</text>`);

  // Legend - sağdan sola yerleştir
  let legendParts = '';
  let lxCur = lx;
  // Ort.
  legendParts += `<circle cx="${(lxCur - 5).toFixed(1)}" cy="${(marginTop - 10).toFixed(1)}" r="4" fill="#fd7e14" stroke="#fff" stroke-width="1.5"/>`;
  legendParts += `<text x="${(lxCur + 1).toFixed(1)}" y="${(marginTop - 6).toFixed(1)}" font-size="9" fill="#6c757d">Ort.</text>`;
  lxCur -= 46;
  // Medyan
  legendParts += `<line x1="${(lxCur - 10).toFixed(1)}" y1="${(marginTop - 10).toFixed(1)}" x2="${(lxCur - 2).toFixed(1)}" y2="${(marginTop - 10).toFixed(1)}" stroke="#dc3545" stroke-width="2.5" stroke-linecap="round"/>`;
  legendParts += `<text x="${(lxCur + 1).toFixed(1)}" y="${(marginTop - 6).toFixed(1)}" font-size="9" fill="#6c757d">Medyan</text>`;
  lxCur -= 62;
  if(hasStudent) {
    legendParts += `<circle cx="${(lxCur - 5).toFixed(1)}" cy="${(marginTop - 10).toFixed(1)}" r="5" fill="#dc3545" stroke="#fff" stroke-width="1.5"/>`;
    legendParts += `<text x="${(lxCur + 2).toFixed(1)}" y="${(marginTop - 6).toFixed(1)}" font-size="9" fill="#6c757d">Öğrenci</text>`;
  }

  let titleText = options.title ? `<text x="${marginLeft}" y="${marginTop - 10}" font-size="10" font-weight="700" fill="#3a5a9a">${options.title}</text>` : '';

  return `<div class="boxplot-wrap"><svg class="boxplot-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="stuGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect x="${marginLeft}" y="${marginTop}" width="${plotW}" height="${plotH}" fill="#fafbff" rx="2"/>
    ${bgBands}
    ${titleText}${legendParts}
    <line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${(marginTop+plotH).toFixed(1)}" stroke="#ced4da" stroke-width="1.5"/>
    <line x1="${marginLeft}" y1="${(marginTop+plotH).toFixed(1)}" x2="${(W-marginRight).toFixed(1)}" y2="${(marginTop+plotH).toFixed(1)}" stroke="#ced4da" stroke-width="1.5"/>
    ${gridLines}${gridLabels}${boxes}
  </svg></div>`;
}

// ---- mkMultiClassBoxPlot (orig lines 1513-1529) ----
function mkMultiClassBoxPlot(classDataMap, highlightClass, options, allVals) {
  options = options || {};
  let entries = Object.entries(classDataMap).sort((a,b)=>a[0].localeCompare(b[0],'tr'));
  if(entries.length === 0) return '';
  // Sınıf renkleri çubuk grafikteki cols ile aynı (sıralı eşleşme)
  let groups = entries.map(([cls, vals], i) => ({
    label: cls,
    values: vals,
    color: highlightClass && cls === highlightClass ? '#dc3545' : cols[i % cols.length]
  }));
  // "Tümü" grubu: tüm bireylerin değerleri birleştirilir
  if(allVals && allVals.length >= 3) {
    groups.unshift({ label: 'Tümü', values: allVals, color: '#6c757d' });
  }
  let W = Math.max(560, groups.length * 90 + 80);
  return mkBoxPlotSVG(groups, null, { ...options, width: W });
}

// ---- calcKarneSummaryCards (orig lines 2232-2294) ----
function calcKarneSummaryCards(stuNo, examType, grade, examsData) {
  let attended = examsData.filter(e => !e.abs);
  if(!attended.length) return null;
  let stuAvg = attended.reduce((a,e)=>a+e.totalNet,0) / attended.length;

  let allSameGrade = DB.e.filter(x => x.examType===examType && !x.abs && getGrade(x.studentClass)===grade);
  let genAvg = allSameGrade.length ? allSameGrade.reduce((a,e)=>a+e.totalNet,0)/allSameGrade.length : null;

  let stuMap = {};
  allSameGrade.forEach(e => {
    if(!stuMap[e.studentNo]) stuMap[e.studentNo] = {scoreSum:0,netSum:0,cnt:0};
    stuMap[e.studentNo].scoreSum += (e.score||0);
    stuMap[e.studentNo].netSum  += (e.totalNet||0);
    stuMap[e.studentNo].cnt++;
  });
  // Sıralama her zaman PUAN'a (score) göre; eşitlikte totalNet
  let rankings = Object.entries(stuMap).map(([no,v])=>({no,avgScore:v.scoreSum/v.cnt,avgNet:v.netSum/v.cnt})).sort((a,b)=>{
    let dp=(b.avgScore||0)-(a.avgScore||0); if(dp!==0) return dp; return (b.avgNet||0)-(a.avgNet||0);
  });
  let rank = rankings.findIndex(x=>x.no===stuNo)+1;
  let totalStudents = rankings.length;

  // Sınıf Derecesi hesapla
  let stuClass = (DB.s.find(x=>x.no===stuNo)||{}).class || '';
  let allSameClass = DB.e.filter(x => x.examType===examType && !x.abs && x.studentClass===stuClass);
  let clsMap = {};
  allSameClass.forEach(e => {
    if(!clsMap[e.studentNo]) clsMap[e.studentNo] = {scoreSum:0,netSum:0,cnt:0};
    clsMap[e.studentNo].scoreSum += (e.score||0);
    clsMap[e.studentNo].netSum  += (e.totalNet||0);
    clsMap[e.studentNo].cnt++;
  });
  let clsRankings = Object.entries(clsMap).map(([no,v])=>({no,avgScore:v.scoreSum/v.cnt,avgNet:v.netSum/v.cnt})).sort((a,b)=>{
    let dp=(b.avgScore||0)-(a.avgScore||0); if(dp!==0) return dp; return (b.avgNet||0)-(a.avgNet||0);
  });
  let classRank = clsRankings.findIndex(x=>x.no===stuNo)+1;
  let classTotalStudents = clsRankings.length;

  // Katılım: öğrencinin sınıf seviyesinde o sınav türüne ait tüm unique sınavlar baz alınır
  let gradeExamKeys = new Set();
  DB.e.forEach(x => { if(x.examType===examType && getGrade(x.studentClass)===grade) gradeExamKeys.add(x.date+'||'+( x.publisher||'')); });
  let attendedKeys = new Set();
  DB.e.forEach(x => { if(x.studentNo===stuNo && x.examType===examType && !x.abs) attendedKeys.add(x.date+'||'+( x.publisher||'')); });
  let totalExamCount = gradeExamKeys.size;
  let attendedCount  = attendedKeys.size;
  let partRate = totalExamCount > 0 ? Math.max(0, Math.min(100, Math.round(attendedCount / totalExamCount * 100))) : 0;

  // Trend: katıldığı sınavların toplam net serisi üzerinden lineer regresyon
  let nets = attended.map(e=>e.totalNet);
  let trend = null;
  if(nets.length >= 2){
    let slope = linRegSlope(nets);
    let totalChange = slope * (nets.length - 1);
    trend = {
      totalChange, slope, count: nets.length,
      trendClass: slope>0?'trend-up':(slope<0?'trend-down':'trend-stable'),
      trendIcon:  slope>0?'fa-arrow-up':(slope<0?'fa-arrow-down':'fa-minus'),
      trendText:  slope>0?'Yükseliş':(slope<0?'Düşüş':'Sabit')
    };
  }

  return {stuAvg, genAvg, rank, totalStudents, classRank, classTotalStudents, partRate, attendedCount, totalExamCount, trend};
}

// ---- buildRiskInfoCards (orig lines 2297-2342) ----
function buildRiskInfoCards(stuNo, examType, stuClass) {
  let risks = (_riskCache && _riskCache.results) ? _riskCache.results : calcRiskScores();
  let stuRisk = risks.find(r => r.no === stuNo && r.examTypes.includes(examType));
  if(!stuRisk) return '';

  const levelLabel = { high:'Yüksek Risk', med:'Orta Risk', low:'Düşük Risk' };
  const levelColor = { high:'#dc3545', med:'#fd7e14', low:'#856404' };
  const levelBg    = { high:'linear-gradient(135deg,#fff0f0,#ffd6d8)', med:'linear-gradient(135deg,#fff8f0,#ffe5cc)', low:'linear-gradient(135deg,#fffdf0,#fff3cc)' };
  const levelBorder= { high:'#dc3545', med:'#fd7e14', low:'#ffc107' };
  const typeIcon   = { trend:'fa-chart-line', rank:'fa-sort-amount-up', subj:'fa-book', abs:'fa-calendar-times' };
  const typeLabel  = { trend:'Düşüş Trendi', rank:'Sıra Gerileme', subj:'Ders Düşüşü', abs:'Devamsızlık' };

  // Bu sınav türüne ait flagler
  let examFlags = stuRisk.flags.filter(f => f.examType === examType);
  if(!examFlags.length) return '';

  let badgesHtml = examFlags.map(f => {
    let safeDetail = f.detail.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<span class="risk-badge rb-${f.type}" title="${f.detail}" onclick="showToast('${safeDetail}', 'warning', 4000)" style="font-size:0.72rem;padding:2px 8px;border-radius:20px;display:inline-flex;align-items:center;gap:3px;font-weight:600;margin:2px;cursor:pointer;">
       <i class="fas ${typeIcon[f.type]}" style="font-size:0.75em;"></i>${typeLabel[f.type]}
     </span>`;
  }).join('');

  let col = levelColor[stuRisk.level];
  let bg  = levelBg[stuRisk.level];
  let brd = levelBorder[stuRisk.level];

  let cardInner = `<div style="border:1px solid ${brd};border-radius:8px;background:${bg};padding:10px 13px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
      <div>
        <span style="font-weight:700;font-size:0.9em;color:${col};">
          <i class="fas fa-exclamation-triangle mr-1"></i>${levelLabel[stuRisk.level]}
        </span>
        <span style="margin-left:8px;font-size:0.78em;color:#6c757d;">Risk Puanı: <strong style="color:${col};">${stuRisk.score.toFixed(1)}</strong></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:3px;">${badgesHtml}</div>
    </div>
  </div>`;

  return `<div class="row mb-2">
    <div class="col-12 mb-2">
      <div style="font-size:0.78em;font-weight:700;color:#6c757d;margin-bottom:4px;"><i class="fas fa-shield-alt mr-1"></i>Risk Analizi</div>
      ${cardInner}
    </div>
  </div>`;
}

// ---- buildKarneExamCards (orig lines 2344-2417) ----
function buildKarneExamCards(summary, examType) {
  if(!summary) return '';
  let {stuAvg, genAvg, rank, totalStudents, classRank, classTotalStudents, partRate, attendedCount, totalExamCount, trend} = summary;

  // Katılım kartı + trend bloğu oluştur
  let trendHtml = '';
  if(trend) {
    let tColor = trend.trendClass==='trend-up' ? '#28a745' : (trend.trendClass==='trend-down' ? '#dc3545' : '#6c757d');
    let tSign  = trend.totalChange > 0 ? '+' : '';
    let sSign  = trend.slope > 0 ? '+' : '';
    trendHtml = `<div class="trend-card mt-2 mb-1"><div class="row align-items-center text-center">
      <div class="col-6 col-md-3 mb-1">
        <span class="trend-indicator ${trend.trendClass}" style="font-size:0.8em;"><i class="fas ${trend.trendIcon} mr-1"></i>${trend.trendText}</span>
        <div class="small text-muted mt-1" style="font-size:0.75em;">Genel Trend</div>
      </div>
      <div class="col-6 col-md-3 border-left mb-1">
        <div style="font-size:1.1em;font-weight:bold;color:${tColor};">${tSign}${trend.totalChange.toFixed(2)}</div>
        <div class="small text-muted" style="font-size:0.75em;">Toplam Değişim (Regresyon)</div>
      </div>
      <div class="col-6 col-md-3 border-left mb-1">
        <div style="font-size:1.1em;font-weight:bold;color:${tColor};">${sSign}${trend.slope.toFixed(2)}</div>
        <div class="small text-muted" style="font-size:0.75em;">Sınav Başı Ort. Eğim</div>
      </div>
      <div class="col-6 col-md-3 border-left mb-1">
        <div style="font-size:1.1em;font-weight:bold;">${trend.count}</div>
        <div class="small text-muted" style="font-size:0.75em;">Toplam Sınav</div>
      </div>
    </div></div>`;
  }

  let cardsHtml = `<div class="row mb-2">
    <div class="col-md-3 col-sm-6">
      <div class="sec-card">
        <div class="sec-icon"><i class="fas fa-chart-bar"></i></div>
        <div class="sec-body">
          <div class="sec-label">Ortalama Net</div>
          <div class="sec-value">${stuAvg.toFixed(2)}</div>
          <div class="sec-sub">Genel Ort: ${genAvg!==null?genAvg.toFixed(2):'—'}</div>
        </div>
      </div>
    </div>
    <div class="col-md-3 col-sm-6">
      <div class="sec-card">
        <div class="sec-icon"><i class="fas fa-percentage"></i></div>
        <div class="sec-body">
          <div class="sec-label">Katılım</div>
          <div class="sec-value">${partRate}%</div>
          <div class="sec-sub">${attendedCount}/${totalExamCount} Sınav</div>
        </div>
      </div>
    </div>
    <div class="col-md-3 col-sm-6">
      <div class="sec-card">
        <div class="sec-icon"><i class="fas fa-users"></i></div>
        <div class="sec-body">
          <div class="sec-label">Sınıf Derece</div>
          <div class="sec-value">${classRank>0?classRank:'—'}</div>
          <div class="sec-sub">Toplam: ${classTotalStudents} Öğrenci</div>
        </div>
      </div>
    </div>
    <div class="col-md-3 col-sm-6">
      <div class="sec-card">
        <div class="sec-icon"><i class="fas fa-trophy"></i></div>
        <div class="sec-body">
          <div class="sec-label">Kurum Derece</div>
          <div class="sec-value">${rank>0?rank:'—'}</div>
          <div class="sec-sub">Toplam: ${totalStudents} Öğrenci</div>
        </div>
      </div>
    </div>
  </div>${trendHtml}`;
  return cardsHtml;
}

// ---- rH (orig lines 2419-2501) ----
function rH(){
  let s=DB.s.find(x=>x.no===aNo); if(!s)return; let r=getEl('homeArea');
  let combined=DB.e.filter(x=>x.studentNo===aNo).sort((a,b)=>srt(a.date,b.date));
  if(!combined.length){r.innerHTML='<div class="alert alert-default-info">Bu öğrenciye ait sınav verisi yok.</div>';return;}

  let grp={}; combined.forEach(e=>{(grp[e.examType]=grp[e.examType]||[]).push(e);});
  let typs=Object.keys(grp).sort(); function abbrevSub(name, shorten){ return shorten?name.substring(0,3):toTitleCase(name); }
  let stGrade = getGrade(s.class);

  let h=`<div class="d-flex justify-content-end mb-2 no-print"><button class="btn btn-success btn-sm mr-2" onclick="xXLMul('kCont','${s.name}_Karne')"><i class='fas fa-file-excel mr-1'></i>Excel</button><button class="btn-print no-print" onclick="xPR('kCont','${s.name}_Karne',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
  <div id="kCont" class="card shadow-sm" style="border-top:3px solid #0d6efd;">
    <div class="report-header">
      <span style="font-size:16px;"><i class="fas fa-user-graduate mr-2"></i><strong>${s.name}</strong> — Karne Özeti</span>
      <span style="font-size:13px;">Sınıf: ${s.class} | ${new Date().toLocaleDateString('tr-TR')}</span>
    </div>
    <div class="card-body" style="padding-top:5px;">`;

  let typsIdx = 0;
  typs.forEach(t=>{
    let el=grp[t].sort((a,b)=>srt(a.date,b.date)); let sb=Array.from(new Set(el.filter(e=>!e.abs).flatMap(e=>Object.keys(e.subs)))).sort();
    let totalCols=sb.length+5, shorten=totalCols>10;
    
    let summary = calcKarneSummaryCards(aNo, t, stGrade, el);
    let cardsHtml = buildKarneExamCards(summary, t);
    let riskCardsHtml = buildRiskInfoCards(aNo, t, s.class);
    let isFirstType = (typsIdx === 0); typsIdx++;
    let canvasId='cKarne_'+t.replace(/[^a-zA-Z0-9]/g,'_');
    let bpKarneId='bpKarne_'+t.replace(/[^a-zA-Z0-9]/g,'_');
    
    let _examCount = el.filter(e=>!e.abs).length;
    let _examColorIdx = (typeof examColorIdx === 'function') ? examColorIdx(t) : 0;
    let _examLabel = (typeof toExamLabel === 'function') ? toExamLabel(t) : t;
    h+=`<div class="karne-bolum exam-type-block exam-color-${_examColorIdx}${isFirstType?' exam-type-first':''}" data-stu-name="${s.name.replace(/"/g,'&quot;')}" data-stu-class="${s.class}"><h5 class="mt-3 mb-2 text-primary border-bottom pb-2"><span>${_examLabel} Sınavları</span><span class="etb-count no-print">${_examCount} Sınav</span></h5>${cardsHtml}${riskCardsHtml}<div id="${bpKarneId}"></div><div class="scroll-hint"><i class="fas fa-arrows-alt-h mr-1"></i>Tabloyu kaydırın</div><div class="scroll"><table class="table table-sm table-bordered table-striped" data-sh="${t}"><thead><tr><th>#</th><th>Tarih</th><th>Yayınevi</th>${sb.map(x=>`<th title="${toTitleCase(x)}">${abbrevSub(x,shorten)}</th>`).join('')}<th>Top.Net</th><th>Puan</th><th>Snf(S/K)</th><th>Okul(S/K)</th><th>İlçe(S/K)</th><th>İl(S/K)</th><th>Gen(S/K)</th></tr></thead><tbody>`;
    
    let kIdx = 1;
    el.forEach(e=>{
      let pub = e.publisher || '—', sNo = e.abs ? '—' : kIdx++;
      if(e.abs) h+=`<tr class="absent-row"><td>${sNo}</td><td>${e.date}</td><td>${toTitleCase(pub)}</td><td colspan="${sb.length+7}" class="text-center font-weight-bold">🔴 Katılmadı</td></tr>`;
      else h+=`<tr><td>${sNo}</td><td>${e.date}</td><td>${toTitleCase(pub)}</td>${sb.map(x=>`<td>${e.subs[x]!==undefined?e.subs[x].net.toFixed(2):'—'}</td>`).join('')}<td><strong>${e.totalNet.toFixed(2)}</strong></td><td>${e.score.toFixed(2)}</td><td>${e.cR||'—'}/${e.cP||'—'}</td><td>${e.iR||'—'}/${e.iP||'—'}</td><td>${e.dR||'—'}/${e.dP||'—'}</td><td>${e.pR||'—'}/${e.pP||'—'}</td><td>${e.gR||'—'}/${e.gP||'—'}</td></tr>`;
    });
    
    let attended = el.filter(e => !e.abs);
    if(attended.length > 0){
      let allGradeExams = DB.e.filter(x => x.examType === t && !x.abs && getGrade(x.studentClass) === stGrade);
      let allClassExams = DB.e.filter(x => x.examType === t && !x.abs && x.studentClass === s.class);
      let genAvgSubs = sb.map(x => { let v = allGradeExams.filter(e => e.subs[x] !== undefined).map(e => e.subs[x].net); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(2) : '—'; });
      let genAvgNet = allGradeExams.length > 0 ? (allGradeExams.reduce((a,e)=>a+e.totalNet,0)/allGradeExams.length).toFixed(2) : '—';
      let genAvgScore = allGradeExams.length > 0 ? (allGradeExams.reduce((a,e)=>a+e.score,0)/allGradeExams.length).toFixed(2) : '—';
      let clsAvgSubs = sb.map(x => { let v = allClassExams.filter(e => e.subs[x] !== undefined).map(e => e.subs[x].net); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(2) : '—'; });
      let clsAvgNet = allClassExams.length > 0 ? (allClassExams.reduce((a,e)=>a+e.totalNet,0)/allClassExams.length).toFixed(2) : '—';
      let clsAvgScore = allClassExams.length > 0 ? (allClassExams.reduce((a,e)=>a+e.score,0)/allClassExams.length).toFixed(2) : '—';
      let avgSubs = sb.map(x => { let v = attended.filter(e => e.subs[x] !== undefined).map(e => e.subs[x].net); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(2) : '—'; });
      let avgNet = (attended.reduce((a,e)=>a+e.totalNet,0)/attended.length).toFixed(2), avgScore = (attended.reduce((a,e)=>a+e.score,0)/attended.length).toFixed(2);
      
      h += `<tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">Öğrenci Ortalama</td>${avgSubs.map(v=>`<td>${v}</td>`).join('')}<td>${avgNet}</td><td>${avgScore}</td><td colspan="5">—</td></tr>`;
      h += `<tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">Sınıf Ortalama (${s.class})</td>${clsAvgSubs.map(v=>`<td>${v}</td>`).join('')}<td>${clsAvgNet}</td><td>${clsAvgScore}</td><td colspan="5">—</td></tr>`;
      h += `<tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">Kurum Ortalama (${stGrade}. Sınıflar)</td>${genAvgSubs.map(v=>`<td>${v}</td>`).join('')}<td>${genAvgNet}</td><td>${genAvgScore}</td><td colspan="5">—</td></tr>`;
    }

    h+=`</tbody></table></div><div class="chart-box avoid-break" style="margin:8px 0 10px 0; height:200px;"><div style="font-size:11px;font-weight:bold;color:#4a6fa5;margin-bottom:4px;text-align:left;">${t} — Toplam Net Gelişimi</div><canvas id="${canvasId}"></canvas></div></div>`;
  });

  h+=`</div></div>`;
  if(c.h){ c.h.destroy(); c.h=null; } if(window._karneCharts){window._karneCharts.forEach(ch=>{try{ch.destroy();}catch(e){}});} window._karneCharts=[];
  r.innerHTML=h; 
  
  setTimeout(()=>{
    typs.forEach(t=>{
      let canvasId='cKarne_'+t.replace(/[^a-zA-Z0-9]/g,'_'); let cv=getEl(canvasId); if(!cv)return;
      let exT=DB.e.filter(x=>x.studentNo===aNo&&x.examType===t).sort((a,b)=>srt(a.date,b.date));
      let chartLabels = exT.map(e => e.publisher ? `${e.date} (${toTitleCase(e.publisher)})` : e.date);
      let stuD=exT.map(e=>e.abs?null:e.totalNet);
      let clsD=exT.map(e=>{if(e.abs)return null;let v=DB.e.filter(x=>x.date===e.date&&x.examType===t&&x.studentClass===s.class&&!x.abs).map(x=>x.totalNet);return v.length?(v.reduce((a,b)=>a+b,0)/v.length):null;});
      let insD=exT.map(e=>{if(e.abs)return null;let v=DB.e.filter(x=>x.date===e.date&&x.examType===t&&!x.abs&&getGrade(x.studentClass)===stGrade).map(x=>x.totalNet);return v.length?(v.reduce((a,b)=>a+b,0)/v.length):null;});
      let ch=mkChart(canvasId,chartLabels,[{label:'Toplam Net',data:stuD,backgroundColor:cols[0]+'cc',borderColor:cols[0],borderWidth:1.5},{label:'Sınıf Ort.',data:clsD,backgroundColor:cols[2]+'99',borderColor:cols[2],borderWidth:1.5},{label:'Kurum Ort.',data:insD,backgroundColor:cols[3]+'99',borderColor:cols[3],borderWidth:1.5}]);
      window._karneCharts.push(ch);
      // Kutu grafiği — her sınav türü için ayrı ayrı
      let bpKarneId='bpKarne_'+t.replace(/[^a-zA-Z0-9]/g,'_');
      let bpKarneEl=getEl(bpKarneId);
      if(bpKarneEl){
        let bpHtml=buildStuBoxPlots(aNo, t, s.class, stGrade, 'totalNet');
        if(bpHtml) bpKarneEl.innerHTML=bpHtml;
      }
    });
  },150);
}

// ---- buildSubjectSparklines: Tek sınav modu — Ders Eğilimi mini-grafik paneli ----
// Her ders için, öğrencinin aynı sınav türündeki son 5 sınavının (seçili sınav dahil)
// neti üzerinden minik bir SVG çizgi grafiği üretir. Seçili sınavın noktası vurgulanır.
function buildSubjectSparklines(stuNo, examType, curExam, subjects){
  if(!subjects || !subjects.length) return '';
  // Öğrencinin bu sınav türündeki tüm sınavları (kronolojik sıra)
  let allEx = DB.e.filter(x => x.studentNo===stuNo && x.examType===examType && !x.abs).sort((a,b)=>srt(a.date,b.date));
  if(allEx.length < 2) return '';
  // Seçili sınavın indeksi
  let curIdx = allEx.findIndex(e => e.date===curExam.date && (e.publisher||'')===(curExam.publisher||''));
  if(curIdx < 0) return '';
  // Son 5 (seçili dahil) — yeterli geçmiş yoksa baştan al
  let startIdx = Math.max(0, curIdx - 4);
  let window = allEx.slice(startIdx, curIdx + 1);
  if(window.length < 2) return '';

  let cards = subjects.map(s => {
    let series = window.map(e => (e.subs && e.subs[s] && e.subs[s].net !== undefined && e.subs[s].net !== null) ? e.subs[s].net : null);
    let valid = series.filter(v => v !== null);
    if(valid.length < 2) return ''; // tek noktalı eğilim çizgisi anlamsız
    let curVal = series[series.length - 1];
    let prevVal = null;
    for(let i = series.length - 2; i >= 0; i--) { if(series[i] !== null) { prevVal = series[i]; break; } }
    let delta = (curVal !== null && prevVal !== null) ? (curVal - prevVal) : null;
    let dCls = delta === null ? 'sec-neutral' : (delta > 0 ? 'sec-pos' : (delta < 0 ? 'sec-neg' : 'sec-neutral'));
    let dIcon = delta === null ? 'fa-minus' : (delta > 0 ? 'fa-arrow-up' : (delta < 0 ? 'fa-arrow-down' : 'fa-minus'));
    let dColor = delta === null ? '#6c757d' : (delta > 0 ? '#198754' : (delta < 0 ? '#dc3545' : '#6c757d'));
    let dStr = delta === null ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(2);

    // SVG sparkline
    let W = 140, H = 38, padX = 4, padY = 5;
    let mn = Math.min(...valid), mx = Math.max(...valid);
    if(mn === mx) { mn -= 1; mx += 1; }
    let n = series.length;
    let xStep = (W - padX*2) / Math.max(1, n - 1);
    let toY = v => padY + (H - padY*2) * (1 - (v - mn) / (mx - mn));

    // Çizgi yolu (null değerleri atla, parça parça çiz)
    let pathParts = [];
    let cur = '';
    series.forEach((v, i) => {
      if(v === null) { if(cur) { pathParts.push(cur); cur = ''; } return; }
      let x = padX + i * xStep, y = toY(v);
      cur += (cur ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    });
    if(cur) pathParts.push(cur);
    let pathSvg = pathParts.map(p => `<path d="${p}" fill="none" stroke="${dColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`).join('');

    // Noktalar — son nokta vurgulu
    let dots = series.map((v, i) => {
      if(v === null) return '';
      let x = padX + i * xStep, y = toY(v);
      let isLast = (i === series.length - 1);
      return isLast
        ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${dColor}" stroke="#fff" stroke-width="1.4"/>`
        : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#fff" stroke="${dColor}" stroke-width="1.2"/>`;
    }).join('');

    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:38px;display:block;">${pathSvg}${dots}</svg>`;

    return `<div class="col-md-3 col-sm-6 mb-2"><div class="sec-card ${dCls}" style="min-height:auto;padding:8px 10px;">
      <div class="sec-body" style="width:100%;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <span class="sec-label" style="font-size:0.7rem;">${toTitleCase(s)}</span>
          <span style="font-size:0.72rem;font-weight:700;color:${dColor};"><i class="fas ${dIcon} mr-1" style="font-size:0.85em;"></i>${dStr}</span>
        </div>
        <div style="margin-top:3px;">${svg}</div>
        <div style="font-size:0.68rem;color:#6c757d;margin-top:2px;">Son ${window.length} sınav · Şu an: ${curVal===null?'—':curVal.toFixed(2)}</div>
      </div>
    </div></div>`;
  }).filter(x => x).join('');

  if(!cards) return '';
  return `<div class="single-exam-chart-title" style="margin-top:14px;"><i class="fas fa-chart-line"></i>Ders Eğilimi <span style="font-weight:400;color:#6c757d;font-size:0.85em;">— son ${window.length} sınav</span></div>
    <div class="row single-exam-cards">${cards}</div>`;
}

// ---- buildSingleExamCards: Tek sınav modu için 4 özet kart ----
// (1) Puan & Sıra  (2) Önceki Sınava Fark  (3) En Başarılı Ders  (4) En Zayıf Ders
// Karşılaştırma: ders bazında öğrenci neti hem Sınıf hem Kurum ortalamasıyla kıyaslanır.
function buildSingleExamCards(stu, examType, curExam, prevExam, stGrade){
  // Card 1: Puan & Sıra
  let scoreTxt = (curExam.score!==undefined && curExam.score!==null) ? curExam.score.toFixed(2) : '—';
  let netTxt   = (curExam.totalNet!==undefined && curExam.totalNet!==null) ? curExam.totalNet.toFixed(2) : '—';
  let rankBits = [];
  if(curExam.cR) rankBits.push(`Sınıf ${curExam.cR}/${curExam.cP||'—'}`);
  if(curExam.iR) rankBits.push(`Okul ${curExam.iR}/${curExam.iP||'—'}`);
  if(curExam.gR) rankBits.push(`Genel ${curExam.gR}/${curExam.gP||'—'}`);
  let card1 = `<div class="col-md-3 col-sm-6"><div class="sec-card">
    <div class="sec-icon"><i class="fas fa-star"></i></div>
    <div class="sec-body">
      <div class="sec-label">Puan &amp; Sıra</div>
      <div class="sec-value">${scoreTxt}</div>
      <div class="sec-sub">Net: ${netTxt}${rankBits.length?' · '+rankBits.join(' · '):''}</div>
    </div></div></div>`;

  // Card 2: Önceki Sınava Fark
  let card2;
  if(prevExam){
    let dN = curExam.totalNet - prevExam.totalNet;
    let dS = (curExam.score||0) - (prevExam.score||0);
    let cls = dN > 0 ? 'sec-pos' : (dN < 0 ? 'sec-neg' : 'sec-neutral');
    let icon = dN > 0 ? 'fa-arrow-up' : (dN < 0 ? 'fa-arrow-down' : 'fa-minus');
    let sign = dN > 0 ? '+' : '';
    let signS = dS > 0 ? '+' : '';
    let _pubP = prevExam.publisher ? ` (${toTitleCase(prevExam.publisher)})` : '';
    card2 = `<div class="col-md-3 col-sm-6"><div class="sec-card ${cls}">
      <div class="sec-icon"><i class="fas ${icon}"></i></div>
      <div class="sec-body">
        <div class="sec-label">Önceki Sınava Fark</div>
        <div class="sec-value">${sign}${dN.toFixed(2)} <small style="font-size:0.62em;font-weight:600;color:#6c757d;">net</small></div>
        <div class="sec-sub">Puan: ${signS}${dS.toFixed(2)} · ${prevExam.date}${_pubP}</div>
      </div></div></div>`;
  } else {
    card2 = `<div class="col-md-3 col-sm-6"><div class="sec-card sec-neutral">
      <div class="sec-icon"><i class="fas fa-minus"></i></div>
      <div class="sec-body">
        <div class="sec-label">Önceki Sınava Fark</div>
        <div class="sec-value">—</div>
        <div class="sec-sub">Önceki sınav verisi yok</div>
      </div></div></div>`;
  }

  // Cards 3 & 4: En Başarılı / En Zayıf Ders
  let subjects = Object.keys(curExam.subs || {});
  let perSubj = subjects.map(s => {
    let sn = curExam.subs[s];
    if(!sn || sn.net === null || sn.net === undefined) return null;
    let net = sn.net;
    let cv = DB.e.filter(x => x.date===curExam.date && (x.publisher||'')===(curExam.publisher||'') && x.examType===examType && x.studentClass===stu.class && !x.abs && x.subs[s]!==undefined).map(x => x.subs[s].net);
    let iv = DB.e.filter(x => x.date===curExam.date && (x.publisher||'')===(curExam.publisher||'') && x.examType===examType && getGrade(x.studentClass)===stGrade && !x.abs && x.subs[s]!==undefined).map(x => x.subs[s].net);
    let clsA = cv.length ? cv.reduce((a,b)=>a+b,0)/cv.length : null;
    let insA = iv.length ? iv.reduce((a,b)=>a+b,0)/iv.length : null;
    let dC = clsA!==null ? net - clsA : null;
    let dI = insA!==null ? net - insA : null;
    let combined = (dC!==null && dI!==null) ? (dC+dI)/2 : (dC!==null ? dC : dI);
    return combined === null ? null : { name: s, net, clsA, insA, dC, dI, combined };
  }).filter(x => x);

  let card3, card4;
  if(perSubj.length){
    let sorted = [...perSubj].sort((a,b)=> b.combined - a.combined);
    let best = sorted[0], worst = sorted[sorted.length-1];
    let mkSubCard = (it, isBest) => {
      let cls = isBest ? 'sec-pos' : 'sec-neg';
      let icon = isBest ? 'fa-trophy' : 'fa-exclamation-triangle';
      let label = isBest ? 'En Başarılı Ders' : 'En Zayıf Ders';
      let dCstr = it.dC===null ? '—' : (it.dC>0?'+':'')+it.dC.toFixed(2);
      let dIstr = it.dI===null ? '—' : (it.dI>0?'+':'')+it.dI.toFixed(2);
      return `<div class="col-md-3 col-sm-6"><div class="sec-card ${cls}">
        <div class="sec-icon"><i class="fas ${icon}"></i></div>
        <div class="sec-body">
          <div class="sec-label">${label}</div>
          <div class="sec-value">${toTitleCase(it.name)}</div>
          <div class="sec-sub">Net: ${it.net.toFixed(2)} · Sınıf ${dCstr} · Kurum ${dIstr}</div>
        </div></div></div>`;
    };
    card3 = mkSubCard(best, true);
    card4 = (worst === best) ? '' : mkSubCard(worst, false);
  } else {
    let neutral = (lbl,icon) => `<div class="col-md-3 col-sm-6"><div class="sec-card sec-neutral">
      <div class="sec-icon"><i class="fas ${icon}"></i></div>
      <div class="sec-body">
        <div class="sec-label">${lbl}</div>
        <div class="sec-value">—</div>
        <div class="sec-sub">Karşılaştırma verisi yok</div>
      </div></div></div>`;
    card3 = neutral('En Başarılı Ders','fa-trophy');
    card4 = neutral('En Zayıf Ders','fa-exclamation-triangle');
  }
  return `<div class="row">${card1}${card2}${card3}${card4}</div>`;
}

// ---- buildStuBoxPlots (orig lines 2503-2550) ----
function buildStuBoxPlots(stuNo, examType, stuClass, stuGrade, sb) {
  // 1. SİSTEMDE O SINAV TÜRÜNDEN TOPLAM KAÇ TANE YAPILDIĞINI BUL
  let totalExamsOfType = new Set(Object.values(EXAM_META).filter(m => m.examType === examType).map(m => m.date)).size;
  
  // 2. 10'DAN AZ SINAV VARSA KUTU GRAFİĞİNİ HİÇ OLUŞTURMA
  if(totalExamsOfType < 10) return '';

  // Öğrencinin kendi değeri (tüm sınavlardaki net ortalaması)
  let getVal = (e) => {
    if(e.abs) return null;
    if(sb === 'score') return e.score;
    if(sb === 'totalNet' || !sb) return e.totalNet;
    let _sn = e.subs[toTitleCase(sb.replace('s_',''))];
    return (_sn !== undefined && _sn !== null) ? _sn.net : null;
  };

  let stuExams = DB.e.filter(x => x.studentNo === stuNo && x.examType === examType && !x.abs);
  let stuVals = stuExams.map(getVal).filter(v => v !== null);
  if(stuVals.length === 10) return '';
  let stuAvg = stuVals.reduce((a,b)=>a+b,0) / stuVals.length;

  // Sınıf içindeki tüm öğrencilerin ortalamaları
  let clsStudentAvgs = {};
  DB.e.filter(x => x.examType === examType && !x.abs && x.studentClass === stuClass).forEach(e => {
    let v = getVal(e); if(v === null) return;
    if(!clsStudentAvgs[e.studentNo]) clsStudentAvgs[e.studentNo] = [];
    clsStudentAvgs[e.studentNo].push(v);
  });
  let clsAvgArr = Object.values(clsStudentAvgs).map(arr => arr.reduce((a,b)=>a+b,0)/arr.length);

  // Okul (aynı sınıf seviyesi) içindeki tüm öğrencilerin ortalamaları
  let insStudentAvgs = {};
  DB.e.filter(x => x.examType === examType && !x.abs && getGrade(x.studentClass) === stuGrade).forEach(e => {
    let v = getVal(e); if(v === null) return;
    if(!insStudentAvgs[e.studentNo]) insStudentAvgs[e.studentNo] = [];
    insStudentAvgs[e.studentNo].push(v);
  });
  let insAvgArr = Object.values(insStudentAvgs).map(arr => arr.reduce((a,b)=>a+b,0)/arr.length);

  if(clsAvgArr.length < 3 && insAvgArr.length < 3) return '';

  let label = sb === 'score' ? 'Puan' : (sb === 'totalNet' || !sb ? 'Toplam Net' : toTitleCase(sb.replace('s_','')) + ' Neti');

  let clsBP = clsAvgArr.length >= 3 ? mkBoxPlotSVG([{label: stuClass, values: clsAvgArr, color:'#28a745'}], stuAvg, {title: `Sınıf İçi Dağılım — ${label}`, height: 195}) : '';
  let insBP = insAvgArr.length >= 3 ? mkBoxPlotSVG([{label: stuGrade+'. Sınıf', values: insAvgArr, color:'#0d6efd'}], stuAvg, {title: `Okul İçi Dağılım — ${label}`, height: 195}) : '';

  if(!clsBP && !insBP) return '';

  let cols2 = (clsBP && insBP) ? 'col-md-6' : 'col-12';
  return `<div class="row mt-2 avoid-break" style="page-break-inside:avoid;">
    ${clsBP ? `<div class="${cols2}"><div class="boxplot-card"><div class="boxplot-title"><i class="fas fa-chart-bar mr-1" style="color:#28a745;"></i>Sınıf İçi Dağılım <span style="font-weight:400;color:#6c757d;font-size:0.85em;">— kırmızı = bu öğrenci</span></div>${clsBP}</div></div>` : ''}
    ${insBP ? `<div class="${cols2}"><div class="boxplot-card"><div class="boxplot-title"><i class="fas fa-chart-bar mr-1" style="color:#0d6efd;"></i>Okul İçi Dağılım <span style="font-weight:400;color:#6c757d;font-size:0.85em;">— kırmızı = bu öğrenci</span></div>${insBP}</div></div>` : ''}
  </div>`;
}

// ---- rAnl (orig lines 2552-3492) ----
function rAnl(){
  let aT=getEl('aType').value,eT=getEl('aEx').value, sb=getEl('aSub')?getEl('aSub').value:'', r=getEl('anlRes');
  if(aT === 'risk') return; // Risk analizi renderRiskPanel tarafından yönetilir
  if(c.a){ c.a.destroy(); c.a=null; } clearTimeout(chartTimer); 
  if(!eT){r.innerHTML='<div class="alert alert-default-info">Sınav verisi yok.</div>';return;}
  // (placeholder kept; user must explicitly choose data type)
  if(aT==='examdetail' && !sb) { return; }

  if(aT==='student'){
    let no=aNo;if(!no){r.innerHTML='';return;}
    let ex=DB.e.filter(x=>x.studentNo===no&&x.examType===eT&&!x.abs).sort((a,b)=>srt(a.date,b.date)), st=DB.s.find(x=>x.no===no); if(!st){r.innerHTML='';return;}
    let stGrade=getGrade(st.class);

    // === TEK SINAV MODU ===
    // aExDate dropdown'unda bir sınav seçilmişse (formatı "date||publisher"),
    // tüm-sınavlar görünümü yerine yalnızca o sınavın özet kart seti gösterilir.
    let _aExDateRaw = (getEl('aExDate')||{}).value || '';
    if(_aExDateRaw){
      let [_seDate, _sePub=''] = _aExDateRaw.split('||');
      let curExam = ex.find(e => e.date === _seDate && (e.publisher||'') === _sePub);
      if(!curExam){
        r.innerHTML = `<div class="alert alert-warning"><i class="fas fa-info-circle mr-2"></i>Seçilen sınav için bu öğrencinin verisi bulunamadı.</div>`;
        return;
      }
      let curIdx = ex.indexOf(curExam);
      let prevExam = curIdx > 0 ? ex[curIdx-1] : null;

      let cardsHtml = buildSingleExamCards(st, eT, curExam, prevExam, stGrade);
      let riskHtml  = buildRiskInfoCards(no, eT, st.class);

      // Ders bazlı çubuk grafik verisi
      let subjects = Object.keys(curExam.subs || {}).sort();
      let stuVals = subjects.map(s => (curExam.subs[s] && curExam.subs[s].net !== undefined) ? curExam.subs[s].net : null);
      let clsVals = subjects.map(s => {
        let v = DB.e.filter(x => x.date===_seDate && (x.publisher||'')===_sePub && x.examType===eT && x.studentClass===st.class && !x.abs && x.subs[s]!==undefined).map(x => x.subs[s].net);
        return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
      });
      let insVals = subjects.map(s => {
        let v = DB.e.filter(x => x.date===_seDate && (x.publisher||'')===_sePub && x.examType===eT && getGrade(x.studentClass)===stGrade && !x.abs && x.subs[s]!==undefined).map(x => x.subs[s].net);
        return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
      });

      // Detay tablosu
      let rowsSE = subjects.map((s,i) => {
        let sn = curExam.subs[s];
        let net = sn ? sn.net : null;
        let dog = sn && sn.dogru !== undefined ? sn.dogru : '—';
        let yan = sn && sn.yanlis !== undefined ? sn.yanlis : '—';
        let clsA = clsVals[i], insA = insVals[i];
        let dCls = (net !== null && clsA !== null) ? (net - clsA) : null;
        let dIns = (net !== null && insA !== null) ? (net - insA) : null;
        let fmt = v => v === null ? '—' : (v>0?'+':'') + v.toFixed(2);
        let cls = v => v === null ? '' : (v > 0 ? 'text-success' : (v < 0 ? 'text-danger' : ''));
        return `<tr><td>${i+1}</td><td>${toTitleCase(s)}</td><td>${dog}</td><td>${yan}</td><td><strong>${net===null?'—':net.toFixed(2)}</strong></td><td>${clsA===null?'—':clsA.toFixed(2)}</td><td class="${cls(dCls)} font-weight-bold">${fmt(dCls)}</td><td>${insA===null?'—':insA.toFixed(2)}</td><td class="${cls(dIns)} font-weight-bold">${fmt(dIns)}</td></tr>`;
      }).join('');

      let _pubLbl  = curExam.publisher ? ` (${toTitleCase(curExam.publisher)})` : '';
      let _exLabel = (typeof toExamLabel==='function') ? toExamLabel(eT) : eT;
      let h = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pS','Ogrenci_Tek_Sinav',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
      <div id="pS" class="card shadow-sm">
        <div class="report-header">
          <span style="font-size:16px;"><i class="fas fa-file-alt mr-2"></i><strong>${st.name}</strong> — ${_exLabel} (${curExam.date}${_pubLbl})</span>
          <span style="font-size:13px;">Sınıf: ${st.class}</span>
        </div>
        <div class="card-body" style="padding-top:8px;">
          <div class="single-exam-cards">${cardsHtml}</div>
          ${riskHtml}
          <div class="single-exam-chart-title"><i class="fas fa-chart-bar"></i>Ders Bazlı Net Karşılaştırması</div>
          <div class="chart-box avoid-break" style="height:280px;"><canvas id="cA"></canvas></div>
          ${buildSubjectSparklines(no, eT, curExam, subjects)}
          <div class="table-responsive mt-3"><table class="table table-sm table-hover table-bordered" id="tS"><thead><tr><th>#</th><th>Ders</th><th>D</th><th>Y</th><th>Net</th><th>Sınıf Ort.</th><th>Sınıf Fark</th><th>Kurum Ort.</th><th>Kurum Fark</th></tr></thead><tbody>${rowsSE}</tbody></table></div>
        </div>
      </div>`;
      r.innerHTML = h;
      chartTimer = setTimeout(() => {
        c.a = mkChart('cA', subjects.map(toTitleCase), [
          {label:'Öğrenci',    data: stuVals, backgroundColor: cols[0]+'cc', borderColor: cols[0], borderWidth: 1.5},
          {label:'Sınıf Ort.', data: clsVals, backgroundColor: cols[2]+'99', borderColor: cols[2], borderWidth: 1.5},
          {label:'Kurum Ort.', data: insVals, backgroundColor: cols[3]+'99', borderColor: cols[3], borderWidth: 1.5}
        ], false);
      }, 100);
      return;
    }
    // === TÜM SINAVLAR MODU (mevcut görünüm + risk/karne kartları) ===
    let dD=[],clsArr=[],instArr=[],rows='';
    
    let isRank = sb.startsWith('rank_');
    let ls = sb === 'score' ? 'Puan' : (sb === 'rank_c' ? 'Sınıf Sırası' : (sb === 'rank_i' ? 'Kurum Sırası' : (sb === 'rank_g' ? 'Genel Sıra' : (sb === 'totalNet' || !sb ? 'Toplam Net' : toTitleCase(sb.replace('s_','')) + ' Neti'))));
    let valHeader = isRank ? 'Sıra' : (sb === 'score' ? 'Puan' : 'Net');
    // Ders neti yoksa null döndür (0 değil) — eksik kayıtlar trend/ortalama hesabını bozmasın
    let getVal = (e) => { if (e.abs) return null; if (sb === 'score') return e.score; if (sb === 'rank_c') return pN(e.cR); if (sb === 'rank_i') return pN(e.iR); if (sb === 'rank_g') return pN(e.gR); if (sb === 'totalNet' || !sb) return e.totalNet; let _sn = e.subs[toTitleCase(sb.replace('s_',''))]; return (_sn !== undefined && _sn !== null) ? _sn.net : null; };

    ex.forEach((e,i)=>{
      let n=getVal(e), pn=i>0 ? getVal(ex[i-1]) : n; let dfStr = '', cl = '';
      if(i > 0) {
        if(n === null || pn === null) { dfStr = '—'; }
        else if(isRank) { let df = pn - n; cl = df > 0 ? 'text-success' : (df < 0 ? 'text-danger' : ''); dfStr = df > 0 ? '+' + df : df; }
        else { let df = (n - pn).toFixed(2); cl = parseFloat(df) > 0 ? 'text-success' : (parseFloat(df) < 0 ? 'text-danger' : ''); dfStr = parseFloat(df) > 0 ? '+' + df : df; }
      } else { dfStr = '-'; }
      let pub = e.publisher || '—';
      let nDisplay = n === null ? '—' : (isRank ? n : n.toFixed(2));
      rows+=`<tr><td>${i+1}</td><td>${e.date}</td><td>${toTitleCase(pub)}</td><td>${nDisplay}</td><td class="${cl} font-weight-bold">${dfStr}</td></tr>`; dD.push(n);
      if(!isRank){
        let cn=DB.e.filter(x=>x.date===e.date&&x.examType===eT&&x.studentClass===st.class&&!x.abs).map(getVal).filter(v=>v!==null);
        clsArr.push(cn.length?(cn.reduce((a,b)=>a+b,0)/cn.length):null);
        let iv=DB.e.filter(x=>x.date===e.date&&x.examType===eT&&!x.abs&&getGrade(x.studentClass)===stGrade).map(getVal).filter(v=>v!==null);
        instArr.push(iv.length?(iv.reduce((a,b)=>a+b,0)/iv.length):null);
      }
    });

    // null olmayan geçerli değerler üzerinden tüm hesaplar yapılır
    let dDValid = dD.filter(v => v !== null && !isNaN(v));

    let avgRowHtml = '';
    if(dDValid.length > 0){ 
      let stuAvg = dDValid.reduce((a,b)=>a+b,0) / dDValid.length;
      let clsAvg = clsArr.filter(x=>x!==null).length > 0 ? clsArr.filter(x=>x!==null).reduce((a,b)=>a+b,0) / clsArr.filter(x=>x!==null).length : null;
      let genAvg = instArr.filter(x=>x!==null).length > 0 ? instArr.filter(x=>x!==null).reduce((a,b)=>a+b,0) / instArr.filter(x=>x!==null).length : null;
      let displayStu = isRank ? Math.round(stuAvg) : stuAvg.toFixed(2);
      let displayCls = clsAvg !== null ? (isRank ? Math.round(clsAvg) : clsAvg.toFixed(2)) : '—';
      let displayGen = genAvg !== null ? (isRank ? Math.round(genAvg) : genAvg.toFixed(2)) : '—';
      avgRowHtml = `<tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">Öğrenci Ortalama</td><td>${displayStu}</td><td>—</td></tr><tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">Sınıf Ortalama (${st.class})</td><td>${displayCls}</td><td>—</td></tr><tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">Kurum Ortalama (${stGrade}. Sınıflar)</td><td>${displayGen}</td><td>—</td></tr>`;
    }

    let trendHtml = '';
    let _trendNets = dDValid; // zaten null ve NaN filtrelenmiş
    if(_trendNets.length >= 2) {
      let slope = linRegSlope(_trendNets);
      let totalChange = slope * (_trendNets.length - 1);
      let avgChange = slope;
      let improving = isRank ? (slope < 0) : (slope > 0);
      let worsening = isRank ? (slope > 0) : (slope < 0);
      let trendClass = improving ? 'trend-up' : (worsening ? 'trend-down' : 'trend-stable');
      let trendIcon  = improving ? 'fa-arrow-up' : (worsening ? 'fa-arrow-down' : 'fa-minus');
      let trendText  = improving ? (isRank ? 'Sıra Yükseliyor' : 'Yükseliş')
                                 : (worsening ? (isRank ? 'Sıra Düşüyor' : 'Düşüş') : 'Sabit');
      let posColor = '#28a745', negColor = '#dc3545';
      let totalColor = improving ? posColor : (worsening ? negColor : '#6c757d');
      let avgColor   = improving ? posColor : (worsening ? negColor : '#6c757d');
      let totalDisplay = (isRank ? Math.round(totalChange) : totalChange.toFixed(2));
      let avgDisplay   = avgChange.toFixed(2);
      let totalSign = totalChange > 0 ? '+' : '';
      let avgSign   = avgChange > 0 ? '+' : '';
      let totalLabel = isRank ? 'Sıra Değişimi (Regresyon)' : 'Toplam Değişim (Regresyon)';
      let avgLabel   = isRank ? 'Sınav Başı Sıra Eğimi' : 'Sınav Başı Ort. Eğim';
      trendHtml = `<div class="trend-card mb-3"><div class="row align-items-center"><div class="col-md-3 text-center"><span class="trend-indicator ${trendClass}"><i class="fas ${trendIcon} mr-1"></i>${trendText}</span><div class="mt-2 small text-muted">Genel Trend</div></div><div class="col-md-3 text-center border-left"><div style="font-size:1.5em; font-weight:bold; color:${totalColor};">${totalSign}${totalDisplay}</div><div class="small text-muted">${totalLabel}</div></div><div class="col-md-3 text-center border-left"><div style="font-size:1.5em; font-weight:bold; color:${avgColor};">${avgSign}${avgDisplay}</div><div class="small text-muted">${avgLabel}</div></div><div class="col-md-3 text-center border-left"><div style="font-size:1.5em; font-weight:bold;">${_trendNets.length}</div><div class="small text-muted">Toplam Sınav</div></div></div></div>`;
    }
    
    // Risk kartı + Sınıf/Kurum Derece kartları (Öğrenci Sayfası karne ile parite)
    // Yalnızca toplam net veya puan üzerinden çalışan görünümlerde anlamlıdır.
    let karneCardsHtml = '';
    let stuRiskHtml = '';
    if(!isRank && (sb === '' || sb === 'totalNet' || sb === 'score')) {
      try {
        let _summary = calcKarneSummaryCards(no, eT, stGrade, ex);
        if(_summary) {
          // İki ek kart: Sınıf Derecesi + Kurum Derecesi
          let {classRank, classTotalStudents, rank, totalStudents} = _summary;
          karneCardsHtml = `<div class="row mb-2">
            <div class="col-md-6 col-sm-6">
              <div class="sec-card">
                <div class="sec-icon"><i class="fas fa-users"></i></div>
                <div class="sec-body">
                  <div class="sec-label">Sınıf Derece (Genel)</div>
                  <div class="sec-value">${classRank>0?classRank:'—'}</div>
                  <div class="sec-sub">Toplam: ${classTotalStudents} Öğrenci</div>
                </div>
              </div>
            </div>
            <div class="col-md-6 col-sm-6">
              <div class="sec-card">
                <div class="sec-icon"><i class="fas fa-trophy"></i></div>
                <div class="sec-body">
                  <div class="sec-label">Kurum Derece (Genel)</div>
                  <div class="sec-value">${rank>0?rank:'—'}</div>
                  <div class="sec-sub">Toplam: ${totalStudents} Öğrenci</div>
                </div>
              </div>
            </div>
          </div>`;
        }
      } catch(e){}
      try { stuRiskHtml = buildRiskInfoCards(no, eT, st.class) || ''; } catch(e){ stuRiskHtml = ''; }
    }

    let perfHtml = '';
    if(!isRank && dDValid.length > 0) {
      let maxVal = Math.max(...dDValid), minVal = Math.min(...dDValid), avgVal = dDValid.reduce((a,b)=>a+b,0)/dDValid.length;
      // Katılım: öğrencinin sınıf seviyesinde düzenlenen aynı sınav türüne ait TÜM sınavlar baz alınır
      let gradeExamKeys = new Set();
      DB.e.forEach(x => { if(x.examType===eT && getGrade(x.studentClass)===stGrade) gradeExamKeys.add(x.date+'||'+(x.publisher||'')); });
      let totalGradeExams = gradeExamKeys.size;
      let attendedKeys = new Set();
      DB.e.forEach(x => { if(x.studentNo===no && x.examType===eT && !x.abs) attendedKeys.add(x.date+'||'+(x.publisher||'')); });
      let attendedCnt = attendedKeys.size;
      let partRate = totalGradeExams > 0 ? Math.max(0, Math.min(100, Math.round(attendedCnt / totalGradeExams * 100))) : 0;
      perfHtml = `<div class="row mt-3 mb-2">
        <div class="col-md-3 col-sm-6"><div class="sec-card sec-pos"><div class="sec-icon"><i class="fas fa-chart-line"></i></div><div class="sec-body"><div class="sec-label">En Yüksek</div><div class="sec-value">${maxVal.toFixed(2)}</div></div></div></div>
        <div class="col-md-3 col-sm-6"><div class="sec-card sec-neg"><div class="sec-icon"><i class="fas fa-arrow-down"></i></div><div class="sec-body"><div class="sec-label">En Düşük</div><div class="sec-value">${minVal.toFixed(2)}</div></div></div></div>
        <div class="col-md-3 col-sm-6"><div class="sec-card"><div class="sec-icon"><i class="fas fa-balance-scale"></i></div><div class="sec-body"><div class="sec-label">Ortalama</div><div class="sec-value">${avgVal.toFixed(2)}</div></div></div></div>
        <div class="col-md-3 col-sm-6"><div class="sec-card"><div class="sec-icon"><i class="fas fa-percentage"></i></div><div class="sec-body"><div class="sec-label">Katılım</div><div class="sec-value">${partRate}%</div><div class="sec-sub">${attendedCnt}/${totalGradeExams} Sınav</div></div></div></div>
      </div>`;
    }

    let h=`<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pS','Ogrenci_Analizi',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
    <div id="pS" class="card shadow-sm" style="border-top:3px solid #17a2b8;">
      <div class="report-header">
        <span style="font-size:16px;"><i class="fas fa-chart-line mr-2"></i><strong>${st.name}</strong> — Analiz (${ls})</span>
        <span style="font-size:13px;">Sınıf: ${st.class} | ${eT}</span>
      </div>
      <div class="card-body" style="padding-top:5px;">
        ${karneCardsHtml}${stuRiskHtml}${perfHtml}${trendHtml}
        <div id="stuBoxPlotArea"></div>
        <div class="table-responsive"><table class="table table-sm table-hover table-bordered" id="tS"><thead><tr><th>#</th><th>Tarih</th><th>Yayınevi</th><th>${valHeader}</th><th>Değişim</th></tr></thead><tbody>${rows}${avgRowHtml}</tbody></table></div>
        <div class="chart-box avoid-break" style="margin-top:10px;"><canvas id="cA"></canvas></div>
      </div>
    </div>`;
    r.innerHTML=h;
    
    chartTimer=setTimeout(()=>{ 
      let chartLabels = ex.map(e => e.publisher ? `${e.date} (${toTitleCase(e.publisher)})` : e.date);
      let datasets = [{label:`Öğrenci ${ls}`,data:dD,backgroundColor:cols[0]+'cc',borderColor:cols[0],borderWidth:1.5}];
      if(!isRank){ datasets.push({label:'Sınıf Ort.',data:clsArr,backgroundColor:cols[2]+'99',borderColor:cols[2],borderWidth:1.5}); datasets.push({label:'Kurum Ort. ('+stGrade+'.Sınıf)',data:instArr,backgroundColor:cols[3]+'99',borderColor:cols[3],borderWidth:1.5}); }
      c.a=mkChart('cA',chartLabels,datasets,isRank);
      // Kutu grafikleri
      if(!isRank && dDValid.length >= 10) {
        let bpArea = getEl('stuBoxPlotArea');
        if(bpArea) bpArea.innerHTML = buildStuBoxPlots(no, eT, st.class, stGrade, sb);
      }
    },100);

  }else if(aT==='class'){
    let l=getEl('aLvl').value, b=getBrVal(), dateFilter = getEl('aDate') ? getEl('aDate').value : '';
    // Filtrelenmiş sınav verisi: sınav türü + tarih filtresi + level/branch filtresi
    let ex=DB.e.filter(x=>x.examType===eT&&!x.abs),d={};
    ex.forEach(e=>{ 
      let m=e.studentClass.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m)return; 
      if(l&&l!==m[1])return; 
      if(b&&b!==m[2].toLocaleUpperCase('tr-TR'))return; 
      if(dateFilter && e.date!==dateFilter) return;
      (d[e.date]=d[e.date]||[]).push(e); 
    });
    let sd=Object.keys(d).sort(srt),cs=new Set(),tr=[], ls = sb === 'score' ? 'Puan' : (sb === 'totalNet' || !sb ? 'Toplam Net' : toTitleCase(sb.replace('s_','')) + ' Neti');

    let cIdx = 1;
    sd.forEach(dt=>{ 
      let cl={}; d[dt].forEach(e=>(cl[e.studentClass]=cl[e.studentClass]||[]).push(e)); 
      Object.keys(cl).sort().forEach(cc=>{ 
        cs.add(cc); 
        let n=cl[cc].map(x=>{ if(sb === 'score') return x.score; if(sb === 'totalNet' || !sb) return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net || 0; }); 
        let pub = cl[cc][0]?.publisher || '—'; tr.push(`<tr><td>${cIdx++}</td><td>${cc}</td><td>${dt}</td><td>${toTitleCase(pub)}</td><td>${n.length?(n.reduce((x,y)=>x+y,0)/n.length).toFixed(2):0}</td></tr>`); 
      }); 
    });

    let lvlForAvg = l || (ex.length > 0 ? getGrade(ex[0].studentClass) : ''), exForAvg = lvlForAvg ? ex.filter(x => getGrade(x.studentClass) === lvlForAvg) : ex;
    let allVals = exForAvg.map(x=>{ if(sb==='score')return x.score; if(sb==='totalNet'||!sb)return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net||0; });
    let classAvgRows = '', sortedClasses = [...cs].sort();
    sortedClasses.forEach(clsName => {
      let clsExams = ex.filter(x => x.studentClass === clsName), clsVals = clsExams.map(x => { if(sb==='score')return x.score; if(sb==='totalNet'||!sb)return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net||0; });
      if(clsVals.length > 0) { let clsAvg = (clsVals.reduce((a,b)=>a+b,0)/clsVals.length).toFixed(2); classAvgRows += `<tr class="avg-row"><td colspan="4" style="text-align:right; padding-right:15px;">${clsName} Ortalama</td><td>${clsAvg}</td></tr>`; }
    });
    
    let clsAvgRow = classAvgRows, lvlLabel = lvlForAvg ? `${lvlForAvg}. Sınıflar` : 'Tüm Sınıflar';
    if (allVals.length > 0) { let genAvg = (allVals.reduce((a,b)=>a+b,0)/allVals.length).toFixed(2); clsAvgRow += `<tr class="avg-row"><td colspan="4" style="text-align:right; padding-right:15px;">Kurum Ortalama (${lvlLabel})</td><td>${genAvg}</td></tr>`; }
    let clsLabel=''; {let lv=getEl('aLvl').value,br=getBrVal(); if(lv&&br)clsLabel=lv+br; else if(lv)clsLabel=lv+'. Sınıflar'; else if(br)clsLabel=br; else clsLabel='Hepsi';}
    
    let clsPerfHtml = '';
    if(sortedClasses.length > 0 && allVals.length > 0) {
      let topCls = sortedClasses.map(clsName => { let cv = ex.filter(x=>x.studentClass===clsName).map(x=>{ if(sb==='score')return x.score; if(sb==='totalNet'||!sb)return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net||0; }); return {cls: clsName, avg: cv.length?(cv.reduce((a,b)=>a+b,0)/cv.length):0, count: cv.length}; }).sort((a,b)=>b.avg-a.avg);
      let best = topCls[0], worst = topCls[topCls.length-1], genAvgPerf = allVals.reduce((a,b)=>a+b,0)/allVals.length, aboveAvg = topCls.filter(x=>x.avg >= genAvgPerf).length;
      // Tek şube seçiliyse (topCls.length === 1) karşılaştırma kartları anlamsız — gizle
      let showCompCards = topCls.length > 1;
      
      // === Sınıf Katılım Oranı ===
      // Mantık: Seçilen sınıf seviyesi (+ varsa şube) içindeki uygun her öğrenci için,
      //   o öğrencinin sınıf seviyesinde düzenlenen aynı sınav türündeki HER sınav (date+publisher) bir "potansiyel katılım"dır.
      // Katılan: Bu öğrencinin o sınava (date+publisher) ait, abs=false olan UNIQUE kaydı varsa 1 sayılır.
      let eligibleStus = DB.s.filter(s => { let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m) return false; if((l&&l!==m[1])||(b&&b!==m[2].toLocaleUpperCase('tr-TR'))) return false; return true; });
      // Her sınav (date+publisher) hangi sınıf seviyelerini kapsıyor?
      let examGradeMap = {}; // key -> { grades:Set, date, publisher }
      Object.values(EXAM_META).forEach(m => {
        if(m.examType !== eT) return;
        if(dateFilter && m.date !== dateFilter) return;
        let key = m.date + '||' + (m.publisher || '');
        if(!examGradeMap[key]) examGradeMap[key] = { grades:new Set(), date:m.date, publisher:m.publisher||'' };
        let gs = (m.grades && m.grades.length) ? m.grades : ['*'];
        gs.forEach(g => examGradeMap[key].grades.add(g));
      });
      // Öğrenci başına katıldığı (date+publisher) setini DB.e'den hazırla
      let attendedSetByStu = {};
      DB.e.forEach(e => {
        if(e.examType !== eT || e.abs) return;
        if(dateFilter && e.date !== dateFilter) return;
        let k = e.date + '||' + (e.publisher || '');
        if(!attendedSetByStu[e.studentNo]) attendedSetByStu[e.studentNo] = new Set();
        attendedSetByStu[e.studentNo].add(k);
      });
      let baseCount = 0, attendedCount = 0;
      eligibleStus.forEach(stu => {
        let g = getGrade(stu.class);
        let stuAttended = attendedSetByStu[stu.no] || new Set();
        Object.entries(examGradeMap).forEach(([key, info]) => {
          if(!(info.grades.has('*') || info.grades.has(g))) return;
          baseCount++;
          if(stuAttended.has(key)) attendedCount++;
        });
      });
      let partRate = baseCount > 0 ? Math.max(0, Math.min(100, Math.round((attendedCount / baseCount) * 100))) : 0;

      clsPerfHtml = `<div class="row mb-3">
        ${showCompCards ? `
        <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card sec-pos h-100"><div class="sec-icon"><i class="fas fa-trophy"></i></div><div class="sec-body"><div class="sec-label">En İyi Sınıf</div><div class="sec-value">${best.cls}</div><div class="sec-sub">Ort: ${best.avg.toFixed(2)}</div></div></div></div>
        <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card sec-neg h-100"><div class="sec-icon"><i class="fas fa-exclamation-circle"></i></div><div class="sec-body"><div class="sec-label">En Düşük Sınıf</div><div class="sec-value">${worst.cls}</div><div class="sec-sub">Ort: ${worst.avg.toFixed(2)}</div></div></div></div>
        ` : ''}
        <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card h-100"><div class="sec-icon"><i class="fas fa-calculator"></i></div><div class="sec-body"><div class="sec-label">Kurum Ort. (${lvlLabel})</div><div class="sec-value">${genAvgPerf.toFixed(2)}</div></div></div></div>
        ${showCompCards ? `
        <div class="col-md-6 col-lg flex-fill mb-2"><div class="sec-card h-100"><div class="sec-icon"><i class="fas fa-star"></i></div><div class="sec-body"><div class="sec-label">Ort. Üstü Sınıf</div><div class="sec-value">${aboveAvg} / ${topCls.length}</div></div></div></div>
        ` : ''}
        <div class="col-md-6 col-lg flex-fill mb-2"><div class="sec-card sec-neutral h-100"><div class="sec-icon"><i class="fas fa-users"></i></div><div class="sec-body"><div class="sec-label">Katılım Oranı</div><div class="sec-value">%${partRate}</div><div class="sec-sub">${attendedCount} / ${baseCount} Katılım</div></div></div></div>
      </div>`;
    }
    
    // === FIX: Öğrenci Top/Bottom 5 sıralaması her zaman PUAN'a göre yapılır ===
    // (Seçilen veri tipi ne olursa olsun, sıralama puan ortalaması üzerinden — kullanıcı isteği)
    let stuRankMap = {};
    ex.forEach(e => {
      let stu = DB.s.find(x => x.no === e.studentNo);
      if(!stu) return; // orphan filtrele
      let m = stu.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/);
      if(!m) return;
      if((l && l !== m[1]) || (b && b !== m[2].toLocaleUpperCase('tr-TR'))) return;
      // Görüntülenen değer (seçili veri için)
      let val;
      if(sb === 'score') val = e.score;
      else if(sb === 'totalNet' || !sb) val = e.totalNet;
      else { let subKey = toTitleCase(sb.replace('s_','')); val = (e.subs && e.subs[subKey] !== undefined) ? e.subs[subKey].net : null; }
      if(val === null || val === undefined) return;
      if(!stuRankMap[e.studentNo]) stuRankMap[e.studentNo] = { no: e.studentNo, name: stu.name, cls: stu.class, sum: 0, cnt: 0, scoreSum: 0, scoreCnt: 0 };
      stuRankMap[e.studentNo].sum += val; stuRankMap[e.studentNo].cnt++;
      stuRankMap[e.studentNo].scoreSum += (e.score||0); stuRankMap[e.studentNo].scoreCnt++;
    });
    let stuRankArr = Object.values(stuRankMap).map(s => ({
      ...s,
      avg: s.sum / s.cnt,
      avgScore: s.scoreCnt ? s.scoreSum / s.scoreCnt : 0
    })).sort((a,b) => {
      let dp = (b.avgScore||0) - (a.avgScore||0); if(dp !== 0) return dp;
      let dn = (b.avg||0) - (a.avg||0); if(dn !== 0) return dn;
      return String(a.name||'').localeCompare(String(b.name||''),'tr',{sensitivity:'base'});
    });
    let top5Stu = stuRankArr.slice(0, 5), bottom5Stu = stuRankArr.slice(-5).reverse();
    let stuTop5Html = top5Stu.length ? top5Stu.map((s,i) => `<tr><td>${i+1}</td><td>${s.name}</td><td>${s.cls}</td><td><strong>${s.avg.toFixed(2)}</strong></td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted">Veri yok</td></tr>';
    let stuBottom5Html = bottom5Stu.length ? bottom5Stu.map((s,i) => `<tr><td>${i + 1}</td><td>${s.name}</td><td>${s.cls}</td><td><strong>${s.avg.toFixed(2)}</strong></td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted">Veri yok</td></tr>';
    
    let top5Bottom5Html = stuRankArr.length > 0 ? `<div class="row mt-3">
      <div class="col-lg-6"><div class="card shadow-sm avoid-break"><div class="card-header bg-success text-white"><h3 class="card-title m-0"><i class="fas fa-trophy mr-1"></i> En İyi 5 Öğrenci</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.85em;"><thead><tr><th>#</th><th>Ad Soyad</th><th>Sınıf</th><th>Ort. (${ls})</th></tr></thead><tbody>${stuTop5Html}</tbody></table></div></div></div>
      <div class="col-lg-6"><div class="card shadow-sm avoid-break"><div class="card-header bg-danger text-white"><h3 class="card-title m-0"><i class="fas fa-exclamation-circle mr-1"></i> En Düşük 5 Öğrenci</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.85em;"><thead><tr><th>#</th><th>Ad Soyad</th><th>Sınıf</th><th>Ort. (${ls})</th></tr></thead><tbody>${stuBottom5Html}</tbody></table></div></div></div>
    </div>` : '';

    // === Sınıf Analizi: Kurum ortalaması üzerinden Trend + SS bloğu ===
    // Her sınav tarihindeki kurum geneli ortalama bir seri oluşturur; bu seri üzerinden lineer regresyon uygulanır.
    let clsTrendHtml = '';
    if(sd.length >= 2) {
      // Tarih başına kurum ortalaması (seçili veri tipine göre)
      let dateAvgSeries = sd.map(dt => {
        let vals = (d[dt]||[]).map(x => { if(sb==='score') return x.score; if(sb==='totalNet'||!sb) return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net||0; });
        return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      }).filter(v => v !== null);

      if(dateAvgSeries.length >= 2) {
        let clsTSlope    = linRegSlope(dateAvgSeries);
        let clsTTotal    = clsTSlope * (dateAvgSeries.length - 1);
        let clsTImproving = clsTSlope > 0, clsTWorsening = clsTSlope < 0;
        let clsTClass   = clsTImproving ? 'trend-up' : (clsTWorsening ? 'trend-down' : 'trend-stable');
        let clsTIcon    = clsTImproving ? 'fa-arrow-up' : (clsTWorsening ? 'fa-arrow-down' : 'fa-minus');
        let clsTText    = clsTImproving ? 'Yükseliş' : (clsTWorsening ? 'Düşüş' : 'Sabit');
        let clsTColor   = clsTImproving ? '#28a745' : (clsTWorsening ? '#dc3545' : '#6c757d');
        let clsTSign    = clsTTotal > 0 ? '+' : '';
        let clsSSign    = clsTSlope > 0 ? '+' : '';

        // Standart Sapma: d (dateFilter+abs uygulanmış) içindeki tüm bireysel değerler üzerinden.
        // allVals exForAvg'dan geliyor ve dateFilter içermeyebilir; d üzerinden hesaplamak tutarlıdır.
        let ssRawVals = sd.flatMap(dt => (d[dt]||[]).map(x => { if(sb==='score') return x.score; if(sb==='totalNet'||!sb) return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net||0; }));
        let ssMean = ssRawVals.length ? ssRawVals.reduce((a,b)=>a+b,0)/ssRawVals.length : 0;
        let ssVal  = ssRawVals.length > 1 ? Math.sqrt(ssRawVals.map(v=>(v-ssMean)**2).reduce((a,b)=>a+b,0)/ssRawVals.length) : 0;
        // Sınıflar Arası Fark: sınıf ortalamaları d üzerinden hesaplanır (dateFilter ile tutarlı)
        let _clsAvgsForMM = sortedClasses.map(clsName => {
          let vals = sd.flatMap(dt => (d[dt]||[]).filter(x=>x.studentClass===clsName).map(x=>{ if(sb==='score')return x.score; if(sb==='totalNet'||!sb)return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net||0; }));
          return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
        }).filter(v=>v!==null);
        let mmDiff = _clsAvgsForMM.length > 1 ? Math.max(..._clsAvgsForMM) - Math.min(..._clsAvgsForMM) : null;

        clsTrendHtml = `<div class="trend-card mb-3"><div class="row align-items-center">
          <div class="col-6 col-md-2 text-center mb-2 mb-md-0">
            <span class="trend-indicator ${clsTClass}"><i class="fas ${clsTIcon} mr-1"></i>${clsTText}</span>
            <div class="mt-2 small text-muted">Genel Trend</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0">
            <div style="font-size:1.4em;font-weight:bold;color:${clsTColor};">${clsTSign}${clsTTotal.toFixed(2)}</div>
            <div class="small text-muted">Toplam Değişim (Regresyon)</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0">
            <div style="font-size:1.4em;font-weight:bold;color:${clsTColor};">${clsSSign}${clsTSlope.toFixed(2)}</div>
            <div class="small text-muted">Sınav Başı Ort. Eğim</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0">
            <div style="font-size:1.4em;font-weight:bold;">${dateAvgSeries.length}</div>
            <div class="small text-muted">Toplam Sınav</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0">
            <div style="font-size:1.4em;font-weight:bold;color:#6f42c1;">±${ssVal.toFixed(2)}</div>
            <div class="small text-muted">Standart Sapma</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0">
            <div style="font-size:1.4em;font-weight:bold;color:#fd7e14;">${mmDiff !== null ? mmDiff.toFixed(2) : '—'}</div>
            <div class="small text-muted">Sınıflar Arası Fark</div>
          </div>
        </div></div>`;
      }
    }

    let h=`<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pC','Sinif_Analizi',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
    <div id="pC" class="card shadow-sm" style="border-top:3px solid #28a745;">
      <div class="report-header">
        <span style="font-size:16px;"><i class="fas fa-users mr-2"></i>Sınıf Analizi — ${eT} (${ls})</span>
        <span style="font-size:13px;">${clsLabel}</span>
      </div>
      <div class="card-body" style="padding-top:5px;">
        ${clsPerfHtml}
        ${clsTrendHtml}
        <div id="clsBoxPlotArea"></div>
        ${top5Bottom5Html}
        <div class="table-responsive"><table class="table table-sm table-hover table-bordered" id="tC"><thead><tr><th>#</th><th>Sınıf</th><th>Tarih</th><th>Yayınevi</th><th>Ortalama</th></tr></thead><tbody>${tr.join('')}${clsAvgRow}</tbody></table></div>
        <div class="chart-box avoid-break" style="margin-top:10px;"><canvas id="cA"></canvas></div>
      </div>
    </div>`;
    r.innerHTML=h;
    
    chartTimer=setTimeout(()=>{ 
      let datePublisherMap = {}; Object.values(EXAM_META).forEach(m => { if(m.examType===eT && m.publisher) datePublisherMap[m.date]=m.publisher; });
      let sdLabels = sd.map(dt => datePublisherMap[dt] ? `${dt} (${toTitleCase(datePublisherMap[dt])})` : dt);
      let ds=[...cs].sort().map((cl,i)=>({
        label:cl, backgroundColor:cols[i%cols.length]+'cc', borderColor:cols[i%cols.length], borderWidth:1.5,
        data:sd.map(dt=>{ let o=(d[dt]||[]).filter(x=>x.studentClass===cl); let n=o.map(x=>{ if(sb === 'score') return x.score; if(sb === 'totalNet' || !sb) return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net || 0; }); return n.length?n.reduce((x,y)=>x+y,0)/n.length:null; })
      })); 
      c.a=mkChart('cA',sdLabels,ds);
      // Kutu grafikleri — sınıflar arası bireysel dağılım (Tümü dahil: aynı sınıf seviyesindeki tüm öğrenciler)
      let clsBPArea = getEl('clsBoxPlotArea');
      let totalExamsOfType = new Set(Object.values(EXAM_META).filter(m => m.examType === eT).map(m => m.date)).size;
      if(clsBPArea && totalExamsOfType >= 10) {
        let classDataMap = {};
        let lvlForBP = l || (ex.length > 0 ? getGrade(ex[0].studentClass) : '');
        // Tümü: aynı sınıf seviyesindeki TÜM öğrencilerin bireysel değerleri (şube filtresi uygulanmaz)
        let allGradeEx = DB.e.filter(x => x.examType===eT && !x.abs && (lvlForBP ? getGrade(x.studentClass)===lvlForBP : true));
        let allGradeValsForBP = allGradeEx.map(x => {
          if(sb==='score') return x.score;
          if(sb==='totalNet'||!sb) return x.totalNet;
          return x.subs[toTitleCase(sb.replace('s_',''))]?.net ?? null;
        }).filter(v => v !== null);
        [...cs].sort().forEach(clsName => {
          let vals = ex.filter(x => x.studentClass === clsName).map(x => {
            if(sb==='score') return x.score;
            if(sb==='totalNet'||!sb) return x.totalNet;
            return x.subs[toTitleCase(sb.replace('s_',''))]?.net ?? null;
          }).filter(v => v !== null);
          if(vals.length >= 3) { classDataMap[clsName] = vals; }
        });
        if(Object.keys(classDataMap).length >= 1) {
          let lbl = sb === 'score' ? 'Puan' : (sb === 'totalNet' || !sb ? 'Toplam Net' : toTitleCase(sb.replace('s_','')) + ' Neti');
          clsBPArea.innerHTML = `<div class="boxplot-card mb-3"><div class="boxplot-title"><i class="fas fa-box-open mr-1 text-success"></i>Sınıflar Arası Dağılım — ${lbl} (Bireysel Sonuçlar)</div>${mkMultiClassBoxPlot(classDataMap, null, {height:220, title:''}, allGradeValsForBP.length>=3?allGradeValsForBP:null)}</div>`;
        }
      }
    },100);

  }else if(aT==='subject'){
    let subj = sb; if(!subj){r.innerHTML='<div class="alert alert-default-info">Lütfen bir ders seçin.</div>';return;}
    let lvl = getEl('aLvl').value, br = getBrVal(), dateFilterS = getEl('aDate') ? getEl('aDate').value : '';
    let ex = DB.e.filter(x => x.examType === eT && !x.abs && x.subs[toTitleCase(subj)] && (!dateFilterS || x.date === dateFilterS));
    if(lvl) ex = ex.filter(x => getGrade(x.studentClass) === lvl);
    if(br) ex = ex.filter(x => { let m=x.studentClass.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); return m && m[2].toLocaleUpperCase('tr-TR')===br; });
    
    if(!ex.length){r.innerHTML='<div class="alert alert-default-warning">Bu ders için veri bulunamadı.</div>';return;}
    
    let dateGroups = {}; ex.forEach(e => { if(!dateGroups[e.date]) dateGroups[e.date] = []; dateGroups[e.date].push(e); });
    let dates = Object.keys(dateGroups).sort(srt), classStats = {}, allStudentStats = {};
    
    ex.forEach(e => {
      let cls = e.studentClass;
      if(!classStats[cls]) classStats[cls] = { totalNet: 0, count: 0, exams: [] };
      classStats[cls].totalNet += e.subs[toTitleCase(subj)].net; classStats[cls].count++; classStats[cls].exams.push(e);
      if(!allStudentStats[e.studentNo]) { let stuName = DB.s.find(s=>s.no===e.studentNo)?.name || '—'; allStudentStats[e.studentNo] = { no: e.studentNo, name: stuName, cls: cls, totalNet: 0, count: 0, nets: [] }; }
      allStudentStats[e.studentNo].totalNet += e.subs[toTitleCase(subj)].net; allStudentStats[e.studentNo].count++; allStudentStats[e.studentNo].nets.push(e.subs[toTitleCase(subj)].net);
    });
    
    // === FIX: Ders sıralamasında öğrencinin puan ortalaması da hesaba katılır (eşitlik bozucu) ===
    let _validNosSubj = new Set(DB.s.map(s=>s.no));
    let stuArr = Object.values(allStudentStats).filter(s=>_validNosSubj.has(s.no)).map(s => ({ ...s, avg: s.totalNet / s.count })).sort((a,b) => {
      let dn = (b.avg||0) - (a.avg||0); if(dn !== 0) return dn;
      return String(a.name||'').localeCompare(String(b.name||''),'tr',{sensitivity:'base'});
    });
    let top5 = stuArr.slice(0, 5), bottom5 = stuArr.slice(-5).reverse();
    let clsArr = Object.entries(classStats).map(([cls, data]) => ({ cls, avg: data.totalNet / data.count, count: data.count })).sort((a,b) => b.avg - a.avg);
    
    let bestStudent = stuArr.length > 0 ? stuArr[0] : null;
    let worstStudent = stuArr.length > 0 ? stuArr[stuArr.length - 1] : null;
    let genAvg = ex.reduce((a,e) => a + e.subs[toTitleCase(subj)].net, 0) / ex.length, lvlStr = (lvl ? `${lvl}. Sınıflar` : 'Tüm Sınıflar') + (br ? ` / ${br} Şubesi` : '');
    
    // === Ders Katılım Oranı ===
    let eligibleStusS = DB.s.filter(s => { let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m) return false; if(lvl && m[1] !== lvl) return false; if(br && m[2].toLocaleUpperCase('tr-TR') !== br) return false; return true; });
    let subjLower = subj.toLocaleLowerCase('tr-TR');
    let subjExamGradeMap = {};
    Object.values(EXAM_META).forEach(m => {
      if(m.examType !== eT) return;
      if(dateFilterS && m.date !== dateFilterS) return;
      if(!m.subjects || !m.subjects.map(s=>s.toLocaleLowerCase('tr-TR')).includes(subjLower)) return;
      let key = m.date + '||' + (m.publisher || '');
      if(!subjExamGradeMap[key]) subjExamGradeMap[key] = { grades:new Set() };
      let gs = (m.grades && m.grades.length) ? m.grades : ['*'];
      gs.forEach(g => subjExamGradeMap[key].grades.add(g));
    });
    let subjAttendedSetByStu = {};
    DB.e.forEach(e => {
      if(e.examType !== eT || e.abs) return;
      if(dateFilterS && e.date !== dateFilterS) return;
      if(!e.subs || !e.subs[toTitleCase(subj)]) return;
      let k = e.date + '||' + (e.publisher || '');
      if(!subjAttendedSetByStu[e.studentNo]) subjAttendedSetByStu[e.studentNo] = new Set();
      subjAttendedSetByStu[e.studentNo].add(k);
    });
    let baseCountS = 0, attendedCountS = 0;
    eligibleStusS.forEach(stu => {
      let g = getGrade(stu.class);
      let stuAtt = subjAttendedSetByStu[stu.no] || new Set();
      Object.entries(subjExamGradeMap).forEach(([key, info]) => {
        if(!(info.grades.has('*') || info.grades.has(g))) return;
        baseCountS++;
        if(stuAtt.has(key)) attendedCountS++;
      });
    });
    let partRateS = baseCountS > 0 ? Math.max(0, Math.min(100, Math.round((attendedCountS / baseCountS) * 100))) : 0;

    // === Ders Analizi: Tarihsel net ortalaması üzerinden Trend + SS bloğu ===
    let subjTrendHtml = '';
    if(dates.length >= 2) {
      // Her sınav tarihi için o derse ait genel ortalama neti bir seri oluşturur
      let subjDateAvgSeries = dates.map(dt => {
        let vals = dateGroups[dt].map(e => e.subs[toTitleCase(subj)].net);
        return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      }).filter(v => v !== null);

      if(subjDateAvgSeries.length >= 2) {
        let subjSlope    = linRegSlope(subjDateAvgSeries);
        let subjTotal    = subjSlope * (subjDateAvgSeries.length - 1);
        let subjImproving = subjSlope > 0, subjWorsening = subjSlope < 0;
        let subjTClass  = subjImproving ? 'trend-up' : (subjWorsening ? 'trend-down' : 'trend-stable');
        let subjTIcon   = subjImproving ? 'fa-arrow-up' : (subjWorsening ? 'fa-arrow-down' : 'fa-minus');
        let subjTText   = subjImproving ? 'Yükseliş' : (subjWorsening ? 'Düşüş' : 'Sabit');
        let subjTColor  = subjImproving ? '#28a745' : (subjWorsening ? '#dc3545' : '#6c757d');
        let subjTSign   = subjTotal > 0 ? '+' : '';
        let subjSSign   = subjSlope > 0 ? '+' : '';

        // Standart Sapma: tüm bireysel net değerleri üzerinden
        let subjAllNets = ex.map(e => e.subs[toTitleCase(subj)].net);
        let subjMean    = subjAllNets.reduce((a,b)=>a+b,0)/subjAllNets.length;
        let subjSS      = subjAllNets.length > 1 ? Math.sqrt(subjAllNets.map(v=>(v-subjMean)**2).reduce((a,b)=>a+b,0)/subjAllNets.length) : 0;
        // Max-Min farkı: sınıf net ortalamaları arasında
        let subjClsAvgs = clsArr.map(c=>c.avg);
        let subjMMDiff  = subjClsAvgs.length > 1 ? Math.max(...subjClsAvgs) - Math.min(...subjClsAvgs) : null;

        subjTrendHtml = `<div class="trend-card mb-3"><div class="row align-items-center">
          <div class="col-6 col-md-2 text-center mb-2 mb-md-0">
            <span class="trend-indicator ${subjTClass}"><i class="fas ${subjTIcon} mr-1"></i>${subjTText}</span>
            <div class="mt-2 small text-muted">Genel Trend</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0">
            <div style="font-size:1.4em;font-weight:bold;color:${subjTColor};">${subjTSign}${subjTotal.toFixed(2)}</div>
            <div class="small text-muted">Toplam Değişim (Regresyon)</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0">
            <div style="font-size:1.4em;font-weight:bold;color:${subjTColor};">${subjSSign}${subjSlope.toFixed(2)}</div>
            <div class="small text-muted">Sınav Başı Ort. Eğim</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0">
            <div style="font-size:1.4em;font-weight:bold;">${subjDateAvgSeries.length}</div>
            <div class="small text-muted">Toplam Sınav</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0">
            <div style="font-size:1.4em;font-weight:bold;color:#6f42c1;">±${subjSS.toFixed(2)}</div>
            <div class="small text-muted">Standart Sapma</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0">
            <div style="font-size:1.4em;font-weight:bold;color:#fd7e14;">${subjMMDiff !== null ? subjMMDiff.toFixed(2) : '—'}</div>
            <div class="small text-muted">Sınıflar Arası Fark</div>
          </div>
        </div></div>`;
      }
    }

    let h = `
    <div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pSubj','${toTitleCase(subj)}_Analizi',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
    <div id="pSubj" class="card shadow-sm" style="border-top:3px solid #007bff; background:#f4f6f9;">
      <div class="report-header">
        <span style="font-size:16px;"><i class="fas fa-book-open mr-2"></i><strong>${toTitleCase(subj)}</strong> — Ders Analizi</span>
        <span style="font-size:13px;">${eT} | ${lvlStr} | Toplam ${dates.length} Sınav</span>
      </div>
      <div class="card-body" style="padding-top:5px;">
        <div class="row mb-3">
          <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card h-100"><div class="sec-icon"><i class="fas fa-calculator"></i></div><div class="sec-body"><div class="sec-label">Genel Ortalama</div><div class="sec-value">${genAvg.toFixed(2)} Net</div></div></div></div>
          <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card h-100"><div class="sec-icon"><i class="fas fa-users"></i></div><div class="sec-body"><div class="sec-label">Toplam Kayıt</div><div class="sec-value">${ex.length} Sonuç</div></div></div></div>
          <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card sec-pos h-100"><div class="sec-icon"><i class="fas fa-trophy"></i></div><div class="sec-body"><div class="sec-label">En İyi Öğrenci</div><div class="sec-value" style="font-size:0.95em;">${bestStudent ? bestStudent.name : 'Veri Yok'}</div><div class="sec-sub">${bestStudent ? `${bestStudent.avg.toFixed(2)} Net (Ort)` : ''}</div></div></div></div>
          <div class="col-md-6 col-lg flex-fill mb-2"><div class="sec-card sec-neg h-100"><div class="sec-icon"><i class="fas fa-exclamation-triangle"></i></div><div class="sec-body"><div class="sec-label">En Zayıf Öğrenci</div><div class="sec-value" style="font-size:0.95em;">${worstStudent ? worstStudent.name : 'Veri Yok'}</div><div class="sec-sub">${worstStudent ? `${worstStudent.avg.toFixed(2)} Net (Ort)` : ''}</div></div></div></div>
          <div class="col-md-6 col-lg flex-fill mb-2"><div class="sec-card sec-neutral h-100"><div class="sec-icon"><i class="fas fa-chart-pie"></i></div><div class="sec-body"><div class="sec-label">Katılım Oranı</div><div class="sec-value">%${partRateS}</div><div class="sec-sub">${attendedCountS} / ${baseCountS} Katılım</div></div></div></div>
        </div>
        ${subjTrendHtml}
        <div id="subjBoxPlotArea"></div>
        <div class="row">
          <div class="col-lg-4"><div class="card shadow-sm avoid-break"><div class="card-header bg-success text-white"><h3 class="card-title m-0"><i class="fas fa-trophy mr-1"></i> En İyi 5 Öğrenci</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.85em;"><thead><tr><th>#</th><th>Ad Soyad</th><th>Sınıf</th><th>Ort.Net</th></tr></thead><tbody>${top5.map((s,i) => `<tr><td>${i+1}</td><td>${s.name}</td><td>${s.cls}</td><td><strong>${s.avg.toFixed(2)}</strong></td></tr>`).join('')}</tbody></table></div></div></div>
          <div class="col-lg-4"><div class="card shadow-sm avoid-break"><div class="card-header bg-danger text-white"><h3 class="card-title m-0"><i class="fas fa-exclamation-circle mr-1"></i> En Düşük 5 Öğrenci</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.85em;"><thead><tr><th>#</th><th>Ad Soyad</th><th>Sınıf</th><th>Ort.Net</th></tr></thead><tbody>${bottom5.map((s,i) => `<tr><td>${i+1}</td><td>${s.name}</td><td>${s.cls}</td><td><strong>${s.avg.toFixed(2)}</strong></td></tr>`).join('')}</tbody></table></div></div></div>
          <div class="col-lg-4"><div class="card shadow-sm avoid-break"><div class="card-header bg-info text-white"><h3 class="card-title m-0"><i class="fas fa-school mr-1"></i> Sınıf Ortalamaları</h3></div><div class="card-body p-0 table-responsive" style="max-height:200px;"><table class="table table-sm table-striped m-0" style="font-size:0.85em;"><thead><tr><th>#</th><th>Sınıf</th><th>Ort.Net</th><th>Kayıt</th></tr></thead><tbody>${clsArr.map((c,i) => `<tr><td>${i+1}</td><td>${c.cls}</td><td><strong>${c.avg.toFixed(2)}</strong></td><td>${c.count}</td></tr>`).join('')}</tbody></table></div></div></div>
        </div>
        <div class="chart-box mt-3 avoid-break" style="height:260px;"><canvas id="cA"></canvas></div>
      </div>
    </div>`;
    r.innerHTML = h;
    
    chartTimer=setTimeout(()=>{
      let datePublisherMap2 = {}; Object.values(EXAM_META).forEach(m => { if(m.examType===eT && m.publisher) datePublisherMap2[m.date]=m.publisher; });
      let dateLabels = dates.map(dt => datePublisherMap2[dt] ? `${dt} (${toTitleCase(datePublisherMap2[dt])})` : dt);
      let clsList = [...new Set(ex.map(e=>e.studentClass))].sort();
      let datasets = clsList.map((cls, i) => ({ label: cls, backgroundColor: cols[i % cols.length] + 'cc', borderColor: cols[i % cols.length], borderWidth: 1.5, data: dates.map(dt => { let clsExams = dateGroups[dt].filter(e => e.studentClass === cls); if(clsExams.length === 0) return null; return clsExams.reduce((a,e) => a + e.subs[toTitleCase(subj)].net, 0) / clsExams.length; }) }));
      c.a = mkChart('cA', dateLabels, datasets);
      // Ders kutu grafiği — sınıflar arası bireysel net dağılımı (Tümü: tüm sınıf seviyesi)
      let subjBPArea = getEl('subjBoxPlotArea');
      let totalExamsOfType = new Set(Object.values(EXAM_META).filter(m => m.examType === eT).map(m => m.date)).size;
      if(subjBPArea && totalExamsOfType >= 10) {
        let subjectClassMap = {};
        clsList.forEach(cls => {
          let vals = ex.filter(e => e.studentClass === cls).map(e => e.subs[toTitleCase(subj)].net);
          if(vals.length >= 3) subjectClassMap[cls] = vals;
        });
        if(Object.keys(subjectClassMap).length >= 1) {
          // Tümü: aynı sınıf seviyesindeki TÜM öğrencilerin ders netleri (şube filtresi uygulanmaz)
          let lvlForSubjBP = lvl || (ex.length > 0 ? getGrade(ex[0].studentClass) : '');
          let allGradeSubjVals = DB.e.filter(e => e.examType===eT && !e.abs && e.subs[toTitleCase(subj)] && (lvlForSubjBP ? getGrade(e.studentClass)===lvlForSubjBP : true)).map(e => e.subs[toTitleCase(subj)].net);
          let multiSVG = mkMultiClassBoxPlot(subjectClassMap, null, {height:220}, allGradeSubjVals.length >= 3 ? allGradeSubjVals : null);
          if(multiSVG) {
            subjBPArea.innerHTML = `<div class="boxplot-card mt-2 mb-3"><div class="boxplot-title"><i class="fas fa-box-open mr-1 text-success"></i>Sınıflar Arası Dağılım — ${toTitleCase(subj)}</div>${multiSVG}</div>`;
          }
        }
      }
    }, 100);

  }else if(aT==='examdetail'){
    let dt=getEl('aDate').value, subSel = sb || 'summary';
    if(subSel !== 'general_summary' && subSel !== 'list_all' && !dt){r.innerHTML='<div class="alert alert-default-info">Sınav seçiniz.</div>';return;}
    let lvl = getEl('aLvl') ? getEl('aLvl').value : '', baseExams = DB.e.filter(x => x.examType === eT);
    let targetLvl = lvl; if (!targetLvl && aNo) { let st = DB.s.find(x=>x.no===aNo); if(st) targetLvl = getGrade(st.class); }
    if (targetLvl) { baseExams = baseExams.filter(x => getGrade(x.studentClass) === targetLvl); }
    let brFilterED = getBrVal();
    if (brFilterED) { baseExams = baseExams.filter(x => { let mm=x.studentClass.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); return mm && mm[2].toLocaleUpperCase('tr-TR')===brFilterED; }); }

    let getName = (no) => DB.s.find(s=>s.no===no)?.name || 'Bilinmiyor';

    if(subSel === 'general_summary') {
        // === FIX: Orphan öğrencileri filtrele ===
        let _validNosGS = new Set(DB.s.map(s=>s.no));
        let ex = baseExams.filter(x => !x.abs && _validNosGS.has(x.studentNo)); if(ex.length === 0) { r.innerHTML = '<div class="alert alert-default-warning">Bu filtrelere uygun sınav sonucu bulunamadı.</div>'; return; }
        let dates = [...new Set(ex.map(x=>x.date))].sort(srt), stuStats = {}; 
        dates.forEach(d => {
            // === FIX: Sınav içi sıralama her zaman PUAN'a göre, eşitlikte totalNet ===
            let exDt = ex.filter(x => x.date === d).sort((a,b) => { let dp=(b.score||0)-(a.score||0); if(dp!==0) return dp; return (b.totalNet||0)-(a.totalNet||0); }); if(!exDt.length) return;
            let firstScore = exDt[0].score;
            exDt.forEach((e, idx) => {
                if(!stuStats[e.studentNo]) stuStats[e.studentNo] = { no: e.studentNo, name: getName(e.studentNo), cls: e.studentClass, first:0, top5:0, bottom5:0, exList:[] };
                stuStats[e.studentNo].exList.push(e);
                if(e.score === firstScore) stuStats[e.studentNo].first++;
                if(idx < 5) stuStats[e.studentNo].top5++;
                if(idx >= exDt.length - 5) stuStats[e.studentNo].bottom5++;
            });
        });

        let progressArr = [];
        Object.values(stuStats).forEach(st => {
            st.exList.sort((a,b) => srt(a.date, b.date));
            // === FIX: İlerleme/Gerileme Lineer Regresyon eğimi (linRegSlope) ile hesaplanır ===
            // PUAN (score) esas alınır; trend skoru puan serisi üzerinden hesaplanır
            if(st.exList.length >= 2) {
              let scores = st.exList.map(e => e.score);
              let nets   = st.exList.map(e => e.totalNet);
              let slopeScore = linRegSlope(scores);
              let slopeNet   = linRegSlope(nets);
              let regChange = slopeScore * (scores.length - 1); // puan üzerinden toplam trend değişimi
              let firstEx = st.exList[0], lastEx = st.exList[st.exList.length - 1];
              progressArr.push({ ...st, diff: regChange, slope: slopeScore, slopeNet, examCount: scores.length, firstNet: firstEx.totalNet, lastNet: lastEx.totalNet, firstScore: firstEx.score, lastScore: lastEx.score });
            }
            let tNet = 0, tScore = 0; st.exList.forEach(e => { tNet+=e.totalNet; tScore+=e.score; }); st.avgNet = tNet / st.exList.length; st.avgScore = tScore / st.exList.length;
        });

        progressArr.sort((a,b) => b.diff - a.diff);
        let bestP = progressArr.length > 0 && progressArr[0].diff > 0 ? progressArr[0] : null, worstP = progressArr.length > 0 && progressArr[progressArr.length-1].diff < 0 ? progressArr[progressArr.length-1] : null;

        let firstDate = dates[0], lastDate = dates[dates.length - 1], subDiffs = [];
        if (dates.length >= 2) {
            let firstExams = ex.filter(x => x.date === firstDate), lastExams = ex.filter(x => x.date === lastDate), allSubs = new Set([...firstExams, ...lastExams].flatMap(e => Object.keys(e.subs)));
            allSubs.forEach(sub => {
                let fSum = 0, fCount = 0; firstExams.forEach(e => { if(e.subs[sub]) { fSum+=e.subs[sub].net; fCount++; } });
                let lSum = 0, lCount = 0; lastExams.forEach(e => { if(e.subs[sub]) { lSum+=e.subs[sub].net; lCount++; } });
                if(fCount > 0 && lCount > 0) { subDiffs.push({ sub, diff: (lSum / lCount) - (fSum / fCount), fAvg: fSum / fCount, lAvg: lSum / lCount }); }
            });
            subDiffs.sort((a,b) => b.diff - a.diff);
        }
        let bestSub = subDiffs.length > 0 && subDiffs[0].diff > 0 ? subDiffs[0] : null, worstSub = subDiffs.length > 0 && subDiffs[subDiffs.length-1].diff < 0 ? subDiffs[subDiffs.length-1] : null;

        let mostFirstArr = Object.values(stuStats).filter(x=>x.first > 0).sort((a,b) => b.first - a.first), mostFirst = mostFirstArr.length > 0 ? mostFirstArr[0] : null;
        let top5List = Object.values(stuStats).filter(x=>x.top5 > 0).sort((a,b) => b.top5 - a.top5).slice(0,5), bottom5List = Object.values(stuStats).filter(x=>x.bottom5 > 0).sort((a,b) => b.bottom5 - a.bottom5).slice(0,5);
        let buildRow = (e, i, prop, countLabel) => `<tr><td>${i+1}</td><td>${e.no}</td><td>${e.name}</td><td>${e.cls}</td><td><strong>${e[prop]} ${countLabel}</strong></td><td>${e.avgNet.toFixed(2)}</td><td>${e.avgScore.toFixed(2)}</td></tr>`;
        let top5Html = top5List.length ? top5List.map((e,i) => buildRow(e, i, 'top5', 'kez')).join('') : '<tr><td colspan="7" class="text-center">Veri yok</td></tr>';
        let bottom5Html = bottom5List.length ? bottom5List.map((e,i) => buildRow(e, i, 'bottom5', 'kez')).join('') : '<tr><td colspan="7" class="text-center">Veri yok</td></tr>';
        let lvlStr = targetLvl ? `${targetLvl}. Sınıflar ` : '', safeName = `${eT}_Genel_Ozet`;

        // === Genel Katılım Oranı (Sınav Analizi) — unique attendance ===
        let eligibleStusGS = DB.s.filter(s => { let m = s.class.match(/^(\d+)/); if(targetLvl && m && m[1] !== targetLvl) return false; if(brFilterED) { let mm = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(mm && mm[2].toLocaleUpperCase('tr-TR') !== brFilterED) return false; } return true; });
        let gsExamGradeMap = {};
        Object.values(EXAM_META).forEach(m => {
          if(m.examType !== eT) return;
          let key = m.date + '||' + (m.publisher || '');
          if(!gsExamGradeMap[key]) gsExamGradeMap[key] = { grades:new Set() };
          let gs = (m.grades && m.grades.length) ? m.grades : ['*'];
          gs.forEach(g => gsExamGradeMap[key].grades.add(g));
        });
        let gsAttendedSetByStu = {};
        DB.e.forEach(e => {
          if(e.examType !== eT || e.abs) return;
          let k = e.date + '||' + (e.publisher || '');
          if(!gsAttendedSetByStu[e.studentNo]) gsAttendedSetByStu[e.studentNo] = new Set();
          gsAttendedSetByStu[e.studentNo].add(k);
        });
        let baseCountGS = 0, attendedCountGS = 0;
        eligibleStusGS.forEach(stu => {
          let g = getGrade(stu.class);
          let stuAtt = gsAttendedSetByStu[stu.no] || new Set();
          Object.entries(gsExamGradeMap).forEach(([key, info]) => {
            if(!(info.grades.has('*') || info.grades.has(g))) return;
            baseCountGS++;
            if(stuAtt.has(key)) attendedCountGS++;
          });
        });
        let partRateGS = baseCountGS > 0 ? Math.max(0, Math.min(100, Math.round((attendedCountGS / baseCountGS) * 100))) : 0;

        let h = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pGenSummary','${safeName}',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
        <div id="pGenSummary" class="card shadow-sm" style="border-top:3px solid #0d6efd; background:#f4f6f9;">
            <div class="report-header">
              <span style="font-size:16px;"><i class="fas fa-globe mr-2"></i><strong>${eT}</strong> — Genel Değerlendirme</span>
              <span style="font-size:13px;">${lvlStr} | Toplam ${dates.length} Sınav</span>
            </div>
            <div class="card-body" style="padding-top:5px;">
              <div class="row">
                  <div class="col-md-4 col-sm-12"><div class="sec-card"><div class="sec-icon"><i class="fas fa-trophy"></i></div><div class="sec-body"><div class="sec-label">En Çok Birinci Olan</div><div class="sec-value" style="font-size:1.05em;">${mostFirst ? `${mostFirst.name} <small>(${mostFirst.cls})</small>` : 'Veri Yok'}</div><div class="sec-sub">${mostFirst ? `Toplam ${mostFirst.first} kez birinci oldu` : ''}</div></div></div></div>
                  <div class="col-md-4 col-sm-12"><div class="sec-card sec-pos"><div class="sec-icon"><i class="fas fa-chart-line"></i></div><div class="sec-body"><div class="sec-label">En Fazla İlerleme Kaydeden</div><div class="sec-value" style="font-size:1.05em;">${bestP ? `${bestP.name} <small>(${bestP.cls})</small>` : 'Veri Yok'}</div><div class="sec-sub">${bestP ? `+${bestP.diff.toFixed(2)} Puan Eğim (${bestP.firstScore.toFixed(2)} ➔ ${bestP.lastScore.toFixed(2)})` : 'En az 2 sınava giren yok'}</div></div></div></div>
                  <div class="col-md-4 col-sm-12"><div class="sec-card sec-neg"><div class="sec-icon"><i class="fas fa-level-down-alt"></i></div><div class="sec-body"><div class="sec-label">En Fazla Gerileme Kaydeden</div><div class="sec-value" style="font-size:1.05em;">${worstP ? `${worstP.name} <small>(${worstP.cls})</small>` : 'Veri Yok'}</div><div class="sec-sub">${worstP ? `${worstP.diff.toFixed(2)} Puan Eğim (${worstP.firstScore.toFixed(2)} ➔ ${worstP.lastScore.toFixed(2)})` : 'En az 2 sınava giren yok'}</div></div></div></div>
              </div>
              <div class="row mt-2">
                  <div class="col-md-4 col-sm-12"><div class="sec-card sec-pos"><div class="sec-icon"><i class="fas fa-arrow-up"></i></div><div class="sec-body"><div class="sec-label">Genel Ort. En Çok Artan Ders</div><div class="sec-value" style="font-size:1.05em;">${bestSub ? toTitleCase(bestSub.sub) : 'Veri Yok'}</div><div class="sec-sub">${bestSub ? `+${bestSub.diff.toFixed(2)} Net (${bestSub.fAvg.toFixed(2)} ➔ ${bestSub.lAvg.toFixed(2)})` : 'Karşılaştırma için veri yetersiz'}</div></div></div></div>
                  <div class="col-md-4 col-sm-12"><div class="sec-card sec-neg"><div class="sec-icon"><i class="fas fa-arrow-down"></i></div><div class="sec-body"><div class="sec-label">Ortalaması En Çok Düşen Ders</div><div class="sec-value" style="font-size:1.05em;">${worstSub ? toTitleCase(worstSub.sub) : 'Veri Yok'}</div><div class="sec-sub">${worstSub ? `${worstSub.diff.toFixed(2)} Net (${worstSub.fAvg.toFixed(2)} ➔ ${worstSub.lAvg.toFixed(2)})` : 'Karşılaştırma için veri yetersiz'}</div></div></div></div>
                  <div class="col-md-4 col-sm-12"><div class="sec-card sec-neutral"><div class="sec-icon"><i class="fas fa-users"></i></div><div class="sec-body"><div class="sec-label">Genel Katılım Oranı</div><div class="sec-value" style="font-size:1.05em;">%${partRateGS}</div><div class="sec-sub">${attendedCountGS} / ${baseCountGS} Katılım</div></div></div></div>
              </div>
              <div id="genSummaryBPArea"></div>
              <div class="row mt-3">
                  <div class="col-lg-6"><div class="card shadow-sm avoid-break"><div class="card-header bg-success text-white"><h3 class="card-title m-0"><i class="fas fa-angle-double-up mr-1"></i> En Çok İlk 5'e Girenler</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.9em;"><thead><tr><th>Sıra</th><th>No</th><th>Ad Soyad</th><th>Sınıf</th><th>Sayı</th><th>Ort.Net</th><th>Ort.Puan</th></tr></thead><tbody>${top5Html}</tbody></table></div></div></div>
                  <div class="col-lg-6"><div class="card shadow-sm avoid-break"><div class="card-header bg-danger text-white"><h3 class="card-title m-0"><i class="fas fa-angle-double-down mr-1"></i> En Çok Son 5'e Girenler</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.9em;"><thead><tr><th>Sıra</th><th>No</th><th>Ad Soyad</th><th>Sınıf</th><th>Sayı</th><th>Ort.Net</th><th>Ort.Puan</th></tr></thead><tbody>${bottom5Html}</tbody></table></div></div></div>
              </div>
              <div id="genSummaryChartArea" class="chart-box avoid-break mt-3" style="display:none; height:280px;"><canvas id="cGenSummaryBar"></canvas></div>
            </div>
        </div>`; r.innerHTML = h;
        // Genel özet kutu grafiği + sınıf bazlı puan çubuk grafiği
        setTimeout(() => {
          // --- KUTU GRAFİĞİ (sadece 10+ sınav varsa) ---
          let bpArea = getEl('genSummaryBPArea');
          let totalExamsOfType = new Set(Object.values(EXAM_META).filter(m => m.examType === eT).map(m => m.date)).size;
          if(bpArea && totalExamsOfType >= 10) {
            let genClassMap = {};
            Object.values(stuStats).forEach(s => {
              if(!s.exList || !s.exList.length) return;
              if(!genClassMap[s.cls]) genClassMap[s.cls] = [];
              genClassMap[s.cls].push(s.avgNet);
            });
            let validClsMap = Object.fromEntries(Object.entries(genClassMap).filter(([c,v])=>v.length>=3));
            let lvlForGenBP = targetLvl || '';
            let allGradeStus = DB.e.filter(x => x.examType===eT && !x.abs && (lvlForGenBP ? getGrade(x.studentClass)===lvlForGenBP : true));
            let gradeStudentAvgs = {};
            allGradeStus.forEach(e => {
              if(!gradeStudentAvgs[e.studentNo]) gradeStudentAvgs[e.studentNo] = [];
              gradeStudentAvgs[e.studentNo].push(e.totalNet);
            });
            let allGradeStuAvgVals = Object.values(gradeStudentAvgs).map(arr => arr.reduce((a,b)=>a+b,0)/arr.length);
            if(allGradeStuAvgVals.length >= 3 && Object.keys(validClsMap).length >= 1) {
              let multiGSBP = mkMultiClassBoxPlot(validClsMap, null, {height:220}, allGradeStuAvgVals);
              if(multiGSBP) {
                bpArea.innerHTML = `<div class="boxplot-card mb-3"><div class="boxplot-title"><i class="fas fa-box-open mr-1 text-success"></i>Sınıflar Arası Dağılım — Öğrenci Ort. Bazlı</div>${multiGSBP}</div>`;
              }
            }
          }

          // --- SINIF BAZLI ORTALAMA PUAN ÇUBUK GRAFİĞİ (sınav sayısından bağımsız) ---
          let clsScoreMapGS = {};
          Object.values(stuStats).forEach(s => {
            if(!s.exList || !s.exList.length) return;
            let cls = s.cls;
            if(!clsScoreMapGS[cls]) clsScoreMapGS[cls] = { scoreSum: 0, cnt: 0 };
            clsScoreMapGS[cls].scoreSum += s.avgScore;
            clsScoreMapGS[cls].cnt++;
          });
          let gsBarLabels = Object.keys(clsScoreMapGS).sort();
          let gsBarData = gsBarLabels.map(cls => clsScoreMapGS[cls].cnt ? clsScoreMapGS[cls].scoreSum / clsScoreMapGS[cls].cnt : 0);
          let gsCv = getEl('cGenSummaryBar');
          if(gsCv && gsBarLabels.length > 0) {
            let gsChartArea = getEl('genSummaryChartArea');
            if(gsChartArea) gsChartArea.style.display = 'block';
            try { let _prev = Chart.getChart && Chart.getChart('cGenSummaryBar'); if(_prev) _prev.destroy(); } catch(e){}
            new Chart(gsCv, {
              type: 'bar',
              data: {
                labels: gsBarLabels,
                datasets: [{ label: 'Ortalama Puan', data: gsBarData, backgroundColor: cols.map(c=>c+'cc'), borderColor: cols, borderWidth: 1.5 }]
              },
              plugins: [ChartDataLabels],
              options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                  legend: { display: false },
                  datalabels: { display: true, anchor: 'end', align: 'top', font: { size: 10, weight: 'bold' }, formatter: v => v.toFixed(1), color: '#343a40' }
                },
                scales: {
                  x: { grid: { color: '#e2e8f0' }, ticks: { font: { size: 10 } } },
                  y: { grid: { color: '#e2e8f0' }, ticks: { font: { size: 10 } }, title: { display: true, text: 'Ortalama Puan', font: { size: 10 } } }
                }
              }
            });
            if(gsChartArea && !gsChartArea.dataset.titleAdded) {
              let title = document.createElement('div');
              title.style.cssText = 'font-size:11px;font-weight:bold;color:#4a6fa5;margin-bottom:4px;text-align:left;';
              title.textContent = `${eT} — Sınıf Bazlı Ortalama Puan (Tüm Sınavlar)`;
              gsChartArea.parentNode.insertBefore(title, gsChartArea);
              gsChartArea.dataset.titleAdded = 'true';
            }
          }
        }, 50);

    } else if (subSel === 'summary') {
      let batch = baseExams.filter(x => x.date === dt), currentExams = batch.filter(x => !x.abs);
      if (!currentExams.length) { r.innerHTML='<div class="alert alert-default-warning">Bu sınavda geçerli sonuç bulunmuyor.</div>'; return; }

      let filteredDates = [...new Set(baseExams.map(x=>x.date))].sort(srt), currentIndex = filteredDates.indexOf(dt), prevDate = currentIndex > 0 ? filteredDates[currentIndex - 1] : null;
      let isFirstExam = (currentIndex === 0 || prevDate === null);
      let prevBatch = prevDate ? DB.e.filter(x => x.examType === eT && x.date === prevDate) : [];
      if(targetLvl) prevBatch = prevBatch.filter(x => getGrade(x.studentClass) === targetLvl);
      // === FIX: summary sıralama her zaman PUAN'a (score) göre, eşitlikte totalNet ===
      let prevExams = prevBatch.filter(x => !x.abs), sortedExams = [...currentExams].sort((a,b) => { let dp=(b.score||0)-(a.score||0); if(dp!==0) return dp; return (b.totalNet||0)-(a.totalNet||0); }), winner = sortedExams[0], progress = [];
      
      // === FIX: Orphan öğrencileri çıkar (silinmiş öğrencilerin verisi karışmasın) ===
      let _validNosSum = new Set(DB.s.map(s=>s.no));
      currentExams = currentExams.filter(x => _validNosSum.has(x.studentNo));
      prevExams = prevExams.filter(x => _validNosSum.has(x.studentNo));
      currentExams.forEach(ce => { let pe = prevExams.find(x => x.studentNo === ce.studentNo); if (pe) progress.push({ no: ce.studentNo, name: getName(ce.studentNo), cls: ce.studentClass, diff: ce.totalNet - pe.totalNet, cur: ce.totalNet, prev: pe.totalNet }); });
      progress.sort((a,b) => b.diff - a.diff);
      let bestP = progress.length > 0 && progress[0].diff > 0 ? progress[0] : null, worstP = progress.length > 0 && progress[progress.length-1].diff < 0 ? progress[progress.length-1] : null;

      let subStats = {};
      let popStats = (exams, key) => { exams.forEach(ex => { Object.keys(ex.subs).forEach(sub => { if (!subStats[sub]) subStats[sub] = { curSum: 0, curCount: 0, prevSum: 0, prevCount: 0 }; subStats[sub][key + 'Sum'] += ex.subs[sub].net; subStats[sub][key + 'Count']++; }); }); };
      popStats(currentExams, 'cur'); popStats(prevExams, 'prev');
      let subDiffs = [];
      Object.keys(subStats).forEach(sub => { let curAvg = subStats[sub].curCount > 0 ? subStats[sub].curSum / subStats[sub].curCount : 0; let prevAvg = subStats[sub].prevCount > 0 ? subStats[sub].prevSum / subStats[sub].prevCount : 0; if (subStats[sub].prevCount > 0 && subStats[sub].curCount > 0) { subDiffs.push({ sub, diff: curAvg - prevAvg, curAvg, prevAvg }); } });
      subDiffs.sort((a,b) => b.diff - a.diff);
      let bestSub = subDiffs.length > 0 && subDiffs[0].diff > 0 ? subDiffs[0] : null, worstSub = subDiffs.length > 0 && subDiffs[subDiffs.length-1].diff < 0 ? subDiffs[subDiffs.length-1] : null;

      let buildRow = (e, i) => `<tr><td>${i+1}</td><td>${e.no}</td><td>${getName(e.no)}</td><td>${e.cls}</td><td><strong>${e.totalNet.toFixed(2)}</strong></td><td>${e.score.toFixed(2)}</td></tr>`;
      let top5Html = sortedExams.slice(0,5).map((e,i) => buildRow({no:e.studentNo, cls:e.studentClass, totalNet:e.totalNet, score:e.score}, i)).join('');
      let bottomExams = [...sortedExams].reverse().slice(0,5); 
      let bottom5Html = bottomExams.map((e,i) => buildRow({no:e.studentNo, cls:e.studentClass, totalNet:e.totalNet, score:e.score}, i)).join('');
      
      let safeName = `${eT}_${dt.replace(/\./g,'-')}_Ozet`, lvlStr = targetLvl ? `${targetLvl}. Sınıflar ` : '';
      let pubName = Object.values(EXAM_META).find(m=>m.date===dt&&m.examType===eT)?.publisher || '';
      
      // === FIX: Sınav Katılım Oranı — Veri Kaynağı: ana metadata (EXAM_META) baz alınır ===
      // Bu sınavın kapsadığı sınıf seviyelerindeki uygun öğrenciler bazlı; katılan sayısı
      // currentExams (filtre uygulanmış GERÇEK katılan) üzerinden alınır, ancak baz
      // (potansiyel katılım) EXAM_META.grades'ten gelir.
      let thisExamMeta = Object.values(EXAM_META).find(m=>m.date===dt && m.examType===eT);
      let examGrades = (thisExamMeta && thisExamMeta.grades && thisExamMeta.grades.length) ? new Set(thisExamMeta.grades) : null;
      let eligibleStusE = DB.s.filter(s => {
        let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m) return false;
        if(targetLvl && m[1] !== targetLvl) return false;
        if(brFilterED && m[2].toLocaleUpperCase('tr-TR') !== brFilterED) return false;
        if(examGrades && !examGrades.has(m[1])) return false;
        return true;
      });
      let partRateE = eligibleStusE.length > 0 ? Math.max(0, Math.min(100, Math.round((currentExams.length / eligibleStusE.length) * 100))) : 0;

      let h = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pSummary','Sinav_Ozeti_${safeName}',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
      <div id="pSummary" class="card shadow-sm" style="border-top:3px solid #17a2b8; background:#f4f6f9;">
          <div class="report-header">
            <span style="font-size:16px;"><i class="fas fa-file-alt mr-2"></i>${dt} Sınav Değerlendirmesi</span>
            <span style="font-size:13px;">${eT}${pubName ? ' / ' + toTitleCase(pubName) : ''} | ${lvlStr}</span>
          </div>
          <div class="card-body" style="padding-top:5px;">
            <div class="row">
                <div class="col-md-4 col-sm-12"><div class="sec-card"><div class="sec-icon"><i class="fas fa-trophy"></i></div><div class="sec-body"><div class="sec-label">Sınav Birincisi</div><div class="sec-value" style="font-size:1.05em;">${getName(winner.studentNo)} <small>(${winner.studentClass})</small></div><div class="sec-sub">Net: ${winner.totalNet.toFixed(2)} | Puan: ${winner.score.toFixed(2)}</div></div></div></div>
                ${!isFirstExam ? `
                <div class="col-md-4 col-sm-12"><div class="sec-card sec-pos"><div class="sec-icon"><i class="fas fa-chart-line"></i></div><div class="sec-body"><div class="sec-label">Önceki Sınava Göre En Büyük Çıkış</div><div class="sec-value" style="font-size:1.05em;">${bestP ? `${bestP.name} <small>(${bestP.cls})</small>` : 'Veri Yok'}</div><div class="sec-sub">${bestP ? `+${bestP.diff.toFixed(2)} Net (${bestP.prev.toFixed(2)} ➔ ${bestP.cur.toFixed(2)})` : 'Önceki sınav bulunamadı'}</div></div></div></div>
                <div class="col-md-4 col-sm-12"><div class="sec-card sec-neg"><div class="sec-icon"><i class="fas fa-level-down-alt"></i></div><div class="sec-body"><div class="sec-label">Önceki Sınava Göre En Büyük Düşüş</div><div class="sec-value" style="font-size:1.05em;">${worstP ? `${worstP.name} <small>(${worstP.cls})</small>` : 'Veri Yok'}</div><div class="sec-sub">${worstP ? `${worstP.diff.toFixed(2)} Net (${worstP.prev.toFixed(2)} ➔ ${worstP.cur.toFixed(2)})` : 'Önceki sınav bulunamadı'}</div></div></div></div>
                ` : ''}
            </div>
            <div class="row mt-2">
                ${!isFirstExam ? `
                <div class="col-md-4 col-sm-12"><div class="sec-card sec-pos"><div class="sec-icon"><i class="fas fa-arrow-up"></i></div><div class="sec-body"><div class="sec-label">Ortalaması En Çok Artan Ders</div><div class="sec-value" style="font-size:1.05em;">${bestSub ? toTitleCase(bestSub.sub) : 'Veri Yok'}</div><div class="sec-sub">${bestSub ? `+${bestSub.diff.toFixed(2)} Net (${bestSub.prevAvg.toFixed(2)} ➔ ${bestSub.curAvg.toFixed(2)})` : 'Önceki sınav bulunamadı'}</div></div></div></div>
                <div class="col-md-4 col-sm-12"><div class="sec-card sec-neg"><div class="sec-icon"><i class="fas fa-arrow-down"></i></div><div class="sec-body"><div class="sec-label">Ortalaması En Çok Düşen Ders</div><div class="sec-value" style="font-size:1.05em;">${worstSub ? toTitleCase(worstSub.sub) : 'Veri Yok'}</div><div class="sec-sub">${worstSub ? `${worstSub.diff.toFixed(2)} Net (${worstSub.prevAvg.toFixed(2)} ➔ ${worstSub.curAvg.toFixed(2)})` : 'Önceki sınav bulunamadı'}</div></div></div></div>
                ` : ''}
                <div class="col-md-4 col-sm-12"><div class="sec-card sec-neutral"><div class="sec-icon"><i class="fas fa-users"></i></div><div class="sec-body"><div class="sec-label">Sınav Katılım Oranı</div><div class="sec-value" style="font-size:1.05em;">%${partRateE}</div><div class="sec-sub">${currentExams.length} / ${eligibleStusE.length} Öğrenci</div></div></div></div>
            </div>
            
            <div class="row mt-3">
                <div class="col-lg-6"><div class="card shadow-sm avoid-break"><div class="card-header bg-success text-white"><h3 class="card-title m-0"><i class="fas fa-angle-double-up mr-1"></i> İlk 5 Öğrenci</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.9em;"><thead><tr><th>Sıra</th><th>No</th><th>Ad Soyad</th><th>Sınıf</th><th>Net</th><th>Puan</th></tr></thead><tbody>${top5Html}</tbody></table></div></div></div>
                <div class="col-lg-6"><div class="card shadow-sm avoid-break"><div class="card-header bg-danger text-white"><h3 class="card-title m-0"><i class="fas fa-angle-double-down mr-1"></i> Son 5 Öğrenci</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.9em;"><thead><tr><th>Sıra</th><th>No</th><th>Ad Soyad</th><th>Sınıf</th><th>Net</th><th>Puan</th></tr></thead><tbody>${bottom5Html}</tbody></table></div></div></div>
            </div>

            <div id="examSummaryBPArea"></div>
            <div id="examSummaryChartArea" class="chart-box avoid-break mt-3" style="display:none; height:280px;"><canvas id="cExamSummaryBar"></canvas></div>
          </div>
      </div>`; 
      r.innerHTML = h;

      // Tek sınav kutu grafiği ve Bar Grafiği
      setTimeout(() => {
        let bpArea = getEl('examSummaryBPArea');
        let totalExamsOfType = new Set(Object.values(EXAM_META).filter(m => m.examType === eT).map(m => m.date)).size;
        
        // Kutu grafiği (sadece 10 sınavdan fazla ise render edilir)
        if(bpArea && totalExamsOfType >= 10) {
          let examClassMap = {};
          currentExams.forEach(e => {
            if(!examClassMap[e.studentClass]) examClassMap[e.studentClass] = [];
            examClassMap[e.studentClass].push(e.totalNet);
          });
          // Tümü: aynı sınıf seviyesindeki TÜM öğrencilerin netleri (şube filtresi uygulanmaz)
          let lvlForExBP = targetLvl || (currentExams.length > 0 ? getGrade(currentExams[0].studentClass) : '');
          let allGradeNets = DB.e.filter(e => e.examType===eT && e.date===dt && !e.abs && (lvlForExBP ? getGrade(e.studentClass)===lvlForExBP : true)).map(e => e.totalNet);
          let validClasses = Object.fromEntries(Object.entries(examClassMap).filter(([c,v])=>v.length>=3));
          if(allGradeNets.length >= 3) {
            let multiClsBP = Object.keys(validClasses).length >= 1 ? mkMultiClassBoxPlot(validClasses, null, {height:220}, allGradeNets) : '';
            if(multiClsBP) {
              bpArea.innerHTML = `<div class="boxplot-card mb-3"><div class="boxplot-title"><i class="fas fa-box-open mr-1 text-success"></i>Sınıflar Arası Net Dağılımı</div>${multiClsBP}</div>`;
            }
          }
        }

        // Sınıf bazlı puan çubuk grafiği (Sınav sayısından bağımsız çalışır)
        let clsScoreMap = {};
        currentExams.forEach(e => {
          if(!clsScoreMap[e.studentClass]) clsScoreMap[e.studentClass] = [];
          clsScoreMap[e.studentClass].push(e.score || 0);
        });
        let sortedClsKeys = Object.keys(clsScoreMap).sort();
        let barLabels = sortedClsKeys;
        let barData = sortedClsKeys.map(cls => { let arr = clsScoreMap[cls]; return arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0; });
        let cv = getEl('cExamSummaryBar');
        
        if(cv && barLabels.length > 0) {
          let chartArea = getEl('examSummaryChartArea');
          if(chartArea) chartArea.style.display = 'block';

          try { let _prev = Chart.getChart && Chart.getChart('cExamSummaryBar'); if(_prev) _prev.destroy(); } catch(e){}
          new Chart(cv, {
            type: 'bar',
            data: {
              labels: barLabels,
              datasets: [{ label: 'Ortalama Puan', data: barData, backgroundColor: cols.map(c=>c+'cc'), borderColor: cols, borderWidth: 1.5 }]
            },
            plugins: [ChartDataLabels],
            options: {
              responsive: true, maintainAspectRatio: false, animation: false,
              plugins: {
                legend: { display: false },
                datalabels: { display: true, anchor: 'end', align: 'top', font: { size: 10, weight: 'bold' }, formatter: v => v.toFixed(1), color: '#343a40' }
              },
              scales: {
                x: { grid: { color: '#e2e8f0' }, ticks: { font: { size: 10 } } },
                y: { grid: { color: '#e2e8f0' }, ticks: { font: { size: 10 } }, title: { display: true, text: 'Ortalama Puan', font: { size: 10 } } }
              }
            }
          });
          
          if(chartArea && !chartArea.dataset.titleAdded) { 
            let title = document.createElement('div'); 
            title.style.cssText='font-size:11px;font-weight:bold;color:#4a6fa5;margin-bottom:4px;text-align:left;'; 
            title.textContent = `${eT} ${dt} — Sınıf Bazlı Ortalama Puan`; 
            chartArea.parentNode.insertBefore(title, chartArea); 
            chartArea.dataset.titleAdded = 'true';
          }
        }
      }, 50);

    } else if (subSel === 'list_single') {
      let batch = baseExams.filter(x => x.date === dt);
      if(!batch.length){r.innerHTML='<div class="alert alert-default-info">Bu sınava ait veri yok.</div>';return;}

      let subKeys=Array.from(new Set(batch.filter(x=>!x.abs).flatMap(e=>Object.keys(e.subs)))).sort();
      // === FIX: Orphan öğrenciler — silinmiş öğrenci verilerini listeden çıkar ===
      let _validNos = new Set(DB.s.map(s=>s.no));
      let rows2=batch.filter(e => e && _validNos.has(e.studentNo)).map(e=>{ let st=DB.s.find(x=>x.no===e.studentNo); return {...e,studentName:st?st.name:'—',studentCls:st?st.class:e.studentClass}; });
      // === FIX: Sıralama her zaman PUAN'a göre (eşitlikte totalNet, sonra ad — Türkçe duyarlı) ===
      let attended=rows2.filter(x=>!x.abs).sort((a,b)=>{
        let dp = (b.score||0) - (a.score||0); if(dp !== 0) return dp;
        let dn = (b.totalNet||0) - (a.totalNet||0); if(dn !== 0) return dn;
        return String(a.studentName||'').localeCompare(String(b.studentName||''),'tr',{sensitivity:'base'});
      });
      let absent=rows2.filter(x=>x.abs).sort((a,b)=>String(a.studentName||'').localeCompare(String(b.studentName||''),'tr',{sensitivity:'base'}));
      let sorted=[...attended,...absent], avgNet=attended.length?(attended.reduce((s,x)=>s+x.totalNet,0)/attended.length).toFixed(2):'0.00', avgScoreMeta=attended.length?(attended.reduce((s,x)=>s+(x.score||0),0)/attended.length).toFixed(2):'0.00', metaStr=`Katılan: ${attended.length} | Ortalama Puan: ${avgScoreMeta} | Sıralama: Puan`;
      
      let headCols=subKeys.map(k=>`<th>${toTitleCase(k)}</th>`).join('');
      // === FIX: Sıra numarası SADECE katılan (attended) öğrencilere verilir; absent için "—" ===
      // _rankIdx sadece katılan satırlar için artırılır (absent satırlar atlanır)
      let _rankIdx = 0;
      let bodyRows=sorted.map((e)=>{
        let isSel=aNo&&e.studentNo===aNo, rCls=isSel?'highlight-row':''; let pub = e.publisher || '—';
        if(e.abs) return `<tr class="absent-row ${rCls}"><td>—</td><td>${e.studentName}</td><td>${e.studentCls}</td><td>${e.date}</td><td>${toTitleCase(pub)}</td>${subKeys.map(()=>'<td>—</td>').join('')}<td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
        _rankIdx++; // sadece katılan için artır
        return `<tr class="${rCls}"><td>${_rankIdx}</td><td>${e.studentName}</td><td>${e.studentCls}</td><td>${e.date}</td><td>${toTitleCase(pub)}</td>${subKeys.map(k=>`<td>${e.subs[k]!==undefined?e.subs[k].net.toFixed(2):'—'}</td>`).join('')}<td><strong>${e.totalNet.toFixed(2)}</strong></td><td>${e.score.toFixed(2)}</td><td>${e.cR||'—'}/${e.cP||'—'}</td><td>${e.iR||'—'}/${e.iP||'—'}</td><td>${e.dR||'—'}/${e.dP||'—'}</td><td>${e.pR||'—'}/${e.pP||'—'}</td><td>${e.gR||'—'}/${e.gP||'—'}</td></tr>`;
      }).join('');

      let listAvgRow = '';
      if (attended.length > 0) {
        let avgSubCols = subKeys.map(k => { let v = attended.filter(e => e.subs[k] !== undefined).map(e => e.subs[k].net); return `<td>${v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(2) : '—'}</td>`; }).join('');
        let listAvgScore = (attended.reduce((s,x)=>s+x.score,0)/attended.length).toFixed(2);
        listAvgRow = `<tr class="avg-row"><td colspan="5" style="text-align:right; padding-right:15px;">ORTALAMA (${attended.length} Kişi)</td>${avgSubCols}<td>${avgNet}</td><td>${listAvgScore}</td><td colspan="5">—</td></tr>`;
      }
      let lvlStr = targetLvl ? `${targetLvl}. Sınıflar ` : '', safeName=`${eT}_${dt.replace(/\./g,'-')}`;
      let h=`<div class="d-flex justify-content-end mb-2 no-print"><button class="btn btn-success btn-sm mr-2" onclick="xXL('tED','Sinav_${safeName}')"><i class='fas fa-file-excel mr-1'></i>Excel</button><button class="btn-print no-print" onclick="xPR('pED','Sinav_${safeName}',this,'landscape')"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
      <div id="pED" class="card shadow-sm" style="border-top:3px solid #ffc107;">
        <div class="report-header">
          <span style="font-size:16px;"><i class="fas fa-list mr-2"></i><strong>${eT}</strong> — ${dt} Toplu Liste</span>
          <span style="font-size:13px;">${lvlStr ? lvlStr : ""}| ${metaStr}</span>
        </div>
        <div class="card-body" style="padding-top:5px;">
          <div class="scroll-hint"><i class="fas fa-arrows-alt-h mr-1"></i>Tabloyu kaydırın</div>
          <div class="scroll"><table class="table table-sm table-hover table-bordered" id="tED"><thead><tr><th>#</th><th>Ad Soyad</th><th>Sınıf</th><th>Tarih</th><th>Yayınevi</th>${headCols}<th>Top.Net</th><th>Puan</th><th>Snf(S/K)</th><th>Okul(S/K)</th><th>İlçe(S/K)</th><th>İl(S/K)</th><th>Gen(S/K)</th></tr></thead><tbody>${bodyRows}${listAvgRow}</tbody></table></div>
        </div>
      </div>`;
      r.innerHTML=h; if(aNo) setTimeout(()=>{ let hlRow=getEl('tED')?.querySelector('tr.highlight-row'); if(hlRow)hlRow.scrollIntoView({behavior:'smooth',block:'center'}); },300);

    } else if (subSel === 'list_all') {
      let allEx = baseExams.filter(x => !x.abs);
      if(!allEx.length){r.innerHTML='<div class="alert alert-default-warning">Bu filtrelere uygun sınav sonucu bulunamadı.</div>';return;}

      let allSubKeys = Array.from(new Set(allEx.flatMap(e => Object.keys(e.subs)))).sort();
      let stuMap = {};
      allEx.forEach(e => {
        let no = e.studentNo;
        if(!stuMap[no]) {
          let st = DB.s.find(x => x.no === no);
          stuMap[no] = { no, name: st ? st.name : '—', cls: e.studentClass, subSums: {}, subCounts: {}, totalNetSum: 0, scoreSum: 0, examCount: 0 };
        }
        stuMap[no].totalNetSum += e.totalNet;
        stuMap[no].scoreSum += e.score;
        stuMap[no].examCount++;
        allSubKeys.forEach(k => {
          if(e.subs[k] !== undefined) {
            stuMap[no].subSums[k] = (stuMap[no].subSums[k] || 0) + e.subs[k].net;
            stuMap[no].subCounts[k] = (stuMap[no].subCounts[k] || 0) + 1;
          }
        });
      });

      // === FIX: Orphan'ları çıkar; sıralama PUAN'a göre, eşitlikte totalNet, sonra ad (TR) ===
      let _validNosLA = new Set(DB.s.map(s=>s.no));
      let stuArr = Object.values(stuMap).filter(s => _validNosLA.has(s.no)).map(s => ({
        ...s,
        avgNet: s.totalNetSum / s.examCount,
        avgScore: s.scoreSum / s.examCount,
        subAvgs: Object.fromEntries(allSubKeys.map(k => [k, s.subCounts[k] ? s.subSums[k] / s.subCounts[k] : null]))
      })).sort((a, b) => {
        let dp = (b.avgScore||0) - (a.avgScore||0); if(dp !== 0) return dp;
        let dn = (b.avgNet||0) - (a.avgNet||0); if(dn !== 0) return dn;
        return String(a.name||'').localeCompare(String(b.name||''),'tr',{sensitivity:'base'});
      });

      // Sınıf sırası: aynı cls içinde avgScore'a göre sıralama
      let clsRankMap = {};
      stuArr.forEach(s => {
        if(!clsRankMap[s.cls]) clsRankMap[s.cls] = [];
        clsRankMap[s.cls].push(s);
      });
      let clsSizeMap = {};
      Object.keys(clsRankMap).forEach(cls => {
        let sorted = [...clsRankMap[cls]].sort((a,b) => { let dp=(b.avgScore||0)-(a.avgScore||0); return dp!==0?dp:(b.avgNet||0)-(a.avgNet||0); });
        sorted.forEach((s, i) => { clsSizeMap[s.no] = { rank: i+1, total: sorted.length }; });
      });

      // Okul sırası: aynı sınıf seviyesi (grade) içinde avgScore'a göre sıralama
      let gradeRankMap = {};
      stuArr.forEach(s => {
        let gr = String(s.cls||'').match(/^(\d+)/)?.[1] || '';
        if(!gradeRankMap[gr]) gradeRankMap[gr] = [];
        gradeRankMap[gr].push(s);
      });
      let gradeSizeMap = {};
      Object.keys(gradeRankMap).forEach(gr => {
        let sorted = [...gradeRankMap[gr]].sort((a,b) => { let dp=(b.avgScore||0)-(a.avgScore||0); return dp!==0?dp:(b.avgNet||0)-(a.avgNet||0); });
        sorted.forEach((s, i) => { gradeSizeMap[s.no] = { rank: i+1, total: sorted.length }; });
      });

      let lvlStr = targetLvl ? `${targetLvl}. Sınıflar ` : '';
      let examDatesAll = [...new Set(allEx.map(x => x.date))].sort(srt);
      let metaStrAll = `Hesaplanan Sınav: ${examDatesAll.length} | Listelenen Öğrenci: ${stuArr.length} | Sıralama: Ortalama Puan`;
      let headColsAll = allSubKeys.map(k => `<th>${toTitleCase(k)}</th>`).join('');

      let bodyRowsAll = stuArr.map((s, idx) => {
        let isSel = aNo && s.no === aNo, rCls = isSel ? 'highlight-row' : '';
        let subCells = allSubKeys.map(k => `<td>${s.subAvgs[k] !== null ? s.subAvgs[k].toFixed(2) : '—'}</td>`).join('');
        let cR = clsSizeMap[s.no]; let gR = gradeSizeMap[s.no];
        let clsRankCell = cR ? `${cR.rank}/${cR.total}` : '—';
        let schoolRankCell = gR ? `${gR.rank}/${gR.total}` : '—';
        return `<tr class="${rCls}"><td>${idx+1}</td><td>${s.name}</td><td>${s.cls}</td>${subCells}<td><strong>${s.avgNet.toFixed(2)}</strong></td><td>${s.avgScore.toFixed(2)}</td><td>${clsRankCell}</td><td>${schoolRankCell}</td><td>${s.examCount}</td></tr>`;
      }).join('');

      let allAvgRow = '';
      if(stuArr.length > 0) {
        let avgSubCols = allSubKeys.map(k => {
          let vals = stuArr.filter(s => s.subAvgs[k] !== null).map(s => s.subAvgs[k]);
          return `<td>${vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : '—'}</td>`;
        }).join('');
        let genAvgNet = (stuArr.reduce((a,s)=>a+s.avgNet,0)/stuArr.length).toFixed(2);
        let genAvgScore = (stuArr.reduce((a,s)=>a+s.avgScore,0)/stuArr.length).toFixed(2);
        let genAvgExam = (stuArr.reduce((a,s)=>a+s.examCount,0)/stuArr.length).toFixed(1);
        allAvgRow = `<tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">GENEL ORTALAMA (${stuArr.length} Öğrenci)</td>${avgSubCols}<td>${genAvgNet}</td><td>${genAvgScore}</td><td colspan="2">—</td><td>${genAvgExam}</td></tr>`;
      }

      let safeNameAll = `${eT}_TumSinavlar_Toplu`;
      let hAll = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn btn-success btn-sm mr-2" onclick="xXL('tEDAll','${safeNameAll}')"><i class='fas fa-file-excel mr-1'></i>Excel</button><button class="btn-print no-print" onclick="xPR('pEDAll','${safeNameAll}',this,'landscape')"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
      <div id="pEDAll" class="card shadow-sm" style="border-top:3px solid #007bff;">
        <div class="report-header">
          <span style="font-size:16px;"><i class="fas fa-list-alt mr-2"></i><strong>${eT}</strong> — Tüm Sınavlar Toplu Liste</span>
          <span style="font-size:13px;">${lvlStr ? lvlStr : ""}| ${metaStrAll}</span>
        </div>
        <div class="card-body" style="padding-top:5px;">
          <div class="scroll-hint"><i class="fas fa-arrows-alt-h mr-1"></i>Tabloyu kaydırın</div>
          <div class="scroll">
            <table class="table table-sm table-hover table-bordered" id="tEDAll">
              <thead><tr><th>#</th><th>Ad Soyad</th><th>Sınıf</th>${headColsAll}<th>Top.Net Ort.</th><th>Puan Ort.</th><th>Sıra/Sınıf</th><th>Sıra/Okul</th><th>Sınav Say.</th></tr></thead>
              <tbody>${bodyRowsAll}${allAvgRow}</tbody>
            </table>
          </div>
        </div>
      </div>`;
      r.innerHTML = hAll;
      if(aNo) setTimeout(()=>{ let hlRow = getEl('tEDAll')?.querySelector('tr.highlight-row'); if(hlRow) hlRow.scrollIntoView({behavior:'smooth', block:'center'}); }, 300);
    }
  }
}

// ---- raporInit (orig lines 3494-3500) ----
function raporInit() {
  let lvlSel = getEl('rLvl'), levels = new Set(); DB.s.forEach(s => { let m = s.class.match(/^(\d+)/); if(m) levels.add(m[1]); });
  lvlSel.innerHTML = '<option value="">Seçiniz</option>' + [...levels].sort((a,b)=>parseInt(a)-parseInt(b)).map(x=>`<option value="${x}">${x}. Sınıf</option>`).join('');
  let etSel = getEl('rExType'), types = new Set(); Object.values(EXAM_META).forEach(m => types.add(m.examType));
  let _curVal = etSel.value; etSel.innerHTML = '<option value="" disabled' + (_curVal?'':' selected') + '>Sınav Seçiniz</option>' + [...types].sort((a,b)=>a.localeCompare(b,'tr')).map(x=>`<option value="${x}">${x}</option>`).join('') + '<option value="ALL">Tüm Sınav Türleri (Genel Karne)</option>'; if(_curVal) etSel.value = _curVal;
  raporFillBranches();
}

// ---- raporFillBranches (orig lines 3502-3506) ----
function raporFillBranches() {
  let lvl = getEl('rLvl').value, brSel = getEl('rBr'), branches = new Set();
  DB.s.forEach(s => { let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(m && (!lvl || m[1] === lvl)) branches.add(m[2].toLocaleUpperCase('tr-TR')); });
  brSel.innerHTML = '<option value="">Tümü</option>' + [...branches].sort().map(x=>`<option value="${x}">${x}</option>`).join('');
}

// ---- generateRapor (orig lines 3508-3627) ----
async function generateRapor() {
  let lvl = getEl('rLvl').value, br = getEl('rBr').value, eTypeSel = getEl('rExType').value;
  if(!eTypeSel) return;
  if(!lvl) { showToast('Lütfen sınıf seviyesi seçin.','warning'); return; }
  
  let students = DB.s.filter(s => { let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m) return false; if(m[1] !== lvl) return false; if(br && m[2].toLocaleUpperCase('tr-TR') !== br) return false; return true; });
  if(!students.length) { showToast('Bu filtreye uygun öğrenci bulunamadı.','warning'); return; }
  
  let neededBatches = [];
  if (eTypeSel === 'ALL') { neededBatches = Object.keys(EXAM_META).filter(id => { let m = EXAM_META[id]; return (!m.grades || m.grades.length === 0 || m.grades.includes(lvl)); }); } else {
      neededBatches = Object.keys(EXAM_META).filter(id => { let m = EXAM_META[id]; return m.examType === eTypeSel && (!m.grades || m.grades.length === 0 || m.grades.includes(lvl)); });
  }
  await fetchBatches(neededBatches);
  
  let r = getEl('raporRes'); if(window._raporCharts){ window._raporCharts.forEach(ch=>{try{ch.destroy();}catch(e){}});} window._raporCharts=[];
  let lvlStr = br ? `${lvl}${br}` : `${lvl}. Sınıflar`;
  
  let examsByStudent = new Map();
  DB.e.forEach(ex => {
    if(!examsByStudent.has(ex.studentNo)) examsByStudent.set(ex.studentNo, []);
    examsByStudent.get(ex.studentNo).push(ex);
  });
  
  let html = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('raporCont','Toplu_Karne_${lvlStr}',this)"><i class='fas fa-print mr-1'></i>Tümünü Yazdır</button></div><div id="raporCont">`;
  
  students.forEach((stu, stuIdx) => {
    let stuExams = examsByStudent.get(stu.no) || [];
    stuExams = stuExams.sort((a,b) => srt(a.date,b.date)); if(!stuExams.length) return;

    let grp = {};
    if (eTypeSel === 'ALL') { stuExams.forEach(e => { (grp[e.examType] = grp[e.examType] || []).push(e); }); } else {
        stuExams.filter(e => e.examType === eTypeSel).forEach(e => { (grp[e.examType] = grp[e.examType] || []).push(e); });
    }

    let typs = Object.keys(grp).sort(); if(typs.length === 0) return;
    let isLastStu = stuIdx === students.length - 1;
    let stGrade = getGrade(stu.class);

    html += `<div class="student-rapor-wrapper">`;
    html += `<div class="report-header" style="margin-bottom:10px;"><span style="font-size:16px;"><i class="fas fa-user-graduate mr-2"></i><strong>${stu.name}</strong> — Genel Karne Özeti</span><span style="font-size:13px;">Sınıf: ${stu.class} | ${new Date().toLocaleDateString('tr-TR')}</span></div>`;

    typs.forEach(t => {
      let el = grp[t].sort((a,b)=>srt(a.date,b.date)); let sb = Array.from(new Set(el.filter(e=>!e.abs).flatMap(e=>Object.keys(e.subs)))).sort();
      let shorten = (sb.length + 5) > 10, abbrev = (name) => shorten ? name.substring(0,3) : toTitleCase(name);
      
      let summary = calcKarneSummaryCards(stu.no, t, stGrade, el);
      let cardsHtml = buildKarneExamCards(summary, t);
      let riskCardsHtml = buildRiskInfoCards(stu.no, t, stu.class);
      
      let karneRows = '', kIdx = 1;
      el.forEach(e => {
        if(e.abs) { karneRows += `<tr class="absent-row"><td>—</td><td>${e.date}</td><td>${toTitleCase(e.publisher)||'—'}</td><td colspan="${sb.length+7}" class="text-center font-weight-bold">🔴 Katılmadı</td></tr>`; } else {
          karneRows += `<tr><td>${kIdx++}</td><td>${e.date}</td><td>${toTitleCase(e.publisher)||'—'}</td>${sb.map(x=>`<td>${e.subs[x]!==undefined?e.subs[x].net.toFixed(2):'—'}</td>`).join('')}<td><strong>${e.totalNet.toFixed(2)}</strong></td><td>${e.score.toFixed(2)}</td><td>${e.cR||'—'}/${e.cP||'—'}</td><td>${e.iR||'—'}/${e.iP||'—'}</td><td>${e.dR||'—'}/${e.dP||'—'}</td><td>${e.pR||'—'}/${e.pP||'—'}</td><td>${e.gR||'—'}/${e.gP||'—'}</td></tr>`;
        }
      });
      
      let attended = el.filter(e=>!e.abs), avgRow = '';
      if(attended.length > 0) {
        let allGradeExamsR = DB.e.filter(x => x.examType === t && !x.abs && getGrade(x.studentClass) === stGrade);
        let allClassExamsR = DB.e.filter(x => x.examType === t && !x.abs && x.studentClass === stu.class);
        let genAvgSubsR = sb.map(x => { let v = allGradeExamsR.filter(e => e.subs[x] !== undefined).map(e => e.subs[x].net); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(2) : '—'; });
        let genAvgNetR = allGradeExamsR.length > 0 ? (allGradeExamsR.reduce((a,e)=>a+e.totalNet,0)/allGradeExamsR.length).toFixed(2) : '—';
        let genAvgScoreR = allGradeExamsR.length > 0 ? (allGradeExamsR.reduce((a,e)=>a+e.score,0)/allGradeExamsR.length).toFixed(2) : '—';
        let clsAvgSubsR = sb.map(x => { let v = allClassExamsR.filter(e => e.subs[x] !== undefined).map(e => e.subs[x].net); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(2) : '—'; });
        let clsAvgNetR = allClassExamsR.length > 0 ? (allClassExamsR.reduce((a,e)=>a+e.totalNet,0)/allClassExamsR.length).toFixed(2) : '—';
        let clsAvgScoreR = allClassExamsR.length > 0 ? (allClassExamsR.reduce((a,e)=>a+e.score,0)/allClassExamsR.length).toFixed(2) : '—';
        let avgSubs = sb.map(x => { let v=attended.filter(e=>e.subs[x]!==undefined).map(e=>e.subs[x].net); return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2):'—'; });
        let avgNet = (attended.reduce((a,e)=>a+e.totalNet,0)/attended.length).toFixed(2), avgScore = (attended.reduce((a,e)=>a+e.score,0)/attended.length).toFixed(2);
        
        avgRow = `<tr class="avg-row"><td colspan="3" style="text-align:right;padding-right:12px;">Öğrenci Ortalama</td>${avgSubs.map(v=>`<td>${v}</td>`).join('')}<td>${avgNet}</td><td>${avgScore}</td><td colspan="5">—</td></tr>`;
        avgRow += `<tr class="avg-row"><td colspan="3" style="text-align:right;padding-right:12px;">Sınıf Ortalama (${stu.class})</td>${clsAvgSubsR.map(v=>`<td>${v}</td>`).join('')}<td>${clsAvgNetR}</td><td>${clsAvgScoreR}</td><td colspan="5">—</td></tr>`;
        avgRow += `<tr class="avg-row"><td colspan="3" style="text-align:right;padding-right:12px;">Kurum Ortalama (${stGrade}. Sınıflar)</td>${genAvgSubsR.map(v=>`<td>${v}</td>`).join('')}<td>${genAvgNetR}</td><td>${genAvgScoreR}</td><td colspan="5">—</td></tr>`;
      }
      
      let chartId = 'rKarneChart_' + stu.no.replace(/[^a-zA-Z0-9]/g,'_') + '_' + t.replace(/[^a-zA-Z0-9]/g,'_');
      let bpId = 'rBP_' + stu.no.replace(/[^a-zA-Z0-9]/g,'_') + '_' + t.replace(/[^a-zA-Z0-9]/g,'_');
      let _rExColorIdx = (typeof examColorIdx === 'function') ? examColorIdx(t) : 0;
      let _rExLabel    = (typeof toExamLabel === 'function') ? toExamLabel(t) : t;
      html += `<div class="card shadow-sm mb-4 exam-type-block exam-color-${_rExColorIdx}${typs.indexOf(t)===0?' exam-type-first':''}" data-stu-name="${stu.name.replace(/"/g,'&quot;')}" data-stu-class="${stu.class}" data-exam-color-idx="${_rExColorIdx}" data-exam-color="${_rExColorIdx}">
        <div class="card-header bg-light"><h3 class="card-title m-0" style="font-size:15px; font-weight:bold;"><i class="fas fa-book mr-2"></i>${_rExLabel} Sınavları</h3></div>
        <div class="card-body p-2">
          ${cardsHtml}
          ${riskCardsHtml}
          <div id="${bpId}"></div>
          <div class="scroll"><table class="table table-sm table-bordered table-striped"><thead><tr><th>#</th><th>Tarih</th><th>Yayınevi</th>${sb.map(x=>`<th title="${toTitleCase(x)}">${abbrev(x)}</th>`).join('')}<th>Top.Net</th><th>Puan</th><th>Snf(S/K)</th><th>Okul(S/K)</th><th>İlçe(S/K)</th><th>İl(S/K)</th><th>Gen(S/K)</th></tr></thead><tbody>${karneRows}${avgRow}</tbody></table></div>
          <div class="chart-box avoid-break" style="height:190px;margin-top:6px;"><canvas id="${chartId}"></canvas></div>
        </div></div>`;
    });
    html += `</div>`;
  });
  
  html += `</div>`; r.innerHTML = html;
  
  setTimeout(() => {
    students.forEach(stu => {
      let stuExams = examsByStudent.get(stu.no) || [];
      stuExams = stuExams.sort((a,b) => srt(a.date, b.date)); if (!stuExams.length) return;
      let grp = {};
      if (eTypeSel === 'ALL') { stuExams.forEach(e => { (grp[e.examType] = grp[e.examType] || []).push(e); }); } else {
          stuExams.filter(e => e.examType === eTypeSel).forEach(e => { (grp[e.examType] = grp[e.examType] || []).push(e); });
      }

      let stGrade = getGrade(stu.class);
      Object.keys(grp).forEach(t => {
        let chartId = 'rKarneChart_' + stu.no.replace(/[^a-zA-Z0-9]/g,'_') + '_' + t.replace(/[^a-zA-Z0-9]/g,'_'); let cv = getEl(chartId); if(!cv) return;
        let el = grp[t].sort((a,b)=>srt(a.date,b.date)), chartLabels = el.map(e => e.publisher ? `${e.date} (${toTitleCase(e.publisher)})` : e.date);
        let stuNets = el.map(e=>e.abs?null:e.totalNet);
        let clsNets = el.map(e => { if(e.abs) return null; let v=DB.e.filter(x=>x.date===e.date&&x.examType===t&&x.studentClass===stu.class&&!x.abs).map(x=>x.totalNet); return v.length?(v.reduce((a,b)=>a+b,0)/v.length):null; });
        let insNets = el.map(e => { if(e.abs) return null; let v=DB.e.filter(x=>x.date===e.date&&x.examType===t&&!x.abs&&getGrade(x.studentClass)===stGrade).map(x=>x.totalNet); return v.length?(v.reduce((a,b)=>a+b,0)/v.length):null; });
        let ch = mkChart(chartId, chartLabels, [ {label:'Öğrenci', data:stuNets, backgroundColor:cols[0]+'cc', borderColor:cols[0], borderWidth:1.5}, {label:'Sınıf Ort.', data:clsNets, backgroundColor:cols[2]+'99', borderColor:cols[2], borderWidth:1.5}, {label:'Kurum Ort.', data:insNets, backgroundColor:cols[3]+'99', borderColor:cols[3], borderWidth:1.5} ]);
        window._raporCharts.push(ch);
        // Kutu grafikleri — toplu raporda her öğrenci için
        let bpId = 'rBP_' + stu.no.replace(/[^a-zA-Z0-9]/g,'_') + '_' + t.replace(/[^a-zA-Z0-9]/g,'_');
        let bpEl = getEl(bpId);
        if(bpEl) {
          let bpHtml = buildStuBoxPlots(stu.no, t, stu.class, stGrade, 'totalNet');
          if(bpHtml) bpEl.innerHTML = bpHtml;
        }
      });
    });
  }, 200);
}
