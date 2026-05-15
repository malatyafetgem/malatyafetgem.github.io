let scheduleEntriesVisible=false;

function openScheduleModal(id=''){
  fillDynamicSelects();
  const s=DB.schedules.find(x=>x.id===id)||null;
  getEl('scheduleModalTitle').textContent=s?'Ders Düzenle':'Ders Ekle';
  getEl('scheduleId').value=s?.id||'';
  getEl('sTeacher').value=s?.teacherId||sortedTeachers()[0]?.id||'';
  getEl('sClass').value=s?.className||DB.settings.classes[0];
  getEl('sSubject').value=s?.subject||teacherById(getEl('sTeacher').value)?.branch||'';
  getEl('sDay').value=s?.day||schoolDays()[0];
  getEl('sHour').value=s?.hour||schoolHours()[0]||1;
  getEl('sNote').value=s?.note||'';
  bootstrap.Modal.getOrCreateInstance(getEl('scheduleModal')).show();
}

function saveScheduleForm(){
  const id=getEl('scheduleId').value||uid('s');
  const hour=Number(getEl('sHour').value), time=lessonTimeByHour(hour);
  const teacherId=getEl('sTeacher').value;
  const item={id,teacherId,className:getEl('sClass').value,subject:normalizeSubjectName(getEl('sSubject').value.trim(), teacherId),day:getEl('sDay').value,hour,startTime:time?.start||'',endTime:time?.end||'',note:getEl('sNote').value.trim()};
  if(!item.teacherId||!item.className||!item.subject||!item.day||!item.hour){showToast('Öğretmen, sınıf, ders, gün ve saat zorunlu.','warning');return;}
  const conflict=findScheduleSaveConflict(item,id);
  if(conflict&&!confirm(`${conflict} Yine de kaydedilsin mi?`)) return;
  const i=DB.schedules.findIndex(x=>x.id===id);
  if(i>=0)DB.schedules[i]=item; else DB.schedules.push(item);
  saveDB();
  bootstrap.Modal.getInstance(getEl('scheduleModal')).hide();
  renderAll();
  showToast('Ders kaydedildi.','success');
}

function findScheduleSaveConflict(item,id=''){
  const sameTime=s=>s.id!==id&&s.day===item.day&&Number(s.hour)===Number(item.hour);
  const teacherConflict=DB.schedules.find(s=>sameTime(s)&&s.teacherId===item.teacherId);
  if(teacherConflict) return 'Bu öğretmenin aynı gün ve saatte başka bir dersi var.';
  const classItems=DB.schedules.filter(s=>sameTime(s)&&s.className===item.className).concat(item);
  if(classItems.length>1&&!isAllowedSharedClassSlot(classItems)) return 'Bu sınıfın aynı gün ve saatte başka bir dersi var.';
  return '';
}

function deleteSchedule(id){
  if(!confirm('Bu ders kaydı silinsin mi?')) return;
  DB.schedules=DB.schedules.filter(s=>s.id!==id);
  saveDB();
  renderAll();
  showToast('Ders silindi.','success');
}

function scheduleFilters(){
  const gradeEl=getEl('scheduleGradeFilter');
  const classEl=getEl('scheduleClassFilter');
  let grade=gradeEl?.value||'';
  let className=getEl('scheduleClassFilter')?.value||'';
  const classLevel=className?classGrade(className):'';
  if(className&&classLevel&&grade!==classLevel&&gradeEl&&[...gradeEl.options].some(o=>o.value===classLevel)){
    grade=classLevel;
    gradeEl.value=classLevel;
  }
  if(grade&&className&&classGrade(className)!==String(grade)){
    className='';
    if(classEl) classEl.value='';
  }
  return {
    mode:getEl('scheduleViewMode')?.value||'weekly',
    teacherId:getEl('scheduleTeacherFilter')?.value||'',
    className,
    grade,
    day:getEl('scheduleDayFilter')?.value||'',
    hour:getEl('scheduleHourFilter')?.value||''
  };
}

