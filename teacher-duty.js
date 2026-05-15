function filterTasksByKind(kind){
  const el=getEl('taskReportKind');
  if(el){ el.value=kind; }
  renderTasks();
}

function renderDuty(){
  const places=dutyPlaceList();
  const days=schoolDays();
  const rows=places.map(place=>`<tr><th class="duty-place-head">${escapeHtml(place)}</th>${days.map(day=>{
    const teacher=DB.teachers.find(t=>t.dutyDay===day&&dutyPlaceKey(t.dutyPlace)===dutyPlaceKey(place));
    return `<td>${teacher?`<strong>${teacherLink(teacher)}</strong><small>${escapeHtml(teacher.branch||'')}</small>`:'<span class="text-muted">—</span>'}</td>`;
  }).join('')}</tr>`).join('');
  const count=DB.teachers.filter(t=>t.dutyDay&&t.dutyPlace).length;
  getEl('dutyContent').innerHTML=`<div class="card obs-panel"><div class="card-header d-flex align-items-center justify-content-between"><h3 class="card-title"><i class="fas fa-clipboard-check me-2"></i>Haftalık Nöbet Çizelgesi</h3><span class="small text-muted">${count} nöbet</span></div><div class="card-body p-0"><div class="table-responsive"><table class="table duty-matrix mb-0"><thead><tr><th>Nöbet Yeri</th>${days.map(day=>`<th>${day}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
}

