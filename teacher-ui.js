function hydrateStaticSelects(){
  const days=schoolDays(), hours=schoolHours();
  const dayBlank='<option value="">Seçiniz</option>'+days.map(d=>`<option value="${d}">${d}</option>`).join('');
  ['tFreeDay','tDutyDay','sDay'].forEach(id=>{ const el=getEl(id); if(el) el.innerHTML=dayBlank; });
  const dayFilter=getEl('scheduleDayFilter'); if(dayFilter) dayFilter.innerHTML='<option value="">Tüm Günler</option>'+days.map(d=>`<option value="${d}">${d}</option>`).join('');
  const teacherDay=getEl('teacherProfileDay'), teacherDayValue=teacherDay?.value||todayName()||days[0]; if(teacherDay) teacherDay.innerHTML=days.map(d=>`<option value="${d}" ${d===teacherDayValue?'selected':''}>${d}</option>`).join('');
  const classDay=getEl('classProfileDay'); if(classDay) classDay.innerHTML=days.map(d=>`<option value="${d}" ${d===(todayName()||days[0])?'selected':''}>${d}</option>`).join('');
  const hourEl=getEl('sHour'); if(hourEl) hourEl.innerHTML=hours.map(h=>`<option value="${h}">${h}. Ders</option>`).join('');
  const hourFilter=getEl('scheduleHourFilter'); if(hourFilter) hourFilter.innerHTML='<option value="">Tüm Saatler</option>'+hours.map(h=>`<option value="${h}">${h}. Ders</option>`).join('');
  fillDynamicSelects();
}
function fillDynamicSelects(){
  const keepValue=(el,value)=>{ if(el && [...el.options].some(o=>o.value===value)) el.value=value; };
  const teachers=sortedTeachers();
  const tOpts='<option value="">Tüm Öğretmenler</option>'+teachers.map(t=>`<option value="${t.id}">${escapeHtml(teacherName(t))}</option>`).join('');
  const tf=getEl('scheduleTeacherFilter'), tfValue=tf?.value||''; if(tf){ tf.innerHTML=tOpts; keepValue(tf,tfValue); }
  const teacherOpts=teachers.map(t=>`<option value="${t.id}">${escapeHtml(teacherName(t))}</option>`).join('');
  const tp=getEl('teacherProfileSelect'), tpValue=tp?.value||selectedTeacherId||''; if(tp){ tp.innerHTML='<option value="">Öğretmen seçiniz</option>'+teacherOpts; keepValue(tp,tpValue||teachers[0]?.id||''); }
  const st=getEl('sTeacher'), stValue=st?.value||''; if(st){ st.innerHTML=teacherOpts; keepValue(st,stValue); }
  const tt=getEl('taskTeacher'), ttValue=tt?.value||''; if(tt){ tt.innerHTML=teacherOpts; keepValue(tt,ttValue); }
  const trt=getEl('taskReportTeacher'), trtValue=trt?.value||''; if(trt){ trt.innerHTML=tOpts; keepValue(trt,trtValue); }
  const subjectList=getEl('subjectOptions'); if(subjectList) subjectList.innerHTML=subjectSettings().sort((a,b)=>a.name.localeCompare(b.name,'tr')).map(s=>`<option value="${escapeHtml(s.name)}">${escapeHtml(s.code||'')}</option>`).join('');
  const taskKinds=['Kulüp','Kurul','Komisyon','Zümre Başkanlığı','Belirli Gün ve Haftalar','Diğer',...(DB.tasks||[]).map(t=>t.kind||'Genel')];
  const taskKindList=getEl('taskKindOptions'); if(taskKindList) taskKindList.innerHTML=[...new Set(taskKinds.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')).map(k=>`<option value="${escapeHtml(k)}"></option>`).join('');
  const grades=[...new Set((DB.settings.classes||CLASS_LIST).map(c=>classGrade(c)).filter(Boolean))].sort((a,b)=>Number(a)-Number(b)||String(a).localeCompare(String(b),'tr'));
  const gf=getEl('scheduleGradeFilter'), gfValue=gf?.value||''; if(gf){ gf.innerHTML='<option value="">Tüm Seviyeler</option>'+grades.map(g=>`<option value="${g}">${g}. Sınıflar</option>`).join(''); keepValue(gf,gfValue); }
  const selectedGrade=getEl('scheduleGradeFilter')?.value||'';
  const scheduleClasses=(DB.settings.classes||CLASS_LIST).filter(c=>!selectedGrade||classGrade(c)===String(selectedGrade));
  const cOpts='<option value="">Tüm Sınıflar</option>'+scheduleClasses.map(c=>`<option value="${c}">${c}</option>`).join('');
  const cf=getEl('scheduleClassFilter'), cfValue=cf?.value||''; if(cf){ cf.innerHTML=cOpts; keepValue(cf,cfValue); }
  const sc=getEl('sClass'), scValue=sc?.value||''; if(sc){ sc.innerHTML=DB.settings.classes.map(c=>`<option value="${c}">${c}</option>`).join(''); keepValue(sc,scValue); }
  const cps=getEl('classProfileSelect'), cpsValue=cps?.value||''; if(cps){ cps.innerHTML=DB.settings.classes.map(c=>`<option value="${c}">${c}</option>`).join(''); keepValue(cps,cpsValue||DB.settings.classes[0]||''); }
}
function sTab(id){
  if(['schedule','duty','tasks'].includes(id)){ window.reportMode=id; id='reports'; }
  if(!getEl(id)) id='dashboard';
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active-pane'));
  getEl(id).classList.add('active-pane');
  document.querySelectorAll('.nav-link[id^="nav-"],.bnav-item').forEach(a=>a.classList.remove('active'));
  if(getEl('nav-'+id)) getEl('nav-'+id).classList.add('active');
  if(getEl('bnav-'+id)) getEl('bnav-'+id).classList.add('active');
  history.replaceState(null,'','#'+id);
  if(id==='teachers') renderTeachers();
  if(id==='classes') renderClasses();
  if(id==='reports') renderReports();
  if(id==='settings') renderSettings();
  return false;
}
function renderAll(){ fillDynamicSelects(); renderDashboard(); renderTeachers(); renderClasses(); renderReports(); renderSettings(); }
function setReportMode(mode='schedule'){
  window.reportMode=mode;
  syncReportPrimaryAction(mode);
  ['schedule','teachers','duty','tasks'].forEach(key=>{
    const pane=getEl('reportPane-'+key), btn=getEl('reportBtn-'+key);
    if(pane) pane.classList.toggle('d-none', key!==mode);
    if(btn){ btn.classList.toggle('btn-primary', key===mode); btn.classList.toggle('btn-outline-secondary', key!==mode); }
  });
  if(mode==='schedule') renderSchedule();
  if(mode==='teachers') renderTeacherReport();
  if(mode==='duty') renderDuty();
  if(mode==='tasks') renderTasks();
}
function syncReportPrimaryAction(mode='schedule'){
  const button=getEl('reportPrimaryAction');
  if(!button) return;
  const actions={
    schedule:{label:'Ders Ekle',icon:'fas fa-plus',handler:'openScheduleModal()'},
    teachers:{label:'Öğretmen Ekle',icon:'fas fa-plus',handler:'openTeacherModal()'},
    tasks:{label:'Görev Ekle',icon:'fas fa-plus',handler:'openTaskModal()'}
  };
  const action=actions[mode];
  button.classList.toggle('d-none',!action);
  if(!action) return;
  button.setAttribute('onclick',action.handler);
  button.innerHTML=`<i class="${action.icon} me-1"></i>${action.label}`;
}
function renderReports(){ setReportMode(window.reportMode||'schedule'); }
function showToast(msg,type='info',timeout=3000){ const c=getEl('toastContainer'), t=document.createElement('div'); t.className='obs-toast obs-toast-'+type; t.innerHTML=`<i class="fas fa-circle-info"></i><span>${escapeHtml(msg)}</span>`; c.appendChild(t); setTimeout(()=>t.remove(),timeout); }
const disclosureState=new Map();
function rememberDisclosure(el){
  if(el?.dataset?.sectionKey) disclosureState.set(el.dataset.sectionKey, !!el.open);
}
function disclosureSection({key,title,icon='fas fa-circle',meta='',content='',open=false}){
  const isOpen=disclosureState.has(key)?disclosureState.get(key):open;
  return `<details class="content-disclosure" data-section-key="${escapeHtml(key)}" ${isOpen?'open':''} ontoggle="rememberDisclosure(this)">
    <summary><span class="disclosure-title"><i class="${icon}"></i><strong>${escapeHtml(title)}</strong></span>${meta?`<span class="disclosure-meta">${escapeHtml(meta)}</span>`:''}</summary>
    <div class="disclosure-body">${content}</div>
  </details>`;
}
function printArea(id,title='Yazdir'){
  const a=getEl(id);
  if(!a)return;
  const isSheet=!!a.querySelector('.schedule-sheet');
  const isEntryList=a.classList.contains('schedule-entry-list')||!!a.querySelector('.schedule-entry-table');
  const bodyClass=isSheet?'sheet-print':(isEntryList?'entry-print':'');
  const printStyle=`@page{size:A4 landscape;margin:3mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10px;color:#0f172a}
a{color:#0f172a;text-decoration:none}
.card{border:0;break-inside:avoid}
.card-header{padding:3px 0}
.card-body{padding:0}
.card-title{margin:0;font-size:12px}
.table{width:100%;border-collapse:collapse}
.table th,.table td{border:1px solid #cbd5e1!important;padding:3px 5px!important;vertical-align:middle}
.table th{background:#f1f5f9!important}
.lesson-hour-label{display:block;font-weight:700;white-space:nowrap}
.lesson-time-sub{display:block;font-size:7px;line-height:1.05;color:#334155;font-weight:600}
.lesson-board-hour{display:block;font-weight:700}
.class-program-board,.teacher-program-board{table-layout:fixed;font-size:8px}
.class-program-board th,.class-program-board td,.teacher-program-board th,.teacher-program-board td{text-align:center;vertical-align:middle}
.class-program-board th:first-child,.teacher-program-board th:first-child{text-align:left;width:19mm}
.class-board-slot strong,.class-board-slot span,.class-board-slot small,.teacher-board-slot strong,.teacher-board-slot span,.teacher-board-slot small{display:block;line-height:1.05}
.class-board-slot strong,.teacher-board-slot strong{font-size:8px}
.class-board-slot span,.teacher-board-slot span{font-size:7px;font-weight:700}
.class-board-slot small,.teacher-board-slot small{font-size:6px;color:#475569}
.class-program-list{display:block}
.class-program-section{break-inside:avoid;page-break-inside:avoid;margin-bottom:5mm}
.class-program-title{margin-bottom:2mm}
.content-disclosure{display:block!important;border-top:1px solid #dbe3ef}
.content-disclosure:first-child{border-top:0}
.content-disclosure>summary{display:none!important}
.content-disclosure>.disclosure-body,.content-disclosure:not([open])>.disclosure-body{display:block!important;padding:3mm 0}
.profile-disclosures{padding:0 4mm!important}
.daily-program-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3mm}
.daily-lesson-card{border:1px solid #cbd5e1;padding:2mm;min-height:20mm;break-inside:avoid}
.daily-lesson-card.has-lesson{border-left:2pt solid #2563eb}
.daily-slot strong,.daily-slot span,.daily-slot small{display:block;line-height:1.1}
.daily-slot strong{font-size:9px}
.daily-slot span{font-size:8px;font-weight:700}
.daily-slot small{font-size:7px;color:#475569}
.row{display:flex;flex-wrap:wrap;gap:8px}
.col-6,.col-lg-3,.col-lg-5,.col-lg-6,.col-lg-7{flex:1 1 0}
body:not(.entry-print) .schedule-entry-list,.schedule-health{display:none!important}
.no-print,button,.page-actions{display:none!important}
.entry-print .schedule-entry-list{display:block!important;border-top:0;padding-top:0}
.entry-print .section-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.entry-print h4{margin:0;font-size:12px}
.sheet-print{font-size:5pt}
.sheet-print .card-header{padding:0 0 1.5mm}
.sheet-print .card-title{font-size:7.4pt;margin:0}
.sheet-print .card-title i,.sheet-print .card-header .text-muted{display:none}
.sheet-print .table-responsive{overflow:visible!important}
.sheet-print .schedule-sheet{width:100%;table-layout:fixed;border-collapse:collapse;line-height:.92}
.sheet-print .schedule-sheet th,.sheet-print .schedule-sheet td{padding:.35mm .45mm!important;line-height:.92;height:auto;white-space:normal;overflow:hidden;text-align:center;break-inside:avoid}
.sheet-print .schedule-sheet thead{display:table-header-group}
.sheet-print .schedule-sheet thead br,.sheet-print .teacher-sheet br{display:none}
.sheet-print .schedule-sheet small{font-size:4.25pt;display:inline;color:#111;margin-left:1px}
.sheet-print .teacher-sheet{font-size:4.35pt}
.sheet-print .class-sheet{font-size:4.8pt}
.sheet-print .class-sheet tbody br{display:block}
.sheet-print .class-sheet tbody small{display:block;margin-left:0;font-size:4.45pt}
.sheet-print .teacher-sheet .sheet-name{width:28mm!important;min-width:28mm!important;max-width:28mm!important;text-align:left}
.sheet-print .class-sheet .sheet-name{width:10mm!important;min-width:10mm!important;max-width:10mm!important;text-align:center}
.sheet-print .teacher-sheet td,.sheet-print .teacher-sheet thead tr:nth-child(2) th{width:calc((100% - 28mm)/40)}
.sheet-print .class-sheet td,.sheet-print .class-sheet thead tr:nth-child(2) th{width:calc((100% - 10mm)/40)}
.sheet-print .sheet-filled,.sheet-print .sheet-empty{min-width:0!important}
.sheet-print .slot-span-note{display:none!important}
.sheet-print .duty-sheet{box-shadow:inset 0 0 0 .6pt #d97706}`;
  const w=window.open('','_blank');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${printStyle}</style></head><body class="${bodyClass}">${a.outerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(()=>{w.print();w.close();},350);
}
function dashboardCard(label,value,icon,tone,sub=''){ return `<div class="col-6 col-lg-3"><div class="metric-card metric-${tone}"><span class="metric-icon"><i class="${icon}"></i></span><div><div class="metric-label">${label}</div><div class="metric-value">${value}</div>${sub?`<div class="metric-sub">${sub}</div>`:''}</div></div></div>`; }
function emptyState(text){ return `<div class="empty-state"><i class="fas fa-circle-info"></i><span>${escapeHtml(text)}</span></div>`; }
