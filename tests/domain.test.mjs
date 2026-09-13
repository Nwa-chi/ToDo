import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan,filterItems,overdue,localDate} from '../src/domain.js';
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
