const STORAGE_KEY = 'ogretmenBilgiDB.v1';
const REMOTE_DB_PATH = 'ogretmenSistemi/main';
const DATA_SEED_VERSION = 'OB8-data';
const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8];
const LESSON_TIMES = [
  {hour:1,start:'08:15',end:'08:55'},
  {hour:2,start:'09:05',end:'09:45'},
  {hour:3,start:'09:55',end:'10:35'},
  {hour:4,start:'10:45',end:'11:25'},
  {hour:5,start:'11:35',end:'12:15'},
  {hour:6,start:'13:00',end:'13:40'},
  {hour:7,start:'13:50',end:'14:30'},
  {hour:8,start:'14:40',end:'15:20'}
];
const CLASS_LIST = ['9A','9B','9C','9D','10A','10B','10C','10D','11A','11B','11C','11D','12A','12B'];
const CLASS_MIGRATION_VERSION = 'classes-no-12cd-v1';
const DATA_NORMALIZATION_VERSION = 'subject-branch-normalization-v1';
const TEACHER_FIELDS = ['ADI','SOYADI','T.C. KİMLİK NO','BRANŞI','CEP TELEFONU','E-POSTA','SINIFI','KULÜP','PROJE','BOŞ GÜN','NÖBET GÜNÜ','NÖBET YERİ','DERS PROGRAMI'];
const SCHEDULE_IMPORT_FIELDS = ['SINIF','GÜN','DERS SAATİ','ÖĞRETMEN T.C.','ÖĞRETMEN','DERS','BAŞLANGIÇ','BİTİŞ','NOT'];
const SUBJECT_CATALOG = [
  ['Beden Eğitimi ve Spor','BED'],
  ['Bilişim Teknolojileri ve Yazılım','BİL'],
  ['Biyoloji','BİY'],
  ['Coğrafya','COĞ'],
  ['Din Kültürü ve Ahlak Bilgisi','DİN'],
  ['Felsefe','FEL'],
  ['Fizik','FİZ'],
  ['Görsel Sanatlar','GÖR'],
  ['Müzik','MÜZ'],
  ['Kimya','KİM'],
  ['Matematik','MAT'],
  ['Rehberlik ve Yönlendirme','REH'],
  ['Sağlık Bilgisi ve Trafik Kültürü','SAĞ'],
  ['Seçmeli Adabımuaşeret','S. AD'],
  ['Seçmeli İkinci Yabancı Dil','S. ALM'],
  ['Seçmeli Klasik Ahlak Metinleri','S. KAM'],
  ['Seçmeli Türk Sosyal Hayatında Aile','S. TSHA'],
  ['Seçmeli Matematik Uygulamaları','S. MATU'],
  ['Seçmeli Peygamberimizin Hayatı','S. PEY'],
  ['Seçmeli Proje Tasarımı ve Uygulamaları','S. PRO'],
  ['Seçmeli Spor Eğitimi','S. SPR'],
  ['Seçmeli Temel Dini Bilgiler','S. TDB'],
  ['T.C. İnkılap Tarihi ve Atatürkçülük','İNK'],
  ['Tarih','TAR'],
  ['Türk Dili ve Edebiyatı','TDE'],
  ['Yabancı Dil','İNG']
].map(([name,code])=>({name,code,key:plainKey(name)}));
const SUBJECT_ALIASES = new Map();
SUBJECT_CATALOG.forEach(s=>SUBJECT_ALIASES.set(s.key,s));
[
  ['beden egitimi','Beden Eğitimi ve Spor'],
  ['bilisim teknolojileri','Bilişim Teknolojileri ve Yazılım'],
  ['din kult ve ahl bil','Din Kültürü ve Ahlak Bilgisi'],
  ['din kulturu ve ahlak bilgisi','Din Kültürü ve Ahlak Bilgisi'],
  ['din kulturu ve ahlak bilgisi','Din Kültürü ve Ahlak Bilgisi'],
  ['gorsel sanatlar muzik','Görsel Sanatlar'],
  ['ingilizce','Yabancı Dil'],
  ['kimya kimya teknolojisi','Kimya'],
  ['rehberlik','Rehberlik ve Yönlendirme'],
  ['turk dili ve edebiyati','Türk Dili ve Edebiyatı'],
  ['t c inkilap tarihi ve ataturkculuk','T.C. İnkılap Tarihi ve Atatürkçülük']
].forEach(([alias,target])=>SUBJECT_ALIASES.set(alias,SUBJECT_CATALOG.find(s=>s.name===target)));
let SUBJECT_SETTINGS_RUNTIME = [...SUBJECT_CATALOG];
let MEMORY_DB_VALUE = null;
let MEMORY_SESSION_LOGGED_IN = false;
let FIREBASE_APP = null;
let FIREBASE_AUTH = null;
let FIREBASE_DB = null;
let REMOTE_READY = false;
let REMOTE_SAVE_TIMER = null;
let REMOTE_SAVE_PENDING = false;
let APP_STARTED = false;