function filteredScheduleItems(){
  const f=scheduleFilters();
  return DB.schedules.filter(s=>(!f.teacherId||s.teacherId===f.teacherId)&&(!f.className||s.className===f.className)&&(!f.grade||classGrade(s.className)===String(f.grade))&&(!f.day||s.day===f.day)&&(!f.hour||Number(s.hour)===Number(f.hour)));
}

function renderSchedule(){
  fillDynamicSelects();
  const f=scheduleFilters();
  syncScheduleToolbar(f);
  const visibleItems=visibleFilteredScheduleItems();
  let body='';
  if(!DB.teachers.length) body=emptyState('Program oluşturmak için önce öğretmen ekleyin.');
  else if(f.mode==='teacherSheet') body=buildTeacherSheet();
  else if(f.mode==='classSheet') body=buildClassSheet();
  else if(f.mode==='classList') body=buildClassProgramList();
  else if(f.mode==='free') body=buildFreeTimeReport();
  else body=buildWeeklyGrid(visibleItems);
  const entryControls=f.mode==='free'?'':`<div class="page-actions no-print"><span class="small text-muted">${visibleItems.length} ders</span><button class="btn btn-sm btn-outline-secondary" onclick="toggleScheduleEntries()"><i class="fas fa-list me-1"></i>Ders Kayıtlarını ${scheduleEntriesVisible?'Gizle':'Göster'}</button>${scheduleEntriesVisible?`<button class="btn btn-sm btn-outline-secondary" onclick="printArea('scheduleEntryList','Ders_Kayitlari')"><i class="fas fa-print me-1"></i>Yazdır</button>`:''}</div>`;
  const headerAside=f.mode==='free'?'<span class="small text-muted">Dinamik hesap</span>':(entryControls||`<span class="small text-muted">${visibleItems.length} ders</span>`);
  getEl('scheduleContent').innerHTML=`<div class="card obs-panel"><div class="card-header d-flex align-items-center justify-content-between"><h3 class="card-title"><i class="fas fa-table me-2"></i>${scheduleTitle()}</h3>${headerAside}</div><div class="card-body">${buildScheduleHealthPanel()}${body}${f.mode==='free'||!scheduleEntriesVisible?'':buildScheduleEntryList()}</div></div>`;
}

function clearScheduleFilters(){
  ['scheduleTeacherFilter','scheduleClassFilter','scheduleGradeFilter','scheduleDayFilter','scheduleHourFilter'].forEach(id=>{
    const el=getEl(id);
    if(el) el.value='';
  });
  renderSchedule();
}

function syncScheduleToolbar(f=scheduleFilters()){
  const modeFilters={
    weekly:['teacher','class','grade','day','hour'],
    daily:['teacher','class','grade','day','hour'],
    classList:['teacher','class','grade','day','hour'],
    teacherSheet:['teacher','class','day','hour'],
    classSheet:['teacher','class','grade','day','hour'],
    free:['teacher','day','hour']
  };
  const visibleFilters=new Set(modeFilters[f.mode]||modeFilters.weekly);
  document.querySelectorAll('[data-schedule-filter]').forEach(el=>el.classList.toggle('d-none',!visibleFilters.has(el.dataset.scheduleFilter)));
  const descriptors=scheduleFilterDescriptors(f).filter(item=>visibleFilters.has(item.key)&&item.value);
  const summary=getEl('scheduleFilterSummary');
  if(summary) summary.innerHTML=descriptors.length
    ? descriptors.map(item=>`<span class="soft-chip">${escapeHtml(item.label)}: ${escapeHtml(item.value)}</span>`).join('')
    : '<span class="text-muted">Tüm kayıtlar</span>';
  const count=getEl('scheduleFilterCount');
  if(count) count.textContent=descriptors.length?`${descriptors.length} etkin`:'';
}

function scheduleFilterDescriptors(f=scheduleFilters()){
  return [
    {key:'teacher',label:'Öğretmen',value:f.teacherId?teacherName(teacherById(f.teacherId)):''},
    {key:'class',label:'Sınıf',value:f.className||''},
    {key:'grade',label:'Seviye',value:f.grade?`${f.grade}. Sınıflar`:''},
    {key:'day',label:'Gün',value:f.day||''},
    {key:'hour',label:'Saat',value:f.hour?`${f.hour}. Ders`:''}
  ];
}

