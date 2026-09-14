import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan,filterItems,overdue,localDate,dailyProgress} from '../src/domain.js';
const input={title:'Plan',description:'',category:'Work',kind:'task',priority:'high',date:'2026-09-13',time:'',duration:''};
test('validates required fields, valid dates and time dependencies',()=>{
 assert.throws(()=>validatePlan({...input,title:' '}),/title/);
 assert.throws(()=>validatePlan({...input,date:'2026-02-30'}),/date/);
 assert.throws(()=>validatePlan({...input,date:'',time:'10:00'}),/date/);
 assert.throws(()=>validatePlan({...input,time:'25:00'}),/time/);
 assert.throws(()=>validatePlan({...input,duration:'1.5'}),/Duration/);
 assert.equal(validatePlan({...input,title:' <script>text</script> '}).title,'<script>text</script>');
});
test('date-only plans become overdue after their day; completed plans never overdue',()=>{
 const now=new Date('2026-09-13T12:00:00');
 assert.equal(overdue({...input,due_date:localDate(now),completed:false},now),false);
 assert.equal(overdue({...input,due_date:'2026-09-12',completed:false},now),true);
 assert.equal(overdue({...input,due_date:'2026-09-12',completed:true},now),false);
});
test('time conversion stores the same instant and retains date-only entries',()=>{
 assert.equal(validatePlan(input).due_at,null);
 const result=validatePlan({...input,time:'14:30'});
 assert.equal(new Date(result.due_at).getHours(),14);
 assert.equal(new Date(result.due_at).getMinutes(),30);
});
test('search and combined filters use the production filtering function',()=>{
 const list=[
 {...input,id:'a',due_date:'2026-09-13',completed:false,created_at:'2026-09-12',description:'Meeting notes'},
 {...input,id:'b',title:'Book tickets',priority:'low',completed:true,created_at:'2026-09-11'}
 ];
 const filters={view:'all',kind:'all',category:'all',priority:'all',search:'',sort:'due'};
 assert.equal(filterItems(list,{...filters,search:'notes'}).length,1);
 assert.equal(filterItems(list,{...filters,view:'completed'})[0].id,'b');
 assert.equal(filterItems(list,{...filters,view:'today'},new Date('2026-09-13T12:00:00'))[0].id,'a');
 assert.equal(filterItems(list,{...filters,priority:'low',category:'Work'})[0].id,'b');
 assert.equal(filterItems(list,{...filters,sort:'alpha'})[0].id,'b');
});
test('reminders use local 09:00 for date-only plans and exact time otherwise',()=>{
 const dateOnly=validatePlan(input);
 assert.equal(new Date(dateOnly.reminder_at).getHours(),9);
 assert.equal(localDate(new Date(dateOnly.reminder_at)),input.date);
 const timed=validatePlan({...input,time:'16:45'});assert.equal(timed.reminder_at,timed.due_at);
 assert.equal(validatePlan({...input,date:''}).reminder_at,null);
});

test('daily progress excludes other dates and undated plans, includes completed today',()=>{
 const now=new Date('2026-09-14T12:00:00');
 const items=[{due_date:'2026-09-14',completed:true},{due_date:'2026-09-14',completed:false},{due_date:'2026-09-13',completed:false},{due_date:'2026-09-15',completed:true},{completed:true}];
 assert.deepEqual(dailyProgress(items,now),{total:2,complete:1,remaining:1,percent:50});
 assert.equal(dailyProgress(items,new Date('2026-09-15T12:00:00')).percent,100);
 assert.deepEqual(dailyProgress([],now),{total:0,complete:0,remaining:0,percent:0});
 const timed={due_date:'1999-01-01',due_at:new Date('2026-09-14T15:00:00').toISOString(),completed:true};
 assert.equal(dailyProgress([timed],now).percent,100);
});
test('multi-day plans appear on every included day and expire after the end date',()=>{
 const item={...validatePlan({...input,date:'2026-09-14',endDate:'2026-09-16',time:'08:00'}),completed:false};
 const filters={view:'today',kind:'all',category:'all',priority:'all',search:'',sort:'due'};
 for(const day of ['14','15','16']){
  const now=new Date(`2026-09-${day}T12:00:00`);
  assert.equal(filterItems([item],filters,now).length,1);assert.equal(dailyProgress([item],now).total,1);assert.equal(overdue(item,now),false);
 }
 assert.equal(overdue(item,new Date('2026-09-17T00:01:00')),true);
 assert.equal(dailyProgress([item],new Date('2026-09-17T12:00:00')).total,0);
 assert.equal(dailyProgress([{...item,completed:true}],new Date('2026-09-15T12:00:00')).percent,100);
 assert.throws(()=>validatePlan({...input,date:'',endDate:'2026-09-16'}),/end date/);
 assert.throws(()=>validatePlan({...input,endDate:'2026-09-01'}),/end date/);
 assert.throws(()=>validatePlan({...input,endDate:'2026-02-30'}),/end date/);
 assert.equal(validatePlan(input).end_date,null);
});
