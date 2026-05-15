let selectedTeacherId='';

function teacherLink(t,label=''){
  if(!t) return '<span class="text-muted">—</span>';
  return `<a href="#teachers" class="teacher-name-link" onclick="event.stopPropagation(); return goTeacherProfile('${escapeHtml(t.id)}')">${escapeHtml(label||teacherName(t))}</a>`;
}

function renderDashboard(){
  const teachers=sortedTeachers();
  const today=todayName(), duty=today?teachers.filter(t=>t.dutyDay===today).length:0, free=today?teachers.filter(t=>isTeacherFreeAllDay(t.id,today)).length:0;
  const active=activeLessonsNow().slice().sort((a,b)=>classCompare(a,b)||teacherCompare(teacherById(a.teacherId),teacherById(b.teacherId))), slot=currentLessonSlot();
  const slotText=slot?`${slot.hour}. Saat`:'Ders saati dışında';
  getEl('dashboardCards').innerHTML=[
    dashboardCard('Öğretmen',DB.teachers.length,'fas fa-user-tie','primary',`${branchList().length} branş`),
    dashboardCard('Şu Anda Dersi Olan',active.length,'fas fa-chalkboard-user','info',slotText),
    dashboardCard('Bugün Nöbetçi',duty,'fas fa-clipboard-check','warning',today||'Hafta sonu'),
    dashboardCard('Bugün Boş Günü',free,'fas fa-calendar-minus','info',today||'Hafta sonu')
  ].join('');
  const rows=today?DB.teachers.filter(t=>t.dutyDay===today).sort(sortByDutyPlace).map(t=>`<tr><td>${teacherLink(t)}</td><td>${escapeHtml(t.branch)}</td><td>${escapeHtml(t.dutyPlace||'—')}</td></tr>`).join(''):'';
  getEl('todayPanel').innerHTML=rows?`<div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Öğretmen</th><th>Branş</th><th>Nöbet Yeri</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyState(today?'Bugün için nöbet kaydı yok.':'Hafta sonu için nöbet gösterilmiyor.');
  const activeRows=active.map(s=>{ const t=teacherById(s.teacherId); return `<tr><td>${teacherLink(t)}</td><td>${escapeHtml(s.className)}</td><td>${escapeHtml(displaySubjectName(s.subject))}</td></tr>`; }).join('');
  const freeRows=today?teachers.filter(t=>isTeacherFreeAllDay(t.id,today)&&teacherLessons(t.id).length>0).map(t=>`<span class="soft-chip">${teacherLink(t)}</span>`).join(''):'';
  getEl('quickQueryPanel').innerHTML=`<div class="quick-section"><strong>Şu anda dersi olanlar${slot?` (${slot.hour}. Saat)`:''}</strong>${activeRows?`<div class="table-responsive mt-2"><table class="table table-sm mb-0"><thead><tr><th>Öğretmen</th><th>Sınıf</th><th>Ders</th></tr></thead><tbody>${activeRows}</tbody></table></div>`:emptyState(slot?'Bu ders saatinde kayıt yok.':'Şu an ders saati dışında.')}</div><div class="quick-section mt-3"><strong>${escapeHtml(today||'Hafta sonu')}</strong> boş günü olanlar<div class="chip-wrap">${freeRows||'<span class="text-muted">Kayıt yok.</span>'}</div></div>`;
  renderDashboardSearch();
}

function renderDashboardSearch(){
  const input=getEl('dashboardSearch'), target=getEl('dashboardSearchResults');
  if(!input||!target) return;
  const q=normalizeText(input.value||'');
  if(!q){ target.innerHTML=''; return; }
  const teacherRows=sortedTeachers().filter(t=>normalizeText(`${teacherName(t)} ${t.branch}`).includes(q)).slice(0,8);
  const classRows=(DB.settings.classes||CLASS_LIST).filter(cls=>normalizeText(cls).includes(q)).slice(0,8);
  const items=[
    ...teacherRows.map(t=>`<button class="search-result-item" onclick="goTeacherProfile('${escapeHtml(t.id)}')"><i class="fas fa-user-tie"></i><span><strong>${escapeHtml(teacherName(t))}</strong><small>${escapeHtml(t.branch||'')}</small></span></button>`),
    ...classRows.map(cls=>`<button class="search-result-item" onclick="goClassProfile('${escapeHtml(cls)}')"><i class="fas fa-users"></i><span><strong>${escapeHtml(cls)}</strong><small>Sınıf profiline git</small></span></button>`)
  ];
  target.innerHTML=items.length?`<div class="search-result-list">${items.join('')}</div>`:emptyState('Aramaya uygun öğretmen veya sınıf bulunamadı.');
}
function clearDashboardSearch(){ const input=getEl('dashboardSearch'); if(input) input.value=''; renderDashboardSearch(); }
function filteredTeachers(){ const q=normalizeText(getEl('teacherSearch')?.value||''); return sortedTeachers().filter(t=>!q||normalizeText(`${teacherName(t)} ${t.branch}`).includes(q)); }
function renderTeacherSearch(){
  const input=getEl('teacherSearch'), target=getEl('teacherSearchResults');
  if(!input||!target) return;
  const q=normalizeText(input.value||'');
  if(!q){ target.innerHTML=''; return; }
  const teacherRows=sortedTeachers().filter(t=>normalizeText(`${teacherName(t)} ${t.branch}`).includes(q)).slice(0,8);
  const classRows=(DB.settings.classes||CLASS_LIST).filter(cls=>normalizeText(cls).includes(q)).slice(0,8);
  const items=[
    ...teacherRows.map(t=>`<button class="search-result-item" onclick="goTeacherProfile('${escapeHtml(t.id)}')"><i class="fas fa-user-tie"></i><span><strong>${escapeHtml(teacherName(t))}</strong><small>${escapeHtml(t.branch||'')}</small></span></button>`),
    ...classRows.map(cls=>`<button class="search-result-item" onclick="goClassProfile('${escapeHtml(cls)}')"><i class="fas fa-users"></i><span><strong>${escapeHtml(cls)}</strong><small>Sınıf profiline git</small></span></button>`)
  ];
  target.innerHTML=items.length?`<div class="search-result-list">${items.join('')}</div>`:emptyState('Aramaya uygun öğretmen veya sınıf bulunamadı.');
}
function renderTeachers(){
  const rows=filteredTeachers(), table=getEl('teacherTable'), profile=getEl('teacherProfile');
  if(table) table.innerHTML=teacherTableHtml(rows,{actions:true});
  renderTeacherSearch();
  if(!rows.length){ if(profile) profile.innerHTML=emptyState('Henüz öğretmen kaydı yok. Ekle butonuyla veya Veri & Ayarlar sekmesinden içe aktarabilirsiniz.'); return; }
  const selected=rows.some(t=>t.id===selectedTeacherId) ? selectedTeacherId : rows[0].id;
  const select=getEl('teacherProfileSelect');
  if(select && [...select.options].some(o=>o.value===selected)) select.value=selected;
  showTeacherProfile(selected);
}
function teacherTableHtml(rows,{actions=false}={}){
  if(!rows.length) return `<tbody><tr><td>${emptyState('Kayıt bulunamadı.')}</td></tr></tbody>`;
  return `<thead><tr><th>#</th><th>Ad Soyad</th><th>Branş</th><th>Telefon</th><th>E-posta</th><th>Sınıf</th><th>Nöbet</th><th>Ders</th><th>Görev</th>${actions?'<th class="no-print">İşlem</th>':''}</tr></thead><tbody>${rows.map((t,i)=>{
    const lessons=teacherLessons(t.id), tasks=teacherTasks(t.id), selected=t.id===selectedTeacherId?' selected-row':'';
    return `<tr class="teacher-row${selected}" data-teacher-id="${escapeHtml(t.id)}" onclick="goTeacherProfile(this.dataset.teacherId)"><td>${i+1}</td><td><strong>${teacherLink(t)}</strong><br><small>${escapeHtml(t.identityNo||'TC yok')}</small></td><td>${escapeHtml(t.branch)}</td><td>${formatPhone(t.phone)}</td><td>${formatEmail(t.email)}</td><td>${escapeHtml(t.classAdvisor||'—')}</td><td>${escapeHtml([t.dutyDay,t.dutyPlace].filter(Boolean).join(' / ')||'—')}</td><td>${lessons.length}</td><td>${tasks.length}</td>${actions?`<td class="no-print table-actions"><button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation();openTeacherModal(this.closest('tr').dataset.teacherId)"><i class="fas fa-pen"></i></button><button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation();deleteTeacher(this.closest('tr').dataset.teacherId)"><i class="fas fa-trash"></i></button></td>`:''}</tr>`;
  }).join('')}</tbody>`;
}
function renderTeacherReport(){
  const target=getEl('reportTeacherListContent');
  if(!target) return;
  const rows=sortedTeachers();
  target.innerHTML=`<div class="card obs-panel"><div class="card-header d-flex align-items-center justify-content-between"><h3 class="card-title"><i class="fas fa-user-tie me-2"></i>Öğretmen Listesi</h3><span class="small text-muted">${rows.length} öğretmen</span></div><div class="card-body p-0"><div class="table-responsive"><table class="table table-hover align-middle mb-0">${teacherTableHtml(rows,{actions:false})}</table></div></div></div>`;
}
function goTeacherProfile(id){
  const t=teacherById(id); if(!t)return false;
  selectedTeacherId=id;
  const search=getEl('teacherSearch'); if(search) search.value='';
  const select=getEl('teacherProfileSelect'); if(select) select.value=id;
  sTab('teachers');
  showTeacherProfile(id);
  setTimeout(()=>getEl('teacherProfile')?.scrollIntoView({behavior:'smooth',block:'start'}),60);
  return false;
}
function showTeacherProfile(id){
  const t=teacherById(id); if(!t)return;
  selectedTeacherId=id;
  const select=getEl('teacherProfileSelect'); if(select && [...select.options].some(o=>o.value===id)) select.value=id;
  document.querySelectorAll('#teacherTable tr').forEach(row=>row.classList.remove('selected-row'));
  document.querySelectorAll('#teacherTable tbody tr').forEach(row=>{ if(row.dataset.teacherId===id) row.classList.add('selected-row'); });
  const lessons=teacherLessons(id), tasks=teacherTasks(id), free=teacherFreeInfo(id);
  const day=getEl('teacherProfileDay')?.value||todayName()||schoolDays()[0];
  const dutyMeta=[t.dutyDay,t.dutyPlace].filter(Boolean).join(' / ')||'Kayıt yok';
  // Update selected badge
  const badge=getEl('teacherSelectedBadge');
  if(badge){ badge.style.display=''; badge.innerHTML=`<span class="selected-teacher-label"><i class="fas fa-user-tie me-1"></i>Seçili Öğretmen: <strong>${escapeHtml(teacherName(t))}</strong> <span class="selected-teacher-branch">(${escapeHtml(t.branch||'Branş yok')})</span></span>`; }
  getEl('teacherProfile').innerHTML=`<div class="card obs-panel profile-card"><div class="card-header profile-header"><div><h3 class="card-title"><i class="fas fa-id-card me-2"></i>${escapeHtml(teacherName(t))}</h3><p>${escapeHtml(t.branch||'Branş yok')}</p></div><div class="profile-actions no-print"><button class="btn btn-sm btn-outline-primary" onclick="openTeacherModal('${t.id}')"><i class="fas fa-pen me-1"></i>Düzenle</button><button class="btn btn-sm btn-outline-secondary" onclick="openTeacherSchedule('${t.id}')"><i class="fas fa-calendar-days me-1"></i>Program</button><button class="btn btn-sm btn-outline-secondary" onclick="printArea('teacherProfile','Ogretmen_Profili')"><i class="fas fa-print me-1"></i>Yazdır</button></div></div><div class="card-body profile-disclosures">
    ${disclosureSection({key:`teacher-${id}-daily-${day}`,title:`${day} Programı`,icon:'fas fa-calendar-day',meta:teacherName(t),content:buildTeacherDailySchedule(t, lessons, day),open:true})}
    ${disclosureSection({key:`teacher-${id}-personal`,title:'Kişisel Bilgiler',icon:'fas fa-user',meta:'Öğretmen kartı',content:buildTeacherPersonalInfo(t, lessons, tasks, free),open:false})}
    ${disclosureSection({key:`teacher-${id}-load`,title:'Ders Yükü',icon:'fas fa-book-open',meta:`${lessons.length} saat / hafta`,content:buildTeacherLessonLoad(t, lessons)})}
    ${disclosureSection({key:`teacher-${id}-weekly`,title:'Haftalık Program',icon:'fas fa-calendar-days',meta:`${schoolDays().length} gün`,content:buildTeacherProfileSchedule(t, lessons)})}
    ${disclosureSection({key:`teacher-${id}-duty`,title:'Nöbet',icon:'fas fa-clipboard-check',meta:dutyMeta,content:buildTeacherDutyInfo(t)})}
    ${disclosureSection({key:`teacher-${id}-tasks`,title:'Görevler',icon:'fas fa-list-check',meta:`${tasks.length} görev`,content:buildTeacherProfileTasks(t, tasks)})}
    ${disclosureSection({key:`teacher-${id}-free`,title:'Boş Saatler',icon:'fas fa-calendar-minus',meta:`${free.freeSlots.length} boş ders`,content:buildTeacherFreeSlots(free)})}
  </div></div>`;
}
function clearTeacherSearch(){ const input=getEl('teacherSearch'); if(input) input.value=''; const results=getEl('teacherSearchResults'); if(results) results.innerHTML=''; renderTeachers(); }
function openTeacherModal(id=''){ const t=id?teacherById(id):null, nameParts=t?teacherNameParts(t):null; getEl('teacherModalTitle').textContent=t?'Öğretmen Düzenle':'Öğretmen Ekle'; getEl('teacherId').value=t?.id||''; ['FirstName','LastName','IdentityNo','Branch','Phone','Email','ClassAdvisor','Club','Project','DutyPlace','ScheduleNote'].forEach(k=>{ const map={FirstName:'firstName',LastName:'lastName',IdentityNo:'identityNo',Branch:'branch',Phone:'phone',Email:'email',ClassAdvisor:'classAdvisor',Club:'club',Project:'project',DutyPlace:'dutyPlace',ScheduleNote:'scheduleNote'}; getEl('t'+k).value=t?.[map[k]]||''; }); if(nameParts){ getEl('tFirstName').value=nameParts.first; getEl('tLastName').value=nameParts.last; } getEl('tFreeDay').value=t?.freeDay||''; getEl('tDutyDay').value=t?.dutyDay||''; bootstrap.Modal.getOrCreateInstance(getEl('teacherModal')).show(); }
function saveTeacherForm(){ const oldId=getEl('teacherId').value, identityNo=getEl('tIdentityNo').value.trim(), id=identityNo||oldId||uid('t'); const draft={firstName:getEl('tFirstName').value.trim(),lastName:getEl('tLastName').value.trim()}; const nameParts=teacherNameParts(draft); const t={id,firstName:nameParts.first,lastName:nameParts.last,identityNo,branch:getEl('tBranch').value.trim(),phone:getEl('tPhone').value.trim(),email:getEl('tEmail').value.trim(),classAdvisor:cleanClassName(getEl('tClassAdvisor').value),club:getEl('tClub').value.trim(),project:getEl('tProject').value.trim(),freeDay:getEl('tFreeDay').value,dutyDay:getEl('tDutyDay').value,dutyPlace:getEl('tDutyPlace').value.trim(),scheduleNote:getEl('tScheduleNote').value.trim()}; if(!t.firstName||!t.lastName){showToast('Ad ve soyad zorunlu.','warning');return;} if(oldId&&oldId!==id){DB.schedules.forEach(s=>{if(s.teacherId===oldId)s.teacherId=id;}); (DB.tasks||[]).forEach(g=>{if(g.teacherId===oldId)g.teacherId=id;}); if(selectedTeacherId===oldId)selectedTeacherId=id;} const i=DB.teachers.findIndex(x=>x.id===oldId||x.id===id); if(i>=0)DB.teachers[i]=t; else DB.teachers.push(t); saveDB(); bootstrap.Modal.getInstance(getEl('teacherModal')).hide(); renderAll(); showTeacherProfile(t.id); showToast('Öğretmen kaydedildi.','success'); }
function deleteTeacher(id){ const t=teacherById(id); if(!t||!confirm(`${teacherName(t)} silinsin mi?`))return; DB.teachers=DB.teachers.filter(x=>x.id!==id); DB.schedules=DB.schedules.filter(x=>x.teacherId!==id); DB.tasks=(DB.tasks||[]).filter(x=>x.teacherId!==id); if(selectedTeacherId===id){selectedTeacherId=''; getEl('teacherProfile').innerHTML='';} saveDB(); renderAll(); showToast('Öğretmen silindi.','success'); }

function formatPhone(phone){
  if(!phone) return '—';
  const digits=phone.replace(/\D/g,'');
  // Başında 0 yoksa ekle (10 haneli Türk numarası için)
  const display=digits.length===10?'0'+digits:(digits.length===11&&digits.startsWith('0')?digits:'0'+digits);
  const tel=digits.length===10?'+90'+digits:(digits.startsWith('90')?'+'+digits:'+90'+digits.replace(/^0/,''));
  return `<a href="tel:${tel}" class="contact-link"><i class="fas fa-phone me-1"></i>${display}</a>`;
}
function formatEmail(email){
  if(!email) return '—';
  return `<a href="mailto:${escapeHtml(email)}" class="contact-link"><i class="fas fa-envelope me-1"></i>${escapeHtml(email)}</a>`;
}
function profileInfo(label,value,icon){ return `<div class="col-6 col-xl-3"><div class="info-line profile-info"><span><i class="${icon} me-1"></i>${label}</span><strong>${escapeHtml(value)}</strong></div></div>`; }
function profileInfoRaw(label,valueHtml,icon){ return `<div class="col-6 col-xl-3"><div class="info-line profile-info"><span><i class="${icon} me-1"></i>${label}</span><strong>${valueHtml}</strong></div></div>`; }
function buildTeacherPersonalInfo(t, lessons, tasks, free){
  return `<div class="row g-3">
      ${profileInfo('T.C. Kimlik No',t.identityNo||'—','fas fa-fingerprint')}
      ${profileInfo('Branş',t.branch||'—','fas fa-book-open')}
      ${profileInfoRaw('Telefon',formatPhone(t.phone),'fas fa-phone')}
      ${profileInfoRaw('E-posta',formatEmail(t.email),'fas fa-envelope')}
      ${profileInfo('Sınıf Öğretmenliği',t.classAdvisor||'—','fas fa-users')}
      ${profileInfo('Kulüp',t.club||'—','fas fa-people-group')}
      ${profileInfo('Proje',t.project||'—','fas fa-diagram-project')}
      ${profileInfo('Ders Saati',lessons.length,'fas fa-clock')}
      ${profileInfo('Boş Gün',free.freeDays||'—','fas fa-calendar-minus')}
      ${profileInfo('Görev',tasks.length,'fas fa-list-check')}
      ${profileInfo('Ders Programı Notu',t.scheduleNote||'—','fas fa-note-sticky')}
      ${profileInfo('Nöbet', [t.dutyDay,t.dutyPlace].filter(Boolean).join(' / ')||'—','fas fa-clipboard-check')}
    </div>`;
}
function buildTeacherLessonLoad(t, lessons){
  const map=new Map();
  lessons.forEach(s=>{
    const key=`${s.className}__${plainKey(s.subject)}`;
    const item=map.get(key)||{className:s.className,subject:s.subject,hours:0,days:new Set()};
    item.hours++;
    item.days.add(s.day);
    map.set(key,item);
  });
  const rows=[...map.values()].sort((a,b)=>classCompare(a.className,b.className)||displaySubjectName(a.subject).localeCompare(displaySubjectName(b.subject),'tr')).map(item=>`<tr><td><strong>${escapeHtml(item.className)}</strong></td><td>${escapeHtml(displaySubjectName(item.subject))}</td><td>${item.hours}</td><td>${escapeHtml([...item.days].sort((a,b)=>dayOrder(a)-dayOrder(b)).join(', '))}</td></tr>`).join('');
  return `${rows?`<div class="table-responsive"><table class="table table-sm table-hover mb-0"><thead><tr><th>Sınıf</th><th>Ders</th><th>Saat</th><th>Günler</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyState('Bu öğretmen için ders kaydı yok.')}`;
}
function teacherLessons(id){ return DB.schedules.filter(s=>s.teacherId===id).sort((a,b)=>dayOrder(a.day)-dayOrder(b.day)||hourOrder(a.hour)-hourOrder(b.hour)||String(a.className).localeCompare(String(b.className),'tr')); }
function teacherTasks(id){ return (DB.tasks||[]).filter(t=>t.teacherId===id).sort((a,b)=>(a.kind||'').localeCompare(b.kind||'','tr')||(a.title||'').localeCompare(b.title||'','tr')); }
function teacherFreeInfo(id){
  const freeSlots=[], freeDays=[];
  schoolDays().forEach(day=>{
    let dayBusy=0;
    schoolHours().forEach(hour=>{
      const busy=DB.schedules.some(s=>s.teacherId===id&&s.day===day&&Number(s.hour)===Number(hour));
      if(busy) dayBusy++; else freeSlots.push({day,hour,label:`${day} ${lessonHourLabel(hour)}`});
    });
    if(dayBusy===0) freeDays.push(day);
  });
  return {freeSlots, freeDays:freeDays.join(', ')};
}
function buildTeacherProfileSchedule(t, lessons){
  const days=schoolDays(), hours=schoolHours();
  const hourHeads=hours.map(hour=>`<th>${lessonBoardHeader(hour)}</th>`).join('');
  const timeHeads=hours.map(hour=>{ const t=lessonTimeByHour(hour); return `<th><span class="lesson-time-sub">${t?.start&&t?.end?`${escapeHtml(t.start)}<br>${escapeHtml(t.end)}`:''}</span></th>`; }).join('');
  const rows=days.map(day=>{
    const cells=[];
    for(let i=0;i<hours.length;i++){
      const hour=hours[i], slot=lessons.filter(s=>s.day===day&&Number(s.hour)===hour);
      const span=slot.length ? matchingSlotSpan(lessons,day,i,hours,slot) : 1;
      const duty=t.dutyDay===day?' duty-sheet':'';
      cells.push(`<td colspan="${span}" class="${slot.length?'teacher-board-filled':'teacher-board-empty'}${duty}">${slot.length?teacherBoardSlotHtml(slot):'—'}</td>`);
      i+=span-1;
    }
    return `<tr><th>${escapeHtml(day)}</th>${cells.join('')}</tr>`;
  }).join('');
  return `<div class="section-body-actions no-print"><button class="btn btn-sm btn-outline-secondary" onclick="openTeacherSchedule('${t.id}')">Programda Aç</button></div><div class="table-responsive"><table class="table table-bordered teacher-program-board mb-0"><thead><tr><th>Ders/Gün</th>${hourHeads}</tr><tr><th>Saat</th>${timeHeads}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function teacherBoardSlotHtml(slots){
  const classes=[...new Set(slots.map(s=>s.className))].join(' / ');
  const subjects=[...new Set(slots.map(s=>displaySubjectName(s.subject)))].join(' / ');
  const notes=[...new Set(slots.map(scheduleNoteText).filter(Boolean))].join(' / ');
  return `<div class="teacher-board-slot"><strong>${escapeHtml(classes)}</strong><span>${escapeHtml(subjects)}</span>${notes?`<small>${escapeHtml(notes)}</small>`:''}</div>`;
}

function teacherDailySlotHtml(slot){
  const classes=[...new Set(slot.map(s=>s.className))].join(' / ');
  const subjects=[...new Set(slot.map(s=>displaySubjectName(s.subject)))].join(' / ');
  const notes=[...new Set(slot.map(scheduleNoteText).filter(Boolean))].join(' / ');
  return `<div class="daily-slot"><strong>${escapeHtml(classes)}</strong><span>${escapeHtml(subjects)}</span>${notes?`<small>${escapeHtml(notes)}</small>`:''}</div>`;
}

function buildTeacherDailySchedule(t, lessons, day){
  const dayLessons=lessons.filter(s=>s.day===day);
  const cards=schoolHours().map(hour=>{
    const slot=dayLessons.filter(s=>Number(s.hour)===Number(hour));
    const duty=t.dutyDay===day?' duty-sheet':'';
    return `<div class="daily-lesson-card${slot.length?' has-lesson':''}${duty}"><div class="daily-lesson-hour">${lessonHourCell(hour)}</div>${slot.length?teacherDailySlotHtml(slot):'<span class="text-muted">—</span>'}</div>`;
  }).join('');
  const noLessonsMsg=dayLessons.length===0?`<div class="empty-state mt-2"><i class="fas fa-calendar-xmark"></i><span>${escapeHtml(day)} günü dersi bulunmamaktadır.</span></div>`:'';
  return `<div class="daily-program-grid">${cards}</div>${noLessonsMsg}`;
}
function buildTeacherDutyInfo(t){
  const hasDuty=!!(t.dutyDay||t.dutyPlace);
  return `<div class="section-body-actions no-print"><button class="btn btn-sm btn-outline-secondary" onclick="sTab('reports'); setReportMode('duty')">Nöbet Listesinde Aç</button></div>${hasDuty?`<div class="duty-profile-box"><div><span>Gün</span><strong>${escapeHtml(t.dutyDay||'—')}</strong></div><div><span>Yer</span><strong>${escapeHtml(t.dutyPlace||'—')}</strong></div></div>`:emptyState('Bu öğretmen için nöbet kaydı yok.')}`;
}
function buildTeacherProfileTasks(t, tasks){
  const rows=tasks.slice(0,24).map(task=>`<tr><td>${escapeHtml(task.kind||'Genel')}</td><td><strong>${escapeHtml(task.title||'—')}</strong></td><td>${escapeHtml(task.description||'—')}</td><td>${escapeHtml(task.startDate||'—')}</td><td>${escapeHtml(task.endDate||'—')}</td></tr>`).join('');
  return `${rows?`<div class="table-responsive"><table class="table table-sm table-hover mb-0"><thead><tr><th>Tür</th><th>Görev Tanımı</th><th>Açıklamalar</th><th>Başlangıç</th><th>Bitiş</th></tr></thead><tbody>${rows}</tbody></table></div>${tasks.length>24?`<div class="text-muted small mt-2">İlk 24 görev gösteriliyor.</div>`:''}`:emptyState('Bu öğretmen için görev kaydı yok.')}`;
}
function buildTeacherFreeSlots(free){
  const grouped=schoolDays().map(day=>({day, slots:free.freeSlots.filter(s=>s.day===day)}));
  return `<div class="free-slot-grid">${grouped.map(g=>`<div class="free-day"><strong>${g.day}</strong><div>${g.slots.length?g.slots.map(s=>`<span class="soft-chip">${escapeHtml(lessonHourLabel(s.hour))}</span>`).join(''):'<span class="text-muted">Dolu gün</span>'}</div></div>`).join('')}</div>`;
}
function openTeacherSchedule(id){
  sTab('reports');
  setReportMode('schedule');
  const view=getEl('scheduleViewMode'), teacher=getEl('scheduleTeacherFilter'), cls=getEl('scheduleClassFilter'), grade=getEl('scheduleGradeFilter'), day=getEl('scheduleDayFilter'), hour=getEl('scheduleHourFilter');
  if(view)view.value='weekly';
  if(teacher)teacher.value=id;
  if(cls)cls.value='';
  if(grade)grade.value='';
  if(day)day.value='';
  if(hour)hour.value='';
  renderSchedule();
}
