function renderSettings(){
  const hourValue=getEl('classProgramHour')?.value||window.settingsProgramHour||'1';
  window.settingsProgramHour=hourValue;
  getEl('settingsContent').innerHTML=`
    <section class="settings-group">
      <div class="settings-group-head"><h3>Günlük İşler</h3><p>İçe aktarma, yedekleme ve sık kullanılan program işlemleri.</p></div>
      <div class="row g-3">
        <div class="col-lg-6">${buildImportSettings()}</div>
        <div class="col-lg-6">${buildBackupSettings()}</div>
        <div class="col-12">${buildDutySettings()}</div>
        <div class="col-12">${buildClassProgramSettings(hourValue)}</div>
      </div>
    </section>
    <section class="settings-group">
      <div class="settings-group-head"><h3>Okul Yapısı</h3><p>Günler, ders saatleri ve ders adları gibi temel tanımlar.</p></div>
      <div class="row g-3">
        <div class="col-12">${buildCalendarSettings()}</div>
        <div class="col-12">${buildSubjectSettings()}</div>
      </div>
    </section>`;
}

function buildImportSettings(){
  return `<div class="card obs-panel h-100"><div class="card-header"><h3 class="card-title">Excel / CSV İçe Aktar</h3></div><div class="card-body">
    <div class="import-block">
      <h4>Öğretmen Bilgileri</h4>
      <p class="text-muted small">Başlıklar: ${TEACHER_FIELDS.join(', ')}</p>
      <input type="file" class="form-control" accept=".xlsx,.xls,.csv" onchange="importTeacherFile(event)">
    </div>
    <div class="import-block">
      <div class="section-title-row">
        <h4>Ders Programı</h4>
        <button class="btn btn-sm btn-outline-secondary no-print" onclick="downloadScheduleTemplate()"><i class="fas fa-download me-1"></i>Şablonu İndir</button>
      </div>
      <p class="text-muted small mb-3">Her satır tek ders kaydıdır. Başlıklar: ${SCHEDULE_IMPORT_FIELDS.join(', ')}</p>
      <div class="row g-2 align-items-end">
        <div class="col-md-5"><label class="form-label">İçe Aktarma Biçimi</label><select id="scheduleImportMode" class="form-select"><option value="replace">Mevcut programı değiştir</option><option value="append">Mevcut programa ekle</option></select></div>
        <div class="col-md-7"><label class="form-label">Ders Programı Dosyası</label><input type="file" class="form-control" accept=".xlsx,.xls,.csv" onchange="importScheduleFile(event)"></div>
      </div>
      <div id="scheduleImportFeedback" class="import-feedback mt-2"></div>
    </div>
    <details class="seed-tools">
      <summary>Hazır başlangıç verilerini göster</summary>
      <div class="d-grid gap-2 mt-2"><button class="btn btn-primary" onclick="loadSeedAll()"><i class="fas fa-database me-1"></i>Hazır Verilerin Tamamını Yükle</button><button class="btn btn-outline-primary" onclick="loadSeedTeachers()"><i class="fas fa-file-excel me-1"></i>Öğretmenler.xlsx Verisini Yükle</button><button class="btn btn-outline-primary" onclick="loadSeedSchedules()"><i class="fas fa-calendar-days me-1"></i>WORD.DOC Ders Programını Yükle</button><button class="btn btn-outline-primary" onclick="loadSeedTasks()"><i class="fas fa-sitemap me-1"></i>Görev Verilerini Yükle</button></div>
      <div class="text-muted small mt-2">${hasSeedTeachers()?`${window.OGRETMEN_SEED.teacherCount||cloneSeedTeachers().length} öğretmen`: 'Öğretmen verisi yok'} · ${hasSeedSchedules()?`${window.OGRETMEN_SCHEDULE_SEED.itemCount||cloneSeedSchedules().length} ders kaydı`: 'Ders programı verisi yok'} · ${hasSeedTasks()?`${window.OGRETMEN_TASK_SEED.taskCount||cloneSeedTasks().length} görev`: 'Görev verisi yok'} başlangıç verisi olarak tanımlı.</div>
    </details>
  </div></div>`;
}

function buildBackupSettings(){
  return `<div class="card obs-panel h-100"><div class="card-header"><h3 class="card-title">Yedekleme</h3></div><div class="card-body d-grid gap-2"><button class="btn btn-outline-primary" onclick="exportBackup()">Yedeği İndir</button><input type="file" class="form-control" accept=".json" onchange="importBackup(event)"><details class="danger-tools"><summary>Gelişmiş işlemleri göster</summary><div class="d-grid gap-2 mt-2"><button class="btn btn-outline-secondary" onclick="loadDemoData()">Örnek Veri Ekle</button><button class="btn btn-outline-danger" onclick="resetAllData()">Tüm Verileri Sıfırla</button></div></details></div></div>`;
}

