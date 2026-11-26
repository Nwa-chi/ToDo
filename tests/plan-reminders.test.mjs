import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceReminder,planTone,localDateTime} from '../src/plan-reminders.js';

test('advance presets preserve the local start time, and custom reminders must precede it',()=>{
  const start=new Date('2027-03-30T14:00').toISOString();
  for(const [days,day] of [[1,29],[2,28],[3,27],[7,23]]){
    const {advance_reminder_at,reminder_lead_days}=advanceReminder(start,String(days));
    assert.equal(localDateTime(advance_reminder_at),'2027-03-'+day+'T14:00');
    assert.equal(reminder_lead_days,days);
  }
  const custom=advanceReminder(start,'custom','2027-03-20T11:30');
  assert.equal(localDateTime(custom.advance_reminder_at),'2027-03-20T11:30');
  assert.equal(custom.reminder_lead_days,null);
  assert.throws(()=>advanceReminder(start,'custom','2027-03-30T14:00'),/must be before/);
  assert.throws(()=>advanceReminder(start,'custom','2027-02-30T14:00'),/valid date/);
  assert.throws(()=>advanceReminder(null,'1'),/start date/);
});

test('explicit ringtone choice overrides stable automatic tone assignment',()=>{
  assert.equal(planTone({id:'1',reminder_tone:'fall'}),'fall');
  assert.equal(planTone({id:'1'}),planTone({id:'1'}));
  assert.notEqual(planTone({id:'1'}),planTone({id:'2'}));
});