function toggleScheduleEntries(){
  scheduleEntriesVisible=!scheduleEntriesVisible;
  renderSchedule();
}

function scheduleTitle(){
  const f=scheduleFilters();
  const t=f.teacherId?teacherName(teacherById(f.teacherId)):'Tüm Öğretmenler';
  const c=f.className||(f.grade?`${f.grade}. Sınıflar`:'Tüm Sınıflar');
  const d=f.mode==='daily' ? (f.day||todayName()||schoolDays()[0]) : (f.day||'Haftalık');
  const h=f.hour ? ` · ${f.hour}. Ders` : '';
  if(f.mode==='teacherSheet') return 'Öğretmen Çarşaf Programı';
  if(f.mode==='classSheet') return 'Sınıf Çarşaf Programı';
  if(f.mode==='classList') return `${c} Programları`;
  if(f.mode==='free') return 'Boş Saat / Boş Gün Sorgusu';
  return `${t} · ${c} · ${d}${h}`;
}

function buildClassProgramList(){
  const f=scheduleFilters();
  const classes=filteredClassList(f);
  const days=visibleScheduleDays(f), hours=visibleScheduleHours(f);
  if(!classes.length) return emptyState('Seçili filtrelere uygun sınıf yok.');
  return `<div class="class-program-list">${classes.map((cls,i)=>disclosureSection({
    key:`report-class-${cls}-${days.join('-')}-${hours.join('-')}-${f.teacherId||'all'}`,
    title:`${cls} Haftalık Program`,
    icon:'fas fa-users',
    meta:`${days.length} gün · ${hours.length} ders`,
    content:buildReportClassProgramBoard(cls,days,hours,f.teacherId),
    open:classes.length===1||i===0
  })).join('')}</div>`;
}