function buildCalendarSettings(){
  const dayRows=schoolDays().map((day,i)=>daySettingsRow(day,i)).join('');
  const timeRows=schoolHours().map((hour,i)=>lessonTimeRow(lessonTimeByHour(hour)||{hour,start:'',end:''},i)).join('');
  return `<div class="card obs-panel"><div class="card-header d-flex align-items-center justify-content-between"><h3 class="card-title"><i class="fas fa-clock me-2"></i>Günler ve Ders Saatleri</h3><div class="page-actions no-print"><button class="btn btn-sm btn-outline-secondary" onclick="addDaySettingsRow()">Gün Ekle</button><button class="btn btn-sm btn-outline-secondary" onclick="addLessonTimeRow()">Saat Ekle</button><button class="btn btn-sm btn-primary" onclick="saveCalendarSettings()">Kaydet</button></div></div><div class="card-body"><p class="text-muted small">Program, nöbet, boş saat ve çarşaf raporları bu gün/saat listesinden beslenir. Gün adı değişirse mevcut program ve nöbet kayıtları yeni ada aktarılır.</p><div class="row g-3"><div class="col-lg-5"><div class="table-responsive"><table class="table settings-matrix mb-0"><thead><tr><th>Gün</th><th class="no-print">İşlem</th></tr></thead><tbody id="daySettingsBody">${dayRows}</tbody></table></div></div><div class="col-lg-7"><div class="table-responsive"><table class="table settings-matrix mb-0"><thead><tr><th>Ders</th><th>Başlangıç</th><th>Bitiş</th><th class="no-print">İşlem</th></tr></thead><tbody id="lessonTimeBody">${timeRows}</tbody></table></div></div></div></div></div>`;
}

function daySettingsRow(day,index){
  return `<tr class="day-settings-row" data-original-day="${escapeHtml(day||'')}" data-row="${index}"><td><input class="form-control form-control-sm day-name-input" value="${escapeHtml(day||'')}" placeholder="Gün adı"></td><td class="no-print"><button class="btn btn-sm btn-outline-danger" onclick="removeSettingsRow(this)">Sil</button></td></tr>`;
}

function lessonTimeRow(item,index){
  return `<tr class="lesson-time-row" data-row="${index}"><td><input type="number" min="1" class="form-control form-control-sm lesson-hour-input" value="${escapeHtml(item.hour||'')}" placeholder="Ders"></td><td><input type="time" class="form-control form-control-sm lesson-start-input" value="${escapeHtml(item.start||'')}"></td><td><input type="time" class="form-control form-control-sm lesson-end-input" value="${escapeHtml(item.end||'')}"></td><td class="no-print"><button class="btn btn-sm btn-outline-danger" onclick="removeSettingsRow(this)">Sil</button></td></tr>`;
}

function addDaySettingsRow(){
  getEl('daySettingsBody').insertAdjacentHTML('beforeend',daySettingsRow('',Date.now()));
}

function addLessonTimeRow(){
  const next=Math.max(0,...schoolHours())+1;
  getEl('lessonTimeBody').insertAdjacentHTML('beforeend',lessonTimeRow({hour:next,start:'',end:''},Date.now()));
}

function saveCalendarSettings(){
  const dayRows=[...document.querySelectorAll('#daySettingsBody .day-settings-row')];
  const days=[], dayKeys=new Set(), dayMap=new Map();
  for(const row of dayRows){
    const oldName=row.dataset.originalDay||'';
    const day=row.querySelector('.day-name-input').value.replace(/\s+/g,' ').trim();
    if(!day) continue;
    const key=plainKey(day);
    if(dayKeys.has(key)){ showToast('Aynı gün adı iki kez yazılmış.','warning'); return; }
    dayKeys.add(key);
    days.push(day);
    if(oldName&&oldName!==day) dayMap.set(oldName,day);
  }
  if(!days.length){ showToast('En az bir gün tanımlı olmalı.','warning'); return; }
  const timeRows=[...document.querySelectorAll('#lessonTimeBody .lesson-time-row')];
  const times=[], hourKeys=new Set();
  for(const row of timeRows){
    const hour=Number(row.querySelector('.lesson-hour-input').value);
    const start=row.querySelector('.lesson-start-input').value;
    const end=row.querySelector('.lesson-end-input').value;
    if(!Number.isFinite(hour)||hour<=0) continue;
    if(hourKeys.has(hour)){ showToast('Aynı ders saati iki kez yazılmış.','warning'); return; }
    if((start&&!end)||(!start&&end)){ showToast(`${hour}. ders için başlangıç ve bitiş birlikte girilmeli.`, 'warning'); return; }
    if(start&&end&&timeToMinutes(start)>=timeToMinutes(end)){ showToast(`${hour}. derste bitiş saati başlangıçtan sonra olmalı.`, 'warning'); return; }
    hourKeys.add(hour);
    times.push({hour,start,end});
  }
  if(!times.length){ showToast('En az bir ders saati tanımlı olmalı.','warning'); return; }
  times.sort((a,b)=>a.hour-b.hour);
  dayMap.forEach((newDay,oldDay)=>{
    DB.schedules.forEach(s=>{ if(s.day===oldDay) s.day=newDay; });
    DB.teachers.forEach(t=>{ if(t.dutyDay===oldDay) t.dutyDay=newDay; if(t.freeDay===oldDay) t.freeDay=newDay; });
  });
  DB.settings.days=days;
  DB.settings.hours=times.map(t=>t.hour);
  DB.settings.lessonTimes=times;
  window.settingsProgramHour=DB.settings.hours.includes(Number(window.settingsProgramHour)) ? window.settingsProgramHour : String(DB.settings.hours[0]);
  saveDB();
  hydrateStaticSelects();
  renderAll();
  showToast('Gün ve ders saatleri kaydedildi.','success');
}

