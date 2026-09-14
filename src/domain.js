export function localDate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
export function overdue(item, now = new Date()) {
  if (item.completed) return false;
  if (item.end_date && item.end_date>item.due_date) return item.end_date<localDate(now);
  if (item.due_at) return new Date(item.due_at).getTime() < now.getTime();
  return Boolean(item.due_date && item.due_date < localDate(now));
}
export function displayDate(item) {
  return item.due_at ? localDate(new Date(item.due_at)) : item.due_date || '';
}
export function matchesView(item, view, now = new Date()) {
  const today = localDate(now);
  if (view==='completed') return item.completed;
  if (view==='overdue') return overdue(item,now);
  if (view==='today') return !item.completed && includesDay(item,today);
  if (view==='upcoming') return !item.completed && displayDate(item)>today;
  return true;
}
export function filterItems(items, filters, now = new Date()) {
  const ranks={high:0,medium:1,low:2};
  return items.filter(t => matchesView(t,filters.view,now)
    && (filters.kind==='all'||t.kind===filters.kind)
    && (filters.priority==='all'||t.priority===filters.priority)
    && (filters.category==='all'||t.category===filters.category)
    && (t.title+' '+t.description).toLowerCase().includes(filters.search.toLowerCase().trim())
  ).sort((a,b)=>{
    if(filters.sort==='alpha')return a.title.localeCompare(b.title,'en-GB');
    if(filters.sort==='priority')return ranks[a.priority]-ranks[b.priority];
    if(filters.sort==='created')return b.created_at.localeCompare(a.created_at);
    const due=t=>t.end_date&&t.end_date>t.due_date?new Date(t.end_date+'T23:59:59').getTime():t.due_at?new Date(t.due_at).getTime():t.due_date?new Date(t.due_date+'T23:59:59').getTime():Infinity;
    const first=due(a),second=due(b);
    return first===second?0:first<second?-1:1;
  });
}
export function validatePlan(input) {
  const title=input.title.trim(), description=input.description.trim(),category=input.category.trim()||'Uncategorised';
  if(!title||title.length>100)throw Error('Enter a title of 1–100 characters.');
  if(description.length>500||category.length>30)throw Error('Shorten the description or category.');
  if(!['task','event','occasion'].includes(input.kind)||!['low','medium','high'].includes(input.priority))throw Error('Choose a valid type and priority.');
  if(input.time&&!input.date)throw Error('Choose a date before setting a time.');
  if(input.date && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||localDate(new Date(input.date+'T12:00:00'))!==input.date))throw Error('Choose a valid date.');
  if(input.endDate&&(!input.date||!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)||localDate(new Date(input.endDate+'T12:00:00'))!==input.endDate||input.endDate<input.date))throw Error('Choose an end date on or after the start date.');
  if(input.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))throw Error('Choose a valid time.');
  const duration=input.duration?Number(input.duration):null;
  if(duration!==null&&(!Number.isInteger(duration)||duration<1||duration>10080))throw Error('Duration must be between 1 and 10,080 minutes.');
  let due_at=null;
  if(input.date&&input.time){
    const d=new Date(input.date+'T'+input.time);
    if(d.getHours()!==Number(input.time.slice(0,2))||d.getMinutes()!==Number(input.time.slice(3)))throw Error('That time does not exist due to a clock change. Choose another time.');
    due_at=d.toISOString();
  }
  return {title,description,category,kind:input.kind,priority:input.priority,due_date:input.date||null,end_date:input.endDate||null,due_at,reminder_at:input.date?(due_at||new Date(input.date+'T09:00:00').toISOString()):null,duration_minutes:duration};
}

// Completed plans stay in today's denominator; undated/other-day plans do not.
export function dailyProgress(items, now = new Date()) {
  const today=localDate(now),daily=items.filter(item=>includesDay(item,today));
  const total=daily.length,complete=daily.filter(item=>item.completed).length;
  return {total,complete,remaining:total-complete,percent:total?Math.round(complete/total*100):0};
}

export function includesDay(item,day){
 const start=displayDate(item);
 return Boolean(start&&start<=day&&day<=(item.end_date||start));
}
