// app-analysis.js — Risk scoring, box plots, karne, rH, rAnl, rapor

// ---- top-level (orig lines 1079-1079) ----
let _riskCache = null;

// ---- top-level (orig lines 1081-1081) ----
const RISK_SEV_W = { high: 3, med: 2, low: 1 };

// ============================================================
// ORTAK İSTATİSTİK YARDIMCI FONKSİYONLARI (yeni)
// Her sayfada tutarlı şekilde kullanılır. Pedagojik/bilimsel
// olarak hangi sayfada ne anlamlı: bkz. CHANGES.md kart matrisi.
// ============================================================

/**
 * Aritmetik ortalama. Boş diziye 0 döner.
 */
function _statMean(arr){
  if(!arr || !arr.length) return 0;
  return arr.reduce((a,b)=>a+b,0) / arr.length;
}

/**
 * Örneklem standart sapması (n-1 paydası).
 * En az 2 değer gerekir, aksi halde null.
 */
function _statStd(arr){
  if(!arr || arr.length < 2) return null;
  let m = _statMean(arr);
  let v = arr.reduce((a,x)=>a+Math.pow(x-m,2),0) / (arr.length - 1);
  return Math.sqrt(v);
}

/**
 * Medyan. Boş diziye null.
 */
function _statMedian(arr){
  if(!arr || !arr.length) return null;
  let s =[...arr].sort((a,b)=>a-b);
  let n = s.length, mid = Math.floor(n/2);
  return n % 2 === 1 ? s[mid] : (s[mid-1] + s[mid]) / 2;
}

/**
 * Çeyrekler (Q1, Q3) ve IQR (Q3-Q1).
 * Tukey yöntemi (linear interpolation). En az 4 veri tavsiye edilir.
 */