function buildDutySettings(){
  const days=schoolDays();
  const assignments={};
  DB.teachers.forEach(t=>{ if(t.dutyDay&&t.dutyPlace) assignments[`${t.dutyPlace}__${t.dutyDay}`]=t.id; });
  const rows=getDutyPlaces().map((place,i)=>dutyPlaceRow(place,i,assignments)).join('');
  return `<div class="card obs-panel"><div class="card-header d-flex align-items-center justify-content-between"><h3 class="card-title"><i class="fas fa-clipboard-check me-2"></i>Nöbet Düzeni</h3><div class="page-actions no-print"><button class="btn btn-sm btn-outline-secondary" onclick="addDutyPlaceRow()">Satır Ekle</button><button class="btn btn-sm btn-primary" onclick="saveDutyMatrix()">Kaydet</button></div></div><div class="card-body"><p class="text-muted small">Sütunlar günleri, satırlar nöbet yerlerini gösterir. Nöbet yeri adını değiştirip kaydedebilir veya yeni satır ekleyebilirsiniz.</p><div class="table-responsive"><table class="table settings-matrix mb-0"><thead><tr><th>Nöbet Yeri</th>${days.map(d=>`<th>${d}</th>`).join('')}<th class="no-print">İşlem</th></tr></thead><tbody id="dutyMatrixBody">${rows}</tbody></table></div></div></div>`;
}

function dutyPlaceRow(place,index,assignments={}){
  const cells=schoolDays().map(day=>`<td><select class="form-select form-select-sm duty-teacher-select" data-day="${day}">${teacherSelectOptions(assignments[`${place}__${day}`]||'', 'Boş')}</select></td>`).join('');
  return `<tr class="duty-place-row" data-row="${index}"><td class="place-cell"><input class="form-control form-control-sm duty-place-input" value="${escapeHtml(place)}" placeholder="Nöbet yeri"></td>${cells}<td class="no-print"><button class="btn btn-sm btn-outline-danger" onclick="removeSettingsRow(this)">Sil</button></td></tr>`;
}

function addDutyPlaceRow(){
  getEl('dutyMatrixBody').insertAdjacentHTML('beforeend',dutyPlaceRow('',Date.now(),{}));
}

function saveDutyMatrix(){
  const rows=[...document.querySelectorAll('#dutyMatrixBody .duty-place-row')];
  const places=[], placeKeys=new Set(), assignments=[], usedTeachers=new Set();
  for(const row of rows){
    const place=row.querySelector('.duty-place-input').value.trim();
    if(!place) continue;
    const key=normalizeText(place);
    if(placeKeys.has(key)){ showToast('Aynı nöbet yeri iki kez yazılmış.','warning'); return; }
    placeKeys.add(key);
    places.push(place);
    for(const day of schoolDays()){
      const teacherId=row.querySelector(`select[data-day="${day}"]`)?.value||'';
      if(!teacherId) continue;
      if(usedTeachers.has(teacherId)){ showToast('Bir öğretmen aynı nöbet çizelgesinde yalnızca bir kez seçilebilir.','warning',5000); return; }
      usedTeachers.add(teacherId);
      assignments.push({teacherId,day,place});
    }
  }
  DB.teachers.forEach(t=>{ t.dutyDay=''; t.dutyPlace=''; });
  assignments.forEach(a=>{ const t=teacherById(a.teacherId); if(t){ t.dutyDay=a.day; t.dutyPlace=a.place; } });
  DB.settings=DB.settings||{};
  DB.settings.dutyPlaces=places;
  saveDB();
  renderAll();
  showToast('Nöbet düzeni kaydedildi.','success');
}

function getDutyPlaces(){
  return dutyPlaceList();
}