function buildReportClassProgramBoard(className,days,hours,teacherId=''){
  const hourHeads=hours.map(hour=>`<th>${lessonBoardHeader(hour)}</th>`).join('');
  const timeHeads=hours.map(hour=>{ const t=lessonTimeByHour(hour); return `<th><span class="lesson-time-sub">${t?.start&&t?.end?`${escapeHtml(t.start)}<br>${escapeHtml(t.end)}`:''}</span></th>`; }).join('');
  const rows=days.map(day=>`<tr><th>${escapeHtml(day)}</th>${classProgramRowCells(className,day,hours,teacherId)}</tr>`).join('');
  return `<div class="table-responsive"><table class="table table-bordered class-program-board mb-0"><thead><tr><th>Ders/Gün</th>${hourHeads}</tr><tr><th>Saat</th>${timeHeads}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function buildWeeklyGrid(items){
  const f=scheduleFilters(), days=visibleScheduleDays(f), hours=visibleScheduleHours(f);
  const skipped=new Set();
  const rows=hours.map((h,hi)=>`<tr><th>${lessonHourCell(h,true)}</th>${days.map(d=>{
    const cellKey=`${d}__${h}`;
    if(skipped.has(cellKey)) return '';
    const slot=items.filter(x=>x.day===d&&Number(x.hour)===h);
    if(!slot.length)return '<td class="empty-cell">—</td>';
    const span=matchingSlotSpan(items,d,hi,hours,slot);
    for(let i=1;i<span;i++) skipped.add(`${d}__${hours[hi+i]}`);
    const hasDuty=slot.some(s=>teacherById(s.teacherId)?.dutyDay===d);
    return `<td rowspan="${span}" class="lesson-cell${hasDuty?' duty-mark':''}">${slot.map(s=>{
      const t=teacherById(s.teacherId);
      const note=scheduleNoteText(s);
      return `<div class="slot-entry"><strong>${escapeHtml(displaySubjectName(s.subject))}</strong><span>${teacherLink(t)}</span><small>${escapeHtml(s.className)}${note?' · '+escapeHtml(note):''}</small><button class="btn btn-sm btn-link no-print" onclick="openScheduleModal('${s.id}')">Düzenle</button></div>`;
    }).join('')}${mergeSpanLabel(span)}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="table-responsive"><table class="table schedule-grid"><thead><tr><th>Saat</th>${days.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function buildTeacherSheet(){
  const f=scheduleFilters();
  const teachers=sortedTeachers().filter(t=>!f.teacherId||t.id===f.teacherId);
  const days=visibleScheduleDays(f), hours=visibleScheduleHours(f);
  const head=days.map(d=>`<th colspan="${hours.length}">${d}</th>`).join('');
  const sub=days.map(()=>hours.map(h=>`<th>${h}<br><small>${escapeHtml(lessonTimeByHour(h)?.start||'')}</small></th>`).join('')).join('');
  const rows=teachers.map(t=>{
    const cells=days.map(d=>{
      const dayCells=[];
      for(let i=0;i<hours.length;i++){
        const h=hours[i];
        const s=DB.schedules.find(x=>x.teacherId===t.id&&x.day===d&&Number(x.hour)===h&&(!f.className||x.className===f.className));
        let span=1;
        if(s){
          const sig=teacherSheetSignature(s);
          for(let j=i+1;j<hours.length;j++){
            if(hours[j]!==hours[j-1]+1) break;
            const next=DB.schedules.find(x=>x.teacherId===t.id&&x.day===d&&Number(x.hour)===hours[j]&&(!f.className||x.className===f.className));
            if(!next || teacherSheetSignature(next)!==sig) break;
            span++;
          }
        }
      const duty=t.dutyDay===d?' duty-sheet':'';
        dayCells.push(`<td colspan="${span}" class="${s?'sheet-filled sheet-merged':'sheet-empty'}${duty}" title="${escapeHtml(s?`${s.subject} ${s.className}`:(t.dutyDay===d?'Nöbet günü':''))}">${s?`${escapeHtml(s.className)}${mergeSpanLabel(span)}`:'—'}</td>`);
        i+=span-1;
      }
      return dayCells.join('');
    }).join('');
    return `<tr><th class="sheet-name" title="${escapeHtml(`${teacherName(t)} · ${t.branch||''}`)}">${escapeHtml(sheetTeacherCode(t))}<small>(${escapeHtml(sheetSubjectCode(t.branch))})</small></th>${cells}</tr>`;
  }).join('');
  return `<div class="table-responsive sheet-scroll"><table class="table table-bordered schedule-sheet teacher-sheet"><thead><tr><th rowspan="2">Öğretmen</th>${head}</tr><tr>${sub}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function buildClassSheet(){
  const f=scheduleFilters();
  const classes=filteredClassList(f);
  const days=visibleScheduleDays(f), hours=visibleScheduleHours(f);
  const head=days.map(d=>`<th colspan="${hours.length}">${d}</th>`).join('');
  const sub=days.map(()=>hours.map(h=>`<th>${h}<br><small>${escapeHtml(lessonTimeByHour(h)?.start||'')}</small></th>`).join('')).join('');
  const rows=classes.map(cls=>{
    const cells=days.map(d=>{
      const dayCells=[];
      for(let i=0;i<hours.length;i++){
        const h=hours[i];
        const slot=DB.schedules.filter(x=>x.className===cls&&x.day===d&&Number(x.hour)===h&&(!f.teacherId||x.teacherId===f.teacherId));
        let span=1;
        if(slot.length){
          const sig=scheduleSlotSignature(slot);
          for(let j=i+1;j<hours.length;j++){
            if(hours[j]!==hours[j-1]+1) break;
            const next=DB.schedules.filter(x=>x.className===cls&&x.day===d&&Number(x.hour)===hours[j]&&(!f.teacherId||x.teacherId===f.teacherId));
            if(scheduleSlotSignature(next)!==sig) break;
            span++;
          }
        }
      const names=[...new Set(slot.map(s=>sheetTeacherCode(teacherById(s.teacherId))))].join(', ');
      const subjects=[...new Set(slot.map(s=>sheetSubjectCode(s.subject)))].join('/');
      const title=slot.map(s=>`${s.subject} · ${teacherName(teacherById(s.teacherId))}`).join(' | ');
        const hasDuty=slot.some(s=>teacherById(s.teacherId)?.dutyDay===d);
        dayCells.push(`<td colspan="${span}" class="${slot.length?'sheet-filled sheet-merged':'sheet-empty'}${hasDuty?' duty-sheet':''}" title="${escapeHtml(title)}">${slot.length?`${escapeHtml(subjects)}<br><small>${escapeHtml(names)}</small>${mergeSpanLabel(span)}`:'—'}</td>`);
        i+=span-1;
      }
      return dayCells.join('');
    }).join('');
    return `<tr><th class="sheet-name">${cls}</th>${cells}</tr>`;
  }).join('');
  return `<div class="table-responsive sheet-scroll"><table class="table table-bordered schedule-sheet class-sheet"><thead><tr><th rowspan="2">Sınıf</th>${head}</tr><tr>${sub}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function scheduleSlotSignature(slot){
  if(!slot.length) return '';
  return slot.map(s=>[s.teacherId,s.className,plainKey(s.subject),plainKey(s.note||'')].join('|')).sort().join('||');
}

function matchingSlotSpan(items,day,hourIndex,hours,slot){
  const signature=scheduleSlotSignature(slot);
  if(!signature) return 1;
  let span=1;
  for(let i=hourIndex+1;i<hours.length;i++){
    if(hours[i]!==hours[i-1]+1) break;
    const next=items.filter(x=>x.day===day&&Number(x.hour)===hours[i]);
    if(scheduleSlotSignature(next)!==signature) break;
    span++;
  }
  return span;
}

function teacherSheetSignature(s){
  return [s.teacherId,s.className,plainKey(s.subject),plainKey(s.note||'')].join('|');
}

function mergeSpanLabel(span){
  return span>1 ? `<small class="slot-span-note">${span} saat</small>` : '';
}

function buildFreeTimeReport(){
  const f=scheduleFilters();
  const teachers=sortedTeachers().filter(t=>!f.teacherId||t.id===f.teacherId);
  const days=visibleScheduleDays(f), hours=visibleScheduleHours(f);
  const summary=(f.day||f.hour)?buildFreeQuerySummary(teachers,days,hours,f):buildFreeDayOverview(teachers);
  const rows=teachers.map(t=>{
    const free=[];
    days.forEach(d=>hours.forEach(h=>{ if(isTeacherFreeAt(t.id,d,h)) free.push(`${d} ${lessonHourLabel(h)}`); }));
    const freeDayLabel=days.filter(d=>schoolHours().every(h=>isTeacherFreeAt(t.id,d,h))).join(', ');
    return `<tr><td><strong>${teacherLink(t)}</strong><br><small>${escapeHtml(t.branch||'')}</small></td><td>${escapeHtml(t.freeDay||'—')}</td><td>${escapeHtml(freeDayLabel||'—')}</td><td>${free.length}</td><td>${free.slice(0,24).map(x=>`<span class="soft-chip">${escapeHtml(x)}</span>`).join('')}${free.length>24?`<span class="text-muted"> +${free.length-24}</span>`:''}</td></tr>`;
  }).join('');
  return `${summary}${disclosureSection({
    key:`free-detail-${f.teacherId||'all'}-${days.join('-')}-${hours.join('-')}`,
    title:'Ayrıntılı Boş Saat Tablosu',
    icon:'fas fa-table',
    meta:`${teachers.length} öğretmen`,
    content:`<div class="table-responsive"><table class="table table-hover mb-0"><thead><tr><th>Öğretmen</th><th>Kayıtlı Boş Gün</th><th>Programda Boş Gün</th><th>Boş Saat</th><th>Uygun Saatler</th></tr></thead><tbody>${rows}</tbody></table></div>`
  })}`;
}

function buildFreeQuerySummary(teachers,days,hours,f){
  const queryTeachers=teachers.filter(t=>days.some(d=>hours.some(h=>isTeacherFreeAt(t.id,d,h))));
  const hourLabel=f.hour?`${lessonHourLabel(f.hour)} (${escapeHtml(lessonTimeRange(f.hour)||'saat yok')})`:'Tüm ders saatleri';
  const cards=queryTeachers.map(t=>`<div class="free-query-card"><strong>${teacherLink(t)}</strong><span>${escapeHtml(t.branch||'Branş yok')}</span><small>${escapeHtml(freeSlotLabelForTeacher(t.id,days,hours))}</small></div>`).join('');
  return `<div class="free-report-block"><div class="section-title-row"><h4><i class="fas fa-calendar-check me-2"></i>Seçili Zamanda Boş Olan Öğretmenler</h4><span class="small text-muted">${queryTeachers.length} öğretmen</span></div><p class="free-report-note">${escapeHtml(days.join(', '))} · ${hourLabel}</p><div class="free-query-grid">${cards||emptyState('Bu seçimde uygun öğretmen yok.')}</div></div>`;
}

function buildFreeDayOverview(teachers){
  const cards=schoolDays().map(day=>{
    const free=teachers.filter(t=>isTeacherFreeAllDay(t.id,day));
    const chips=free.map(t=>`<span class="soft-chip">${teacherLink(t)}</span>`).join('');
    return `<div class="free-day-summary"><strong>${escapeHtml(day)}</strong><span>${free.length} öğretmen</span><div class="chip-wrap">${chips||'<span class="text-muted">Tam boş günü olan yok.</span>'}</div></div>`;
  }).join('');
  return `<div class="free-report-block"><div class="section-title-row"><h4><i class="fas fa-calendar-minus me-2"></i>Programda Tam Boş Günler</h4><span class="small text-muted">Pazartesi-Cuma</span></div><p class="free-report-note">Aşağıdaki özet, ders programında o gün hiç dersi görünmeyen öğretmenleri gösterir. Belirli gün veya ders saati seçersen uygun öğretmenler ayrı listelenir.</p><div class="free-day-overview">${cards}</div></div>`;
}

function freeSlotLabelForTeacher(teacherId,days,hours){
  const slots=[];
  days.forEach(day=>hours.forEach(hour=>{ if(isTeacherFreeAt(teacherId,day,hour)) slots.push(`${day} ${lessonHourLabel(hour)}`); }));
  return slots.slice(0,10).join(', ') + (slots.length>10?` +${slots.length-10}`:'');
}

function visibleScheduleDays(f=scheduleFilters()){
  const days=schoolDays();
  if(f.mode==='daily') return [f.day||todayName()||days[0]];
  return days.filter(d=>!f.day||d===f.day);
}

function visibleScheduleHours(f=scheduleFilters()){
  return schoolHours().filter(h=>!f.hour||Number(h)===Number(f.hour));
}

function visibleFilteredScheduleItems(){
  const f=scheduleFilters(), days=visibleScheduleDays(f), hours=visibleScheduleHours(f);
  return filteredScheduleItems().filter(s=>days.includes(s.day)&&hours.includes(Number(s.hour)));
}

function classGrade(className){
  const m=String(className||'').match(/^(\d+)/);
  return m?m[1]:'';
}

function filteredClassList(f=scheduleFilters()){
  return (DB.settings.classes||CLASS_LIST).filter(c=>(!f.className||c===f.className)&&(!f.grade||classGrade(c)===String(f.grade)));
}

function isTeacherFreeAt(teacherId, day, hour){
  return !DB.schedules.some(s=>s.teacherId===teacherId&&s.day===day&&Number(s.hour)===Number(hour));
}

function isTeacherFreeAllDay(teacherId, day){
  return !!day && schoolHours().every(hour=>isTeacherFreeAt(teacherId,day,hour));
}

function scheduleConflicts(){
  const byTeacher=new Map(), byClass=new Map();
  DB.schedules.forEach(s=>{
    const teacherKey=`${s.teacherId}__${s.day}__${s.hour}`;
    const classKey=`${s.className}__${s.day}__${s.hour}`;
    if(!byTeacher.has(teacherKey)) byTeacher.set(teacherKey,[]);
    if(!byClass.has(classKey)) byClass.set(classKey,[]);
    byTeacher.get(teacherKey).push(s);
    byClass.get(classKey).push(s);
  });
  const teacher=[...byTeacher.values()].filter(items=>items.length>1);
  const classes=[...byClass.values()].filter(items=>items.length>1&&!isAllowedSharedClassSlot(items));
  return {teacher,classes};
}

function isAllowedSharedClassSlot(items){
  const ids=new Set(items.map(s=>s.teacherId));
  const subjects=new Set(items.map(s=>plainKey(s.subject)));
  const artMusic=ids.size===2 && ids.has('12275702534') && ids.has('40522761546') && subjects.has(plainKey('Görsel Sanatlar')) && subjects.has(plainKey('Müzik'));
  const elective=ids.size===2 && ids.has('15643689888') && ids.has('24836297168') && subjects.has(plainKey('Seçmeli Klasik Ahlak Metinleri')) && subjects.has(plainKey('Seçmeli Türk Sosyal Hayatında Aile'));
  return artMusic || elective;
}

function buildScheduleHealthPanel(){
  const issues=scheduleConflicts(), total=issues.teacher.length+issues.classes.length;
  if(!total) return '';
  const teacherRows=issues.teacher.slice(0,5).map(items=>{
    const s=items[0], t=teacherById(s.teacherId);
    return `<li>${teacherLink(t)} · ${escapeHtml(s.day)} ${escapeHtml(lessonHourLabel(s.hour))}: ${items.map(x=>escapeHtml(x.className)).join(', ')}</li>`;
  }).join('');
  const classRows=issues.classes.slice(0,5).map(items=>{
    const s=items[0];
    return `<li>${escapeHtml(s.className)} · ${escapeHtml(s.day)} ${escapeHtml(lessonHourLabel(s.hour))}: ${items.map(x=>teacherLink(teacherById(x.teacherId))).join(', ')}</li>`;
  }).join('');
  return `<div class="schedule-health health-warning no-print"><i class="fas fa-triangle-exclamation"></i><div><strong>Programda ${total} çakışma var</strong><span>Aynı gün/saatte tekrar eden öğretmen veya sınıf kayıtları kontrol edilmeli.</span>${teacherRows?`<ul>${teacherRows}</ul>`:''}${classRows?`<ul>${classRows}</ul>`:''}${total>10?`<span>İlk 10 kayıt gösteriliyor.</span>`:''}</div></div>`;
}

function buildScheduleEntryList(){
  const rows=visibleFilteredScheduleItems().sort((a,b)=>dayOrder(a.day)-dayOrder(b.day)||hourOrder(a.hour)-hourOrder(b.hour)).map(s=>{
    const t=teacherById(s.teacherId);
    return `<tr><td>${escapeHtml(s.day)}</td><td>${escapeHtml(lessonHourLabel(s.hour))}</td><td>${teacherLink(t)}</td><td>${escapeHtml(s.className)}</td><td>${escapeHtml(displaySubjectName(s.subject))}</td><td>${escapeHtml(scheduleNoteText(s)||'—')}</td><td class="no-print table-actions"><button class="btn btn-sm btn-outline-primary" onclick="openScheduleModal('${s.id}')"><i class="fas fa-pen"></i></button><button class="btn btn-sm btn-outline-danger" onclick="deleteSchedule('${s.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
  }).join('');
  return `<div id="scheduleEntryList" class="schedule-entry-list mt-3"><div class="section-title-row"><h4><i class="fas fa-list me-2"></i>Ders Kayıtları</h4><span class="small text-muted">${visibleFilteredScheduleItems().length} kayıt</span></div>${rows?`<div class="table-responsive"><table class="table table-sm table-striped mb-0 schedule-entry-table"><thead><tr><th>Gün</th><th>Saat</th><th>Öğretmen</th><th>Sınıf</th><th>Ders</th><th>Not</th><th class="no-print">İşlem</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyState('Seçili filtrelere uygun ders kaydı yok.')}</div>`;
}

function shortSubject(subject){
  return displaySubjectName(subject);
}

function sheetSubjectCode(subject){
  return subjectCode(subject);
}

function sheetTeacherCode(t){
  if(!t) return '—';
  const parts=teacherNameParts(t);
  const initials=parts.first.split(/\s+/).filter(Boolean).map(w=>upperNamePart(w.slice(0,1))+'.').join('');
  return `${initials}${parts.last}`.trim();
}

function shortTeacherName(t){
  if(!t) return '—';
  const parts=teacherNameParts(t);
  return `${parts.first.slice(0,1)}. ${parts.last}`.trim();
}
