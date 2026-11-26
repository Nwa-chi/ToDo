import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareReminderSound,signalReminder} from '../src/reminder-signal.js';

test('reminder requests vibration and schedules a chime after audio is enabled',t=>{
  const starts=[];
  const vibration=[];
  const navigator=globalThis.navigator;
  Object.defineProperty(navigator,'vibrate',{configurable:true,value:pattern=>vibration.push(pattern)});
  t.after(()=>delete navigator.vibrate);
  const gain={setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};
  const AudioContext=class {
    state='running';
    currentTime=5;
    createGain(){return {gain,connect(){},disconnect(){}}}
    createOscillator(){return {frequency:{},connect(){},disconnect(){},start:time=>starts.push(time),stop(){}}}
  };
  Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:AudioContext});
  t.after(()=>delete globalThis.AudioContext);

  prepareReminderSound();
  signalReminder();

  assert.deepEqual(vibration,[[250,100,250,100,400]]);
  assert.equal(starts.length,3);
  assert.equal(starts[0],5);
  assert.ok(starts[0]<starts[1]&&starts[1]<starts[2]);
});