function buildClassProgramSettings(hourValue){
  const days=schoolDays(), hours=schoolHours();
  const hourOptions=hours.map(h=>`<option value="${h}" ${String(hourValue)===String(h)?'selected':''}>${h}. Ders (${escapeHtml(lessonTimeByHour(h)?.start||'')})</option>`).join('');
  const rows=(DB.settings.classes||CLASS_LIST).map((cls,i)=>classProgramRow(cls,cls,hourValue,i)).join('');
  return `<div class="card obs-panel"><div class="card-header d-flex align-items-center justify-content-between"><h3 class="card-title"><i class="fas fa-calendar-days me-2"></i>Ders Programı Hızlı Düzenleme</h3><div class="page-actions no-print"><button class="btn btn-sm btn-outline-secondary" onclick="addClassProgramRow()">Sınıf Ekle</button><button class="btn btn-sm btn-primary" onclick="saveClassProgramMatrix()">Kaydet</button></div></div><div class="card-body"><div class="row g-2 align-items-end"><div class="col-md-3"><label class="form-label">Ders Saati</label><select id="classProgramHour" class="form-select" onchange="window.settingsProgramHour=this.value; renderSettings()">${hourOptions}</select></div><div class="col-md-9"><p class="text-muted small mb-0">Bu tablo seçili ders saatini düzenler. Sütunlar günleri, satırlar sınıfları gösterir. Öğretmen listesi alfabetiktir; kaydedince ders adı öğretmenin branşından alınır.</p></div></div><div class="table-responsive mt-3"><table class="table settings-matrix mb-0"><thead><tr><th>Sınıf</th>${days.map(d=>`<th>${d}</th>`).join('')}<th class="no-print">İşlem</th></tr></thead><tbody id="classProgramBody">${rows}</tbody></table></div></div></div>`;
}

function classProgramRow(className,originalClass,hour,index){
  const cells=schoolDays().map(day=>{
    const item=DB.schedules.find(s=>s.className===className&&s.day===day&&Number(s.hour)===Number(hour));
    return `<td><select class="form-select form-select-sm class-program-teacher" data-day="${day}">${teacherSelectOptions(item?.teacherId||'', 'Boş')}</select></td>`;
  }).join('');
  return `<tr class="class-program-row" data-original-class="${escapeHtml(originalClass||'')}" data-row="${index}"><td class="place-cell"><input class="form-control form-control-sm class-name-input" value="${escapeHtml(className||'')}" placeholder="Örn: 9A"></td>${cells}<td class="no-print"><button class="btn btn-sm btn-outline-danger" onclick="removeSettingsRow(this)">Sil</button></td></tr>`;
}

function addClassProgramRow(){
  const hour=getEl('classProgramHour')?.value||'1';
  getEl('classProgramBody').insertAdjacentHTML('beforeend',classProgramRow('', '', hour, Date.now()));
}

function removeSettingsRow(btn){
  const row=btn.closest('tr');
  if(row&&confirm('Bu satır kaldırılacak. Kaydetmeden kesinleşmez.')) row.remove();
}

function saveClassProgramMatrix(){
  const hour=Number(getEl('classProgramHour')?.value||1), time=lessonTimeByHour(hour);
  const rows=[...document.querySelectorAll('#classProgramBody .class-program-row')];
  const oldClasses=DB.settings.classes||CLASS_LIST, classNames=[], classKeys=new Set(), maps=[];
  for(const row of rows){
    const oldName=row.dataset.originalClass||'';
    const className=cleanClassName(row.querySelector('.class-name-input').value);
    if(!className) continue;
    const key=normalizeText(className);
    if(classKeys.has(key)){ showToast('Aynı sınıf iki kez yazılmış.','warning'); return; }
    classKeys.add(key);
    classNames.push(className);
    maps.push({oldName,className,row});
  }
  for(const day of schoolDays()){
    const used=new Map();
    for(const item of maps){
      const teacherId=item.row.querySelector(`select[data-day="${day}"]`)?.value||'';
      if(!teacherId) continue;
      if(used.has(teacherId)){
        showToast(`${day} ${hour}. derste aynı öğretmen birden fazla sınıfa seçilmiş.`, 'warning', 6000);
        return;
      }
      used.set(teacherId,item.className);
    }
  }
  maps.forEach(m=>{ if(m.oldName&&m.oldName!==m.className) DB.schedules.forEach(s=>{ if(s.className===m.oldName) s.className=m.className; }); });
  const allowed=new Set(classNames), oldSet=new Set(oldClasses);
  DB.schedules=DB.schedules.filter(s=>!(oldSet.has(s.className)&&!allowed.has(s.className)));
  DB.schedules=DB.schedules.filter(s=>!(allowed.has(s.className)&&Number(s.hour)===hour&&schoolDays().includes(s.day)));
  maps.forEach(m=>{
    schoolDays().forEach(day=>{
      const teacherId=m.row.querySelector(`select[data-day="${day}"]`)?.value||'';
      if(!teacherId) return;
      const t=teacherById(teacherId);
      DB.schedules.push({id:uid('s'),teacherId,className:m.className,subject:t?.branch||'Ders',day,hour,startTime:time?.start||'',endTime:time?.end||'',note:''});
    });
  });
  DB.settings.classes=classNames;
  saveDB();
  renderAll();
  showToast('Ders programı hızlı düzenleme kaydedildi.','success');
}