function renderTasks(){
  const allTasks=(DB.tasks||[]).slice();
  const teacherFilter=getEl('taskReportTeacher')?.value||'';
  const kindFilter=getEl('taskReportKind')?.value||'';
  const search=normalizeText(getEl('taskReportSearch')?.value||'');
  syncTaskToolbar(teacherFilter,kindFilter,getEl('taskReportSearch')?.value||'');
  const kinds=[...new Set(allTasks.map(t=>t.kind||'Genel'))].sort((a,b)=>a.localeCompare(b,'tr'));
  const kindSelect=getEl('taskReportKind');
  if(kindSelect){
    kindSelect.innerHTML='<option value="">Tüm Görev Türleri</option>'+kinds.map(kind=>`<option value="${escapeHtml(kind)}">${escapeHtml(kind)}</option>`).join('');
    if([...kindSelect.options].some(o=>o.value===kindFilter)) kindSelect.value=kindFilter;
  }
  const tasks=allTasks.filter(task=>{
    const t=teacherById(task.teacherId);
    const haystack=normalizeText(`${teacherName(t)} ${t?.branch||''} ${task.kind||''} ${task.title||''} ${task.description||''} ${task.details||''} ${task.startDate||''} ${task.endDate||''}`);
    return (!teacherFilter||task.teacherId===teacherFilter) && (!kindFilter||(task.kind||'Genel')===kindFilter) && (!search||haystack.includes(search));
  }).sort((a,b)=>(a.kind||'').localeCompare(b.kind||'','tr')||(a.title||'').localeCompare(b.title||'','tr')||teacherCompare(teacherById(a.teacherId),teacherById(b.teacherId)));
  const counts=[...new Set(allTasks.map(t=>t.kind||'Genel'))].sort((a,b)=>a.localeCompare(b,'tr')).map(kind=>{const isActive=(kindFilter&&(kindFilter===kind));return `<span class="soft-chip chip-clickable${isActive?' chip-active':''}" onclick="filterTasksByKind('${escapeHtml(kind)}')">${escapeHtml(kind)}: ${allTasks.filter(t=>(t.kind||'Genel')===kind).length}</span>`;}).join('');
  const rows=tasks.map(task=>{
    const t=teacherById(task.teacherId);
    return `<tr><td>${teacherLink(t)}<br><small>${escapeHtml(t?.branch||'')}</small></td><td>${escapeHtml(task.kind||'Genel')}</td><td><strong>${escapeHtml(task.title||'—')}</strong></td><td>${escapeHtml(task.description||'—')}</td><td>${escapeHtml(task.details||'—')}</td><td>${escapeHtml(task.startDate||'—')}</td><td>${escapeHtml(task.endDate||'—')}</td><td class="no-print table-actions"><button class="btn btn-sm btn-outline-primary" onclick="openTaskModal('${task.id}')"><i class="fas fa-pen"></i></button><button class="btn btn-sm btn-outline-danger" onclick="deleteTask('${task.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
  }).join('');
  getEl('tasksContent').innerHTML=`<div class="card obs-panel mb-3"><div class="card-header"><h3 class="card-title"><i class="fas fa-list-check me-2"></i>Görev Özeti</h3></div><div class="card-body"><div class="chip-wrap">${counts||'<span class="text-muted">Kayıt yok.</span>'}</div></div></div><div class="card obs-panel"><div class="card-header d-flex align-items-center justify-content-between"><h3 class="card-title"><i class="fas fa-sitemap me-2"></i>Görev Listesi</h3><span class="small text-muted">${tasks.length} / ${allTasks.length} görev</span></div><div class="card-body p-0">${rows?`<div class="table-responsive"><table class="table table-hover mb-0"><thead><tr><th>Öğretmen</th><th>Tür</th><th>Görev Tanımı</th><th>Açıklamalar</th><th>Ayrıntılar</th><th>Başlangıç</th><th>Bitiş</th><th class="no-print">İşlem</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyState('Seçili filtrelere uygun görev kaydı yok.')}</div></div>`;
}

function syncTaskToolbar(teacherId='',kind='',search=''){
  const descriptors=[
    teacherId?{label:'Öğretmen',value:teacherName(teacherById(teacherId))}:null,
    kind?{label:'Tür',value:kind}:null,
    search?{label:'Arama',value:search}:null
  ].filter(Boolean);
  const summary=getEl('taskFilterSummary');
  if(summary) summary.innerHTML=descriptors.length
    ? descriptors.map(item=>`<span class="soft-chip">${escapeHtml(item.label)}: ${escapeHtml(item.value)}</span>`).join('')
    : '<span class="text-muted">Tüm görevler</span>';
  const count=getEl('taskFilterCount');
  if(count) count.textContent=descriptors.length?`${descriptors.length} etkin`:'';
}

function clearTaskFilters(){
  ['taskReportTeacher','taskReportKind','taskReportSearch'].forEach(id=>{ const el=getEl(id); if(el) el.value=''; });
  renderTasks();
}

function openTaskModal(id=''){
  fillDynamicSelects();
  const task=(DB.tasks||[]).find(t=>t.id===id)||null;
  getEl('taskModalTitle').textContent=task?'Görev Düzenle':'Görev Ekle';
  getEl('taskId').value=task?.id||'';
  getEl('taskTeacher').value=task?.teacherId||sortedTeachers()[0]?.id||'';
  getEl('taskKind').value=task?.kind||'Genel';
  getEl('taskTitle').value=task?.title||'';
  getEl('taskDescription').value=task?.description||'';
  getEl('taskDetails').value=task?.details||'';
  getEl('taskStart').value=task?.startDate||'';
  getEl('taskEnd').value=task?.endDate||'';
  bootstrap.Modal.getOrCreateInstance(getEl('taskModal')).show();
}

function saveTaskForm(){
  const id=getEl('taskId').value||uid('g');
  const task={id,teacherId:getEl('taskTeacher').value,kind:getEl('taskKind').value.trim()||'Genel',title:getEl('taskTitle').value.trim(),description:getEl('taskDescription').value.trim(),details:getEl('taskDetails').value.trim(),startDate:getEl('taskStart').value,endDate:getEl('taskEnd').value};
  if(!task.teacherId||!task.title){ showToast('Öğretmen ve görev tanımı zorunlu.','warning'); return; }
  DB.tasks=DB.tasks||[];
  const i=DB.tasks.findIndex(t=>t.id===id);
  if(i>=0) DB.tasks[i]=task; else DB.tasks.push(task);
  saveDB();
  bootstrap.Modal.getInstance(getEl('taskModal')).hide();
  renderAll();
  showToast('Görev kaydedildi.','success');
}

function deleteTask(id){
  const task=(DB.tasks||[]).find(t=>t.id===id);
  if(!task||!confirm('Bu görev kaydı silinsin mi?')) return;
  DB.tasks=DB.tasks.filter(t=>t.id!==id);
  saveDB();
  renderAll();
  showToast('Görev silindi.','success');
}