let DB = loadDB();

function makeEmptyDB(){ return { teachers: [], schedules: [], tasks: [], meta: {}, settings: { classes: [...CLASS_LIST], days: DAY_NAMES, hours: HOURS, lessonTimes: LESSON_TIMES } }; }
function hasSeedTeachers(){ return Array.isArray(window.OGRETMEN_SEED?.teachers) && window.OGRETMEN_SEED.teachers.length > 0; }
function cloneSeedTeachers(){ return hasSeedTeachers() ? window.OGRETMEN_SEED.teachers.map(t=>({...t})) : []; }
function hasSeedSchedules(){ return Array.isArray(window.OGRETMEN_SCHEDULE_SEED?.schedules) && window.OGRETMEN_SCHEDULE_SEED.schedules.length > 0; }
function cloneSeedSchedules(){ return hasSeedSchedules() ? window.OGRETMEN_SCHEDULE_SEED.schedules.map(s=>({...s})) : []; }
function hasSeedTasks(){ return Array.isArray(window.OGRETMEN_TASK_SEED?.tasks) && window.OGRETMEN_TASK_SEED.tasks.length > 0; }
function cloneSeedTasks(){ return hasSeedTasks() ? window.OGRETMEN_TASK_SEED.tasks.map(t=>({...t})) : []; }
function defaultDB(){ const db=makeEmptyDB(); applySeedData(db); return normalizeDB(db); }
function applySeedData(db, parts={teachers:true,schedules:true,tasks:true}){
  if(parts.teachers) db.teachers=cloneSeedTeachers();
  if(parts.schedules) db.schedules=cloneSeedSchedules();
  if(parts.tasks) db.tasks=cloneSeedTasks();
  db.settings=db.settings||{};
  db.settings.classes=[...CLASS_LIST];
  db.settings.days=DAY_NAMES;
  db.settings.hours=HOURS;
  db.settings.lessonTimes=window.OGRETMEN_SCHEDULE_SEED?.lessonTimes||LESSON_TIMES;
  db.meta=db.meta||{};
  db.meta.seedVersion=DATA_SEED_VERSION;
  db.meta.classMigrationVersion=CLASS_MIGRATION_VERSION;
  return normalizeDB(db);
}
function normalizeDB(d){
  d.meta=d.meta||{};
  d.settings=d.settings||{};
  d.settings.classes=normalizeClassSettings(d.settings.classes, d.meta);
  d.settings.days=normalizeDaySettings(d.settings.days);
  d.settings.hours=normalizeHourSettings(d.settings.hours, d.settings.lessonTimes);
  d.settings.lessonTimes=normalizeLessonTimes(d.settings.lessonTimes, d.settings.hours);
  d.settings.subjects=normalizeSubjectSettings(d.settings.subjects);
  SUBJECT_SETTINGS_RUNTIME=d.settings.subjects.map(s=>({...s,key:plainKey(s.name)}));
  d.teachers=sortedTeachers((Array.isArray(d.teachers)?d.teachers:[]).map(normalizeTeacherRecord));
  d.schedules=normalizeScheduleRecords(Array.isArray(d.schedules)?d.schedules:[]);
  d.tasks=Array.isArray(d.tasks)?d.tasks:[];
  d.meta.dataNormalizationVersion=DATA_NORMALIZATION_VERSION;
  return d;
}
function normalizeClassSettings(classes, meta={}){
  let list=Array.isArray(classes)&&classes.length ? classes.map(cleanClassName).filter(Boolean) : [...CLASS_LIST];
  if(meta.classMigrationVersion!==CLASS_MIGRATION_VERSION){
    list=list.filter(cls=>!['12C','12D'].includes(cls));
    meta.classMigrationVersion=CLASS_MIGRATION_VERSION;
  }
  const seen=new Set();
  return list.filter(cls=>{ if(seen.has(cls)) return false; seen.add(cls); return true; });
}
function normalizeDaySettings(days){
  const source=Array.isArray(days)&&days.length ? days : DAY_NAMES;
  const seen=new Set(), list=[];
  source.forEach(day=>{
    const clean=String(day||'').replace(/\s+/g,' ').trim();
    const key=plainKey(clean);
    if(clean&&!seen.has(key)){ seen.add(key); list.push(clean); }
  });
  return list.length ? list : [...DAY_NAMES];
}
function normalizeHourSettings(hours, lessonTimes){
  const source=Array.isArray(hours)&&hours.length ? hours : (Array.isArray(lessonTimes)&&lessonTimes.length ? lessonTimes.map(t=>t.hour) : HOURS);
  const list=[...new Set(source.map(h=>Number(h)).filter(h=>Number.isFinite(h)&&h>0))].sort((a,b)=>a-b);
  return list.length ? list : [...HOURS];
}
function normalizeLessonTimes(lessonTimes, hours){
  const source=Array.isArray(lessonTimes)?lessonTimes:[];
  return hours.map(hour=>{
    const item=source.find(t=>Number(t.hour)===Number(hour)) || LESSON_TIMES.find(t=>Number(t.hour)===Number(hour)) || {};
    return {hour:Number(hour),start:String(item.start||'').trim(),end:String(item.end||'').trim()};
  });
}
function normalizeSubjectSettings(subjects){
  const source=Array.isArray(subjects)&&subjects.length ? subjects : SUBJECT_CATALOG;
  const seen=new Set(), list=[];
  source.forEach(item=>{
    const name=String(item?.name||item?.[0]||'').replace(/\s+/g,' ').trim();
    if(!name) return;
    const key=plainKey(name);
    if(seen.has(key)) return;
    seen.add(key);
    const fallback=SUBJECT_CATALOG.find(s=>s.key===key);
    const code=upperNamePart(String(item?.code||item?.[1]||fallback?.code||name.split(/\s+/).map(w=>w[0]).join('')).replace(/\s+/g,' ').trim());
    list.push({name,code});
  });
  return list.length ? list : SUBJECT_CATALOG.map(s=>({name:s.name,code:s.code}));
}
function subjectSettings(){ return SUBJECT_SETTINGS_RUNTIME.map(s=>({name:s.name,code:s.code,key:s.key||plainKey(s.name)})); }
function schoolDays(){ return normalizeDaySettings(DB?.settings?.days); }
function schoolHours(){ return normalizeHourSettings(DB?.settings?.hours, DB?.settings?.lessonTimes); }
function dayOrder(day){ const days=schoolDays(), i=days.indexOf(day); return i>=0?i:DAY_NAMES.indexOf(day); }
function hourOrder(hour){ const hours=schoolHours(), i=hours.indexOf(Number(hour)); return i>=0?i:HOURS.indexOf(Number(hour)); }
function loadDB(){
  try{
    const d=JSON.parse(readStorage(STORAGE_KEY)||'null');
    if(d&&Array.isArray(d.teachers)&&Array.isArray(d.schedules)){
      normalizeDB(d);
      if(d.meta.seedVersion!==DATA_SEED_VERSION && (hasSeedTeachers()||hasSeedSchedules()||hasSeedTasks())){
        applySeedData(d);
        writeStorage(STORAGE_KEY, JSON.stringify(d));
      }else{
        writeStorage(STORAGE_KEY, JSON.stringify(d));
      }
      return d;
    }
  }catch(e){}
  return defaultDB();
}
function readStorage(key){ try{ return localStorage.getItem(key); }catch(e){ return MEMORY_DB_VALUE; } }
function writeStorage(key,value){ MEMORY_DB_VALUE=value; try{ localStorage.setItem(key,value); }catch(e){} }
function readSession(){ try{ return sessionStorage.getItem('obsLoggedIn')==='1'; }catch(e){ return MEMORY_SESSION_LOGGED_IN; } }
function writeSession(){ MEMORY_SESSION_LOGGED_IN=true; try{ sessionStorage.setItem('obsLoggedIn','1'); }catch(e){} }
function clearSession(){ MEMORY_SESSION_LOGGED_IN=false; try{ sessionStorage.removeItem('obsLoggedIn'); }catch(e){} }
function saveDB(){ normalizeDB(DB); writeStorage(STORAGE_KEY, JSON.stringify(DB)); queueRemoteSave(); }
function hasFirebaseConfig(){ return !!window.OGRETMEN_FIREBASE_CONFIG?.databaseURL; }
function initFirebase(){
  if(!window.firebase||!hasFirebaseConfig()) return false;
  if(!FIREBASE_APP) FIREBASE_APP=window.firebase.apps?.length ? window.firebase.app() : window.firebase.initializeApp(window.OGRETMEN_FIREBASE_CONFIG);
  FIREBASE_AUTH=window.firebase.auth();
  FIREBASE_DB=window.firebase.database();
  return true;
}
function remoteRef(){ return FIREBASE_DB?.ref(REMOTE_DB_PATH); }
function queueRemoteSave(){
  if(!REMOTE_READY||!remoteRef()) return;
  REMOTE_SAVE_PENDING=true;
  clearTimeout(REMOTE_SAVE_TIMER);
  REMOTE_SAVE_TIMER=setTimeout(pushRemoteDB,350);
}
function pushRemoteDB(){
  if(!REMOTE_READY||!remoteRef()||!REMOTE_SAVE_PENDING) return Promise.resolve();
  REMOTE_SAVE_PENDING=false;
  return remoteRef().set(DB).catch(()=>{
    REMOTE_SAVE_PENDING=true;
    showSyncState('Bulut kaydı bekliyor', 'warning');
  });
}
function showSyncState(text='',tone=''){
  const badge=getEl('versionBadge');
  if(!badge) return;
  badge.title=text;
  badge.className=`nav-link version-pill${tone?` version-${tone}`:''}`;
}
async function hydrateRemoteDB(){
  if(!remoteRef()) return;
  const snapshot=await remoteRef().once('value');
  const remote=snapshot.val();
  if(remote&&Array.isArray(remote.teachers)&&Array.isArray(remote.schedules)){
    DB=normalizeDB(remote);
    writeStorage(STORAGE_KEY, JSON.stringify(DB));
  }else{
    await remoteRef().set(DB);
  }
  REMOTE_READY=true;
  showSyncState('Bulut bağlı','success');
}
function uid(p='id'){ return p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
function getEl(id){ return document.getElementById(id); }
function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function normalizeText(v){ return String(v||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim(); }
function plainKey(v){ return normalizeText(v).replace(/ı/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
function cleanClassName(v){ const raw=String(v||'').toLocaleUpperCase('tr-TR').replace(/\s+/g,''); const m=raw.match(/^(\d{1,2})([A-ZÇĞİÖŞÜ])$/); return m?`${m[1]}${m[2]}`:raw; }
function titleCaseNamePart(value){
  return String(value||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean).map(word=>
    word.split('-').map(part=>{
      const lower=part.toLocaleLowerCase('tr-TR');
      return lower ? lower.charAt(0).toLocaleUpperCase('tr-TR')+lower.slice(1) : '';
    }).join('-')
  ).join(' ');
}
function upperNamePart(value){ return String(value||'').replace(/\s+/g,' ').trim().toLocaleUpperCase('tr-TR'); }
function teacherNameParts(t){
  const rawFirst=String(t?.firstName||'').replace(/\s+/g,' ').trim();
  const rawLast=String(t?.lastName||'').replace(/\s+/g,' ').trim();
  const full=`${rawFirst} ${rawLast}`.replace(/\s+/g,' ').trim();
  const key=dutyPlaceKey(full);
  if(key==='pinar demirhan akgok') return {first:'Pınar', last:'DEMİRHAN AKGÖK'};
  if(rawLast) return {first:titleCaseNamePart(rawFirst), last:upperNamePart(rawLast)};
  const parts=full.split(' ').filter(Boolean);
  if(parts.length>1) return {first:titleCaseNamePart(parts.slice(0,-1).join(' ')), last:upperNamePart(parts[parts.length-1])};
  return {first:titleCaseNamePart(full), last:''};
}
function teacherName(t){
  const parts=teacherNameParts(t);
  return `${parts.first} ${parts.last}`.replace(/\s+/g,' ').trim() || 'Adsız Öğretmen';
}
function compactTeacherCode(t){
  if(!t) return '—';
  const parts=teacherNameParts(t);
  const first=parts.first.split(/\s+/).filter(Boolean).map(w=>upperNamePart(w.slice(0,1))+'.').join('');
  const last=parts.last.split(/\s+/).filter(Boolean).map(w=>upperNamePart(w).slice(0,3)).join(' ');
  return `${first}${last}`.trim() || teacherName(t);
}
function normalizeBranchName(value){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  const noRole=text.replace(/^(Müdür Başyardımcısı|Müdür Yardımcısı|Müdür)\s*\/\s*/i,'').trim();
  const key=plainKey(noRole);
  const branchMap={
    'beden egitimi':'Beden Eğitimi',
    'bilisim teknolojileri':'Bilişim Teknolojileri',
    'din kult ve ahl bil':'Din Kültürü ve Ahlak Bilgisi',
    'din kulturu ve ahlak bilgisi':'Din Kültürü ve Ahlak Bilgisi',
    'kimya kimya teknolojisi':'Kimya',
    'turk dili ve edebiyati':'Türk Dili ve Edebiyatı'
  };
  return branchMap[key]||titleCaseNamePart(noRole);
}
function normalizeTeacherRecord(t){
  const parts=teacherNameParts(t);
  return {...t, firstName:parts.first, lastName:parts.last, branch:normalizeBranchName(t.branch), classAdvisor:cleanClassName(t.classAdvisor)};
}
function subjectInfo(subject){
  const key=plainKey(subject);
  const settings=subjectSettings();
  const exact=settings.find(s=>s.key===key);
  if(exact) return exact;
  if(SUBJECT_ALIASES.has(key)){
    const alias=SUBJECT_ALIASES.get(key);
    return settings.find(s=>s.key===alias.key) || alias;
  }
  if(key.includes('klasik ahlak')&&key.includes('turk sosyal')) return settings.find(s=>s.name==='Seçmeli Klasik Ahlak Metinleri') || SUBJECT_CATALOG.find(s=>s.name==='Seçmeli Klasik Ahlak Metinleri');
  if(key.includes('klasik ahlak')) return settings.find(s=>s.name==='Seçmeli Klasik Ahlak Metinleri') || SUBJECT_CATALOG.find(s=>s.name==='Seçmeli Klasik Ahlak Metinleri');
  if(key.includes('turk sosyal hayatinda aile')) return settings.find(s=>s.name==='Seçmeli Türk Sosyal Hayatında Aile') || SUBJECT_CATALOG.find(s=>s.name==='Seçmeli Türk Sosyal Hayatında Aile');
  return null;
}
function normalizeSubjectName(subject, teacherId=''){
  const key=plainKey(subject);
  if(key==='gorsel sanatlar muzik'){
    if(teacherId==='40522761546') return 'Müzik';
    return 'Görsel Sanatlar';
  }
  return subjectInfo(subject)?.name || titleCaseNamePart(String(subject||'Ders').replace(/\s+/g,' ').trim());
}
function subjectCode(subject, teacherId=''){
  if(plainKey(subject)==='almanca') return 'ALM';
  const name=normalizeSubjectName(subject, teacherId);
  return subjectInfo(name)?.code || name.split(/\s+/).filter(Boolean).map(w=>upperNamePart(w.slice(0,1))).join('').slice(0,6);
}
function normalizeScheduleRecords(schedules){
  const result=[], seen=new Set();
  schedules.forEach(raw=>{
    const subjectKey=plainKey(raw.subject);
    if(subjectKey.includes('klasik ahlak')&&subjectKey.includes('turk sosyal')){
      const base={...raw, subject:'Seçmeli Klasik Ahlak Metinleri', note:raw.note||'Grup X'};
      result.push(normalizeScheduleRecord(base));
      const hacId=`${raw.id||uid('s')}_ha`;
      const exists=schedules.some(s=>s.id===hacId) || seen.has(hacId);
      if(!exists) result.push(normalizeScheduleRecord({...raw,id:hacId,teacherId:'24836297168',subject:'Seçmeli Türk Sosyal Hayatında Aile',note:raw.note||'Grup Y'}));
      seen.add(hacId);
      return;
    }
    result.push(normalizeScheduleRecord(raw));
  });
  return result;
}
function normalizeScheduleRecord(raw){
  const subject=normalizeSubjectName(raw.subject, raw.teacherId);
  let note=String(raw.note||'').trim();
  return {...raw, className:cleanClassName(raw.className), subject, note};
}
function teacherById(id){ return DB.teachers.find(t=>t.id===id)||null; }
function teacherCompare(a,b){ return teacherName(a).localeCompare(teacherName(b),'tr') || String(a?.identityNo||a?.id||'').localeCompare(String(b?.identityNo||b?.id||''),'tr'); }
function sortedTeachers(list=DB.teachers){ return (Array.isArray(list)?list:[]).slice().sort(teacherCompare); }
function classCompare(a,b){
  const ca=cleanClassName(typeof a==='string'?a:a?.className), cb=cleanClassName(typeof b==='string'?b:b?.className);
  const classes=DB?.settings?.classes||CLASS_LIST, ia=classes.indexOf(ca), ib=classes.indexOf(cb);
  if(ia>=0 || ib>=0) return (ia>=0?ia:9999)-(ib>=0?ib:9999);
  return ca.localeCompare(cb,'tr',{numeric:true});
}
function branchList(){ return [...new Set(DB.teachers.map(t=>t.branch).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')); }
function dutyPlaceList(){
  const defaults=['Bahçe Batı','Bahçe Doğu','Zemin','1. Kat','2. Kat'];
  const configured=Array.isArray(DB.settings?.dutyPlaces)?DB.settings.dutyPlaces:[];
  const values=[...(configured.length?configured:defaults),...DB.teachers.map(t=>t.dutyPlace).filter(Boolean)];
  const list=[], seen=new Set();
  values.forEach(place=>{
    const clean=String(place||'').trim(), key=normalizeText(clean);
    if(clean&&!seen.has(key)){ seen.add(key); list.push(clean); }
  });
  return list.length?list:defaults;
}
function dutyPlaceKey(place){
  return normalizeText(place).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ç/g,'c').replace(/ı/g,'i');
}
function dutyPlaceRank(place){
  const key=dutyPlaceKey(place), list=dutyPlaceList().map(p=>dutyPlaceKey(p)), index=list.indexOf(key);
  return index>=0?index:list.length;
}
function sortByDutyPlace(a,b){
  return dutyPlaceRank(a.dutyPlace)-dutyPlaceRank(b.dutyPlace) || teacherName(a).localeCompare(teacherName(b),'tr');
}
function todayName(){ const d=new Date().getDay(), days=schoolDays(); return d>=1&&d<=5 ? (days[d-1]||DAY_NAMES[d-1]||'') : ''; }
function lessonTimeByHour(hour){ return (DB.settings?.lessonTimes||LESSON_TIMES).find(t=>Number(t.hour)===Number(hour)) || LESSON_TIMES.find(t=>Number(t.hour)===Number(hour)); }
function scheduleTimeLabel(item){ const t=lessonTimeByHour(item.hour); return t?`${item.hour}. Ders (${t.start}-${t.end})`:`${item.hour}. Ders`; }
function lessonHourLabel(hour){ return `${Number(hour)}. Ders`; }
function lessonTimeRange(hour){ const t=lessonTimeByHour(hour); return t&&t.start&&t.end ? `${t.start}-${t.end}` : ''; }
function lessonHourCell(hour,showTime=false){ const range=lessonTimeRange(hour); return `<span class="lesson-hour-label">${escapeHtml(lessonHourLabel(hour))}</span>${showTime&&range?`<small class="lesson-time-sub">${escapeHtml(range)}</small>`:''}`; }
function lessonBoardHeader(hour){ return `<span class="lesson-board-hour">(${escapeHtml(hour)})</span>`; }
function displaySubjectName(subject){ return normalizeSubjectName(subject).replace(/^Seçmeli\s+/i,'S. ').replace(/\s+Seçmeli\s+/gi,' S. '); }
function scheduleNoteText(item){
  const note=String(item?.note||'').trim();
  const key=plainKey(note);
  return ['resim sinifi','muzik sinifi'].includes(key) || /^grup [xy]$/.test(key) ? '' : note;
}
function timeToMinutes(value){ const [h,m]=String(value||'0:0').split(':').map(Number); return h*60+m; }
function currentLessonSlot(date=new Date()){
  const today=todayName();
  if(!today) return null;
  const now=date.getHours()*60+date.getMinutes();
  const slot=(DB.settings?.lessonTimes||LESSON_TIMES).find(t=>now>=timeToMinutes(t.start)&&now<=timeToMinutes(t.end));
  return slot ? {...slot, day: today} : null;
}
function activeLessonsNow(date=new Date()){
  const slot=currentLessonSlot(date);
  if(!slot) return [];
  return DB.schedules.filter(s=>s.day===slot.day&&Number(s.hour)===Number(slot.hour));
}
function mapHeaderKey(h){ return normalizeText(h).replace(/\./g,'').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c'); }
function teacherFromRow(row){
  const lookup={}; Object.keys(row||{}).forEach(k=>lookup[mapHeaderKey(k)]=row[k]);
  const get=(...ks)=>{ for(const k of ks){ const v=lookup[mapHeaderKey(k)]; if(v!==undefined&&v!==null&&String(v).trim()!=='') return String(v).trim(); } return ''; };
  const identityNo=get('T.C. KİMLİK NO','TC Kimlik No','TCKN');
  return { id:identityNo||uid('t'), firstName:get('ADI','Adı','Ad'), lastName:get('SOYADI','Soyadı','Soyad'), identityNo, branch:get('BRANŞI','Branşı','Branş'), phone:get('CEP TELEFONU','Telefon','Cep'), email:get('E-POSTA','Eposta','Email'), classAdvisor:cleanClassName(get('SINIFI','Sınıfı','Sınıf')), club:get('KULÜP','Kulüp'), project:get('PROJE','Proje'), freeDay:get('BOŞ GÜN','Boş Gün'), dutyDay:get('NÖBET GÜNÜ','Nöbet Günü'), dutyPlace:get('NÖBET YERLERİ','Nöbet Yerleri','NÖBET YERİ','Nöbet Yeri'), scheduleNote:get('DERS PROGRAMI','Ders Programı') };
}
function rowLookup(row){
  const lookup={};
  Object.keys(row||{}).forEach(k=>lookup[mapHeaderKey(k)]=row[k]);
  return (...keys)=>{
    for(const key of keys){
      const value=lookup[mapHeaderKey(key)];
      if(value!==undefined&&value!==null&&String(value).trim()!=='') return String(value).trim();
    }
    return '';
  };
}
function teacherByImportValue(identityNo='',name=''){
  const id=String(identityNo||'').replace(/\D+/g,'').trim();
  if(id){
    const byIdentity=DB.teachers.find(t=>String(t.identityNo||'').replace(/\D+/g,'').trim()===id||String(t.id||'')===id);
    if(byIdentity) return byIdentity;
  }
  const key=plainKey(name);
  return key ? DB.teachers.find(t=>plainKey(teacherName(t))===key) || null : null;
}

async function login(){
  const email=getEl('loginEmail').value.trim(), pass=getEl('loginPass').value, err=getEl('loginError');
  if(!initFirebase()){ err.textContent='Firebase bağlantısı hazır değil.'; err.classList.remove('d-none'); return; }
  try{
    await FIREBASE_AUTH.signInWithEmailAndPassword(email,pass);
    err.classList.add('d-none');
  }catch(e){
    err.textContent='Kullanıcı adı veya şifre hatalı.';
    err.classList.remove('d-none');
  }
}
async function logout(){
  clearSession();
  APP_STARTED=false;
  REMOTE_READY=false;
  showSyncState('');
  if(initFirebase()) await FIREBASE_AUTH.signOut().catch(()=>{});
  getEl('mainApp').style.display='none';
  getEl('loginScreen').style.display='flex';
}
function togglePassword(){ const i=getEl('loginPass'), icon=getEl('togglePassIcon'); i.type=i.type==='password'?'text':'password'; icon.className=i.type==='password'?'fas fa-eye':'fas fa-eye-slash'; }
function startApp(){
  getEl('loginScreen').style.display='none';
  getEl('mainApp').style.display='block';
  const b=getEl('versionBadge'); if(b)b.textContent=window.OBS_APP_VERSION||'OB49';
  hydrateStaticSelects();
  renderAll();
  sTab((location.hash||'#dashboard').slice(1));
  APP_STARTED=true;
}
async function handleAuthUser(user){
  if(!user){
    clearSession();
    APP_STARTED=false;
    REMOTE_READY=false;
    getEl('mainApp').style.display='none';
    getEl('loginScreen').style.display='flex';
    return;
  }
  writeSession();
  try{
    showSyncState('Bulut bağlanıyor','');
    await hydrateRemoteDB();
  }catch(e){
    showSyncState('Yerel kopya','warning');
  }
  if(!APP_STARTED) startApp();
  else renderAll();
}
document.addEventListener('DOMContentLoaded',()=>{
  hydrateStaticSelects();
  if(initFirebase()) FIREBASE_AUTH.onAuthStateChanged(handleAuthUser);
  else if(readSession()) startApp();
  if('serviceWorker' in navigator&&location.protocol!=='file:') navigator.serviceWorker.register('./sw.js?v='+(window.OBS_APP_VERSION||'dev'),{scope:'./',updateViaCache:'none'}).catch(()=>{});
});