function buildSubjectSettings(){
  const rows=(DB.settings.subjects||subjectSettings()).map((item,i)=>subjectSettingsRow(item,i)).join('');
  return `<div class="card obs-panel"><div class="card-header d-flex align-items-center justify-content-between"><h3 class="card-title"><i class="fas fa-book-open me-2"></i>Dersler ve Kısaltmalar</h3><div class="page-actions no-print"><button class="btn btn-sm btn-outline-secondary" onclick="addSubjectSettingsRow()">Ders Ekle</button><button class="btn btn-sm btn-primary" onclick="saveSubjectSettings()">Kaydet</button></div></div><div class="card-body"><p class="text-muted small">Çarşaf program ve sınıf/öğretmen özetlerinde kullanılan ders adları ve kısa kodlar burada tutulur.</p><div class="table-responsive"><table class="table settings-matrix mb-0 subject-settings-table"><thead><tr><th>Ders Adı</th><th>Kısaltma</th><th class="no-print">İşlem</th></tr></thead><tbody id="subjectSettingsBody">${rows}</tbody></table></div></div></div>`;
}

function subjectSettingsRow(item,index){
  return `<tr class="subject-settings-row" data-row="${index}"><td><input class="form-control form-control-sm subject-name-input" value="${escapeHtml(item.name||'')}" placeholder="Ders adı"></td><td><input class="form-control form-control-sm subject-code-input" value="${escapeHtml(item.code||'')}" placeholder="Kısaltma"></td><td class="no-print"><button class="btn btn-sm btn-outline-danger" onclick="removeSettingsRow(this)">Sil</button></td></tr>`;
}

function addSubjectSettingsRow(){
  getEl('subjectSettingsBody').insertAdjacentHTML('beforeend',subjectSettingsRow({name:'',code:''},Date.now()));
}

function saveSubjectSettings(){
  const rows=[...document.querySelectorAll('#subjectSettingsBody .subject-settings-row')];
  const subjects=[], keys=new Set();
  for(const row of rows){
    const name=row.querySelector('.subject-name-input').value.replace(/\s+/g,' ').trim();
    const code=row.querySelector('.subject-code-input').value.replace(/\s+/g,' ').trim().toLocaleUpperCase('tr-TR');
    if(!name) continue;
    const key=plainKey(name);
    if(keys.has(key)){ showToast('Aynı ders adı iki kez yazılmış.','warning'); return; }
    keys.add(key);
    subjects.push({name,code:code||subjectCode(name)});
  }
  if(!subjects.length){ showToast('En az bir ders tanımlı olmalı.','warning'); return; }
  DB.settings.subjects=subjects;
  SUBJECT_SETTINGS_RUNTIME=normalizeSubjectSettings(subjects).map(s=>({...s,key:plainKey(s.name)}));
  saveDB();
  renderAll();
  showToast('Ders ve kısaltma listesi kaydedildi.','success');
}

function teacherSelectOptions(selected='', emptyLabel='Seçiniz'){
  const teachers=sortedTeachers();
  return `<option value="">${emptyLabel}</option>`+teachers.map(t=>`<option value="${t.id}" ${t.id===selected?'selected':''}>${escapeHtml(teacherName(t))}</option>`).join('');
}

