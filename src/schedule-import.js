import {maxShifts,workShiftPlan} from './work-schedule.js';
import {readSchedule} from './schedule-reader.js';

export function setupScheduleImport(saveShifts,onSaved){
  const dialog=document.querySelector('#schedule-import');
  const form=dialog.querySelector('form');
  const input=dialog.querySelector('#schedule-file');
  const list=dialog.querySelector('#schedule-rows');
  const template=dialog.querySelector('template');
  const status=dialog.querySelector('#schedule-status');
  const unreadable=dialog.querySelector('#schedule-unreadable');
  const error=dialog.querySelector('#schedule-error');
  const zone=dialog.querySelector('#schedule-zone');
  const submit=dialog.querySelector('#schedule-save');
  const add=dialog.querySelector('#schedule-add-row');
  const close=dialog.querySelector('#schedule-close');
  const year=dialog.querySelector('#schedule-year');
  const team=dialog.querySelector('#schedule-team');
  const hoursInputs=[...dialog.querySelectorAll('[data-shift]')];
  let readID=0,reading=false,saving=false,lastFile;
  const rosterFields=[year,team,...hoursInputs];

  function controls(){
    input.disabled=reading||saving;
    for(const field of rosterFields)field.disabled=reading||saving;
    add.disabled=reading||saving||list.children.length>=maxShifts;
    submit.disabled=reading||saving||!list.children.length;
    close.disabled=saving;
    for(const control of list.querySelectorAll('input,button'))control.disabled=saving;
  }

  function addRow(shift={}){
    const row=template.content.firstElementChild.cloneNode(true);
    for(const field of ['date','start','end'])row.querySelector(`[name="${field}"]`).value=shift[field]||'';
    row.querySelector('button').onclick=()=>{row.remove();controls()};
    list.append(row);
    return row;
  }

  function clear(){
    readID++;reading=false;saving=false;
    form.reset();
    year.value=new Date().getFullYear();lastFile=null;
    list.replaceChildren();status.textContent='';error.textContent='';unreadable.hidden=true;
    controls();
  }

  document.querySelector('#open-schedule-import').onclick=()=>{
    clear();
    zone.textContent='Shift times use '+Intl.DateTimeFormat().resolvedOptions().timeZone+'.';
    dialog.showModal();
  };
  close.onclick=()=>dialog.close();
  dialog.onclose=clear;
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault()});
  add.onclick=()=>{if(!add.disabled){addRow().querySelector('input').focus();controls()}};

  async function readFile(file){
    if(!file||reading||saving)return;
    lastFile=file;
    if(rosterFields.some(field=>!field.validity.valid)){
      error.textContent='Enter a valid roster year and shift times.';
      return;
    }
    const hours={};
    for(const input of hoursInputs)(hours[input.dataset.shift]??=[]).push(input.value);
    const read=++readID;
    reading=true;list.replaceChildren();error.textContent='';unreadable.hidden=true;status.textContent='Reading schedule…';controls();
    try{
      const {shifts,unrecognised,usedYear,usedHours,missingYear,reviewDates=[]}=await readSchedule(file,message=>{if(read===readID)status.textContent=message},{year:year.value,team:team.value,hours});
      if(read!==readID)return;
      if(shifts.length>maxShifts)throw Error(`Choose a file with ${maxShifts} shifts or fewer.`);
      for(const shift of shifts)addRow(shift);
      status.textContent=shifts.length?`${shifts.length} ${shifts.length===1?'shift':'shifts'} found. Check the dates and times before saving.`:'No dated shifts found. Choose another file or add a shift below.';
      if(missingYear)status.textContent='Enter the roster year to read dates without a year.';
      if(usedYear&&shifts.length)status.textContent+=' Check the year on dates inferred from the roster.';
      if(usedHours&&shifts.length)status.textContent+=' Named shifts use the times above.';
      if(unrecognised&&shifts.length)status.textContent+=` ${unrecognised} entries need review. Add any missing shifts before saving.`;
      if(reviewDates.length){
        unreadable.querySelector('p').textContent=reviewDates.join(', ');
        unreadable.hidden=false;
      }
    }catch(e){
      if(read===readID){status.textContent='';error.textContent=e.message||'Could not read this file.'}
    }finally{
      if(read===readID){reading=false;input.value='';controls()}
    }
  }
  input.onchange=()=>void readFile(input.files[0]);
  for(const field of rosterFields)field.onchange=()=>void readFile(lastFile);

  form.onsubmit=async event=>{
    event.preventDefault();
    if(submit.disabled)return;
    saving=true;error.textContent='';controls();
    try{
      const plans=[];
      for(const [index,row] of [...list.children].entries()){
        const shift=Object.fromEntries([...row.querySelectorAll('input')].map(field=>[field.name,field.value]));
        try{plans.push(workShiftPlan(shift))}
        catch(e){throw Error(`Shift ${index+1}. ${e.message}`)}
      }
      const count=await saveShifts(plans);
      if(count===undefined)return;
      dialog.close();
      onSaved(count,plans.length);
    }catch(e){if(dialog.open)error.textContent=e.message||'Could not save the schedule.'}
    finally{saving=false;controls()}
  };
  return ()=>{if(dialog.open)dialog.close();clear()};
}
