import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agendaTiming} from '../src/agenda.js';
import {parseRosterGrid,parseWorkSchedule,workShiftPlan,workShiftID} from '../src/work-schedule.js';

test('agenda transitions at 3 hours, 1 hour and 10 minutes before the start',()=>{
  const minute=60_000,due=Date.parse('2026-11-26T10:00:00Z');
  for(const [offset,color] of [[-180*minute-1,''],[-180*minute,'green'],[-60*minute-1,'green'],[-60*minute,'yellow'],[-10*minute-1,'yellow'],[-10*minute,'red'],[0,'red'],[minute,'red']]){
    assert.equal(agendaTiming(due,due+offset).color,color);
  }
  assert.equal(agendaTiming(NaN,due).color,'');
  assert.equal(agendaTiming(due,due-180*minute).next,due-60*minute);
  assert.equal(agendaTiming(due,due-60*minute).next,due-10*minute);
});

test('schedule reader recognises dated Dutch and English rows and flags uncertain times',()=>{
  const {shifts,unrecognised}=parseWorkSchedule([
    'Date,Start,End',
    '26/11/2026,06:45,15:15',
    '27 november 2026',
    '22.45 – 07.15',
    '28 Nov. 2026 2:45 PM – 11:15 PM',
    '26/11/2026 06:45 - 15:15',
    '31/11/2026 15:00'
  ].join('\n'));
  assert.deepEqual(shifts,[
    {date:'2026-11-26',start:'06:45',end:'15:15'},
    {date:'2026-11-27',start:'22:45',end:'07:15'},
    {date:'2026-11-28',start:'14:45',end:'23:15'}
  ]);
  assert.equal(unrecognised,1);
});

test('overnight shifts preserve start reminders and get distinct IDs per account',async()=>{
  const plan=workShiftPlan({date:'2026-11-27',start:'22:45',end:'07:15'});
  assert.equal(plan.duration_minutes,510);
  assert.equal(plan.reminder_at,plan.due_at);
  assert.equal(plan.category,'Work');
  const id=await workShiftID('first',plan.due_at);
  assert.equal(await workShiftID('first',plan.due_at),id);
  assert.notEqual(await workShiftID('second',plan.due_at),id);
  assert.throws(()=>workShiftPlan({date:'2026-11-26',start:'09:00',end:'09:00'}),/must differ/);
});

test('weekly rosters use the header year and explicit times and omit days off',()=>{
  const result=parseWorkSchedule('23 – 29 NOVEMBER 2026\nMON 23 Nov MORNING 07:00 – 15:15\nTUE 24 Nov OFF');
  assert.deepEqual(result.shifts,[{date:'2026-11-23',start:'07:00',end:'15:15'}]);
});

test('team rosters expand named shifts and ignore other teams and days off',()=>{
  const result=parseWorkSchedule([
    '48 | 23/Nov | 24/Nov | 25/Nov | 26/Nov | 27/Nov | 28/Nov | 29/Nov',
    'Team 1 Nacht Nacht Nacht x x x x',
    'Team 2 Ochtend Ochtend Middag Middag Middag Middag x',
    'Team 3 x x Ochtend Ochtend Ochtend Ochtend x'
  ].join('\n'),{year:2026,team:2});
  assert.equal(result.shifts.length,6);
  assert.deepEqual(result.shifts[0],{date:'2026-11-23',start:'06:45',end:'15:15'});
  assert.deepEqual(result.shifts[5],{date:'2026-11-28',start:'14:45',end:'23:15'});
});

test('grid cells keep their dates when an adjacent shift cell cannot be read',()=>{
  const result=parseRosterGrid([{
    dates:['48','23/Nov','24/Nov','25/Nov','26/Nov','','28/Nov','29/Nov'],
    shifts:['Team2','Ochtend','unreadable','Middag','Middag','Middag','Middag','x']
  }],{year:2026});
  assert.equal(result.unrecognised,1);
  assert.deepEqual(result.shifts.map(shift=>shift.date),['2026-11-23','2026-11-25','2026-11-26','2026-11-27','2026-11-28']);
});

test('a grid fills a damaged date row only when nearby weeks agree',()=>{
  const evenings=['Team2','Middag','x','x','x','x','x','x'];
  const weeks=[
    {series:1,dates:['47','16/Nov','17/Nov','18/Nov','19/Nov','20/Nov','21/Nov','22/Nov'],shifts:evenings},
    {series:1,dates:['','','','','','','',''],shifts:evenings},
    {series:1,dates:['49','30/Nov','1/Dec','2/Dec','3/Dec','4/Dec','5/Dec','6/Dec'],shifts:evenings}
  ];
  assert.deepEqual(parseRosterGrid(weeks,{year:2026}).shifts.map(row=>row.date),['2026-11-16','2026-11-23','2026-11-30']);
  assert.equal(parseRosterGrid(weeks.slice(0,2),{year:2026}).unrecognised,7);
});