function loadSeedAll(){ if(!confirm('Mevcut veriler temizlenip hazır öğretmen, ders programı ve görev verileri yüklensin mi?'))return; DB=applySeedData(makeEmptyDB()); saveDB(); renderAll(); showToast(`${DB.teachers.length} öğretmen, ${DB.schedules.length} ders ve ${DB.tasks.length} görev yüklendi.`,'success'); }
function loadSeedTeachers(){ if(!hasSeedTeachers()){showToast('Yüklenecek Öğretmenler.xlsx verisi bulunamadı.','warning');return;} if((DB.teachers.length||DB.schedules.length||DB.tasks?.length)&&!confirm('Mevcut kayıtlar temizlenip Öğretmenler.xlsx verisi yüklensin mi?'))return; DB=applySeedData(makeEmptyDB(),{teachers:true,schedules:false,tasks:false}); saveDB(); renderAll(); showToast(`${DB.teachers.length} öğretmen yüklendi.`,'success'); }
function loadSeedSchedules(){ if(!hasSeedSchedules()){showToast('Yüklenecek WORD.DOC ders programı bulunamadı.','warning');return;} if(DB.schedules.length&&!confirm('Mevcut ders programı temizlenip WORD.DOC programı yüklensin mi?'))return; const seedSchedules=cloneSeedSchedules(), ids=new Set(DB.teachers.map(t=>t.id)); if(seedSchedules.some(s=>!ids.has(s.teacherId))&&hasSeedTeachers()) DB.teachers=cloneSeedTeachers(); DB.schedules=seedSchedules; DB.settings.lessonTimes=window.OGRETMEN_SCHEDULE_SEED?.lessonTimes||LESSON_TIMES; DB.meta=DB.meta||{}; DB.meta.seedVersion=DATA_SEED_VERSION; saveDB(); renderAll(); showToast(`${DB.schedules.length} ders programı kaydı yüklendi.`,'success'); }
function loadSeedTasks(){ if(!hasSeedTasks()){showToast('Yüklenecek görev verisi bulunamadı.','warning');return;} if((DB.tasks||[]).length&&!confirm('Mevcut görevler temizlenip hazır görev verisi yüklensin mi?'))return; const seedTasks=cloneSeedTasks(), ids=new Set(DB.teachers.map(t=>t.id)); if(seedTasks.some(t=>!ids.has(t.teacherId))&&hasSeedTeachers()) DB.teachers=cloneSeedTeachers(); DB.tasks=seedTasks; DB.meta=DB.meta||{}; DB.meta.seedVersion=DATA_SEED_VERSION; saveDB(); renderAll(); showToast(`${DB.tasks.length} görev kaydı yüklendi.`,'success'); }
function importTeacherFile(e){ const f=e.target.files&&e.target.files[0]; if(!f)return; if(!window.XLSX){ showToast('Excel içe aktarma için internet bağlantısı veya XLSX kütüphanesi gerekir. Hazır veriler yine yerel çalışır.','warning',6000); e.target.value=''; return; } const r=new FileReader(); r.onload=ev=>{ try{ const wb=XLSX.read(ev.target.result,{type:'array'}), ws=wb.Sheets[wb.SheetNames[0]], rows=XLSX.utils.sheet_to_json(ws,{defval:''}); const teachers=rows.map(teacherFromRow).filter(t=>t.firstName||t.lastName); DB.teachers=teachers; saveDB(); renderAll(); showToast(`${teachers.length} öğretmen içe aktarıldı.`,'success'); }catch(err){ showToast('Dosya okunamadı.','danger'); } e.target.value=''; }; r.readAsArrayBuffer(f); }
function downloadScheduleTemplate(){
  if(!window.XLSX){ showToast('Şablon üretmek için XLSX kütüphanesi gerekir.','warning'); return; }
  const example=[{
    'SINIF':'9A',
    'GÜN':'Pazartesi',
    'DERS SAATİ':1,
    'ÖĞRETMEN T.C.':'',
    'ÖĞRETMEN':'Öğretmen Adı SOYADI',
    'DERS':'Matematik',
    'BAŞLANGIÇ':'08:15',
    'BİTİŞ':'08:55',
    'NOT':''
  }];
  const wb=XLSX.utils.book_new(), ws=XLSX.utils.json_to_sheet(example,{header:SCHEDULE_IMPORT_FIELDS});
  XLSX.utils.book_append_sheet(wb,ws,'Ders Programı');
  XLSX.writeFile(wb,'ders-programi-sablonu.xlsx');
}
function importScheduleFile(e){
  const f=e.target.files&&e.target.files[0];
  if(!f) return;
  if(!window.XLSX){ showToast('Excel içe aktarma için internet bağlantısı veya XLSX kütüphanesi gerekir.','warning',6000); e.target.value=''; return; }
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const wb=XLSX.read(ev.target.result,{type:'array'}), ws=wb.Sheets[wb.SheetNames[0]], rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      const parsed=parseScheduleRows(rows);
      if(parsed.errors.length){
        renderScheduleImportFeedback(parsed.errors,'danger');
        showToast(`${parsed.errors.length} satır kontrol edilmeli. Ders programı içe aktarılmadı.`,'warning',6000);
        e.target.value='';
        return;
      }
      const mode=getEl('scheduleImportMode')?.value||'replace';
      const nextSchedules=mode==='append' ? [...DB.schedules,...parsed.items] : parsed.items;
      const conflicts=scheduleImportConflicts(nextSchedules);
      if(conflicts.length){
        renderScheduleImportFeedback(conflicts,'danger');
        showToast('Çakışma bulunduğu için içe aktarma yapılmadı.','warning',6000);
        e.target.value='';
        return;
      }
      applyImportedSchedule(parsed,mode);
      renderScheduleImportFeedback([`${parsed.items.length} ders kaydı içe aktarıldı.`, `${parsed.classes.length} sınıf, ${parsed.subjects.length} ders ve ${parsed.lessonTimes.length} ders saati işlendi.`],'success');
      showToast(`${parsed.items.length} ders kaydı içe aktarıldı.`,'success');
    }catch(err){
      renderScheduleImportFeedback(['Dosya okunamadı. Başlıkları ve ilk sayfayı kontrol edin.'],'danger');
      showToast('Ders programı dosyası okunamadı.','danger');
    }
    e.target.value='';
  };
  r.readAsArrayBuffer(f);
}
function parseScheduleRows(rows){
  const items=[], errors=[], classes=new Map(), subjects=new Map(), lessonTimes=new Map();
  rows.forEach((row,index)=>{
    const line=index+2, get=rowLookup(row);
    const className=cleanClassName(get('SINIF','Sınıf'));
    const rawDay=get('GÜN','Gün');
    const day=schoolDays().find(d=>plainKey(d)===plainKey(rawDay))||'';
    const hour=Number(get('DERS SAATİ','Ders Saati','Saat'));
    const teacher=teacherByImportValue(get('ÖĞRETMEN T.C.','Öğretmen TC','T.C. Kimlik No'),get('ÖĞRETMEN','Öğretmen'));
    const rawSubject=get('DERS','Ders');
    const subject=rawSubject?normalizeSubjectName(rawSubject, teacher?.id||''):'';
    const start=get('BAŞLANGIÇ','Başlangıç');
    const end=get('BİTİŞ','Bitiş');
    const note=get('NOT','Not');
    if(!className) errors.push(`${line}. satır: sınıf boş.`);
    if(!day) errors.push(`${line}. satır: gün tanınmadı (${rawDay||'boş'}).`);
    if(!Number.isFinite(hour)||hour<=0) errors.push(`${line}. satır: ders saati geçersiz.`);
    if(!teacher) errors.push(`${line}. satır: öğretmen bulunamadı.`);
    if(!subject) errors.push(`${line}. satır: ders boş.`);
    if((start&&!end)||(!start&&end)) errors.push(`${line}. satır: başlangıç ve bitiş birlikte girilmeli.`);
    if(start&&end&&timeToMinutes(start)>=timeToMinutes(end)) errors.push(`${line}. satır: bitiş saati başlangıçtan sonra olmalı.`);
    if(errors.length && errors[errors.length-1].startsWith(`${line}.`)) return;
    if(!schoolHours().includes(hour) && !(start&&end)) errors.push(`${line}. satır: ${hour}. ders sistemde yok; yeni saat için başlangıç ve bitiş girilmeli.`);
    if(errors.length && errors[errors.length-1].startsWith(`${line}.`)) return;
    if(start&&end){
      const existing=lessonTimes.get(hour);
      const pair=`${start}-${end}`;
      if(existing&&existing!==pair){ errors.push(`${line}. satır: ${hour}. ders için farklı saat aralıkları var.`); return; }
      lessonTimes.set(hour,pair);
    }
    classes.set(className,className);
    subjects.set(plainKey(subject),subject);
    const time=lessonTimeByHour(hour);
    items.push({id:uid('s'),teacherId:teacher.id,className,subject,day,hour,startTime:start||time?.start||'',endTime:end||time?.end||'',note});
  });
  if(!rows.length) errors.push('Dosyada okunabilir ders kaydı bulunamadı.');
  return {items,errors,classes:[...classes.values()],subjects:[...subjects.values()],lessonTimes:[...lessonTimes.entries()].map(([hour,pair])=>{ const [start,end]=pair.split('-'); return {hour:Number(hour),start,end}; })};
}
function scheduleImportConflicts(items){
  const issues=[], byTeacher=new Map(), byClass=new Map();
  items.forEach(s=>{
    const teacherKey=`${s.teacherId}__${s.day}__${s.hour}`, classKey=`${s.className}__${s.day}__${s.hour}`;
    if(!byTeacher.has(teacherKey)) byTeacher.set(teacherKey,[]);
    if(!byClass.has(classKey)) byClass.set(classKey,[]);
    byTeacher.get(teacherKey).push(s);
    byClass.get(classKey).push(s);
  });
  [...byTeacher.values()].filter(group=>group.length>1).slice(0,6).forEach(group=>{
    const s=group[0], t=teacherById(s.teacherId);
    issues.push(`${teacherName(t)} için ${s.day} ${lessonHourLabel(s.hour)} çakışıyor.`);
  });
  [...byClass.values()].filter(group=>group.length>1&&!isAllowedSharedClassSlot(group)).slice(0,6).forEach(group=>{
    const s=group[0];
    issues.push(`${s.className} için ${s.day} ${lessonHourLabel(s.hour)} çakışıyor.`);
  });
  return issues;
}
function applyImportedSchedule(parsed,mode){
  if(mode==='replace') DB.schedules=parsed.items;
  else DB.schedules.push(...parsed.items);
  DB.settings.subjects=DB.settings.subjects||subjectSettings().map(s=>({name:s.name,code:s.code}));
  const classKeys=new Set((DB.settings.classes||[]).map(plainKey));
  parsed.classes.forEach(cls=>{ if(!classKeys.has(plainKey(cls))){ DB.settings.classes.push(cls); classKeys.add(plainKey(cls)); } });
  const subjectKeys=new Set((DB.settings.subjects||subjectSettings()).map(s=>plainKey(s.name)));
  parsed.subjects.forEach(subject=>{
    const key=plainKey(subject);
    if(!subjectKeys.has(key)){ DB.settings.subjects.push({name:subject,code:subjectCode(subject)}); subjectKeys.add(key); }
  });
  const timeMap=new Map((DB.settings.lessonTimes||LESSON_TIMES).map(t=>[Number(t.hour),{...t}]));
  parsed.lessonTimes.forEach(item=>timeMap.set(Number(item.hour),item));
  DB.settings.lessonTimes=[...timeMap.values()].sort((a,b)=>a.hour-b.hour);
  DB.settings.hours=[...new Set([...(DB.settings.hours||[]),...DB.settings.lessonTimes.map(t=>Number(t.hour))])].sort((a,b)=>a-b);
  saveDB();
  hydrateStaticSelects();
  renderAll();
}
function renderScheduleImportFeedback(lines,type='info'){
  const target=getEl('scheduleImportFeedback');
  if(!target) return;
  const list=(lines||[]).slice(0,8).map(line=>`<li>${escapeHtml(line)}</li>`).join('');
  target.innerHTML=list?`<div class="import-feedback-box feedback-${type}"><strong>${type==='success'?'İçe aktarma tamamlandı':'İçe aktarma kontrolü'}</strong><ul>${list}</ul>${lines.length>8?`<span>İlk 8 kayıt gösteriliyor.</span>`:''}</div>`:'';
}
function exportBackup(){
  const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'}), a=document.createElement('a');
  const stamp=new Date().toISOString().slice(0,10), version=window.OBS_APP_VERSION||'yerel';
  a.href=URL.createObjectURL(blob);
  a.download=`ogretmen-bilgi-yedek-${version}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Yedek indirildi.','success');
}
function importBackup(e){ const f=e.target.files&&e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>{ try{ const d=JSON.parse(ev.target.result); if(!Array.isArray(d.teachers)||!Array.isArray(d.schedules))throw Error(); DB=normalizeDB(d); saveDB(); renderAll(); showToast('Yedek geri yüklendi.','success'); }catch(err){ showToast('Yedek dosyası uygun değil.','danger'); } e.target.value=''; }; r.readAsText(f,'utf-8'); }
function resetAllData(){ if(!confirm('Tüm veriler silinsin mi?'))return; DB=makeEmptyDB(); saveDB(); renderAll(); }
function loadDemoData(){ const demo=[['Ayşe','Yılmaz','Matematik','9A','Pazartesi','A Blok','Cuma'],['Mehmet','Kaya','Edebiyat','10B','Çarşamba','Bahçe','Salı'],['Elif','Demir','Biyoloji','11C','Perşembe','B Blok','Perşembe'],['Selim','Arslan','Fizik','12A','Salı','C Blok','Pazartesi']].map(x=>({id:uid('t'),firstName:x[0],lastName:x[1],identityNo:'',branch:x[2],phone:'',email:'',classAdvisor:x[3],club:'',project:'',dutyDay:x[4],dutyPlace:x[5],freeDay:x[6],scheduleNote:''})); DB.teachers.push(...demo); const [a,b,c,d]=demo; DB.schedules.push({id:uid('s'),teacherId:a.id,className:'9A',subject:'Matematik',day:'Pazartesi',hour:1,startTime:'08:15',endTime:'08:55',note:''},{id:uid('s'),teacherId:a.id,className:'9A',subject:'Matematik',day:'Pazartesi',hour:2,startTime:'09:05',endTime:'09:45',note:''},{id:uid('s'),teacherId:b.id,className:'10B',subject:'Edebiyat',day:'Salı',hour:3,startTime:'09:55',endTime:'10:35',note:''},{id:uid('s'),teacherId:c.id,className:'11C',subject:'Biyoloji',day:'Perşembe',hour:5,startTime:'11:35',endTime:'12:15',note:'Lab'},{id:uid('s'),teacherId:d.id,className:'12A',subject:'Fizik',day:'Salı',hour:1,startTime:'08:15',endTime:'08:55',note:''}); DB.tasks=DB.tasks||[]; DB.tasks.push({id:uid('g'),teacherId:a.id,kind:'Demo',title:'Örnek Görev',description:'Deneme amaçlı görev',details:'',startDate:'',endDate:''}); saveDB(); renderAll(); showToast('Örnek veri eklendi.','success'); }