function _statQuartiles(arr){
  if(!arr || arr.length < 2) return { q1: null, q3: null, iqr: null };
  let s =[...arr].sort((a,b)=>a-b);
  let pct = (p) => {
    let pos = (s.length - 1) * p;
    let lo = Math.floor(pos), hi = Math.ceil(pos);
    if(lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  };
  let q1 = pct(0.25), q3 = pct(0.75);
  return { q1, q3, iqr: q3 - q1 };
}

/**
 * Cohen's d — iki bağımsız grup arasındaki etki büyüklüğü.
 * Pooled std kullanılır. d ≈ 0.2 küçük, 0.5 orta, ≥0.8 büyük etki.
 * Eğitim verisinde gruplar arası farkın "anlamlılık" göstergesi olarak kullanılır.
 */
function _statCohenD(a, b){
  if(!a || !b || a.length < 2 || b.length < 2) return null;
  let mA = _statMean(a), mB = _statMean(b);
  let sA = _statStd(a), sB = _statStd(b);
  if(sA === null || sB === null) return null;
  let nA = a.length, nB = b.length;
  let pooled = Math.sqrt(((nA-1)*sA*sA + (nB-1)*sB*sB) / (nA + nB - 2));
  if(pooled === 0) return null;
  return (mA - mB) / pooled;
}

/**
 * Cohen's d için sözel etiket (TR).
 */
function _cohenLabel(d){
  if(d === null || d === undefined || isNaN(d)) return '—';
  let abs = Math.abs(d);
  if(abs < 0.2) return 'İhmal edilebilir';
  if(abs < 0.5) return 'Küçük';
  if(abs < 0.8) return 'Orta';
  return 'Büyük';
}

/**
 * Değişim katsayısı CV% — std/ortalama * 100.
 * Tutarlılık/homojenlik göstergesi olarak kullanılır.
 * <10 çok tutarlı, 10–20 tutarlı, 20–35 dalgalı, >35 çok dalgalı.
 */
function _statCV(arr){
  if(!arr || arr.length < 2) return null;
  let m = _statMean(arr); if(m === 0) return null;
  let sd = _statStd(arr); if(sd === null) return null;
  return (sd / Math.abs(m)) * 100;
}

function _consistencyLabel(cv){
  if(cv === null) return '—';
  if(cv < 10)  return 'Çok tutarlı';
  if(cv < 20)  return 'Tutarlı';
  if(cv < 35)  return 'Dalgalı';
  return 'Çok dalgalı';
}
// Sürpriz Payı etiketi — RMSE (regresyon kalıntılarının standart hatası) bazlı.
// RMSE düşükse trend tahmini güvenilir → sürpriz az; RMSE yüksekse sınavlar trendden
// büyük sapma gösteriyor → sürpriz yüksek. Eşikler net cinsinden tipik dağılıma göredir.
function _surpriseLabel(rmse){
  if(rmse === null || rmse === undefined || isNaN(rmse)) return '—';
  if(rmse < 4)   return 'Çok Düşük';
  if(rmse < 8)   return 'Düşük';
  if(rmse < 14)  return 'Orta';
  return 'Yüksek';
}
function _homogeneityLabel(cv){
  if(cv === null) return '—';
  if(cv < 10)  return 'Çok homojen';
  if(cv < 20)  return 'Homojen';
  if(cv < 35)  return 'Heterojen';
  return 'Çok heterojen';
}

/**
 * Yeni eklenen kart yardımcısı: bir kart içine kısa Türkçe açıklama satırı (sec-explain) basar.
 * Kullanım: ${_explain('İlk sınavdan son sınava net farkı')} kart .sec-body içine.
 */
function _explain(txt){
  if(!txt) return '';
  return `<div class="sec-explain" title="${String(txt).replace(/"/g,'&quot;')}">${txt}</div>`;
}

// Trend kartı için minimum sınav sayısı (regresyonun anlamlı olması için).
const _TREND_MIN_N = 3;

/**
 * Adaptif R² eşiği — örneklem büyüklüğüne göre ölçeklenir.
 * Az sayıda sınavda (n=3-4) sabit 0.30 eşiği çok katı olur;
 * büyük n'lerde (n≥10) 0.25 yeterince seçici kalır.
 *
 * Pedagojik gerekçe: az veriyle düşük R² kaçınılmazdır —
 * n=3'te R²>0.30 zorlamak gerçek trendi gizler.
 * APA (2019) simülasyonlarına göre n<6 için 0.15 kabul edilebilir.
 *
 * @param {number} n  Sınav sayısı
 * @returns {number}  Kullanılacak R² eşiği
 */
function _adaptiveR2(n){
  if(!n || n < 3) return 0.30; // n<3'te trend hesabı yapılmaz zaten
  if(n <= 4)  return 0.15;
  if(n <= 6)  return 0.20;
  if(n <= 9)  return 0.25;
  return 0.30; // n≥10 için standart eşik
}

// ============================================================
// ORTAK YARDIMCILAR SONU
// ============================================================


// ---- calcRiskScores (orig lines 1083-1256) — OPTİMİZE EDİLDİ ----
function calcRiskScores() {
  if(!DB.e.length || !DB.s.length) return[];

  // O(1) öğrenci araması — O(N²) find() döngüsü yerine Map kullan
  const stuMap = getStuMap();
  let gradeOf = (no) => { let st = stuMap.get(no); return st ? (String(st.class||'').match(/^(\d+)/)?.[1] || '') : ''; };

  // 1. Popülasyon İstatistikleri (SınavTürü + SınıfSeviyesi + Tarih bazlı)
  // Z-skoru hesabı için her gruba ait tüm net dizisini tut
  let popStats = {};
  DB.e.forEach(x => {
    if(x.abs) return;
    let gr = gradeOf(x.studentNo);
    if(!gr) return;
    let key = x.examType + '||' + gr + '||' + x.date;
    if(!popStats[key]) popStats[key] = { totalNets:[], subjs: {}, stus: 0 };
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
  let getStd = (arr, mean) => {
    if(arr.length < 2) return 0;
    let v = arr.reduce((a,x)=>a+Math.pow(x-mean,2),0)/arr.length;
    return Math.sqrt(v);
  };

  let popAvgs = {};
  Object.keys(popStats).forEach(k => {
    let p = popStats[k];
    let mean = getAvg(p.totalNets);
    let std  = getStd(p.totalNets, mean);
    popAvgs[k] = {
      totalNet: mean, totalStd: std, totalNets: p.totalNets,
      subjs: Object.fromEntries(Object.entries(p.subjs).map(([s, arr]) => {
        let sm = getAvg(arr); return[s, { avg: sm, std: getStd(arr, sm), vals: arr }];
      }))
    };
  });

  // 2. Devamsızlık hesabı için (SınavTürü + SınıfSeviyesi) sınav tarihleri
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

  let riskEntries =[];

  // 4. Rubrik Bazlı Hesaplama
  Object.entries(stuGroups).forEach(([no, types]) => {
    // O(1) Map araması
    let stu = stuMap.get(no);
    if(!stu) return;
    let gr = gradeOf(no);
    if(!gr) return;

    // enrolledAt: öğrenci sisteme geç eklendiyse önceki sınavlar için devamsızlık sayılmaz
    let enrolledDate = stu.enrolledAt ? new Date(stu.enrolledAt) : null;
    let isEnrolledBefore = (dateStr) => {
      if(!enrolledDate) return true;
      // dateStr formatı: GG.AA.YYYY
      let m = String(dateStr).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if(!m) return true;
      let examDate = new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
      return examDate >= enrolledDate;
    };

    Object.entries(types).forEach(([eType, exams]) => {
      let typeScore = 0;
      let flags =[];

      exams.sort((a,b) => srt(a.date, b.date));

      // excused:true olan devamsızlıklar hariç tutulur
      let attended = exams.filter(x => !x.abs || x.excused);
      attended = attended.filter(x => !x.abs); // sadece katıldıklarını al

      let allDatesForGroup = [...(examDatesByGroup[eType + '||' + gr] ||[])]
        .filter(isEnrolledBefore) // Geç eklenen öğrenci için erken tarihler hariç
        .sort(srt);
      let totalHeld = allDatesForGroup.length;

      // A) KATILIM / DEVAMSIZLIK RİSKİ (Maks 30 Puan)
      if(totalHeld >= 2) {
        let attRate = totalHeld > 0 ? attended.length / totalHeld : 1;
        let last2Dates = allDatesForGroup.slice(-2);
        let attendedLast2 = attended.filter(x => last2Dates.includes(x.date)).length;

        if(attRate < 0.50 || attendedLast2 === 0) {
          flags.push({ type:'abs', severity:'high', examType:eType, detail:`${eType}: Katılım çok düşük (%${Math.round(attRate*100)}) veya son 2 sınava girmedi.`, z: 30 });
          typeScore += 30;
        } else if(attRate <= 0.75) {
          flags.push({ type:'abs', severity:'med', examType:eType, detail:`${eType}: Katılım oranı düşük (%${Math.round(attRate*100)}).`, z: 15 });
          typeScore += 15;
        }
      }

      // B ve C için en az 2 sınav gerekli
      if(attended.length >= 2) {
        // EWMA ile son 3 sınav ağırlıklı ortalaması
        let allNets = attended.map(x => x.totalNet);
        let ewmaScore = ewma(allNets, 3, 0.5); // Son 3 sınavın EWMA'sı

        // R² ile trend güvenilirliği — düşük R² = "regression to the mean" gürültüsü.
        // Eşik, sınav sayısına göre adaptif: az veriyle 0.30 çok kısıtlayıcıdır.
        let r2 = linRegR2(allNets);
        let trendReliable = r2 >= _adaptiveR2(allNets.length);

        let lastEx = attended[attended.length - 1];
        let prevEx = attended[attended.length - 2];

        // B) SIRALAMA GERİLEMESİ — EWMA bazlı + R² güvenilirlik filtresi (Maks 40 Puan)
        let lastPct = (parseFloat(lastEx.iR) / parseFloat(lastEx.iP)) || null;
        let prevPct = (parseFloat(prevEx.iR) / parseFloat(prevEx.iP)) || null;

        if(lastPct !== null && prevPct !== null) {
          let delta = lastPct - prevPct;
          if(!trendReliable && delta >= 0.08 && delta < 0.20) {
            // Gürültülü trend — düşük R² ile sadece low severity
            flags.push({ type:'rank', severity:'low', examType:eType, detail:`${eType}: Sıralama geriledi ancak sonuçlar dalgalı — kesin bir düşüş trendi yok.`, z: 10 });
            typeScore += 10;
          } else if(delta >= 0.15) {
            flags.push({ type:'rank', severity:'high', examType:eType, detail:`${eType}: Kurum sıralamasında belirgin düşüş — son iki sınavta %${Math.round(delta*100)} geriledi.`, z: 40 });
            typeScore += 40;
          } else if(delta >= 0.08) {
            flags.push({ type:'rank', severity:'med', examType:eType, detail:`${eType}: Kurum sıralamasında gerileme — son iki sınavta %${Math.round(delta*100)} geriledi.`, z: 20 });
            typeScore += 20;
          }
        }

        // C) NORMALİZE NET DÜŞÜŞÜ — Z-Skoru + EWMA (Maks 30 Puan)
        let pKeyLast = eType + '||' + gr + '||' + lastEx.date;
        let aLast = popAvgs[pKeyLast];

        if(aLast && aLast.totalNets.length >= 3) {
          // Z-skoru: öğrencinin EWMA'sı popülasyon içinde nerede?
          let stuZ = calcZScore(ewmaScore !== null ? ewmaScore : lastEx.totalNet, aLast.totalNets);

          let dropScore = 0;
          if(stuZ <= -2.0) {
            // 2 standart sapma altı = ciddi düşüş
            flags.push({ type:'trend', severity:'high', examType:eType, detail:`${eType}: Son dönem net ortalaması sınıf genelinin çok altında.`, z: 30 });
            dropScore = 30;
          } else if(stuZ <= -1.2) {
            flags.push({ type:'trend', severity:'med', examType:eType, detail:`${eType}: Son dönem net ortalaması sınıf genelinin altında.`, z: 15 });
            dropScore = 15;
          } else if(stuZ <= -0.7 && trendReliable) {
            // Sadece güvenilir trend varsa düşük uyarı
            flags.push({ type:'trend', severity:'low', examType:eType, detail:`${eType}: Hafif düşüş eğilimi — son sınavlarda net ortalaması düşüyor.`, z: 8 });
            dropScore = 8;
          }

          // Ders bazlı Z-skoru kontrolü (toplam düşüş yoksa ders bazlı bak)
          if(dropScore < 30 && lastEx.subs && aLast.subjs) {
            let droppedSubjs =[];
            let maxSubjSeverity = null;
            Object.keys(lastEx.subs).forEach(s => {
              let pSub = aLast.subjs[s];
              if(!pSub || !pSub.vals || pSub.vals.length < 3) return;
              let subjZ = calcZScore(lastEx.subs[s].net, pSub.vals);
              if(subjZ <= -2.0) { droppedSubjs.push(escapeHtml(toTitleCase(s))); maxSubjSeverity = 'high'; }
              else if(subjZ <= -1.2 && maxSubjSeverity !== 'high') { droppedSubjs.push(escapeHtml(toTitleCase(s))); maxSubjSeverity = maxSubjSeverity || 'med'; }
            });
            if(droppedSubjs.length > 0) {
              let sPts = maxSubjSeverity === 'high' ? 30 : 15;
              flags.push({ type:'subj', severity:maxSubjSeverity, examType:eType, detail:`${eType} — Sınıf ortalamasının belirgin altında kalan dersler: ${droppedSubjs.join(', ')}`, z: sPts });
              dropScore += sPts;
            }
          }
          typeScore += Math.min(dropScore, 30);

        } else {
          // Popülasyon küçükse eski normalize yönteme geri dön (güvenli fallback)
          let pKeyPrev = eType + '||' + gr + '||' + prevEx.date;
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
            if(dropScore < 30 && lastEx.subs && prevEx.subs && aPrev.subjs) {
              let droppedSubjs =[];
              let maxSubjSeverity = null;
              Object.keys(lastEx.subs).forEach(s => {
                let pSubLast = aLast.subjs[s], pSubPrev = aPrev.subjs[s];
                if(!pSubLast || !pSubPrev) return;
                let d = checkDrop(lastEx.subs[s].net, pSubLast.avg, prevEx.subs[s]?prevEx.subs[s].net:0, pSubPrev.avg);
                if(d >= 0.20) { droppedSubjs.push(escapeHtml(toTitleCase(s))); maxSubjSeverity = 'high'; }
                else if(d >= 0.10 && maxSubjSeverity !== 'high') { droppedSubjs.push(escapeHtml(toTitleCase(s))); maxSubjSeverity = maxSubjSeverity || 'med'; }
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
      }

      if(typeScore > 0) {
        let topLevel = typeScore >= 70 ? 'high' : (typeScore >= 40 ? 'med' : 'low');
        let seenTypes = new Set();
        let uniqueFlags =[];
        flags.forEach(f => {
          let k = f.type + '|' + f.examType;
          if(!seenTypes.has(k)) { seenTypes.add(k); uniqueFlags.push(f); }
        });
        riskEntries.push({
          no: no,
          name: escapeHtml(stu.name),
          cls: escapeHtml(stu.class),
          score: typeScore,
          level: topLevel,
          flags: uniqueFlags,
          examTypes: [eType]
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
      // XSS: escapeHtml zaten calcRiskScores'da uygulandı; title attr için tekrar encode
      let safeTitle = escapeHtml(f.detail);
      let safeToast = escapeHtml(f.detail).replace(/'/g,'&#x27;');
      return `<span class="risk-badge rb-${f.type}" title="${safeTitle}" onclick="showToast('${safeToast}', 'warning', 4000)" style="cursor:pointer;"><i class="fas ${typeIcon[f.type]}" style="font-size:0.8em;"></i>${typeLabel[f.type]}</span>`;
    }).join('');
    // r.name ve r.cls zaten escapeHtml ile güvende (calcRiskScores)
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

  let allVals = stats.flatMap(g => g.bp ?[g.bp.min, g.bp.max, ...(g.bp.outliers||[])] :[]);
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
  // Sınıf renkleri çubuk grafikteki cols ile ayn (sıralı eşleşme)
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
// sb parametresi opsiyoneldir; belirtilmezse veya 'totalNet' ise net bazlı hesap yapılır.
// 'score' → puan, 's_matematik' gibi → o dersin neti kullanılır.
function calcKarneSummaryCards(stuNo, examType, grade, examsData, sb) {
  sb = sb || 'totalNet';
  let attended = examsData.filter(e => !e.abs);
  if(!attended.length) return null;

  // sb'ye göre değer çekici
  let _subjKey = sb.startsWith('s_') ? toTitleCase(sb.replace('s_','')) : null;
  let _getVal = (e) => {
    if(sb === 'score') return (e.score !== undefined && e.score !== null) ? e.score : null;
    if(_subjKey) { let sn = e.subs ? (e.subs[_subjKey] || e.subs[sb.replace('s_','')]) : null; return sn ? sn.net : null; }
    return e.totalNet; // totalNet (varsayılan)
  };

  let stuVals = attended.map(_getVal).filter(v => v !== null);
  if(!stuVals.length) return null;
  let stuAvg = stuVals.reduce((a,b)=>a+b,0) / stuVals.length;

  let allSameGrade = DB.e.filter(x => x.examType===examType && !x.abs && getGrade(x.studentClass)===grade);
  let genVals = allSameGrade.map(_getVal).filter(v => v !== null);
  let genAvg = genVals.length ? genVals.reduce((a,b)=>a+b,0)/genVals.length : null;

  let stuMap_local = {};
  allSameGrade.forEach(e => {
    let v = _getVal(e); if(v === null) return;
    if(!stuMap_local[e.studentNo]) stuMap_local[e.studentNo] = {sum:0,cnt:0};
    stuMap_local[e.studentNo].sum += v;
    stuMap_local[e.studentNo].cnt++;
  });
  let rankings = Object.entries(stuMap_local).map(([no,v])=>({no,avg:v.sum/v.cnt})).sort((a,b)=>b.avg-a.avg);
  let rank = rankings.findIndex(x=>x.no===stuNo)+1;
  let totalStudents = rankings.length;

  // Sınıf Derecesi
  let stuClass = (getStuMap().get(stuNo)||{}).class || '';
  let allSameClass = DB.e.filter(x => x.examType===examType && !x.abs && x.studentClass===stuClass);
  let clsMap_local = {};
  allSameClass.forEach(e => {
    let v = _getVal(e); if(v === null) return;
    if(!clsMap_local[e.studentNo]) clsMap_local[e.studentNo] = {sum:0,cnt:0};
    clsMap_local[e.studentNo].sum += v;
    clsMap_local[e.studentNo].cnt++;
  });
  let clsRankings = Object.entries(clsMap_local).map(([no,v])=>({no,avg:v.sum/v.cnt})).sort((a,b)=>b.avg-a.avg);
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

  // Trend + Kişisel Tutarlılık — sb'ye göre seçilen metrik üzerinden
  let metricVals = attended.map(_getVal).filter(v => v !== null);
  let trend = null;
  let consistency = null;
  if(metricVals.length >= _TREND_MIN_N){
    let slope = linRegSlope(metricVals);
    let r2    = linRegR2(metricVals);
    let ewmaVal = ewma(metricVals, 3, 0.5);
    let totalChange = slope * (metricVals.length - 1);
    let trendClass, trendIcon, trendText;
    if(r2 < 0.20) {
      trendClass = 'trend-stable'; trendIcon = 'fa-question-circle'; trendText = 'Dalgalı';
    } else if(slope > 0) {
      trendClass = 'trend-up'; trendIcon = 'fa-arrow-up'; trendText = 'Yükseliş';
    } else if(slope < 0) {
      trendClass = 'trend-down'; trendIcon = 'fa-arrow-down'; trendText = 'Düşüş';
    } else {
      trendClass = 'trend-stable'; trendIcon = 'fa-minus'; trendText = 'Sabit';
    }
    trend = { totalChange, slope, r2, ewmaVal, count: metricVals.length, trendClass, trendIcon, trendText };

    let surpriseRMSE = linRegRMSE(metricVals);
    if(surpriseRMSE !== null){
      consistency = { sd: surpriseRMSE, label: _surpriseLabel(surpriseRMSE), n: metricVals.length };
    }
  }

  return {stuAvg, genAvg, rank, totalStudents, classRank, classTotalStudents, partRate, attendedCount, totalExamCount, trend, consistency};
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
    let safeTitle = escapeHtml(f.detail);
    let safeToast = escapeHtml(f.detail).replace(/'/g,'&#x27;');
    return `<span class="risk-badge rb-${f.type}" title="${safeTitle}" onclick="showToast('${safeToast}', 'warning', 4000)" style="font-size:0.72rem;padding:2px 8px;border-radius:20px;display:inline-flex;align-items:center;gap:3px;font-weight:600;margin:2px;cursor:pointer;">
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
// 4 üst kart (Ortalama Net, Katılım, Sınıf Derece, Kurum Derece) + (n≥3 ise) trend bloğu.
// Trend bloğu: Genel Yön (R² chip), Toplam İlerleme, Sınav Başı Değişim, Performans Tutarlılığı (σ), Son Dönem Ortalaması.
// metricLabel: görünen etiket (ör. 'Net', 'Puan', 'Matematik Neti') — belirtilmezse 'Net'
function buildKarneExamCards(summary, examType, metricLabel) {
  if(!summary) return '';
  metricLabel = metricLabel || 'Net';
  let isScore = (metricLabel === 'Puan');
  let {stuAvg, genAvg, rank, totalStudents, classRank, classTotalStudents, partRate, attendedCount, totalExamCount, trend, consistency} = summary;

  // Katılım kartı + trend bloğu oluştur
  // ÖNEMLİ: Trend bloğu yalnızca n≥3 sınavda gösterilir. Tek sınav türünde 1-2 sınav varsa
  //         bilimsel olarak regresyon/eğim anlamsızdır (bkz. Konuşma — kart matrisi).
  let trendHtml = '';
  if(trend) {
    let tColor = trend.trendClass==='trend-up' ? '#28a745' : (trend.trendClass==='trend-down' ? '#dc3545' : '#6c757d');
    let tSign  = trend.totalChange > 0 ? '+' : '';
    let sSign  = trend.slope > 0 ? '+' : '';

    // R²: Trendin ne kadar tutarlı/güvenilir olduğunu gösterir (0-1; 1 mükemmel uyum)
    let r2Pct  = trend.r2 !== undefined ? Math.round(trend.r2 * 100) : null;
    let r2Tooltip = r2Pct !== null
      ? (r2Pct >= 60 ? 'R²: Trend tutarlı ve güvenilir' : (r2Pct >= 30 ? 'R²: Trend kısmen tutarlı' : 'R²: Sonuçlar çok dalgalı, net bir trend yok'))
      : '';

    // EWMA: Son sınavlara daha fazla ağırlık verilen ortalama (kısa-vadeli momentum)
    let ewmaVal = trend.ewmaVal !== null && trend.ewmaVal !== undefined ? trend.ewmaVal.toFixed(1) : null;

    // Sürpriz Payı — regresyon doğrusundan kalıntıların RMSE'si (Standart Hata).
    let consHtml = '';
    if(consistency){
      consHtml = `<div class="col border-right mb-1" title="Sınav sonuçlarının trend doğrusundan ortalama sapması (Standart Hata / RMSE). Düşük değer = trend güvenilir, sürpriz az." style="min-width:90px;">
        <div style="font-size:1.1em;font-weight:bold;color:#6f42c1;">±${consistency.sd.toFixed(2)}</div>
        <div class="small text-muted" style="font-size:0.75em;">Sürpriz Payı</div>
        <div class="x-small text-muted">${consistency.label}</div>
        <div class="x-small text-muted">(Standart Hata / RMSE)</div>
      </div>`;
    }

    trendHtml = `<div class="trend-card mt-2 mb-1"><div class="row flex-nowrap align-items-center text-center" style="overflow-x:auto;">
      <div class="col border-right mb-1" title="${r2Tooltip}" style="min-width:90px;">
        <span class="trend-indicator ${trend.trendClass}" style="font-size:0.8em;"><i class="fas ${trend.trendIcon} mr-1"></i>${trend.trendText}</span>
        <div class="small text-muted mt-1" style="font-size:0.75em;"><strong>Genel Yön (Trend)</strong></div>
        ${r2Pct !== null ? `<div class="x-small mt-1" style="color:${tColor};"><strong>%${r2Pct}</strong> doğruluk payıyla (R²: ${(r2Pct/100).toFixed(2)})</div>` : ''}
      </div>
      <div class="col border-right mb-1" title="İlk sınavdan son sınava kadar regresyon doğrusunun toplam değişimi" style="min-width:90px;">
        <div style="font-size:1.1em;font-weight:bold;color:${tColor};">${tSign}${trend.totalChange.toFixed(1)}</div>
        <div class="small text-muted" style="font-size:0.75em;"><strong>Toplam ${metricLabel} Değişimi</strong></div>
        <div class="x-small text-muted">Süreç Boyunca</div>
      </div>
      <div class="col border-right mb-1" title="Her yeni sınavda beklenen ortalama değişim (regresyon eğimi)" style="min-width:90px;">
        <div style="font-size:1.1em;font-weight:bold;color:${tColor};">${sSign}${trend.slope.toFixed(2)}</div>
        <div class="small text-muted" style="font-size:0.75em;"><strong>Sınav Başı Değişim</strong></div>
        <div class="x-small text-muted">(Regresyon Analizi)</div>
      </div>
      ${consHtml}
      <div class="col border-right mb-1" title="Son sınavlara daha fazla ağırlık verilerek hesaplanan ortalama (EWMA, α=0.5)" style="min-width:90px;">
        <div style="font-size:1.1em;font-weight:bold;color:#0d6efd;">${ewmaVal !== null ? ewmaVal : '—'}</div>
        <div class="small text-muted" style="font-size:0.75em;"><strong>Güncel Performans</strong></div>
        <div class="x-small text-muted">(Ağırlıklı / EWMA)</div>
      </div>
      <div class="col mb-1" title="Bu sınav türünde katıldığı sınav sayısı" style="min-width:90px;">
        <div style="font-size:1.1em;font-weight:bold;">${trend.count}</div>
        <div class="small text-muted" style="font-size:0.75em;"><strong>Katıldığı Sınav</strong></div>
        <div class="x-small text-muted">Trend hesabına dahil</div>
      </div>
    </div></div>`;
  }

  let avgLabel = isScore ? 'Ortalama Puan' : `Ortalama ${metricLabel}`;
  let genOrtLabel = isScore ? 'Genel Puan Ort' : 'Genel Ort';

  let cardsHtml = `<div class="row mb-2">
    <div class="col-md-3 col-sm-6">
      <div class="sec-card">
        <div class="sec-icon"><i class="fas fa-chart-bar"></i></div>
        <div class="sec-body">
          <div class="sec-label">${avgLabel}</div>
          <div class="sec-value">${stuAvg.toFixed(2)}</div>
          <div class="sec-sub">${genOrtLabel}: ${genAvg!==null?genAvg.toFixed(2):'—'}</div>
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
  let s=getStuMap().get(aNo); if(!s)return; let r=getEl('homeArea');
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
    h+=`<div class="karne-bolum exam-type-block exam-color-${_examColorIdx}${isFirstType?' exam-type-first':''}" data-stu-name="${s.name.replace(/"/g,'&quot;')}" data-stu-class="${s.class}"><h5 class="mt-3 mb-2 text-primary border-bottom pb-2"><span>${_examLabel} Sınavları</span><span class="etb-count no-print">${_examCount} Sınav</span></h5>${cardsHtml}${riskCardsHtml}<div id="${bpKarneId}"></div><div class="scroll-hint"><i class="fas fa-arrows-alt-h mr-1"></i>Tabloyu kaydırın</div><div class="scroll"><table class="table table-sm table-bordered table-striped" data-sh="${t}"><thead><tr><th>#</th><th>Tarih</th><th>Yayınevi</th>${sb.map(x=>`<th title="${toTitleCase(x)}">${abbrevSub(x,shorten)}</th>`).join('')}<th>Top.Net</th><th>Puan</th><th>Snf(S/K)</th><th>Okul(S/K)</th></tr></thead><tbody>`;
    
    let kIdx = 1;
    el.forEach(e=>{
      let pub = e.publisher || '—', sNo = e.abs ? '—' : kIdx++;
      if(e.abs) h+=`<tr class="absent-row"><td>${sNo}</td><td>${e.date}</td><td>${toTitleCase(pub)}</td><td colspan="${sb.length+4}" class="text-center font-weight-bold">🔴 Katılmadı</td></tr>`;
      else h+=`<tr><td>${sNo}</td><td>${e.date}</td><td>${toTitleCase(pub)}</td>${sb.map(x=>`<td>${e.subs[x]!==undefined?e.subs[x].net.toFixed(2):'—'}</td>`).join('')}<td><strong>${e.totalNet.toFixed(2)}</strong></td><td>${e.score.toFixed(2)}</td><td>${e.cR||'—'}/${e.cP||'—'}</td><td>${e.iR||'—'}/${e.iP||'—'}</td></tr>`;
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
      
      h += `<tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">Öğrenci Ortalama</td>${avgSubs.map(v=>`<td>${v}</td>`).join('')}<td>${avgNet}</td><td>${avgScore}</td><td colspan="2">—</td></tr>`;
      h += `<tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">Sınıf Ortalama (${s.class})</td>${clsAvgSubs.map(v=>`<td>${v}</td>`).join('')}<td>${clsAvgNet}</td><td>${clsAvgScore}</td><td colspan="2">—</td></tr>`;
      h += `<tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">Kurum Ortalama (${stGrade}. Sınıflar)</td>${genAvgSubs.map(v=>`<td>${v}</td>`).join('')}<td>${genAvgNet}</td><td>${genAvgScore}</td><td colspan="2">—</td></tr>`;
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

// ---- _buildSingleMetricSparkline: Tek bir metrik için (Toplam Net, Puan, ders neti, sıralama) eğilim kartı ----
// metric: 'totalNet' | 'score' | 'rank_c'/'rank_i'/'rank_g' | 's_<dersAdı>'
function _buildSingleMetricSparkline(stuNo, examType, curExam, metric, label){
  // Eğilim (sparkline) grafiği kullanıcı isteğiyle kaldırıldı.
  return '';
}

// ---- buildSubjectSparklines: Tek sınav modu — Ders Eğilimi mini-grafik paneli ----
// Her ders için, öğrencinin aynı sınav türündeki son 5 sınavının (seçili sınav dahil)
// neti üzerinden minik bir SVG çizgi grafiği üretir. Seçili sınavın noktası vurgulanır.
function buildSubjectSparklines(stuNo, examType, curExam, subjects){
  // Ders Eğilimi sparkline paneli kullanıcı isteğiyle kaldırıldı.
  return '';
}

// ---- buildSingleExamCards: Tek sınav modu için 4 özet kart ----
// (1) Puan & Sıra  (2) Önceki Sınava Fark  (3) En Başarılı Ders  (4) En Zayıf Ders
// Karşılaştırma: ders bazında öğrenci neti hem Sınıf hem Kurum ortalamasıyla kıyaslanır.
function buildSingleExamCards(stu, examType, curExam, prevExam, stGrade){
  // Card 1: Puan & Sıra
  let scoreTxt = (curExam.score!==undefined && curExam.score!==null) ? curExam.score.toFixed(2) : '—';
  let netTxt   = (curExam.totalNet!==undefined && curExam.totalNet!==null) ? curExam.totalNet.toFixed(2) : '—';
  let rankBits =[];
  if(curExam.cR) rankBits.push(`Sınıf ${curExam.cR}/${curExam.cP||'—'}`);
  if(curExam.iR) rankBits.push(`Okul ${curExam.iR}/${curExam.iP||'—'}`);
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
    let sorted =[...perSubj].sort((a,b)=> b.combined - a.combined);
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
  let stuAvg = stuVals.reduce((a,b)=>a+b,0) / stuVals.length;

  // Sınıf içindeki tüm öğrencilerin ortalamaları
  let clsStudentAvgs = {};
  DB.e.filter(x => x.examType === examType && !x.abs && x.studentClass === stuClass).forEach(e => {
    let v = getVal(e); if(v === null) return;
    if(!clsStudentAvgs[e.studentNo]) clsStudentAvgs[e.studentNo] =[];
    clsStudentAvgs[e.studentNo].push(v);
  });
  let clsAvgArr = Object.values(clsStudentAvgs).map(arr => arr.reduce((a,b)=>a+b,0)/arr.length);

  // Okul (aynı sınıf seviyesi) içindeki tüm öğrencilerin ortalamaları
  let insStudentAvgs = {};
  DB.e.filter(x => x.examType === examType && !x.abs && getGrade(x.studentClass) === stuGrade).forEach(e => {
    let v = getVal(e); if(v === null) return;
    if(!insStudentAvgs[e.studentNo]) insStudentAvgs[e.studentNo] =[];
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
  if(!eT){
    if(aT === 'class') { r.innerHTML='<div class="alert alert-default-info"><i class="fas fa-info-circle mr-2"></i>Lütfen Sınıf Seviyesi ve Sınav Türü seçiniz.</div>'; }
    else { r.innerHTML='<div class="alert alert-default-info">Sınav verisi yok.</div>'; }
    return;
  }
  // (placeholder kept; user must explicitly choose data type)
  if(aT==='examdetail' && !sb) { return; }

  if(aT==='student'){
    let no=aNo;if(!no){r.innerHTML='<div class="alert alert-default-info"><i class="fas fa-hand-point-up mr-2"></i>Lütfen bir öğrenci seçin.</div>';return;}
    let ex=DB.e.filter(x=>x.studentNo===no&&x.examType===eT&&!x.abs).sort((a,b)=>srt(a.date,b.date)), st=getStuMap().get(no); if(!st){r.innerHTML='<div class="alert alert-default-warning"><i class="fas fa-exclamation-circle mr-2"></i>Öğrenci verisi bulunamadı.</div>';return;}
    let stGrade=getGrade(st.class);

    // === TEK SINAV MODU ===
    let _aExDateRaw = (getEl('aExDate')||{}).value || '';
    if(_aExDateRaw){
      let[_seDate, _sePub=''] = _aExDateRaw.split('||');
      let curExam = ex.find(e => e.date === _seDate && (e.publisher||'') === _sePub);
      if(!curExam){
        r.innerHTML = `<div class="alert alert-warning"><i class="fas fa-info-circle mr-2"></i>Seçilen sınav için bu öğrencinin verisi bulunamadı.</div>`;
        return;
      }
      let curIdx = ex.indexOf(curExam);
      let prevExam = curIdx > 0 ? ex[curIdx-1] : null;
      let subjects = Object.keys(curExam.subs || {}).sort();
      let _pubLbl  = curExam.publisher ? ` (${toTitleCase(curExam.publisher)})` : '';
      let _exLabel = (typeof toExamLabel==='function') ? toExamLabel(eT) : eT;

      // ==================== SINAV ÖZETİ (summary) ====================
      if(sb === 'summary' || sb === ''){
        let cardsHtml = buildSingleExamCards(st, eT, curExam, prevExam, stGrade);
        let riskHtml  = buildRiskInfoCards(no, eT, st.class);
        // Ders bazlı çubuk grafik verisi + Toplam Net
        let barSubjects = [...subjects];
        let stuVals = subjects.map(s => (curExam.subs[s] && curExam.subs[s].net !== undefined) ? curExam.subs[s].net : null);
        let clsVals = subjects.map(s => {
          let v = DB.e.filter(x => x.date===_seDate && (x.publisher||'')===_sePub && x.examType===eT && x.studentClass===st.class && !x.abs && x.subs[s]!==undefined).map(x => x.subs[s].net);
          return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
        });
        let insVals = subjects.map(s => {
          let v = DB.e.filter(x => x.date===_seDate && (x.publisher||'')===_sePub && x.examType===eT && getGrade(x.studentClass)===stGrade && !x.abs && x.subs[s]!==undefined).map(x => x.subs[s].net);
          return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
        });
        // Toplam Net ekleme
        barSubjects.push('Toplam Net');
        stuVals.push(curExam.totalNet !== undefined ? curExam.totalNet : null);
        let clsTN = DB.e.filter(x => x.date===_seDate && (x.publisher||'')===_sePub && x.examType===eT && x.studentClass===st.class && !x.abs).map(x => x.totalNet);
        clsVals.push(clsTN.length ? clsTN.reduce((a,b)=>a+b,0)/clsTN.length : null);
        let insTN = DB.e.filter(x => x.date===_seDate && (x.publisher||'')===_sePub && x.examType===eT && getGrade(x.studentClass)===stGrade && !x.abs).map(x => x.totalNet);
        insVals.push(insTN.length ? insTN.reduce((a,b)=>a+b,0)/insTN.length : null);

        let totalNetTrendCard = _buildSingleMetricSparkline(no, eT, curExam, 'totalNet', 'Toplam Net');

        // 1-A: Özet modunda Toplam Net için Z-skoru + yüzdelik dilim + katılım kartı
        let seExtraCardsHtml = '';
        {
          let _tnVal = curExam.totalNet;
          // Z-skoru ve yüzdelik dilim (sınıf)
          let _clsTNStd = _statStd(clsTN);
          let _clsTNMean = clsTN.length ? clsTN.reduce((a,b)=>a+b,0)/clsTN.length : null;
          let _clsTNZ = (_tnVal!==null && _clsTNMean!==null && _clsTNStd && _clsTNStd>0) ? ((_tnVal-_clsTNMean)/_clsTNStd) : null;
          let _clsTNPerc = (_tnVal!==null && clsTN.length >= 3) ? Math.round(clsTN.filter(v=>v<=_tnVal).length/clsTN.length*100) : null;
          // Z-skoru ve yüzdelik dilim (kurum)
          let _insTNStd = _statStd(insTN);
          let _insTNMean = insTN.length ? insTN.reduce((a,b)=>a+b,0)/insTN.length : null;
          let _insTNZ = (_tnVal!==null && _insTNMean!==null && _insTNStd && _insTNStd>0) ? ((_tnVal-_insTNMean)/_insTNStd) : null;
          let _insTNPerc = (_tnVal!==null && insTN.length >= 3) ? Math.round(insTN.filter(v=>v<=_tnVal).length/insTN.length*100) : null;

          if(clsTN.length >= 3 || insTN.length >= 3) {
            let _clsZCls = _clsTNZ===null?'sec-neutral':(_clsTNZ>0?'sec-pos':(_clsTNZ<0?'sec-neg':'sec-neutral'));
            let _insZCls = _insTNZ===null?'sec-neutral':(_insTNZ>0?'sec-pos':(_insTNZ<0?'sec-neg':'sec-neutral'));
            seExtraCardsHtml += `<div class="row mt-2">`;
            if(clsTN.length >= 3) {
              seExtraCardsHtml += `<div class="col-md-3 col-sm-6"><div class="sec-card ${_clsZCls}">
                <div class="sec-icon"><i class="fas fa-chart-bar"></i></div>
                <div class="sec-body"><div class="sec-label">Sınıf İçi Konum</div>
                <div class="sec-value">${_clsTNZ!==null?_clsTNZ.toFixed(2)+'σ':'—'}</div>
                <div class="sec-sub">${_clsTNPerc!==null?'Top %'+(100-_clsTNPerc)+' · '+clsTN.length+' öğrenci':'Yetersiz veri'}</div>
                ${_explain('Z-skoru: sınıf ortalamasından kaç standart sapma uzakta?')}
                </div></div></div>`;
            }
            if(insTN.length >= 3) {
              seExtraCardsHtml += `<div class="col-md-3 col-sm-6"><div class="sec-card ${_insZCls}">
                <div class="sec-icon"><i class="fas fa-school"></i></div>
                <div class="sec-body"><div class="sec-label">Kurum İçi Konum</div>
                <div class="sec-value">${_insTNZ!==null?_insTNZ.toFixed(2)+'σ':'—'}</div>
                <div class="sec-sub">${_insTNPerc!==null?'Top %'+(100-_insTNPerc)+' · '+insTN.length+' öğrenci':'Yetersiz veri'}</div>
                ${_explain('Z-skoru: kurum ortalamasından kaç standart sapma uzakta?')}
                </div></div></div>`;
            }
            seExtraCardsHtml += `</div>`;
          }

          // Katılım oranı (bu sınav türüne genel katılım)
          let _allTypeDates = new Set();
          DB.e.forEach(x => { if(x.examType===eT && getGrade(x.studentClass)===stGrade) _allTypeDates.add(x.date+'||'+(x.publisher||'')); });
          let _attTypeDates = new Set();
          DB.e.forEach(x => { if(x.studentNo===no && x.examType===eT && !x.abs) _attTypeDates.add(x.date+'||'+(x.publisher||'')); });
          let _seTot = _allTypeDates.size, _seAtt = _attTypeDates.size;
          let _seRate = _seTot > 0 ? Math.round(_seAtt/_seTot*100) : 0;
          let _seRateCls = _seRate >= 80 ? 'sec-pos' : (_seRate >= 50 ? 'sec-neutral' : 'sec-neg');
          seExtraCardsHtml += `<div class="row mt-2">
            <div class="col-md-3 col-sm-6"><div class="sec-card ${_seRateCls}">
              <div class="sec-icon"><i class="fas fa-calendar-check"></i></div>
              <div class="sec-body"><div class="sec-label">Genel Katılım</div>
              <div class="sec-value">${_seRate}%</div>
              <div class="sec-sub">${_seAtt} / ${_seTot} Sınav</div>
              </div></div></div>
          </div>`;
        }

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
        // Toplam Net satırı (vurgulu)
        let _tnStu = curExam.totalNet, _tnCls = clsVals[clsVals.length-1], _tnIns = insVals[insVals.length-1];
        let _dTC = (_tnStu!==null&&_tnCls!==null)?(_tnStu-_tnCls):null, _dTI = (_tnStu!==null&&_tnIns!==null)?(_tnStu-_tnIns):null;
        let _fmtT = v => v===null?'—':(v>0?'+':'')+v.toFixed(2);
        let _clsT = v => v===null?'':(v>0?'text-success':(v<0?'text-danger':''));
        rowsSE += `<tr class="avg-row" style="font-weight:bold;"><td><strong>Σ</strong></td><td>Toplam Net</td><td>—</td><td>—</td><td><strong>${_tnStu!==null&&_tnStu!==undefined?_tnStu.toFixed(2):'—'}</strong></td><td>${_tnCls!==null?_tnCls.toFixed(2):'—'}</td><td class="${_clsT(_dTC)} font-weight-bold">${_fmtT(_dTC)}</td><td>${_tnIns!==null?_tnIns.toFixed(2):'—'}</td><td class="${_clsT(_dTI)} font-weight-bold">${_fmtT(_dTI)}</td></tr>`;

        let h = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pS','Ogrenci_Tek_Sinav',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
        <div id="pS" class="card shadow-sm">
          <div class="report-header">
            <span style="font-size:16px;"><i class="fas fa-file-alt mr-2"></i><strong>${st.name}</strong> — ${_exLabel} (${curExam.date}${_pubLbl})</span>
            <span style="font-size:13px;">Sınıf: ${st.class}</span>
          </div>
          <div class="card-body" style="padding-top:8px;">
            <div class="single-exam-cards">${cardsHtml}</div>
            ${seExtraCardsHtml}
            ${riskHtml}
            <div class="single-exam-chart-title"><i class="fas fa-chart-bar"></i>Ders Bazlı Net Karşılaştırması</div>
            <div class="chart-box avoid-break" style="height:280px;"><canvas id="cA"></canvas></div>
            ${totalNetTrendCard}
            ${buildSubjectSparklines(no, eT, curExam, subjects)}
            <div class="table-responsive mt-3"><table class="table table-sm table-hover table-bordered" id="tS"><thead><tr><th>#</th><th>Ders</th><th>D</th><th>Y</th><th>Net</th><th>Sınıf Ort.</th><th>Sınıf Fark</th><th>Kurum Ort.</th><th>Kurum Fark</th></tr></thead><tbody>${rowsSE}</tbody></table></div>
          </div>
        </div>`;
        r.innerHTML = h;
        chartTimer = setTimeout(() => {
          c.a = mkChart('cA', barSubjects.map(toTitleCase),[
            {label:'Öğrenci',    data: stuVals, backgroundColor: cols[0]+'cc', borderColor: cols[0], borderWidth: 1.5},
            {label:'Sınıf Ort.', data: clsVals, backgroundColor: cols[2]+'99', borderColor: cols[2], borderWidth: 1.5},
            {label:'Kurum Ort.', data: insVals, backgroundColor: cols[3]+'99', borderColor: cols[3], borderWidth: 1.5}
          ], false);
        }, 100);
        return;

      // ==================== TEK DERS MODU (s_matematik vb.) ====================
      } else if(sb.startsWith('s_')){
        let subjKey = toTitleCase(sb.replace('s_',''));
        let subjLower = sb.replace('s_','');
        let sn = curExam.subs ? curExam.subs[subjLower] || curExam.subs[subjKey] : null;
        let net = sn ? sn.net : null;
        let dog = sn && sn.dogru !== undefined ? sn.dogru : null;
        let yan = sn && sn.yanlis !== undefined ? sn.yanlis : null;
        let bos = (dog !== null && yan !== null && sn.total) ? (sn.total - dog - yan) : null;

        // Sınıf & Kurum ortalamaları
        let _sKey = subjLower;
        let _findSub = (e) => e.subs[_sKey] || e.subs[subjKey] || null;
        let cvNets = DB.e.filter(x => x.date===_seDate && (x.publisher||'')===_sePub && x.examType===eT && x.studentClass===st.class && !x.abs && _findSub(x)).map(x => _findSub(x).net);
        let ivNets = DB.e.filter(x => x.date===_seDate && (x.publisher||'')===_sePub && x.examType===eT && getGrade(x.studentClass)===stGrade && !x.abs && _findSub(x)).map(x => _findSub(x).net);
        let clsA = cvNets.length ? cvNets.reduce((a,b)=>a+b,0)/cvNets.length : null;
        let insA = ivNets.length ? ivNets.reduce((a,b)=>a+b,0)/ivNets.length : null;

        // Z-skoru
        let _std = (arr) => { if(arr.length<2) return null; let m=arr.reduce((a,b)=>a+b,0)/arr.length; let v=arr.reduce((a,b)=>a+(b-m)*(b-m),0)/(arr.length-1); return Math.sqrt(v); };
        let clsStd = _std(cvNets), insStd = _std(ivNets);
        let clsZ = (net!==null && clsA!==null && clsStd && clsStd>0) ? ((net-clsA)/clsStd) : null;
        let insZ = (net!==null && insA!==null && insStd && insStd>0) ? ((net-insA)/insStd) : null;

        // Yüzdelik dilim
        let clsPerc = (net!==null && cvNets.length>1) ? Math.round(cvNets.filter(v=>v<=net).length/cvNets.length*100) : null;
        let insPerc = (net!==null && ivNets.length>1) ? Math.round(ivNets.filter(v=>v<=net).length/ivNets.length*100) : null;

        // Önceki sınavdan fark
        let prevNet = null;
        if(prevExam){
          let _ps = prevExam.subs ? (prevExam.subs[_sKey] || prevExam.subs[subjKey]) : null;
          prevNet = _ps ? _ps.net : null;
        }
        let delta = (net!==null && prevNet!==null) ? (net-prevNet) : null;
        let dSign = delta!==null ? (delta>0?'+':'') : '';
        let dCls = delta===null?'sec-neutral':(delta>0?'sec-pos':(delta<0?'sec-neg':'sec-neutral'));
        let dIcon = delta===null?'fa-minus':(delta>0?'fa-arrow-up':(delta<0?'fa-arrow-down':'fa-minus'));

        // Kartlar
        let card1 = `<div class="col-md-3 col-sm-6"><div class="sec-card">
          <div class="sec-icon"><i class="fas fa-book"></i></div>
          <div class="sec-body"><div class="sec-label">${subjKey} Neti</div>
          <div class="sec-value">${net!==null?net.toFixed(2):'—'}</div>
          <div class="sec-sub">${dog!==null?'D:'+dog+' Y:'+yan+(bos!==null?' B:'+bos:''):'Detay yok'}</div>
          </div></div></div>`;

        let card2 = `<div class="col-md-3 col-sm-6"><div class="sec-card ${dCls}">
          <div class="sec-icon"><i class="fas ${dIcon}"></i></div>
          <div class="sec-body"><div class="sec-label">Önceki Sınava Fark</div>
          <div class="sec-value">${delta!==null?dSign+delta.toFixed(2):'—'} <small style="font-size:0.62em;font-weight:600;color:#6c757d;">net</small></div>
          <div class="sec-sub">${prevNet!==null?'Önceki: '+prevNet.toFixed(2):'Önceki veri yok'}</div>
          </div></div></div>`;

        let _fC = (net!==null&&clsA!==null)?(net-clsA):null;
        let _fI = (net!==null&&insA!==null)?(net-insA):null;
        let _fCs = _fC===null?'sec-neutral':(_fC>0?'sec-pos':(_fC<0?'sec-neg':'sec-neutral'));
        let _fIs = _fI===null?'sec-neutral':(_fI>0?'sec-pos':(_fI<0?'sec-neg':'sec-neutral'));
        let card3 = `<div class="col-md-3 col-sm-6"><div class="sec-card ${_fCs}">
          <div class="sec-icon"><i class="fas fa-users"></i></div>
          <div class="sec-body"><div class="sec-label">Sınıf Karşılaştırma</div>
          <div class="sec-value">${clsA!==null?clsA.toFixed(2):'—'} <small style="font-size:0.62em;font-weight:600;">ort</small></div>
          <div class="sec-sub">Fark: ${_fC!==null?(_fC>0?'+':'')+_fC.toFixed(2):'—'}${clsZ!==null?' · Z: '+clsZ.toFixed(2):''}${clsPerc!==null?' · Top %'+(100-clsPerc):''}</div>
          </div></div></div>`;

        let card4 = `<div class="col-md-3 col-sm-6"><div class="sec-card ${_fIs}">
          <div class="sec-icon"><i class="fas fa-school"></i></div>
          <div class="sec-body"><div class="sec-label">Kurum Karşılaştırma</div>
          <div class="sec-value">${insA!==null?insA.toFixed(2):'—'} <small style="font-size:0.62em;font-weight:600;">ort</small></div>
          <div class="sec-sub">Fark: ${_fI!==null?(_fI>0?'+':'')+_fI.toFixed(2):'—'}${insZ!==null?' · Z: '+insZ.toFixed(2):''}${insPerc!==null?' · Top %'+(100-insPerc):''}</div>
          </div></div></div>`;

        // D/Y/B dağılım barı
        let dybBar = '';
        if(dog!==null && yan!==null && sn.total){
          let pD=Math.round(dog/sn.total*100), pY=Math.round(yan/sn.total*100), pB=100-pD-pY;
          dybBar = `<div class="single-exam-chart-title" style="margin-top:12px;"><i class="fas fa-tasks"></i>Doğru / Yanlış / Boş Dağılımı</div>
          <div style="display:flex;height:28px;border-radius:6px;overflow:hidden;font-size:0.75rem;font-weight:600;margin-bottom:10px;">
            <div style="width:${pD}%;background:#28a745;color:#fff;display:flex;align-items:center;justify-content:center;">${dog} D (${pD}%)</div>
            <div style="width:${pY}%;background:#dc3545;color:#fff;display:flex;align-items:center;justify-content:center;">${yan} Y (${pY}%)</div>
            <div style="width:${pB}%;background:#e9ecef;color:#6c757d;display:flex;align-items:center;justify-content:center;">${bos!==null?bos:'?'} B (${pB}%)</div>
          </div>`;
        }

        // Sadece bu dersin eğilim grafiği
        let trendCard = _buildSingleMetricSparkline(no, eT, curExam, 's_'+_sKey, subjKey+' Neti');

        // Tek ders çubuk grafik (öğrenci vs sınıf vs kurum — sadece bu ders)
        let singleBarHtml = `<div class="single-exam-chart-title"><i class="fas fa-chart-bar"></i>${subjKey} — Karşılaştırma</div>
          <div class="chart-box avoid-break" style="height:220px;"><canvas id="cA"></canvas></div>`;

        let h = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pS','Ogrenci_Ders',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
        <div id="pS" class="card shadow-sm">
          <div class="report-header">
            <span style="font-size:16px;"><i class="fas fa-book-open mr-2"></i><strong>${st.name}</strong> — ${subjKey} (${curExam.date}${_pubLbl})</span>
            <span style="font-size:13px;">Sınıf: ${st.class} | ${_exLabel}</span>
          </div>
          <div class="card-body" style="padding-top:8px;">
            <div class="row">${card1}${card2}${card3}${card4}</div>
            ${dybBar}
            ${singleBarHtml}
            ${trendCard}
          </div>
        </div>`;
        r.innerHTML = h;

        // Trend grafik: bu dersin tüm sınavlardaki neti
        chartTimer = setTimeout(() => {
          let trendExams = ex.filter(e => { let _s = e.subs ? (e.subs[_sKey]||e.subs[subjKey]) : null; return _s && _s.net !== null && _s.net !== undefined; });
          let tLabels = trendExams.map(e => e.publisher ? `${e.date} (${toTitleCase(e.publisher)})` : e.date);
          let tStuData = trendExams.map(e => { let _s = e.subs[_sKey]||e.subs[subjKey]; return _s.net; });
          let tClsData = trendExams.map(e => {
            let cv = DB.e.filter(x => x.date===e.date && (x.publisher||'')===(e.publisher||'') && x.examType===eT && x.studentClass===st.class && !x.abs && _findSub(x)).map(x=>_findSub(x).net);
            return cv.length ? cv.reduce((a,b)=>a+b,0)/cv.length : null;
          });
          let tInsData = trendExams.map(e => {
            let iv = DB.e.filter(x => x.date===e.date && (x.publisher||'')===(e.publisher||'') && x.examType===eT && getGrade(x.studentClass)===stGrade && !x.abs && _findSub(x)).map(x=>_findSub(x).net);
            return iv.length ? iv.reduce((a,b)=>a+b,0)/iv.length : null;
          });
          c.a = mkChart('cA', tLabels,[
            {label:'Öğrenci', data:tStuData, backgroundColor:cols[0]+'cc', borderColor:cols[0], borderWidth:1.5},
            {label:'Sınıf Ort.', data:tClsData, backgroundColor:cols[2]+'99', borderColor:cols[2], borderWidth:1.5},
            {label:'Kurum Ort.', data:tInsData, backgroundColor:cols[3]+'99', borderColor:cols[3], borderWidth:1.5}
          ], false);
        }, 100);
        return;

      // ==================== TOPLAM NET / PUAN / SIRALAMA MODU ====================
      } else {
        let isRank = sb.startsWith('rank_');
        let ls = sb === 'score' ? 'Puan' : (sb === 'rank_c' ? 'Sınıf Sırası' : (sb === 'rank_i' ? 'Kurum Sırası' : (sb === 'rank_g' ? 'Genel Sıra' : 'Toplam Net')));
        let getValSE = (e) => { if(e.abs) return null; if(sb==='score') return e.score; if(sb==='rank_c') return pN(e.cR); if(sb==='rank_i') return pN(e.iR); if(sb==='rank_g') return pN(e.gR); return e.totalNet; };
        let curVal = getValSE(curExam);
        let prevVal = prevExam ? getValSE(prevExam) : null;
        let delta = (curVal!==null && prevVal!==null) ? (isRank ? (prevVal-curVal) : (curVal-prevVal)) : null;
        let dSign = delta!==null ? (delta>0?'+':'') : '';
        let dCls = delta===null?'sec-neutral':(delta>0?'sec-pos':(delta<0?'sec-neg':'sec-neutral'));
        let dIcon = delta===null?'fa-minus':(delta>0?'fa-arrow-up':(delta<0?'fa-arrow-down':'fa-minus'));

        // Sınıf & Kurum ortalamaları
        let cvAll = DB.e.filter(x => x.date===_seDate && (x.publisher||'')===_sePub && x.examType===eT && x.studentClass===st.class && !x.abs).map(getValSE).filter(v=>v!==null);
        let ivAll = DB.e.filter(x => x.date===_seDate && (x.publisher||'')===_sePub && x.examType===eT && getGrade(x.studentClass)===stGrade && !x.abs).map(getValSE).filter(v=>v!==null);
        let clsA = cvAll.length ? cvAll.reduce((a,b)=>a+b,0)/cvAll.length : null;
        let insA = ivAll.length ? ivAll.reduce((a,b)=>a+b,0)/ivAll.length : null;

        let _std = (arr) => { if(arr.length<2) return null; let m=arr.reduce((a,b)=>a+b,0)/arr.length; let v=arr.reduce((a,b)=>a+(b-m)*(b-m),0)/(arr.length-1); return Math.sqrt(v); };
        let clsZ = null, insZ = null;
        if(!isRank && curVal!==null){
          let cs = _std(cvAll), is2 = _std(ivAll);
          clsZ = (clsA!==null&&cs&&cs>0)?((curVal-clsA)/cs):null;
          insZ = (insA!==null&&is2&&is2>0)?((curVal-insA)/is2):null;
        }
        let clsPerc = (!isRank && curVal!==null && cvAll.length>1) ? Math.round(cvAll.filter(v=> (isRank?(v>=curVal):(v<=curVal)) ).length/cvAll.length*100) : null;
        let insPerc = (!isRank && curVal!==null && ivAll.length>1) ? Math.round(ivAll.filter(v=> (isRank?(v>=curVal):(v<=curVal)) ).length/ivAll.length*100) : null;

        let fmtV = v => v===null?'—':(isRank?v:v.toFixed(2));

        let card1 = `<div class="col-md-3 col-sm-6"><div class="sec-card">
          <div class="sec-icon"><i class="fas fa-star"></i></div>
          <div class="sec-body"><div class="sec-label">${ls}</div>
          <div class="sec-value">${fmtV(curVal)}</div>
          <div class="sec-sub">${curExam.date}${_pubLbl}</div>
          </div></div></div>`;

        let card2 = `<div class="col-md-3 col-sm-6"><div class="sec-card ${dCls}">
          <div class="sec-icon"><i class="fas ${dIcon}"></i></div>
          <div class="sec-body"><div class="sec-label">Önceki Sınava Fark</div>
          <div class="sec-value">${delta!==null?dSign+(isRank?delta:delta.toFixed(2)):'—'}</div>
          <div class="sec-sub">${prevVal!==null?'Önceki: '+fmtV(prevVal):'Önceki veri yok'}</div>
          </div></div></div>`;

        let _fC = (!isRank&&curVal!==null&&clsA!==null)?(curVal-clsA):null;
        let _fI = (!isRank&&curVal!==null&&insA!==null)?(curVal-insA):null;
        let _fCs2 = _fC===null?'sec-neutral':(_fC>0?'sec-pos':(_fC<0?'sec-neg':'sec-neutral'));
        let _fIs2 = _fI===null?'sec-neutral':(_fI>0?'sec-pos':(_fI<0?'sec-neg':'sec-neutral'));

        let card3 = `<div class="col-md-3 col-sm-6"><div class="sec-card ${_fCs2}">
          <div class="sec-icon"><i class="fas fa-users"></i></div>
          <div class="sec-body"><div class="sec-label">Sınıf ${isRank?'Sıra':'Karşılaştırma'}</div>
          <div class="sec-value">${clsA!==null?fmtV(clsA):'—'} <small style="font-size:0.62em;font-weight:600;">ort</small></div>
          <div class="sec-sub">${!isRank&&_fC!==null?'Fark: '+(_fC>0?'+':'')+_fC.toFixed(2):''}${clsZ!==null?' · Z: '+clsZ.toFixed(2):''}${clsPerc!==null?' · Top %'+(100-clsPerc):''}</div>
          </div></div></div>`;

        let card4 = `<div class="col-md-3 col-sm-6"><div class="sec-card ${_fIs2}">
          <div class="sec-icon"><i class="fas fa-school"></i></div>
          <div class="sec-body"><div class="sec-label">Kurum ${isRank?'Sıra':'Karşılaştırma'}</div>
          <div class="sec-value">${insA!==null?fmtV(insA):'—'} <small style="font-size:0.62em;font-weight:600;">ort</small></div>
          <div class="sec-sub">${!isRank&&_fI!==null?'Fark: '+(_fI>0?'+':'')+_fI.toFixed(2):''}${insZ!==null?' · Z: '+insZ.toFixed(2):''}${insPerc!==null?' · Top %'+(100-insPerc):''}</div>
          </div></div></div>`;

        let trendCard = _buildSingleMetricSparkline(no, eT, curExam, sb, ls);

        let h = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pS','Ogrenci_Veri',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
        <div id="pS" class="card shadow-sm">
          <div class="report-header">
            <span style="font-size:16px;"><i class="fas fa-chart-line mr-2"></i><strong>${st.name}</strong> — ${ls} (${curExam.date}${_pubLbl})</span>
            <span style="font-size:13px;">Sınıf: ${st.class} | ${_exLabel}</span>
          </div>
          <div class="card-body" style="padding-top:8px;">
            <div class="row">${card1}${card2}${card3}${card4}</div>
            <div class="single-exam-chart-title"><i class="fas fa-chart-line"></i>${ls} — Sınav Trend</div>
            <div class="chart-box avoid-break" style="height:280px;"><canvas id="cA"></canvas></div>
            ${trendCard}
          </div>
        </div>`;
        r.innerHTML = h;

        chartTimer = setTimeout(() => {
          let tLabels = ex.map(e => e.publisher ? `${e.date} (${toTitleCase(e.publisher)})` : e.date);
          let tData = ex.map(getValSE);
          let datasets =[{label:ls, data:tData, backgroundColor:cols[0]+'cc', borderColor:cols[0], borderWidth:1.5}];
          if(!isRank){
            let tCls = ex.map(e => { let cv=DB.e.filter(x=>x.date===e.date&&(x.publisher||'')===(e.publisher||'')&&x.examType===eT&&x.studentClass===st.class&&!x.abs).map(getValSE).filter(v=>v!==null); return cv.length?cv.reduce((a,b)=>a+b,0)/cv.length:null; });
            let tIns = ex.map(e => { let iv=DB.e.filter(x=>x.date===e.date&&(x.publisher||'')===(e.publisher||'')&&x.examType===eT&&getGrade(x.studentClass)===stGrade&&!x.abs).map(getValSE).filter(v=>v!==null); return iv.length?iv.reduce((a,b)=>a+b,0)/iv.length:null; });
            datasets.push({label:'Sınıf Ort.', data:tCls, backgroundColor:cols[2]+'99', borderColor:cols[2], borderWidth:1.5});
            datasets.push({label:'Kurum Ort.', data:tIns, backgroundColor:cols[3]+'99', borderColor:cols[3], borderWidth:1.5});
          }
          c.a = mkChart('cA', tLabels, datasets, isRank);
        }, 100);
        return;
      }
    }
    // === TÜM SINAVLAR MODU ===
    let dD=[],clsArr=[],instArr=[],rows='';
    
    let isRank = sb.startsWith('rank_');
    let ls = sb === 'score' ? 'Puan' : (sb === 'rank_c' ? 'Sınıf Sırası' : (sb === 'rank_i' ? 'Kurum Sırası' : (sb === 'rank_g' ? 'Genel Sıra' : (sb === 'totalNet' || !sb ? 'Toplam Net' : toTitleCase(sb.replace('s_','')) + ' Neti'))));
    let valHeader = isRank ? 'Sıra' : (sb === 'score' ? 'Puan' : 'Net');
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

    // sb'ye göre görünen metrik etiketi — istatistik kartlarında ve trend bloğunda kullanılır
    let _metricLabel = sb === 'score' ? 'Puan'
                     : sb.startsWith('s_') ? toTitleCase(sb.replace('s_','')) + ' Neti'
                     : 'Net'; // totalNet ve boş için

    let karneCardsHtml = '';
    let stuRiskHtml = '';
    if(!isRank) {
      try {
        // calcKarneSummaryCards artık sb parametresi alıyor; seçilen metriği kullanır
        let _summary = calcKarneSummaryCards(no, eT, stGrade, ex, sb);
        if(_summary) {
          karneCardsHtml = buildKarneExamCards(_summary, eT, _metricLabel);
        }
      } catch(e){ console.error('[rAnl karneCards]', e); }
      try { stuRiskHtml = buildRiskInfoCards(no, eT, st.class) || ''; } catch(e){ stuRiskHtml = ''; }
    }

    let perfHtml = '';
    if(isRank && dDValid.length > 0) {
      // Sıralama modunda En İyi / En Kötü / Ortalama Sıra kartları (karneCardsHtml boş olduğu için bunlar gösterilir)
      let bestRank = Math.min(...dDValid);
      let worstRank = Math.max(...dDValid);
      let avgRank = Math.round(dDValid.reduce((a,b)=>a+b,0)/dDValid.length);
      let gradeExamKeys2 = new Set();
      DB.e.forEach(x => { if(x.examType===eT && getGrade(x.studentClass)===stGrade) gradeExamKeys2.add(x.date+'||'+(x.publisher||'')); });
      let totalGradeExams2 = gradeExamKeys2.size;
      let attendedKeys2 = new Set();
      DB.e.forEach(x => { if(x.studentNo===no && x.examType===eT && !x.abs) attendedKeys2.add(x.date+'||'+(x.publisher||'')); });
      let attendedCnt2 = attendedKeys2.size;
      let partRate2 = totalGradeExams2 > 0 ? Math.max(0, Math.min(100, Math.round(attendedCnt2 / totalGradeExams2 * 100))) : 0;
      perfHtml = `<div class="row mt-3 mb-2">
        <div class="col-md-3 col-sm-6"><div class="sec-card sec-pos"><div class="sec-icon"><i class="fas fa-trophy"></i></div><div class="sec-body"><div class="sec-label">En İyi Sıra</div><div class="sec-value">${bestRank}</div><div class="sec-sub">Düşük = daha iyi</div></div></div></div>
        <div class="col-md-3 col-sm-6"><div class="sec-card sec-neg"><div class="sec-icon"><i class="fas fa-arrow-down"></i></div><div class="sec-body"><div class="sec-label">En Kötü Sıra</div><div class="sec-value">${worstRank}</div></div></div></div>
        <div class="col-md-3 col-sm-6"><div class="sec-card"><div class="sec-icon"><i class="fas fa-balance-scale"></i></div><div class="sec-body"><div class="sec-label">Ortalama Sıra</div><div class="sec-value">${avgRank}</div></div></div></div>
        <div class="col-md-3 col-sm-6"><div class="sec-card"><div class="sec-icon"><i class="fas fa-percentage"></i></div><div class="sec-body"><div class="sec-label">Katılım</div><div class="sec-value">${partRate2}%</div><div class="sec-sub">${attendedCnt2}/${totalGradeExams2} Sınav</div></div></div></div>
      </div>`;
    }

    let h=`<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pS','Ogrenci_Analizi',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
    <div id="pS" class="card shadow-sm" style="border-top:3px solid #17a2b8;">
      <div class="report-header">
        <span style="font-size:16px;"><i class="fas fa-chart-line mr-2"></i><strong>${st.name}</strong> — Analiz (${ls})</span>
        <span style="font-size:13px;">Sınıf: ${st.class} | ${eT}</span>
      </div>
      <div class="card-body" style="padding-top:5px;">
        ${karneCardsHtml}${stuRiskHtml}${perfHtml}
        <div id="stuBoxPlotArea"></div>
        <div class="table-responsive"><table class="table table-sm table-hover table-bordered" id="tS"><thead><tr><th>#</th><th>Tarih</th><th>Yayınevi</th><th>${valHeader}</th><th>Değişim</th></tr></thead><tbody>${rows}${avgRowHtml}</tbody></table></div>
        <div class="chart-box avoid-break" style="margin-top:10px;"><canvas id="cA"></canvas></div>
      </div>
    </div>`;
    r.innerHTML=h;
    
    chartTimer=setTimeout(()=>{ 
      let chartLabels = ex.map(e => e.publisher ? `${e.date} (${toTitleCase(e.publisher)})` : e.date);
      let datasets =[{label:`Öğrenci ${ls}`,data:dD,backgroundColor:cols[0]+'cc',borderColor:cols[0],borderWidth:1.5}];
      if(!isRank){ datasets.push({label:'Sınıf Ort.',data:clsArr,backgroundColor:cols[2]+'99',borderColor:cols[2],borderWidth:1.5}); datasets.push({label:'Kurum Ort. ('+stGrade+'.Sınıf)',data:instArr,backgroundColor:cols[3]+'99',borderColor:cols[3],borderWidth:1.5}); }
      c.a=mkChart('cA',chartLabels,datasets,isRank);
      if(!isRank && dDValid.length >= 10) {
        let bpArea = getEl('stuBoxPlotArea');
        if(bpArea) bpArea.innerHTML = buildStuBoxPlots(no, eT, st.class, stGrade, sb);
      }
    },100);

  }else if(aT==='class'){
    let l=getEl('aLvl').value, b=getBrVal(), dateFilter = getEl('aDate') ? getEl('aDate').value : '';
    let ex=DB.e.filter(x=>{
      if(x.examType!==eT||x.abs) return false;
      let m=x.studentClass.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m) return false;
      if(l&&l!==m[1]) return false;
      if(b&&b!==m[2].toLocaleUpperCase('tr-TR')) return false;
      return true;
    }), d={};
    ex.forEach(e=>{ 
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
    let showCompCards = false;
    if(sortedClasses.length > 0 && allVals.length > 0) {
      let topCls = sortedClasses.map(clsName => { let cv = ex.filter(x=>x.studentClass===clsName).map(x=>{ if(sb==='score')return x.score; if(sb==='totalNet'||!sb)return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net||0; }); return {cls: clsName, avg: cv.length?(cv.reduce((a,b)=>a+b,0)/cv.length):0, count: cv.length}; }).sort((a,b)=>b.avg-a.avg);
      let best = topCls[0], worst = topCls[topCls.length-1], genAvgPerf = allVals.reduce((a,b)=>a+b,0)/allVals.length, aboveAvg = topCls.filter(x=>x.avg >= genAvgPerf).length;
      showCompCards = topCls.length > 1;
      
      let eligibleStus = DB.s.filter(s => { let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m) return false; if((l&&l!==m[1])||(b&&b!==m[2].toLocaleUpperCase('tr-TR'))) return false; return true; });
      let examGradeMap = {}; 
      Object.values(EXAM_META).forEach(m => {
        if(m.examType !== eT) return;
        if(dateFilter && m.date !== dateFilter) return;
        let key = m.date + '||' + (m.publisher || '');
        if(!examGradeMap[key]) examGradeMap[key] = { grades:new Set(), date:m.date, publisher:m.publisher||'' };
        let gs = (m.grades && m.grades.length) ? m.grades : ['*'];
        gs.forEach(g => examGradeMap[key].grades.add(g));
      });
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

      // Cohen's d — en iyi şube vs en düşük şube (yalnızca >=2 şube + ≥2 sınav modunda).
      // Ham kayıt yerine öğrenci başına ortalama kullanılır:
      //   Ham kayıtlar her sınavı ayrı gözlem sayar → büyük n/küçük n şubeler
      //   arasında yapay varyans farkı oluşur (sınav sayısı Cohen's d'yi etkiler).
      //   Öğrenci başına ortalama, ölçeği eşitler ve gerçek grup farkını yansıtır.
      // Minimum n≥10 öğrenci: küçük örneklemlerde Cohen's d güvenilir değildir
      //   (SE büyür, d kolayca ±∞ alır). 10 öğrenci APA'nın önerdiği alt sınırdır.
      let cohenHtml = '';
      if(showCompCards && sd.length >= 2) {
        // En iyi ve en düşük şubede her öğrencinin ortalamasını hesapla
        let _stuAvgsForCls = (cls) => {
          let map = {};
          ex.filter(x=>x.studentClass===cls).forEach(x=>{
            let v; if(sb==='score') v=x.score; else if(sb==='totalNet'||!sb) v=x.totalNet; else v=x.subs[toTitleCase(sb.replace('s_',''))]?.net||0;
            if(!map[x.studentNo]) map[x.studentNo]=[];
            map[x.studentNo].push(v);
          });
          return Object.values(map).map(arr=>arr.reduce((a,b)=>a+b,0)/arr.length);
        };
        let bestVals  = _stuAvgsForCls(best.cls);
        let worstVals = _stuAvgsForCls(worst.cls);
        // n≥10 koşulu: az öğrencili şubede Cohen's d güvenilir değil
        if(bestVals.length >= 10 && worstVals.length >= 10) {
          let d = _statCohenD(bestVals, worstVals);
          if(d !== null && isFinite(d)) {
            let lab = _cohenLabel(d);
            let dColor = Math.abs(d) >= 0.8 ? '#dc3545' : (Math.abs(d) >= 0.5 ? '#fd7e14' : (Math.abs(d) >= 0.2 ? '#ffc107' : '#6c757d'));
            cohenHtml = `<div class="col-md-6 col-lg flex-fill mb-2"><div class="sec-card h-100"><div class="sec-icon"><i class="fas fa-balance-scale"></i></div><div class="sec-body"><div class="sec-label">Şubeler Arası Etki Büyüklüğü</div><div class="sec-value" style="color:${dColor};">d = ${d.toFixed(2)}</div><div class="sec-sub">${lab} fark (${best.cls} vs ${worst.cls})</div>${_explain("Cohen's d: iki şube arasındaki başarı farkının pratik büyüklüğü. 0.2 küçük, 0.5 orta, 0.8+ büyük.")}</div></div></div>`;
          }
        }
      }

      // 1-E: Tek sınav + tek şube — bağlam kartları (şube ort., kurum ort., fark)
      let singleExamSingleBranchHtml = '';
      if(dateFilter && !showCompCards && sortedClasses.length === 1) {
        let _brAvg = topCls[0].avg;
        let _instValsForDate = (lvlForAvg ? DB.e.filter(x=>x.examType===eT&&!x.abs&&x.date===dateFilter&&getGrade(x.studentClass)===lvlForAvg) : DB.e.filter(x=>x.examType===eT&&!x.abs&&x.date===dateFilter))
          .map(x=>{ if(sb==='score')return x.score; if(sb==='totalNet'||!sb)return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net||0; });
        let _instAvg = _instValsForDate.length ? _instValsForDate.reduce((a,b)=>a+b,0)/_instValsForDate.length : null;
        let _delta = (_instAvg!==null) ? (_brAvg - _instAvg) : null;
        let _dCls = _delta===null?'sec-neutral':(_delta>0?'sec-pos':(_delta<0?'sec-neg':'sec-neutral'));
        let _dSign = _delta!==null?(_delta>0?'+':''):'';
        singleExamSingleBranchHtml = `<div class="row mb-3">
          <div class="col-md-4 flex-fill mb-2"><div class="sec-card h-100"><div class="sec-icon"><i class="fas fa-school"></i></div><div class="sec-body"><div class="sec-label">Şube Ortalaması</div><div class="sec-value">${_brAvg.toFixed(2)}</div><div class="sec-sub">${sortedClasses[0]} · ${ls}</div></div></div></div>
          ${_instAvg!==null?`<div class="col-md-4 flex-fill mb-2"><div class="sec-card h-100"><div class="sec-icon"><i class="fas fa-building"></i></div><div class="sec-body"><div class="sec-label">Kurum Ortalaması</div><div class="sec-value">${_instAvg.toFixed(2)}</div><div class="sec-sub">${lvlForAvg?lvlForAvg+'. Sınıflar':''} · ${_instValsForDate.length} kayıt</div></div></div></div>`:''}
          ${_delta!==null?`<div class="col-md-4 flex-fill mb-2"><div class="sec-card ${_dCls} h-100"><div class="sec-icon"><i class="fas fa-exchange-alt"></i></div><div class="sec-body"><div class="sec-label">Şube − Kurum Farkı</div><div class="sec-value">${_dSign}${_delta.toFixed(2)}</div><div class="sec-sub">${_delta>0?'Kurum üstünde':'Kurum altında'}</div></div></div></div>`:''}
        </div>`;
      }

      clsPerfHtml = `<div class="row mb-3">
        ${singleExamSingleBranchHtml ? singleExamSingleBranchHtml : `
        ${showCompCards ? `
        <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card sec-pos h-100"><div class="sec-icon"><i class="fas fa-trophy"></i></div><div class="sec-body"><div class="sec-label">En İyi Sınıf</div><div class="sec-value">${best.cls}</div><div class="sec-sub">Ort: ${best.avg.toFixed(2)}</div></div></div></div>
        <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card sec-neg h-100"><div class="sec-icon"><i class="fas fa-exclamation-circle"></i></div><div class="sec-body"><div class="sec-label">En Düşük Sınıf</div><div class="sec-value">${worst.cls}</div><div class="sec-sub">Ort: ${worst.avg.toFixed(2)}</div></div></div></div>
        ` : ''}
        <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card h-100"><div class="sec-icon"><i class="fas fa-calculator"></i></div><div class="sec-body"><div class="sec-label">Kurum Ort. (${lvlLabel})</div><div class="sec-value">${genAvgPerf.toFixed(2)}</div></div></div></div>
        ${showCompCards ? `
        <div class="col-md-6 col-lg flex-fill mb-2"><div class="sec-card h-100"><div class="sec-icon"><i class="fas fa-star"></i></div><div class="sec-body"><div class="sec-label">Ort. Üstü Sınıf</div><div class="sec-value">${aboveAvg} / ${topCls.length}</div></div></div></div>
        ` : ''}
        <div class="col-md-6 col-lg flex-fill mb-2"><div class="sec-card sec-neutral h-100"><div class="sec-icon"><i class="fas fa-users"></i></div><div class="sec-body"><div class="sec-label">Katılım Oranı</div><div class="sec-value">%${partRate}</div><div class="sec-sub">${attendedCount} / ${baseCount} Katılım</div></div></div></div>
        ${cohenHtml}
        `}
      </div>`;
    }
    
    let stuRankMap = {};
    ex.forEach(e => {
      // BUG DÜZELTMESİ: tek sınav seçildiğinde (dateFilter) En İyi/Düşük 5
      // yalnızca o sınavın verilerini yansıtmalı; aksi hâlde tüm sınavların
      // ortalamasına göre sıralama yapılır ve seçilen sınavla tutarsız sonuç çıkar.
      if(dateFilter && e.date !== dateFilter) return;
      let stu = getStuMap().get(e.studentNo);
      if(!stu) return; 
      let m = stu.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/);
      if(!m) return;
      if((l && l !== m[1]) || (b && b !== m[2].toLocaleUpperCase('tr-TR'))) return;
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

    // 1-D: Tek şube - ilerleme/gerileme kartları (showCompCards=false olsa bile gösterilir)
    let progressRegressionHtml = '';
    if(!showCompCards && sd.length >= 2) {
      // Her öğrencinin sınav serisi üzerinden regresyon eğimi hesapla
      let _stuSeriesMap = {};
      sd.forEach(dt => {
        (d[dt]||[]).forEach(e => {
          let _stu = getStuMap().get(e.studentNo); if(!_stu) return;
          if(!_stuSeriesMap[e.studentNo]) _stuSeriesMap[e.studentNo] = { name: _stu.name, cls: _stu.class, scores: [] };
          let _v;
          if(sb==='score') _v=e.score;
          else if(sb==='totalNet'||!sb) _v=e.totalNet;
          else { let _sk=toTitleCase(sb.replace('s_','')); _v=(e.subs&&e.subs[_sk]!==undefined)?e.subs[_sk].net:null; }
          if(_v!==null && _v!==undefined) _stuSeriesMap[e.studentNo].scores.push(_v);
        });
      });
      let _slopeArr = Object.entries(_stuSeriesMap)
        .filter(([,s]) => s.scores.length >= 2)
        .map(([no2,s]) => ({ no: no2, name: s.name, cls: s.cls, slope: linRegSlope(s.scores), cnt: s.scores.length }));
      _slopeArr.sort((a,b) => b.slope - a.slope);
      let _bestProg  = _slopeArr.length > 0 && _slopeArr[0].slope > 0 ? _slopeArr[0] : null;
      let _worstProg = _slopeArr.length > 0 && _slopeArr[_slopeArr.length-1].slope < 0 ? _slopeArr[_slopeArr.length-1] : null;
      if(_bestProg || _worstProg) {
        progressRegressionHtml = `<div class="row mb-3">
          ${_bestProg ? `<div class="col-md-6 mb-2"><div class="sec-card sec-pos h-100"><div class="sec-icon"><i class="fas fa-rocket"></i></div><div class="sec-body"><div class="sec-label">En Fazla İlerleme</div><div class="sec-value" style="font-size:1.05em;">${_bestProg.name} <small>(${_bestProg.cls})</small></div><div class="sec-sub">Sınav başına +${_bestProg.slope.toFixed(2)} · ${_bestProg.cnt} sınav</div></div></div></div>` : ''}
          ${_worstProg ? `<div class="col-md-6 mb-2"><div class="sec-card sec-neg h-100"><div class="sec-icon"><i class="fas fa-level-down-alt"></i></div><div class="sec-body"><div class="sec-label">En Fazla Gerileme</div><div class="sec-value" style="font-size:1.05em;">${_worstProg.name} <small>(${_worstProg.cls})</small></div><div class="sec-sub">Sınav başına ${_worstProg.slope.toFixed(2)} · ${_worstProg.cnt} sınav</div></div></div></div>` : ''}
        </div>`;
      }
    }

    let clsTrendHtml = '';
    if(sd.length >= 2) {
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

        let ssRawVals = sd.flatMap(dt => (d[dt]||[]).map(x => { if(sb==='score') return x.score; if(sb==='totalNet'||!sb) return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net||0; }));
        // Örneklem standart sapması (n-1 paydası) — grup heterojenliği için doğru ölçü.
        // Popülasyon σ (n paydası) örneklem varyansını sistematik olarak küçümser.
        let ssMean = ssRawVals.length ? ssRawVals.reduce((a,b)=>a+b,0)/ssRawVals.length : 0;
        let ssVal  = _statStd(ssRawVals) || 0;
        let _clsAvgsForMM = sortedClasses.map(clsName => {
          let vals = sd.flatMap(dt => (d[dt]||[]).filter(x=>x.studentClass===clsName).map(x=>{ if(sb==='score')return x.score; if(sb==='totalNet'||!sb)return x.totalNet; return x.subs[toTitleCase(sb.replace('s_',''))]?.net||0; }));
          return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
        }).filter(v=>v!==null);
        let mmDiff = _clsAvgsForMM.length > 1 ? Math.max(..._clsAvgsForMM) - Math.min(..._clsAvgsForMM) : null;

        let _consistencyLabelC = (function(){ let cv = ssMean!==0 ? Math.abs(ssVal/ssMean)*100 : 0; return cv<10?'Çok homojen':(cv<20?'Homojen':(cv<35?'Heterojen':'Çok heterojen')); })();
        // R² — sınıf trend güvenilirliği (adaptif eşik)
        let clsTR2    = linRegR2(dateAvgSeries);
        let clsTR2Thr = _adaptiveR2(dateAvgSeries.length);
        let clsTR2Lab = clsTR2 >= 0.65 ? 'Güçlü trend' : (clsTR2 >= clsTR2Thr ? 'Orta trend' : 'Zayıf trend');
        let clsTR2Col = clsTR2 >= 0.65 ? '#28a745'     : (clsTR2 >= clsTR2Thr ? '#fd7e14'   : '#dc3545');

        clsTrendHtml = `<div class="trend-card mb-3"><div class="row align-items-center">
          <div class="col-6 col-md-2 text-center mb-2 mb-md-0" title="Sınıf ortalamasının zaman içindeki yönü">
            <span class="trend-indicator ${clsTClass}"><i class="fas ${clsTIcon} mr-1"></i>${clsTText}</span>
            <div class="mt-2 small text-muted"><strong>Genel Eğilim</strong></div>
            <div class="x-small text-muted">Sınıf ortalamasının yönü</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0" title="İlk sınavdan son sınava ortalamadaki net değişim (regresyon)">
            <div style="font-size:1.4em;font-weight:bold;color:${clsTColor};">${clsTSign}${clsTTotal.toFixed(2)}</div>
            <div class="small text-muted"><strong>Toplam Net Değişimi</strong></div>
            <div class="x-small text-muted">Süreç Boyunca</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0" title="Her yeni sınavda beklenen ortalama değişim">
            <div style="font-size:1.4em;font-weight:bold;color:${clsTColor};">${clsSSign}${clsTSlope.toFixed(2)}</div>
            <div class="small text-muted"><strong>Sınav Başına Değişim</strong></div>
            <div class="x-small text-muted">(Regresyon Analizi)</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0" title="Analize dahil edilen toplam sınav sayısı">
            <div style="font-size:1.4em;font-weight:bold;">${dateAvgSeries.length}</div>
            <div class="small text-muted"><strong>Sınav Sayısı</strong></div>
            <div class="x-small text-muted">Trend hesabına dahil</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0" title="Öğrencilerin ortalama etrafındaki dağılımı (örneklem standart sapması, n-1). Düşük = homojen sınıf.">
            <div style="font-size:1.4em;font-weight:bold;color:#6f42c1;">±${ssVal.toFixed(2)}</div>
            <div class="small text-muted"><strong>Sınıf İçi Dağılım</strong></div>
            <div class="x-small text-muted">${_consistencyLabelC}</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0" title="En yüksek ortalamalı sınıf ile en düşük arasındaki fark">
            <div style="font-size:1.4em;font-weight:bold;color:#fd7e14;">${mmDiff !== null ? mmDiff.toFixed(2) : '—'}</div>
            <div class="small text-muted"><strong>Şubeler Arası Fark</strong></div>
            <div class="x-small text-muted">En iyi − en düşük şube</div>
          </div>
        </div>
        <div class="row mt-2 pt-2 border-top">
          <div class="col-12 text-center" title="R² (determinasyon katsayısı): 1'e yakınsa trend veriye iyi uyuyor, 0'a yakınsa gürültülü. Adaptif eşik: n=${dateAvgSeries.length} sınav için min R²=${clsTR2Thr.toFixed(2)}.">
            <span class="x-small text-muted">Trend Güvenilirliği (R²):&nbsp;</span>
            <strong style="font-size:0.9em; color:${clsTR2Col};">${clsTR2.toFixed(2)}</strong>
            <span class="x-small text-muted ml-1">— ${clsTR2Lab}</span>
          </div>
        </div>
        </div>`;
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
        ${progressRegressionHtml}
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
      let clsBPArea = getEl('clsBoxPlotArea');
      let totalExamsOfType = new Set(Object.values(EXAM_META).filter(m => m.examType === eT).map(m => m.date)).size;
      if(clsBPArea && totalExamsOfType >= 10) {
        let classDataMap = {};
        let lvlForBP = l || (ex.length > 0 ? getGrade(ex[0].studentClass) : '');
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
      if(!allStudentStats[e.studentNo]) { let stuName = getStuMap().get(e.studentNo)?.name || '—'; allStudentStats[e.studentNo] = { no: e.studentNo, name: stuName, cls: cls, totalNet: 0, count: 0, nets: [] }; }
      allStudentStats[e.studentNo].totalNet += e.subs[toTitleCase(subj)].net; allStudentStats[e.studentNo].count++; allStudentStats[e.studentNo].nets.push(e.subs[toTitleCase(subj)].net);
    });
    
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
    
    let eligibleStusS = DB.s.filter(s => { let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m) return false; if(lvl && m[1] !== lvl) return false; if(br && m[2].toLocaleUpperCase('tr-TR') !== br) return false; return true; });
    let subjLower = subj.toLocaleLowerCase('tr-TR');
    let subjExamGradeMap = {};
    Object.values(EXAM_META).forEach(m => {
      if(m.examType !== eT) return;
      if(dateFilterS && m.date !== dateFilterS) return;
      if(!m.subjects || !m.subjects.map(s=>s.toLocaleLowerCase('tr-TR')).includes(subjLower)) return;
      let key = m.date + '||' + (m.publisher || '');
      if(!subjExamGradeMap[key]) subjExamGradeMap[key] = { grades:new Set() };
      let gs = (m.grades && m.grades.length) ? m.grades :['*'];
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

    let subjTrendHtml = '';
    if(dates.length >= _TREND_MIN_N) {
      let subjDateAvgSeries = dates.map(dt => {
        let vals = dateGroups[dt].map(e => e.subs[toTitleCase(subj)].net);
        return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      }).filter(v => v !== null);

      if(subjDateAvgSeries.length >= _TREND_MIN_N) {
        let subjSlope    = linRegSlope(subjDateAvgSeries);
        let subjTotal    = subjSlope * (subjDateAvgSeries.length - 1);
        let subjImproving = subjSlope > 0, subjWorsening = subjSlope < 0;
        let subjTClass  = subjImproving ? 'trend-up' : (subjWorsening ? 'trend-down' : 'trend-stable');
        let subjTIcon   = subjImproving ? 'fa-arrow-up' : (subjWorsening ? 'fa-arrow-down' : 'fa-minus');
        let subjTText   = subjImproving ? 'Yükseliş' : (subjWorsening ? 'Düşüş' : 'Sabit');
        let subjTColor  = subjImproving ? '#28a745' : (subjWorsening ? '#dc3545' : '#6c757d');
        let subjTSign   = subjTotal > 0 ? '+' : '';
        let subjSSign   = subjSlope > 0 ? '+' : '';

        let subjAllNets = ex.map(e => e.subs[toTitleCase(subj)].net);
        let subjMean    = subjAllNets.reduce((a,b)=>a+b,0)/subjAllNets.length;
        // Örneklem standart sapması (n-1 paydası) — öğrenci heterojenliği için doğru ölçü.
        let subjSS      = _statStd(subjAllNets) || 0;
        let subjClsAvgs = clsArr.map(c=>c.avg);
        let subjMMDiff  = subjClsAvgs.length > 1 ? Math.max(...subjClsAvgs) - Math.min(...subjClsAvgs) : null;

        let _consistencyLabelS = (function(){ let cv = subjMean!==0 ? Math.abs(subjSS/subjMean)*100 : 0; return cv<10?'Çok homojen':(cv<20?'Homojen':(cv<35?'Heterojen':'Çok heterojen')); })();
        // R² — ders trend güvenilirliği (adaptif eşik)
        let subjR2    = linRegR2(subjDateAvgSeries);
        let subjR2Thr = _adaptiveR2(subjDateAvgSeries.length);
        let subjR2Lab = subjR2 >= 0.65 ? 'Güçlü trend' : (subjR2 >= subjR2Thr ? 'Orta trend' : 'Zayıf trend');
        let subjR2Col = subjR2 >= 0.65 ? '#28a745'     : (subjR2 >= subjR2Thr ? '#fd7e14'   : '#dc3545');

        subjTrendHtml = `<div class="trend-card mb-3"><div class="row align-items-center">
          <div class="col-6 col-md-2 text-center mb-2 mb-md-0" title="Bu dersin ortalamasının zaman içindeki yönü">
            <span class="trend-indicator ${subjTClass}"><i class="fas ${subjTIcon} mr-1"></i>${subjTText}</span>
            <div class="mt-2 small text-muted"><strong>Genel Eğilim</strong></div>
            <div class="x-small text-muted">Ders ortalamasının yönü</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0" title="İlk sınavdan son sınava ders ortalamasındaki değişim (regresyon)">
            <div style="font-size:1.4em;font-weight:bold;color:${subjTColor};">${subjTSign}${subjTotal.toFixed(2)}</div>
            <div class="small text-muted"><strong>Toplam Net Değişimi</strong></div>
            <div class="x-small text-muted">Süreç Boyunca</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0" title="Her yeni sınavda derste beklenen değişim">
            <div style="font-size:1.4em;font-weight:bold;color:${subjTColor};">${subjSSign}${subjSlope.toFixed(2)}</div>
            <div class="small text-muted"><strong>Sınav Başına Değişim</strong></div>
            <div class="x-small text-muted">(Regresyon Analizi)</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0" title="Trend hesabına dahil edilen toplam sınav sayısı">
            <div style="font-size:1.4em;font-weight:bold;">${subjDateAvgSeries.length}</div>
            <div class="small text-muted"><strong>Sınav Sayısı</strong></div>
            <div class="x-small text-muted">Bu dersi içeren sınavlar</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0" title="Öğrenci netlerinin ortalama etrafındaki dağılımı (örneklem standart sapması, n-1)">
            <div style="font-size:1.4em;font-weight:bold;color:#6f42c1;">±${subjSS.toFixed(2)}</div>
            <div class="small text-muted"><strong>Öğrenciler Arası Dağılım</strong></div>
            <div class="x-small text-muted">${_consistencyLabelS}</div>
          </div>
          <div class="col-6 col-md-2 text-center border-left mb-2 mb-md-0" title="Bu derste en yüksek ve en düşük sınıf ortalaması arasındaki fark">
            <div style="font-size:1.4em;font-weight:bold;color:#fd7e14;">${subjMMDiff !== null ? subjMMDiff.toFixed(2) : '—'}</div>
            <div class="small text-muted"><strong>Sınıflar Arası Fark</strong></div>
            <div class="x-small text-muted">En iyi − en düşük sınıf</div>
          </div>
        </div>
        <div class="row mt-2 pt-2 border-top">
          <div class="col-12 text-center" title="R² (determinasyon katsayısı): 1'e yakınsa ders trendi güçlü, 0'a yakınsa gürültülü. Adaptif eşik: n=${subjDateAvgSeries.length} sınav için min R²=${subjR2Thr.toFixed(2)}.">
            <span class="x-small text-muted">Trend Güvenilirliği (R²):&nbsp;</span>
            <strong style="font-size:0.9em; color:${subjR2Col};">${subjR2.toFixed(2)}</strong>
            <span class="x-small text-muted ml-1">— ${subjR2Lab}</span>
          </div>
        </div>
        </div>`;
      }
    }

    // Ders Analizi Cohen's d — en iyi şube vs en düşük şube (n≥10 öğrenci koşulu).
    // Pedagojik gerekçe: tek bir derste iki şubenin performans farkının "pratik büyüklüğünü"
    // gösterir. Sadece ortalama farkı değil, varyansla normalize edilmiş etki büyüklüğü.
    let subjCohenHtml = '';
    if(clsArr.length >= 2) {
      let subjBestCls  = clsArr[0].cls;
      let subjWorstCls = clsArr[clsArr.length - 1].cls;
      let _subjStuAvgs = (cls) => {
        let map = {};
        ex.filter(e => e.studentClass === cls).forEach(e => {
          if(!map[e.studentNo]) map[e.studentNo] = [];
          map[e.studentNo].push(e.subs[toTitleCase(subj)].net);
        });
        return Object.values(map).map(arr => arr.reduce((a,b)=>a+b,0)/arr.length);
      };
      let subjBestVals  = _subjStuAvgs(subjBestCls);
      let subjWorstVals = _subjStuAvgs(subjWorstCls);
      if(subjBestVals.length >= 10 && subjWorstVals.length >= 10) {
        let subjD = _statCohenD(subjBestVals, subjWorstVals);
        if(subjD !== null && isFinite(subjD)) {
          let subjDLab = _cohenLabel(subjD);
          let subjDCol = Math.abs(subjD) >= 0.8 ? '#dc3545' : (Math.abs(subjD) >= 0.5 ? '#fd7e14' : (Math.abs(subjD) >= 0.2 ? '#ffc107' : '#6c757d'));
          subjCohenHtml = `<div class="row mb-2">
            <div class="col-12">
              <div class="sec-card"><div class="sec-icon"><i class="fas fa-balance-scale"></i></div><div class="sec-body">
                <div class="sec-label">Şubeler Arası Etki Büyüklüğü (Cohen's d)</div>
                <div class="sec-value" style="color:${subjDCol};">d = ${subjD.toFixed(2)}</div>
                <div class="sec-sub">${subjDLab} fark — ${subjBestCls} vs ${subjWorstCls} (bu derste)</div>
                ${_explain("Cohen's d: iki şubenin bu dersteki başarı farkının pratik büyüklüğü. 0.2 küçük, 0.5 orta, 0.8+ büyük.")}
              </div></div>
            </div>
          </div>`;
        }
      }
    }

    // Ders Analizi — Şube "Tümü" iken En İyi / En Zayıf Sınıf kartları
    let subjBestCls  = clsArr.length > 0 ? clsArr[0] : null;
    let subjWorstCls2 = clsArr.length > 1 ? clsArr[clsArr.length - 1] : null;
    let subjClassCardsHtml = (!br && clsArr.length > 1) ? `
      <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card sec-pos h-100"><div class="sec-icon"><i class="fas fa-school"></i></div><div class="sec-body"><div class="sec-label">En İyi Sınıf</div><div class="sec-value">${subjBestCls.cls}</div><div class="sec-sub">Ort: ${subjBestCls.avg.toFixed(2)} Net</div></div></div></div>
      <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card sec-neg h-100"><div class="sec-icon"><i class="fas fa-exclamation-circle"></i></div><div class="sec-body"><div class="sec-label">En Zayıf Sınıf</div><div class="sec-value">${subjWorstCls2.cls}</div><div class="sec-sub">Ort: ${subjWorstCls2.avg.toFixed(2)} Net</div></div></div></div>
    ` : '';

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
          <div class="col-md-4 col-lg flex-fill mb-2"><div class="sec-card sec-pos h-100"><div class="sec-icon"><i class="fas fa-trophy"></i></div><div class="sec-body"><div class="sec-label">En İyi Öğrenci</div><div class="sec-value" style="font-size:0.95em;">${bestStudent ? `${bestStudent.name} (${bestStudent.cls})` : 'Veri Yok'}</div><div class="sec-sub">${bestStudent ? `${bestStudent.avg.toFixed(2)} Net (Ort)` : ''}</div></div></div></div>
          <div class="col-md-6 col-lg flex-fill mb-2"><div class="sec-card sec-neg h-100"><div class="sec-icon"><i class="fas fa-exclamation-triangle"></i></div><div class="sec-body"><div class="sec-label">En Zayıf Öğrenci</div><div class="sec-value" style="font-size:0.95em;">${worstStudent ? `${worstStudent.name} (${worstStudent.cls})` : 'Veri Yok'}</div><div class="sec-sub">${worstStudent ? `${worstStudent.avg.toFixed(2)} Net (Ort)` : ''}</div></div></div></div>
          <div class="col-md-6 col-lg flex-fill mb-2"><div class="sec-card sec-neutral h-100"><div class="sec-icon"><i class="fas fa-chart-pie"></i></div><div class="sec-body"><div class="sec-label">Katılım Oranı</div><div class="sec-value">%${partRateS}</div><div class="sec-sub">${attendedCountS} / ${baseCountS} Katılım</div></div></div></div>
          ${subjClassCardsHtml}
        </div>
        ${subjCohenHtml}
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
      let clsList =[...new Set(ex.map(e=>e.studentClass))].sort();
      let datasets = clsList.map((cls, i) => ({ label: cls, backgroundColor: cols[i % cols.length] + 'cc', borderColor: cols[i % cols.length], borderWidth: 1.5, data: dates.map(dt => { let clsExams = dateGroups[dt].filter(e => e.studentClass === cls); if(clsExams.length === 0) return null; return clsExams.reduce((a,e) => a + e.subs[toTitleCase(subj)].net, 0) / clsExams.length; }) }));
      c.a = mkChart('cA', dateLabels, datasets);
      let subjBPArea = getEl('subjBoxPlotArea');
      let totalExamsOfType = new Set(Object.values(EXAM_META).filter(m => m.examType === eT).map(m => m.date)).size;
      if(subjBPArea && totalExamsOfType >= 10) {
        let subjectClassMap = {};
        clsList.forEach(cls => {
          let vals = ex.filter(e => e.studentClass === cls).map(e => e.subs[toTitleCase(subj)].net);
          if(vals.length >= 3) subjectClassMap[cls] = vals;
        });
        if(Object.keys(subjectClassMap).length >= 1) {
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
    let targetLvl = lvl; if (!targetLvl && aNo) { let st = getStuMap().get(aNo); if(st) targetLvl = getGrade(st.class); }
    if (targetLvl) { baseExams = baseExams.filter(x => getGrade(x.studentClass) === targetLvl); }
    let brFilterED = getBrVal();
    if (brFilterED) { baseExams = baseExams.filter(x => { let mm = x.studentClass.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); return mm && mm[2].toLocaleUpperCase('tr-TR') === brFilterED; }); }

    let getName = (no) => getStuMap().get(no)?.name || 'Bilinmiyor';

    if(subSel === 'general_summary') {
        let _validNosGS = new Set(DB.s.map(s=>s.no));
        let ex = baseExams.filter(x => !x.abs && _validNosGS.has(x.studentNo)); if(ex.length === 0) { r.innerHTML = '<div class="alert alert-default-warning">Bu filtrelere uygun sınav sonucu bulunamadı.</div>'; return; }
        let dates = [...new Set(ex.map(x=>x.date))].sort(srt), stuStats = {}; 
        dates.forEach(d => {
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

        let progressArr =[];
        Object.values(stuStats).forEach(st => {
            st.exList.sort((a,b) => srt(a.date, b.date));
            if(st.exList.length >= 2) {
              let scores = st.exList.map(e => e.score);
              let nets   = st.exList.map(e => e.totalNet);
              let slopeScore = linRegSlope(scores);
              let slopeNet   = linRegSlope(nets);
              let regChange = slopeScore * (scores.length - 1);
              let firstEx = st.exList[0], lastEx = st.exList[st.exList.length - 1];
              progressArr.push({ ...st, diff: regChange, slope: slopeScore, slopeNet, examCount: scores.length, firstNet: firstEx.totalNet, lastNet: lastEx.totalNet, firstScore: firstEx.score, lastScore: lastEx.score });
            }
            let tNet = 0, tScore = 0; st.exList.forEach(e => { tNet+=e.totalNet; tScore+=e.score; }); st.avgNet = tNet / st.exList.length; st.avgScore = tScore / st.exList.length;
        });

        progressArr.sort((a,b) => b.diff - a.diff);
        let bestP = progressArr.length > 0 && progressArr[0].diff > 0 ? progressArr[0] : null, worstP = progressArr.length > 0 && progressArr[progressArr.length-1].diff < 0 ? progressArr[progressArr.length-1] : null;

        let firstDate = dates[0], lastDate = dates[dates.length - 1], subDiffs =[];
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
        let lvlStr = (targetLvl ? `${targetLvl}. Sınıflar` : '') + (brFilterED ? ` / ${brFilterED} Şubesi` : '') + ' ', safeName = `${eT}_Genel_Ozet`;

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

        // Tüm Sınavlar istatistik kartları: her öğrencinin ortalama neti baz alınır
        let _gsAvgNets = Object.values(stuStats).filter(s => s.avgNet !== undefined && s.exList && s.exList.length > 0).map(s => s.avgNet);
        let gsStatsHtml = '';
        if (_gsAvgNets.length >= 5) {
          let _gsMean = _statMean(_gsAvgNets);
          let _gsStd  = _statStd(_gsAvgNets);
          let _gsMed  = _statMedian(_gsAvgNets);
          let _gsQ    = _statQuartiles(_gsAvgNets);
          let _gsCV   = _statCV(_gsAvgNets);
          let _gsHomLab = _homogeneityLabel(_gsCV);
          let _gsIqrRatio = (_gsMed && _gsMed !== 0) ? _gsQ.iqr / Math.abs(_gsMed) : null;
          let _gsIqrColor = '#6c757d', _gsIqrLabel = '—';
          if (_gsIqrRatio !== null) {
            if (_gsIqrRatio < 0.20)      { _gsIqrColor = '#28a745'; _gsIqrLabel = 'Homojen / Dengeli'; }
            else if (_gsIqrRatio < 0.30) { _gsIqrColor = '#ffc107'; _gsIqrLabel = 'Normal Dağılım'; }
            else if (_gsIqrRatio < 0.40) { _gsIqrColor = '#fd7e14'; _gsIqrLabel = 'Seviye Farkı Var (Dikkat!)'; }
            else                         { _gsIqrColor = '#dc3545'; _gsIqrLabel = 'Kritik Kopukluk (Uçurum!)'; }
          }
          // Sınıf bazlı ortalama net (Tüm Sınavlar bağlamı için)
          let _gsClsAvg = {};
          Object.values(stuStats).forEach(s => { if (!_gsClsAvg[s.cls]) _gsClsAvg[s.cls] = []; _gsClsAvg[s.cls].push(s.avgNet); });
          let _gsClsHtml = Object.keys(_gsClsAvg).sort().map(cls => `<span style="font-size:0.78em;background:#f1f3f5;border-radius:6px;padding:2px 8px;color:#495057;"><strong>${cls}:</strong> ${(_gsClsAvg[cls].reduce((a,b)=>a+b,0)/_gsClsAvg[cls].length).toFixed(2)}</span>`).join('');
          gsStatsHtml = `
              <div class="row mt-2">
                <div class="col-12"><div class="sec-card"><div class="sec-icon"><i class="fas fa-chart-bar"></i></div><div class="sec-body"><div class="sec-label">Ortalama Net <small style="font-weight:400;color:#6c757d;">(Tüm Sınavlar)</small></div><div class="sec-value">${_gsMean.toFixed(2)}</div><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;">${_gsClsHtml}</div>${_explain('Öğrencilerin tüm sınavlardaki bireysel ortalama netleri üzerinden hesaplanmıştır.')}</div></div></div>
              </div>
              <div class="row mt-2">
                <div class="col-md-4 col-sm-12"><div class="sec-card"><div class="sec-icon"><i class="fas fa-arrows-alt-h"></i></div><div class="sec-body"><div class="sec-label">Ortalamadan Uzaklık</div><div class="sec-value">±${_gsStd.toFixed(2)}</div><div class="sec-sub">Standart sapma · ${_gsHomLab}</div>${_explain('Öğrencilerin tüm sınav ortalamalarının genel ortalama etrafındaki yayılımı. Düşükse grup homojen.')}</div></div></div>
                <div class="col-md-4 col-sm-12"><div class="sec-card"><div class="sec-icon"><i class="fas fa-equals"></i></div><div class="sec-body"><div class="sec-label">Medyan Net</div><div class="sec-value">${_gsMed.toFixed(2)}</div><div class="sec-sub">Ortalama: ${_gsMean.toFixed(2)}</div>${_explain('Öğrenciler kendi sınav ortalamalarına göre sıralandığında ortadaki değer. Ortalamadan belirgin farklıysa dağılım çarpıktır.')}</div></div></div>
                <div class="col-md-4 col-sm-12"><div class="sec-card"><div class="sec-icon"><i class="fas fa-grip-lines-vertical"></i></div><div class="sec-body"><div class="sec-label">Çeyrekler Arası Aralık (IQR)</div><div class="sec-value" style="color:${_gsIqrColor};">${_gsQ.iqr.toFixed(2)}</div><div class="sec-sub" style="color:${_gsIqrColor};font-weight:600;">${_gsIqrLabel}</div><div class="sec-sub">Q1: ${_gsQ.q1.toFixed(2)} · Q3: ${_gsQ.q3.toFixed(2)}</div></div></div></div>
              </div>`;
        }

        let h = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('pGenSummary','${safeName}',this)"><i class='fas fa-print mr-1'></i>Yazdır</button></div>
        <div id="pGenSummary" class="card shadow-sm" style="border-top:3px solid #0d6efd; background:#f4f6f9;">
            <div class="report-header">
              <span style="font-size:16px;"><i class="fas fa-globe mr-2"></i><strong>${eT}</strong> — Sınav Özeti (Tüm Sınavlar)</span>
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

              ${gsStatsHtml}

              <div id="genSummaryBPArea"></div>
              <div class="row mt-3">
                  <div class="col-lg-6"><div class="card shadow-sm avoid-break"><div class="card-header bg-success text-white"><h3 class="card-title m-0"><i class="fas fa-angle-double-up mr-1"></i> En Çok İlk 5'e Girenler</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.9em;"><thead><tr><th>Sıra</th><th>No</th><th>Ad Soyad</th><th>Sınıf</th><th>Sayı</th><th>Ort.Net</th><th>Ort.Puan</th></tr></thead><tbody>${top5Html}</tbody></table></div></div></div>
                  <div class="col-lg-6"><div class="card shadow-sm avoid-break"><div class="card-header bg-danger text-white"><h3 class="card-title m-0"><i class="fas fa-angle-double-down mr-1"></i> En Çok Son 5'e Girenler</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.9em;"><thead><tr><th>Sıra</th><th>No</th><th>Ad Soyad</th><th>Sınıf</th><th>Sayı</th><th>Ort.Net</th><th>Ort.Puan</th></tr></thead><tbody>${bottom5Html}</tbody></table></div></div></div>
              </div>
              <div id="genSummaryChartArea" class="chart-box avoid-break mt-3" style="display:none; height:280px;"><canvas id="cGenSummaryBar"></canvas></div>
            </div>
        </div>`; r.innerHTML = h;
        setTimeout(() => {
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
            let allGradeStus = DB.e.filter(x => x.examType===eT && !x.abs && (lvlForGenBP ? getGrade(x.studentClass)===lvlForGenBP : true) && (!brFilterED || (() => { let mm=x.studentClass.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); return mm && mm[2].toLocaleUpperCase('tr-TR')===brFilterED; })()));
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

          let clsScoreMapGS = {};
          Object.values(stuStats).forEach(s => {
            if(!s.exList || !s.exList.length) return;
            let cls = s.cls;
            if(!clsScoreMapGS[cls]) clsScoreMapGS[cls] = { netSum: 0, cnt: 0 };
            clsScoreMapGS[cls].netSum += s.avgNet;
            clsScoreMapGS[cls].cnt++;
          });
          let gsBarLabels = Object.keys(clsScoreMapGS).sort();
          let gsBarData = gsBarLabels.map(cls => clsScoreMapGS[cls].cnt ? clsScoreMapGS[cls].netSum / clsScoreMapGS[cls].cnt : 0);
          let gsCv = getEl('cGenSummaryBar');
          if(gsCv && gsBarLabels.length > 0) {
            let gsChartArea = getEl('genSummaryChartArea');
            if(gsChartArea) gsChartArea.style.display = 'block';
            try { let _prev = Chart.getChart && Chart.getChart('cGenSummaryBar'); if(_prev) _prev.destroy(); } catch(e){}
            new Chart(gsCv, {
              type: 'bar',
              data: {
                labels: gsBarLabels,
                datasets:[{ label: 'Ortalama Net', data: gsBarData, backgroundColor: cols.map(c=>c+'cc'), borderColor: cols, borderWidth: 1.5 }]
              },
              plugins:[ChartDataLabels],
              options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                  legend: { display: false },
                  datalabels: { display: false }
                },
                scales: {
                  x: { grid: { color: '#e2e8f0' }, ticks: { font: { size: 10 } } },
                  y: { grid: { color: '#e2e8f0' }, ticks: { font: { size: 10 } }, title: { display: true, text: 'Ortalama Net', font: { size: 10 } } }
                }
              }
            });
            if(gsChartArea && !gsChartArea.dataset.titleAdded) {
              let title = document.createElement('div');
              title.style.cssText = 'font-size:11px;font-weight:bold;color:#4a6fa5;margin-bottom:4px;text-align:left;';
              title.textContent = `${eT} — Sınıf Bazlı Ortalama Net (Tüm Sınavlar)`;
              gsChartArea.parentNode.insertBefore(title, gsChartArea);
              gsChartArea.dataset.titleAdded = 'true';
            }
          }
        }, 50);

    } else if (subSel === 'summary') {
      let batch = baseExams.filter(x => x.date === dt), currentExams = batch.filter(x => !x.abs);
      if (!currentExams.length) { r.innerHTML='<div class="alert alert-default-warning">Bu sınavda geçerli sonuç bulunmuyor.</div>'; return; }

      let filteredDates =[...new Set(baseExams.map(x=>x.date))].sort(srt), currentIndex = filteredDates.indexOf(dt), prevDate = currentIndex > 0 ? filteredDates[currentIndex - 1] : null;
      let isFirstExam = (currentIndex === 0 || prevDate === null);
      let prevBatch = prevDate ? DB.e.filter(x => x.examType === eT && x.date === prevDate) :[];
      if(targetLvl) prevBatch = prevBatch.filter(x => getGrade(x.studentClass) === targetLvl);
      if(brFilterED) prevBatch = prevBatch.filter(x => { let mm = x.studentClass.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); return mm && mm[2].toLocaleUpperCase('tr-TR') === brFilterED; });
      let prevExams = prevBatch.filter(x => !x.abs), sortedExams = [...currentExams].sort((a,b) => { let dp=(b.score||0)-(a.score||0); if(dp!==0) return dp; return (b.totalNet||0)-(a.totalNet||0); }), winner = sortedExams[0], progress =[];
      
      let _validNosSum = new Set(DB.s.map(s=>s.no));
      currentExams = currentExams.filter(x => _validNosSum.has(x.studentNo));
      prevExams = prevExams.filter(x => _validNosSum.has(x.studentNo));
      currentExams.forEach(ce => { let pe = prevExams.find(x => x.studentNo === ce.studentNo); if (pe) progress.push({ no: ce.studentNo, name: getName(ce.studentNo), cls: ce.studentClass, diff: ce.totalNet - pe.totalNet, cur: ce.totalNet, prev: pe.totalNet }); });
      progress.sort((a,b) => b.diff - a.diff);
      let bestP = progress.length > 0 && progress[0].diff > 0 ? progress[0] : null, worstP = progress.length > 0 && progress[progress.length-1].diff < 0 ? progress[progress.length-1] : null;

      let subStats = {};
      let popStats = (exams, key) => { exams.forEach(ex => { Object.keys(ex.subs).forEach(sub => { if (!subStats[sub]) subStats[sub] = { curSum: 0, curCount: 0, prevSum: 0, prevCount: 0 }; subStats[sub][key + 'Sum'] += ex.subs[sub].net; subStats[sub][key + 'Count']++; }); }); };
      popStats(currentExams, 'cur'); popStats(prevExams, 'prev');
      let subDiffs =[];
      Object.keys(subStats).forEach(sub => { let curAvg = subStats[sub].curCount > 0 ? subStats[sub].curSum / subStats[sub].curCount : 0; let prevAvg = subStats[sub].prevCount > 0 ? subStats[sub].prevSum / subStats[sub].prevCount : 0; if (subStats[sub].prevCount > 0 && subStats[sub].curCount > 0) { subDiffs.push({ sub, diff: curAvg - prevAvg, curAvg, prevAvg }); } });
      subDiffs.sort((a,b) => b.diff - a.diff);
      let bestSub = subDiffs.length > 0 && subDiffs[0].diff > 0 ? subDiffs[0] : null, worstSub = subDiffs.length > 0 && subDiffs[subDiffs.length-1].diff < 0 ? subDiffs[subDiffs.length-1] : null;

      let buildRow = (e, i) => `<tr><td>${i+1}</td><td>${e.no}</td><td>${getName(e.no)}</td><td>${e.cls}</td><td><strong>${e.totalNet.toFixed(2)}</strong></td><td>${e.score.toFixed(2)}</td></tr>`;
      let top5Html = sortedExams.slice(0,5).map((e,i) => buildRow({no:e.studentNo, cls:e.studentClass, totalNet:e.totalNet, score:e.score}, i)).join('');
      let bottomExams = [...sortedExams].reverse().slice(0,5); 
      let bottom5Html = bottomExams.map((e,i) => buildRow({no:e.studentNo, cls:e.studentClass, totalNet:e.totalNet, score:e.score}, i)).join('');
      
      let safeName = `${eT}_${dt.replace(/\./g,'-')}_Ozet`, lvlStr = (targetLvl ? `${targetLvl}. Sınıflar` : '') + (brFilterED ? ` / ${brFilterED} Şubesi` : '') + ' ';
      let pubName = Object.values(EXAM_META).find(m=>m.date===dt&&m.examType===eT)?.publisher || '';
      
      let thisExamMeta = Object.values(EXAM_META).find(m=>m.date===dt && m.examType===eT);
      // examGrades: sınav metasında belirli sınıf seviyeleri varsa filtrele.
      // Ancak targetLvl zaten seçilmişse (kullanıcı seviye seçti) examGrades filtresini atla;
      // çünkü metadata 9. sınıf olarak kayıtlı bir sınavı 10/11. sınıf öğrencisi de girebilir.
      let examGrades = (!targetLvl && thisExamMeta && thisExamMeta.grades && thisExamMeta.grades.length) ? new Set(thisExamMeta.grades) : null;
      let eligibleStusE = DB.s.filter(s => {
        let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m) return false;
        if(targetLvl && m[1] !== targetLvl) return false;
        if(brFilterED && m[2].toLocaleUpperCase('tr-TR') !== brFilterED) return false;
        if(examGrades && !examGrades.has(m[1])) return false;
        return true;
      });
      // attendedNos öne alındı: hem partRateE hem absentStus hesabında kullanılır
      let attendedNos = new Set(currentExams.map(e => e.studentNo));
      let partRateE = eligibleStusE.length > 0 ? Math.max(0, Math.min(100, Math.round((attendedNos.size / eligibleStusE.length) * 100))) : 0;

      // Tek sınav istatistik kartı: Std + Medyan + IQR (yalnızca n>=5 öğrenci varsa anlamlı)
      let examStatsHtml = '';
      let examNets = currentExams.map(e => e.totalNet).filter(v => v !== null && v !== undefined);
      if(examNets.length >= 5) {
        let _eMean = _statMean(examNets);
        let _eStd  = _statStd(examNets);
        let _eMed  = _statMedian(examNets);
        let _eQ    = _statQuartiles(examNets);
        let _eCV   = _statCV(examNets);
        let _eHomLab = _homogeneityLabel(_eCV);
        let _iqrRatio = (_eMed && _eMed !== 0) ? _eQ.iqr / Math.abs(_eMed) : null;
        let _iqrColor = '#6c757d', _iqrLabel = '—';
        if(_iqrRatio !== null) {
          if(_iqrRatio < 0.20)      { _iqrColor = '#28a745'; _iqrLabel = 'Homojen / Dengeli'; }
          else if(_iqrRatio < 0.30) { _iqrColor = '#ffc107'; _iqrLabel = 'Normal Dağılım'; }
          else if(_iqrRatio < 0.40) { _iqrColor = '#fd7e14'; _iqrLabel = 'Seviye Farkı Var (Dikkat!)'; }
          else                      { _iqrColor = '#dc3545'; _iqrLabel = 'Kritik Kopukluk (Uçurum!)'; }
        }
        examStatsHtml = `<div class="row mt-2">
          <div class="col-md-4 col-sm-12"><div class="sec-card"><div class="sec-icon"><i class="fas fa-arrows-alt-h"></i></div><div class="sec-body"><div class="sec-label">Ortalamadan Uzaklık</div><div class="sec-value">±${_eStd.toFixed(2)}</div><div class="sec-sub">Standart sapma · ${_eHomLab}</div>${_explain('Öğrenci netlerinin ortalama etrafındaki yayılımı. Düşükse grup homojen.')}</div></div></div>
          <div class="col-md-4 col-sm-12"><div class="sec-card"><div class="sec-icon"><i class="fas fa-equals"></i></div><div class="sec-body"><div class="sec-label">Medyan Net</div><div class="sec-value">${_eMed.toFixed(2)}</div><div class="sec-sub">Ortalama: ${_eMean.toFixed(2)}</div>${_explain('Sıralandığında ortadaki öğrencinin neti. Aşırı uçlardan etkilenmez; ortalamadan farklıysa dağılım çarpıktır.')}</div></div></div>
          <div class="col-md-4 col-sm-12"><div class="sec-card"><div class="sec-icon"><i class="fas fa-grip-lines-vertical"></i></div><div class="sec-body"><div class="sec-label">Çeyrekler Arası Aralık (IQR)</div><div class="sec-value" style="color:${_iqrColor};">${_eQ.iqr.toFixed(2)}</div><div class="sec-sub" style="color:${_iqrColor};font-weight:600;">${_iqrLabel}</div><div class="sec-sub">Q1: ${_eQ.q1.toFixed(2)} · Q3: ${_eQ.q3.toFixed(2)}</div></div></div></div>
        </div>`;
      }

      // Katılmayan öğrenci listesi: "Katılım %82" kartı hangi %18'in kim olduğunu söylemiyor.
      // Ders öğretmeni sınav sonucunu incelerken katılmayanları doğrudan bu sayfadan görebilmeli.
      let absentStus  = eligibleStusE.filter(s => !attendedNos.has(s.no));
      let absentListHtml = '';
      if(absentStus.length > 0) {
        let absentRows = absentStus.map((s, i) => `<tr><td>${i+1}</td><td>${escapeHtml(s.no)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.class)}</td></tr>`).join('');
        absentListHtml = `<div class="card shadow-sm mt-3 avoid-break">
          <div class="card-header bg-warning text-dark">
            <h3 class="card-title m-0" style="font-size:14px;"><i class="fas fa-user-times mr-1"></i> Sınava Katılmayan Öğrenciler (${absentStus.length} kişi)</h3>
          </div>
          <div class="card-body p-0 table-responsive">
            <table class="table table-sm table-striped m-0" style="font-size:0.85em;">
              <thead><tr><th>#</th><th>No</th><th>Ad Soyad</th><th>Sınıf</th></tr></thead>
              <tbody>${absentRows}</tbody>
            </table>
          </div>
        </div>`;
      }

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
                <div class="col-md-4 col-sm-12"><div class="sec-card sec-neutral"><div class="sec-icon"><i class="fas fa-users"></i></div><div class="sec-body"><div class="sec-label">Sınav Katılım Oranı</div><div class="sec-value" style="font-size:1.05em;">%${partRateE}</div><div class="sec-sub">${attendedNos.size} katıldı · ${absentStus.length} katılmadı</div></div></div></div>
            </div>
            <div class="row mt-2">
                <div class="col-12"><div class="sec-card"><div class="sec-icon"><i class="fas fa-chart-bar"></i></div><div class="sec-body"><div class="sec-label">Ortalama Net</div><div class="sec-value">${(currentExams.reduce((s,e)=>s+e.totalNet,0)/currentExams.length).toFixed(2)}</div><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;">${(() => { let _cm={}; currentExams.forEach(e=>{if(!_cm[e.studentClass])_cm[e.studentClass]=[];_cm[e.studentClass].push(e.totalNet);}); return Object.keys(_cm).sort().map(cls=>`<span style="font-size:0.78em;background:#f1f3f5;border-radius:6px;padding:2px 8px;color:#495057;"><strong>${cls}:</strong> ${(_cm[cls].reduce((a,b)=>a+b,0)/_cm[cls].length).toFixed(2)}</span>`).join(''); })()}</div></div></div></div>
            </div>
            ${examStatsHtml}
            
            <div class="row mt-3">
                <div class="col-lg-6"><div class="card shadow-sm avoid-break"><div class="card-header bg-success text-white"><h3 class="card-title m-0"><i class="fas fa-angle-double-up mr-1"></i> İlk 5 Öğrenci</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.9em;"><thead><tr><th>Sıra</th><th>No</th><th>Ad Soyad</th><th>Sınıf</th><th>Net</th><th>Puan</th></tr></thead><tbody>${top5Html}</tbody></table></div></div></div>
                <div class="col-lg-6"><div class="card shadow-sm avoid-break"><div class="card-header bg-danger text-white"><h3 class="card-title m-0"><i class="fas fa-angle-double-down mr-1"></i> Son 5 Öğrenci</h3></div><div class="card-body p-0 table-responsive"><table class="table table-sm table-striped m-0" style="font-size:0.9em;"><thead><tr><th>Sıra</th><th>No</th><th>Ad Soyad</th><th>Sınıf</th><th>Net</th><th>Puan</th></tr></thead><tbody>${bottom5Html}</tbody></table></div></div></div>
            </div>

            ${absentListHtml}
            <div id="examSummaryBPArea"></div>
            <div id="examSummaryChartArea" class="chart-box avoid-break mt-3" style="display:none; height:280px;"><canvas id="cExamSummaryBar"></canvas></div>
          </div>
      </div>`; 
      r.innerHTML = h;

      setTimeout(() => {
        let bpArea = getEl('examSummaryBPArea');
        let totalExamsOfType = new Set(Object.values(EXAM_META).filter(m => m.examType === eT).map(m => m.date)).size;
        
        if(bpArea && totalExamsOfType >= 10) {
          let examClassMap = {};
          currentExams.forEach(e => {
            if(!examClassMap[e.studentClass]) examClassMap[e.studentClass] =[];
            examClassMap[e.studentClass].push(e.totalNet);
          });
          let lvlForExBP = targetLvl || (currentExams.length > 0 ? getGrade(currentExams[0].studentClass) : '');
          let allGradeNets = DB.e.filter(e => e.examType===eT && e.date===dt && !e.abs && (lvlForExBP ? getGrade(e.studentClass)===lvlForExBP : true) && (!brFilterED || (() => { let mm=e.studentClass.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); return mm && mm[2].toLocaleUpperCase('tr-TR')===brFilterED; })())).map(e => e.totalNet);
          let validClasses = Object.fromEntries(Object.entries(examClassMap).filter(([c,v])=>v.length>=3));
          if(allGradeNets.length >= 3) {
            let multiClsBP = Object.keys(validClasses).length >= 1 ? mkMultiClassBoxPlot(validClasses, null, {height:220}, allGradeNets) : '';
            if(multiClsBP) {
              bpArea.innerHTML = `<div class="boxplot-card mb-3"><div class="boxplot-title"><i class="fas fa-box-open mr-1 text-success"></i>Sınıflar Arası Net Dağılımı</div>${multiClsBP}</div>`;
            }
          }
        }

        let clsScoreMap = {};
        currentExams.forEach(e => {
          if(!clsScoreMap[e.studentClass]) clsScoreMap[e.studentClass] = [];
          clsScoreMap[e.studentClass].push(e.totalNet || 0);
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
              datasets:[{ label: 'Ortalama Net', data: barData, backgroundColor: cols.map(c=>c+'cc'), borderColor: cols, borderWidth: 1.5 }]
            },
            plugins: [ChartDataLabels],
            options: {
              responsive: true, maintainAspectRatio: false, animation: false,
              plugins: {
                legend: { display: false },
                datalabels: { display: false }
              },
              scales: {
                x: { grid: { color: '#e2e8f0' }, ticks: { font: { size: 10 } } },
                y: { grid: { color: '#e2e8f0' }, ticks: { font: { size: 10 } }, title: { display: true, text: 'Ortalama Net', font: { size: 10 } } }
              }
            }
          });
          
          if(chartArea && !chartArea.dataset.titleAdded) { 
            let title = document.createElement('div'); 
            title.style.cssText='font-size:11px;font-weight:bold;color:#4a6fa5;margin-bottom:4px;text-align:left;'; 
            title.textContent = `${eT} ${dt} — Sınıf Bazlı Ortalama Net`; 
            chartArea.parentNode.insertBefore(title, chartArea); 
            chartArea.dataset.titleAdded = 'true';
          }
        }
      }, 50);

    } else if (subSel === 'list_single') {
      let batch = baseExams.filter(x => x.date === dt);
      if(brFilterED) batch = batch.filter(x => { let mm=x.studentClass.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); return mm && mm[2].toLocaleUpperCase('tr-TR')===brFilterED; });
      
      if(!batch.length){r.innerHTML='<div class="alert alert-default-info">Bu sınava ait veri yok.</div>';return;}

      let subKeys=Array.from(new Set(batch.filter(x=>!x.abs).flatMap(e=>Object.keys(e.subs)))).sort();
      let _validNos = new Set(DB.s.map(s=>s.no));
      let rows2=batch.filter(e => e && _validNos.has(e.studentNo)).map(e=>{ let st=getStuMap().get(e.studentNo); return {...e,studentName:st?st.name:'—',studentCls:st?st.class:e.studentClass}; });
      let attended=rows2.filter(x=>!x.abs).sort((a,b)=>{
        let dp = (b.score||0) - (a.score||0); if(dp !== 0) return dp;
        let dn = (b.totalNet||0) - (a.totalNet||0); if(dn !== 0) return dn;
        return String(a.studentName||'').localeCompare(String(b.studentName||''),'tr',{sensitivity:'base'});
      });
      let absent=rows2.filter(x=>x.abs).sort((a,b)=>String(a.studentName||'').localeCompare(String(b.studentName||''),'tr',{sensitivity:'base'}));
      let sorted=[...attended,...absent], avgNet=attended.length?(attended.reduce((s,x)=>s+x.totalNet,0)/attended.length).toFixed(2):'0.00', avgScoreMeta=attended.length?(attended.reduce((s,x)=>s+(x.score||0),0)/attended.length).toFixed(2):'0.00', metaStr=`Katılan: ${attended.length} | Devamsız: ${absent.length} | Ortalama Puan: ${avgScoreMeta} | Sıralama: Puan`;
      
      let headCols=subKeys.map(k=>`<th>${toTitleCase(k)}</th>`).join('');
      let _rankIdx = 0;
      let bodyRows=sorted.map((e)=>{
        let isSel=aNo&&e.studentNo===aNo, rCls=isSel?'highlight-row':''; let pub = e.publisher || '—';
        if(e.abs) return `<tr class="absent-row ${rCls}"><td>—</td><td>${e.studentName}</td><td>${e.studentCls}</td><td>${e.date}</td><td>${toTitleCase(pub)}</td>${subKeys.map(()=>'<td>—</td>').join('')}<td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
        _rankIdx++;
        return `<tr class="${rCls}"><td>${_rankIdx}</td><td>${e.studentName}</td><td>${e.studentCls}</td><td>${e.date}</td><td>${toTitleCase(pub)}</td>${subKeys.map(k=>`<td>${e.subs[k]!==undefined?e.subs[k].net.toFixed(2):'—'}</td>`).join('')}<td><strong>${e.totalNet.toFixed(2)}</strong></td><td>${e.score.toFixed(2)}</td><td>${e.cR||'—'}/${e.cP||'—'}</td><td>${e.iR||'—'}/${e.iP||'—'}</td></tr>`;
      }).join('');

      // 1-F: Sınıf bazlı ara ortalama satırları (tablo sonuna eklenir)
      let classSubtotalRows = '';
      {
        let _clsGroups = {};
        attended.forEach(e => { if(!_clsGroups[e.studentCls]) _clsGroups[e.studentCls] = []; _clsGroups[e.studentCls].push(e); });
        Object.keys(_clsGroups).sort().forEach(cls => {
          let _cg = _clsGroups[cls];
          let _cgSubCols = subKeys.map(k => { let v = _cg.filter(e=>e.subs[k]!==undefined).map(e=>e.subs[k].net); return `<td>${v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2):'—'}</td>`; }).join('');
          let _cgNet = (_cg.reduce((s,x)=>s+x.totalNet,0)/_cg.length).toFixed(2);
          let _cgScore = (_cg.reduce((s,x)=>s+(x.score||0),0)/_cg.length).toFixed(2);
          classSubtotalRows += `<tr class="avg-row" style="background:#e8f5e9;"><td colspan="5" style="text-align:right;padding-right:15px;font-weight:bold;">${cls} Ortalaması (${_cg.length} kişi)</td>${_cgSubCols}<td>${_cgNet}</td><td>${_cgScore}</td><td colspan="2">—</td></tr>`;
        });
      }

      let listAvgRow = '';
      if (attended.length > 0) {
        let avgSubCols = subKeys.map(k => { let v = attended.filter(e => e.subs[k] !== undefined).map(e => e.subs[k].net); return `<td>${v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(2) : '—'}</td>`; }).join('');
        let listAvgScore = (attended.reduce((s,x)=>s+x.score,0)/attended.length).toFixed(2);
        listAvgRow = `<tr class="avg-row"><td colspan="5" style="text-align:right; padding-right:15px;">ORTALAMA (${attended.length} Kişi)</td>${avgSubCols}<td>${avgNet}</td><td>${listAvgScore}</td><td colspan="2">—</td></tr>`;
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
          <div class="scroll"><table class="table table-sm table-hover table-bordered" id="tED"><thead><tr><th>#</th><th>Ad Soyad</th><th>Sınıf</th><th>Tarih</th><th>Yayınevi</th>${headCols}<th>Top.Net</th><th>Puan</th><th>Snf(S/K)</th><th>Okul(S/K)</th></tr></thead><tbody>${bodyRows}${classSubtotalRows}${listAvgRow}</tbody></table></div>
        </div>
      </div>`;
      r.innerHTML=h; if(aNo) setTimeout(()=>{ let hlRow=getEl('tED')?.querySelector('tr.highlight-row'); if(hlRow)hlRow.scrollIntoView({behavior:'smooth',block:'center'}); },300);

    } else if (subSel === 'list_all') {
      let allEx = baseExams.filter(x => !x.abs);
      if(!allEx.length){r.innerHTML='<div class="alert alert-default-warning">Bu filtrelere uygun sınav sonucu bulunamadı.</div>';return;}

      let allSubKeys = Array.from(new Set(allEx.flatMap(e => Object.keys(e.subs)))).sort();
      let stuMap_local = {};
      allEx.forEach(e => {
        let no = e.studentNo;
        if(!stuMap_local[no]) {
          let st = getStuMap().get(no);
          stuMap_local[no] = { no, name: st ? st.name : '—', cls: e.studentClass, subSums: {}, subCounts: {}, totalNetSum: 0, scoreSum: 0, examCount: 0 };
        }
        stuMap_local[no].totalNetSum += e.totalNet;
        stuMap_local[no].scoreSum += e.score;
        stuMap_local[no].examCount++;
        allSubKeys.forEach(k => {
          if(e.subs[k] !== undefined) {
            stuMap_local[no].subSums[k] = (stuMap_local[no].subSums[k] || 0) + e.subs[k].net;
            stuMap_local[no].subCounts[k] = (stuMap_local[no].subCounts[k] || 0) + 1;
          }
        });
      });

      let _validNosLA = new Set(DB.s.map(s=>s.no));
      let fullStuArr = Object.values(stuMap_local).filter(s => _validNosLA.has(s.no)).map(s => ({
        ...s,
        avgNet: s.totalNetSum / s.examCount,
        avgScore: s.scoreSum / s.examCount,
        subAvgs: Object.fromEntries(allSubKeys.map(k =>[k, s.subCounts[k] ? s.subSums[k] / s.subCounts[k] : null]))
      }));

      let gradeRankList = [...fullStuArr].sort((a,b) => {
        let dp = (b.avgScore||0) - (a.avgScore||0); if(dp !== 0) return dp;
        return (b.avgNet||0) - (a.avgNet||0);
      });
      let gradeSizeMap = {};
      gradeRankList.forEach((s, idx) => { gradeSizeMap[s.no] = { rank: idx + 1, total: gradeRankList.length }; });

      let clsRankMap = {};
      fullStuArr.forEach(s => { (clsRankMap[s.cls] = clsRankMap[s.cls] ||[]).push(s); });
      let clsSizeMap = {};
      Object.keys(clsRankMap).forEach(cls => {
        let sorted = [...clsRankMap[cls]].sort((a,b) => {
          let dp = (b.avgScore||0) - (a.avgScore||0); if(dp !== 0) return dp;
          return (b.avgNet||0) - (a.avgNet||0);
        });
        sorted.forEach((s, i) => { clsSizeMap[s.no] = { rank: i+1, total: sorted.length }; });
      });

      let displayStuArr = fullStuArr;
      if(brFilterED) {
        displayStuArr = fullStuArr.filter(s => {
          let mm = String(s.cls||'').match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/);
          return mm && mm[2].toLocaleUpperCase('tr-TR') === brFilterED;
        });
      }
      displayStuArr.sort((a,b) => {
        let dp = (b.avgScore||0) - (a.avgScore||0); if(dp !== 0) return dp;
        return (b.avgNet||0) - (a.avgNet||0);
      });

      let lvlStr = targetLvl ? `${targetLvl}. Sınıflar ` : '';
      let examDatesAll = [...new Set(allEx.map(x => x.date))].sort(srt);
      let metaStrAll = `Hesaplanan Sınav: ${examDatesAll.length} | Listelenen Öğrenci: ${displayStuArr.length} | Sıralama: Ortalama Puan`;
      let headColsAll = allSubKeys.map(k => `<th>${toTitleCase(k)}</th>`).join('');

      let totalExamCount = examDatesAll.length; // toplam sınav sayısı (unique tarihler)
      let bodyRowsAll = displayStuArr.map((s, idx) => {
        let isSel = aNo && s.no === aNo, rCls = isSel ? 'highlight-row' : '';
        let subCells = allSubKeys.map(k => `<td>${s.subAvgs[k] !== null ? s.subAvgs[k].toFixed(2) : '—'}</td>`).join('');
        let cR = clsSizeMap[s.no]; let gR = gradeSizeMap[s.no];
        let clsRankCell = cR ? `${cR.rank}/${cR.total}` : '—';
        let schoolRankCell = gR ? `${gR.rank}/${gR.total}` : '—';
        // 1-G: Az sınava giren öğrenci için uyarı vurgusu (toplam sınavın yarısından az)
        let examCntWarning = (totalExamCount > 0 && s.examCount < totalExamCount / 2);
        let examCntCell = examCntWarning
          ? `<td style="background:#fff3cd;color:#856404;font-weight:bold;" title="Toplam ${totalExamCount} sınavdan yalnızca ${s.examCount}'ine katıldı">⚠ ${s.examCount}</td>`
          : `<td>${s.examCount}</td>`;
        return `<tr class="${rCls}"><td>${idx+1}</td><td>${s.name}</td><td>${s.cls}</td>${subCells}<td><strong>${s.avgNet.toFixed(2)}</strong></td><td>${s.avgScore.toFixed(2)}</td><td>${clsRankCell}</td><td>${schoolRankCell}</td>${examCntCell}</tr>`;
      }).join('');

      let allAvgRow = '';
      if(displayStuArr.length > 0) {
        let avgSubCols = allSubKeys.map(k => {
          let vals = displayStuArr.filter(s => s.subAvgs[k] !== null).map(s => s.subAvgs[k]);
          return `<td>${vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : '—'}</td>`;
        }).join('');
        let genAvgNet = (displayStuArr.reduce((a,s)=>a+s.avgNet,0)/displayStuArr.length).toFixed(2);
        let genAvgScore = (displayStuArr.reduce((a,s)=>a+s.avgScore,0)/displayStuArr.length).toFixed(2);
        let genAvgExam = (displayStuArr.reduce((a,s)=>a+s.examCount,0)/displayStuArr.length).toFixed(1);
        allAvgRow = `<tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">GENEL ORTALAMA (${displayStuArr.length} Öğrenci)</td>${avgSubCols}<td>${genAvgNet}</td><td>${genAvgScore}</td><td colspan="2">—</td><td>${genAvgExam}</td></tr>`;
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
  let rType = getEl('rReportType') ? getEl('rReportType').value : 'Karne';
  if(!eTypeSel) return;
  if(!lvl) { showToast('Lütfen sınıf seviyesi seçin.','warning'); return; }
  
  let students = DB.s.filter(s => { let m = s.class.match(/^(\d+)([a-zA-ZğüşıöçĞÜŞİÖÇ]+)$/); if(!m) return false; if(m[1] !== lvl) return false; if(br && m[2].toLocaleUpperCase('tr-TR') !== br) return false; return true; });
  if(!students.length) { showToast('Bu filtreye uygun öğrenci bulunamadı.','warning'); return; }
  
  let neededBatches =[];
  if (eTypeSel === 'ALL') { neededBatches = Object.keys(EXAM_META).filter(id => { let m = EXAM_META[id]; return (!m.grades || m.grades.length === 0 || m.grades.includes(lvl)); }); } else {
      neededBatches = Object.keys(EXAM_META).filter(id => { let m = EXAM_META[id]; return m.examType === eTypeSel && (!m.grades || m.grades.length === 0 || m.grades.includes(lvl)); });
  }
  await fetchBatches(neededBatches);
  
  let r = getEl('raporRes'); if(window._raporCharts){ window._raporCharts.forEach(ch=>{try{ch.destroy();}catch(e){}});} window._raporCharts=[];
  let lvlStr = br ? `${lvl}${br}` : `${lvl}. Sınıflar`;
  
  // --- LİSTE MODU ---
  if (rType === 'Liste') {
    let html = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn btn-success btn-sm mr-2" onclick="xXLMul('raporCont','Toplu_Liste_${lvlStr}')"><i class='fas fa-file-excel mr-1'></i>Excel</button><button class="btn-print no-print" onclick="xPR('raporCont','Toplu_Liste_${lvlStr}',this,'landscape')"><i class='fas fa-print mr-1'></i>Tümünü Yazdır</button></div><div id="raporCont">`;

    let typesToProcess =[];
    if (eTypeSel === 'ALL') {
      let tSet = new Set();
      neededBatches.forEach(bId => tSet.add(EXAM_META[bId].examType));
      typesToProcess = [...tSet].sort();
    } else {
      typesToProcess = [eTypeSel];
    }

    let validNos = new Set(students.map(s => s.no));

    typesToProcess.forEach(t => {
      // Sınıf seviyesindeki tüm sınavları getir (derecelendirme tüm popülasyon bazında olmalı)
      let allExamsOfType = DB.e.filter(x => x.examType === t && !x.abs && getGrade(x.studentClass) === lvl);
      if (allExamsOfType.length === 0) return;

      let allSubKeys = Array.from(new Set(allExamsOfType.flatMap(e => Object.keys(e.subs)))).sort();
      let stuMap_local = {};

      allExamsOfType.forEach(e => {
        let no = e.studentNo;
        if(!stuMap_local[no]) {
          let st = getStuMap().get(no);
          stuMap_local[no] = { no, name: st ? st.name : '—', cls: e.studentClass, subSums: {}, subCounts: {}, totalNetSum: 0, scoreSum: 0, examCount: 0 };
        }
        stuMap_local[no].totalNetSum += e.totalNet;
        stuMap_local[no].scoreSum += (e.score || 0);
        stuMap_local[no].examCount++;
        allSubKeys.forEach(k => {
          if(e.subs[k] !== undefined) {
            stuMap_local[no].subSums[k] = (stuMap_local[no].subSums[k] || 0) + e.subs[k].net;
            stuMap_local[no].subCounts[k] = (stuMap_local[no].subCounts[k] || 0) + 1;
          }
        });
      });

      let fullStuArr = Object.values(stuMap_local).map(s => ({
        ...s,
        avgNet: s.totalNetSum / s.examCount,
        avgScore: s.scoreSum / s.examCount,
        subAvgs: Object.fromEntries(allSubKeys.map(k => [k, s.subCounts[k] ? s.subSums[k] / s.subCounts[k] : null]))
      }));

      // Kurum / Seviye Sıralaması
      let gradeRankList = [...fullStuArr].sort((a,b) => { let dp = (b.avgScore||0) - (a.avgScore||0); if(dp !== 0) return dp; return (b.avgNet||0) - (a.avgNet||0); });
      let gradeSizeMap = {};
      gradeRankList.forEach((s, idx) => { gradeSizeMap[s.no] = { rank: idx + 1, total: gradeRankList.length }; });

      // Sınıf Sıralaması
      let clsRankMap = {};
      fullStuArr.forEach(s => { (clsRankMap[s.cls] = clsRankMap[s.cls] ||[]).push(s); });
      let clsSizeMap = {};
      Object.keys(clsRankMap).forEach(cls => {
        let sorted = [...clsRankMap[cls]].sort((a,b) => { let dp = (b.avgScore||0) - (a.avgScore||0); if(dp !== 0) return dp; return (b.avgNet||0) - (a.avgNet||0); });
        sorted.forEach((s, i) => { clsSizeMap[s.no] = { rank: i+1, total: sorted.length }; });
      });

      // Ekrana sadece filtreye uyan öğrencileri bas
      let displayStuArr = fullStuArr.filter(s => validNos.has(s.no));
      if (displayStuArr.length === 0) return;

      displayStuArr.sort((a,b) => { let dp = (b.avgScore||0) - (a.avgScore||0); if(dp !== 0) return dp; return (b.avgNet||0) - (a.avgNet||0); });

      let headColsAll = allSubKeys.map(k => `<th title="${toTitleCase(k)}">${toTitleCase(k).length > 6 ? toTitleCase(k).substring(0,3) : toTitleCase(k)}</th>`).join('');

      let bodyRowsAll = displayStuArr.map((s, idx) => {
        let subCells = allSubKeys.map(k => `<td>${s.subAvgs[k] !== null ? s.subAvgs[k].toFixed(2) : '—'}</td>`).join('');
        let cR = clsSizeMap[s.no]; let gR = gradeSizeMap[s.no];
        let clsRankCell = cR ? `${cR.rank}/${cR.total}` : '—';
        let schoolRankCell = gR ? `${gR.rank}/${gR.total}` : '—';
        return `<tr><td>${idx+1}</td><td>${s.name}</td><td>${s.cls}</td>${subCells}<td><strong>${s.avgNet.toFixed(2)}</strong></td><td>${s.avgScore.toFixed(2)}</td><td>${clsRankCell}</td><td>${schoolRankCell}</td><td>${s.examCount}</td></tr>`;
      }).join('');

      let allAvgRow = '';
      let avgSubCols = allSubKeys.map(k => {
        let vals = displayStuArr.filter(s => s.subAvgs[k] !== null).map(s => s.subAvgs[k]);
        return `<td>${vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : '—'}</td>`;
      }).join('');
      let genAvgNet = (displayStuArr.reduce((a,s)=>a+s.avgNet,0)/displayStuArr.length).toFixed(2);
      let genAvgScore = (displayStuArr.reduce((a,s)=>a+s.avgScore,0)/displayStuArr.length).toFixed(2);
      let genAvgExam = (displayStuArr.reduce((a,s)=>a+s.examCount,0)/displayStuArr.length).toFixed(1);
      allAvgRow = `<tr class="avg-row"><td colspan="3" style="text-align:right; padding-right:15px;">ORTALAMA (${displayStuArr.length} Öğrenci)</td>${avgSubCols}<td>${genAvgNet}</td><td>${genAvgScore}</td><td colspan="2">—</td><td>${genAvgExam}</td></tr>`;

      let _rExColorIdx = (typeof examColorIdx === 'function') ? examColorIdx(t) : 0;
      let _rExLabel    = (typeof toExamLabel === 'function') ? toExamLabel(t) : t;
      let isFirst = typesToProcess.indexOf(t) === 0;

      html += `<div class="card shadow-sm mb-4 exam-type-block exam-color-${_rExColorIdx}${isFirst?' exam-type-first':''}" data-exam-color-idx="${_rExColorIdx}" data-exam-color="${_rExColorIdx}">
        <div class="card-header bg-light">
          <h3 class="card-title m-0" style="font-size:15px; font-weight:bold;"><i class="fas fa-list-alt mr-2"></i>${_rExLabel} — Toplu Liste | <span style="font-weight:normal;">${lvlStr}</span></h3>
        </div>
        <div class="card-body p-2">
          <div class="scroll-hint"><i class="fas fa-arrows-alt-h mr-1"></i>Tabloyu kaydırın</div>
          <div class="scroll">
            <table class="table table-sm table-bordered table-striped table-hover" data-sh="${t}">
              <thead><tr><th>#</th><th>Ad Soyad</th><th>Sınıf</th>${headColsAll}<th>Top.Net Ort.</th><th>Puan Ort.</th><th>Sıra/Sınıf</th><th>Sıra/Okul</th><th>Sınav Say.</th></tr></thead>
              <tbody>${bodyRowsAll}${allAvgRow}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    });
    
    html += `</div>`;
    r.innerHTML = html;

  } else {
    // --- KARNE MODU ---
    let examsByStudent = new Map();
    DB.e.forEach(ex => {
      if(!examsByStudent.has(ex.studentNo)) examsByStudent.set(ex.studentNo,[]);
      examsByStudent.get(ex.studentNo).push(ex);
    });
    
    let html = `<div class="d-flex justify-content-end mb-2 no-print"><button class="btn-print no-print" onclick="xPR('raporCont','Toplu_Karne_${lvlStr}',this)"><i class='fas fa-print mr-1'></i>Tümünü Yazdır</button></div><div id="raporCont">`;
    
    students.forEach((stu, stuIdx) => {
      let stuExams = examsByStudent.get(stu.no) ||[];
      stuExams = stuExams.sort((a,b) => srt(a.date,b.date)); if(!stuExams.length) return;

      let grp = {};
      if (eTypeSel === 'ALL') { stuExams.forEach(e => { (grp[e.examType] = grp[e.examType] ||[]).push(e); }); } else {
          stuExams.filter(e => e.examType === eTypeSel).forEach(e => { (grp[e.examType] = grp[e.examType] ||[]).push(e); });
      }

      let typs = Object.keys(grp).sort(); if(typs.length === 0) return;
      let stGrade = getGrade(stu.class);

      html += `<div class="student-rapor-wrapper">`;
      html += `<div class="report-header no-print" style="margin-bottom:10px;"><span style="font-size:16px;"><i class="fas fa-user-graduate mr-2"></i><strong>${stu.name}</strong> — Genel Karne Özeti</span><span style="font-size:13px;">Sınıf: ${stu.class} | ${new Date().toLocaleDateString('tr-TR')}</span></div>`;

      typs.forEach(t => {
        let el = grp[t].sort((a,b)=>srt(a.date,b.date)); let sb = Array.from(new Set(el.filter(e=>!e.abs).flatMap(e=>Object.keys(e.subs)))).sort();
        let shorten = (sb.length + 5) > 10, abbrev = (name) => shorten ? name.substring(0,3) : toTitleCase(name);
        
        let summary = calcKarneSummaryCards(stu.no, t, stGrade, el);
        let cardsHtml = buildKarneExamCards(summary, t);
        let riskCardsHtml = buildRiskInfoCards(stu.no, t, stu.class);
        
        let karneRows = '', kIdx = 1;
        el.forEach(e => {
          if(e.abs) { karneRows += `<tr class="absent-row"><td>—</td><td>${e.date}</td><td>${toTitleCase(e.publisher)||'—'}</td><td colspan="${sb.length+4}" class="text-center font-weight-bold">🔴 Katılmadı</td></tr>`; } else {
            karneRows += `<tr><td>${kIdx++}</td><td>${e.date}</td><td>${toTitleCase(e.publisher)||'—'}</td>${sb.map(x=>`<td>${e.subs[x]!==undefined?e.subs[x].net.toFixed(2):'—'}</td>`).join('')}<td><strong>${e.totalNet.toFixed(2)}</strong></td><td>${e.score.toFixed(2)}</td><td>${e.cR||'—'}/${e.cP||'—'}</td><td>${e.iR||'—'}/${e.iP||'—'}</td></tr>`;
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
          
          avgRow = `<tr class="avg-row"><td colspan="3" style="text-align:right;padding-right:12px;">Öğrenci Ortalama</td>${avgSubs.map(v=>`<td>${v}</td>`).join('')}<td>${avgNet}</td><td>${avgScore}</td><td colspan="2">—</td></tr>`;
          avgRow += `<tr class="avg-row"><td colspan="3" style="text-align:right;padding-right:12px;">Sınıf Ortalama (${stu.class})</td>${clsAvgSubsR.map(v=>`<td>${v}</td>`).join('')}<td>${clsAvgNetR}</td><td>${clsAvgScoreR}</td><td colspan="2">—</td></tr>`;
          avgRow += `<tr class="avg-row"><td colspan="3" style="text-align:right;padding-right:12px;">Kurum Ortalama (${stGrade}. Sınıflar)</td>${genAvgSubsR.map(v=>`<td>${v}</td>`).join('')}<td>${genAvgNetR}</td><td>${genAvgScoreR}</td><td colspan="2">—</td></tr>`;
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
            <div class="scroll"><table class="table table-sm table-bordered table-striped" data-sh="${t}"><thead><tr><th>#</th><th>Tarih</th><th>Yayınevi</th>${sb.map(x=>`<th title="${toTitleCase(x)}">${abbrev(x)}</th>`).join('')}<th>Top.Net</th><th>Puan</th><th>Snf(S/K)</th><th>Okul(S/K)</th></tr></thead><tbody>${karneRows}${avgRow}</tbody></table></div>
            <div class="chart-box avoid-break" style="height:190px;margin-top:6px;"><canvas id="${chartId}"></canvas></div>
          </div></div>`;
      });
      html += `</div>`;
    });
    
    html += `</div>`; r.innerHTML = html;
    
    setTimeout(() => {
      students.forEach(stu => {
        let stuExams = examsByStudent.get(stu.no) ||[];
        stuExams = stuExams.sort((a,b) => srt(a.date, b.date)); if (!stuExams.length) return;
        let grp = {};
        if (eTypeSel === 'ALL') { stuExams.forEach(e => { (grp[e.examType] = grp[e.examType] ||[]).push(e); }); } else {
            stuExams.filter(e => e.examType === eTypeSel).forEach(e => { (grp[e.examType] = grp[e.examType] ||[]).push(e); });
        }
        let stGrade = getGrade(stu.class);
        Object.keys(grp).forEach(t => {
          let chartId = 'rKarneChart_' + stu.no.replace(/[^a-zA-Z0-9]/g,'_') + '_' + t.replace(/[^a-zA-Z0-9]/g,'_'); let cv = getEl(chartId); if(!cv) return;
          let el = grp[t].sort((a,b)=>srt(a.date,b.date)), chartLabels = el.map(e => e.publisher ? `${e.date} (${toTitleCase(e.publisher)})` : e.date);
          let stuNets = el.map(e=>e.abs?null:e.totalNet);
          let clsNets = el.map(e => { if(e.abs) return null; let v=DB.e.filter(x=>x.date===e.date&&x.examType===t&&x.studentClass===stu.class&&!x.abs).map(x=>x.totalNet); return v.length?(v.reduce((a,b)=>a+b,0)/v.length):null; });
          let insNets = el.map(e => { if(e.abs) return null; let v=DB.e.filter(x=>x.date===e.date&&x.examType===t&&!x.abs&&getGrade(x.studentClass)===stGrade).map(x=>x.totalNet); return v.length?(v.reduce((a,b)=>a+b,0)/v.length):null; });
          let ch = mkChart(chartId, chartLabels,[ {label:'Öğrenci', data:stuNets, backgroundColor:cols[0]+'cc', borderColor:cols[0], borderWidth:1.5}, {label:'Sınıf Ort.', data:clsNets, backgroundColor:cols[2]+'99', borderColor:cols[2], borderWidth:1.5}, {label:'Kurum Ort.', data:insNets, backgroundColor:cols[3]+'99', borderColor:cols[3], borderWidth:1.5} ]);
          window._raporCharts.push(ch);
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
}
