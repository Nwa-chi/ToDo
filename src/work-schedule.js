import {localDate,validatePlan} from './domain.js';

const months=new Map(Object.entries({
  jan:1,feb:2,mar:3,maa:3,mrt:3,apr:4,may:5,mei:5,jun:6,jul:7,aug:8,sep:9,okt:10,oct:10,nov:11,dec:12
}));
const dates=/\b(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})|(\d{1,2})[\s./-]*([a-z]{3,9})\.?(?:\s+(\d{4}))?)\b/gi;
const times=/\b(\d{1,2})\s*[:.h]\s*([0-5]\d)(?:\s*(am|pm)\b)?/gi;
const pad=n=>String(n).padStart(2,'0');

export const maxShifts=250;
export const shiftHours={
  morning:['06:45','15:15'],afternoon:['14:45','23:15'],night:['22:45','07:15']
};
const shiftWords=/\b(afternoon|morning|night|ochtend|middag|nacht|off|vrij|x)\b/gi;
const shiftNames={ochtend:'morning',middag:'afternoon',nacht:'night',vrij:'off',x:'off'};

function labels(text){
  return [...text.matchAll(shiftWords)].map(match=>{
    const name=match[0].toLowerCase();
    return {name:shiftNames[name]||name,index:match.index};
  });
}

function readDate(match,fallbackYear){
  const [,isoYear,yearMonth,yearDay,day,month,year,textDay,textMonth,textYear]=match;
  const resolvedYear=isoYear||year||textYear||fallbackYear;
  if(!resolvedYear)return '';
  const date=[resolvedYear,pad(Number(yearMonth||month||months.get(textMonth?.toLowerCase().slice(0,3)))),pad(Number(yearDay||day||textDay))].join('-');
  const parsed=new Date(date+'T12:00:00');
  return !Number.isNaN(+parsed)&&localDate(parsed)===date?date:'';
}

function dateTokens(text){
  return [...text.matchAll(dates)].filter(match=>!match[8]||months.has(match[8].toLowerCase().slice(0,3)));
}

function readTimes(text){
  return [...text.matchAll(times)].flatMap(([,hours,minutes,meridiem])=>{
    let hour=Number(hours);
    if(meridiem){
      if(hour<1||hour>12)return [];
      hour=hour%12+(meridiem.toLowerCase()==='pm'?12:0);
    }
    return hour<=23?[pad(hour)+':'+minutes]:[];
  });
}

export function mergeSchedules(results){
  const rows=new Map();
  let conflicts=0;
  for(const {shifts} of results)for(const row of shifts){
    const key=row.date+'T'+row.start;
    const previous=rows.get(key);
    if(previous?.end&&row.end&&previous.end!==row.end){conflicts++;continue}
    if(!previous?.end)rows.set(key,row);
  }
  return {
    shifts:[...rows.values()].sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)),
    unrecognised:Math.max(0,...results.map(result=>result.unrecognised))+conflicts,
    usedYear:results.some(result=>result.usedYear),
    usedHours:results.some(result=>result.usedHours),
    missingYear:results.some(result=>result.missingYear)
  };
}

function weekMonday(year,week){
  const start=new Date(Number(year),0,4,12);
  start.setDate(start.getDate()-((start.getDay()+6)%7)+(week-1)*7);
  return start;
}

function shiftDate(date,days){
  const day=new Date(date+'T12:00:00');
  day.setDate(day.getDate()+days);
  return localDate(day);
}

function labelDistance(a,b){
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(const [i,char] of [...a].entries()){
    const next=[i+1];
    for(const [j,other] of [...b].entries())next.push(Math.min(next[j]+1,previous[j+1]+1,previous[j]+Number(char!==other)));
    previous=next;
  }
  return previous.at(-1);
}

export function gridLabel(value){
  const known=labels(value)[0]?.name;
  if(known)return known;
  const word=value.toLowerCase().replace(/[^a-z]/g,'');
  if(/^[kvy]$/.test(word)||value.trim()==='%')return 'off';
  if(word.length<4)return '';
  const candidates=['ochtend','middag','nacht','morning','afternoon','night'].map(name=>[labelDistance(word,name),name]).sort((a,b)=>a[0]-b[0]);
  const [[distance,name],[secondDistance]]=candidates;
  if(distance<=2&&distance<secondDistance||word.length>=7&&distance===3&&secondDistance>=5)return shiftNames[name]||name;
  return '';
}

function gridMonday(table,year){
  const anchors=new Map();
  for(let day=1;day<=7;day++){
    const token=dateTokens(table.dates[day].replace(/^O(?=\d)/i,'0').replace(/(\d)\s*[Il](?=[A-Za-z])/g,'$1/'))[0];
    const date=token&&readDate(token,year);
    if(!date)continue;
    const monday=shiftDate(date,1-day);
    if(new Date(monday+'T12:00:00').getDay()===1)anchors.set(monday,(anchors.get(monday)||0)+1);
  }
  const sorted=[...anchors].sort((a,b)=>b[1]-a[1]);
  if(sorted[0]?.[1]>=2&&sorted[0][1]!==sorted[1]?.[1])return sorted[0][0];
  const week=Number(table.dates[0].match(/\b\d{1,2}\b/)?.[0]);
  if(week>=1&&week<=53){
    const expected=localDate(weekMonday(year,week));
    if(anchors.has(expected))return expected;
  }
  return '';
}

function inferGridMonday(index,tables,mondays){
  const series=tables[index].series;
  if(series===undefined)return '';
  const candidates=new Map();
  for(let i=0;i<tables.length;i++){
    if(!mondays[i]||tables[i].series!==series)continue;
    const date=shiftDate(mondays[i],(index-i)*7);
    candidates.set(date,(candidates.get(date)||0)+1);
  }
  const sorted=[...candidates].sort((a,b)=>b[1]-a[1]);
  if(sorted[0]?.[1]>=2&&sorted[0][1]>(sorted[1]?.[1]||0))return sorted[0][0];
  return '';
}

export function parseRosterGrid(tables,{year,hours=shiftHours}){
  const shifts=[];
  const reviewDates=[];
  let unrecognised=0;
  if(!year)return {shifts,unrecognised,missingYear:true};
  const mondays=tables.map(table=>gridMonday(table,year));
  for(const [index,table] of tables.entries()){
    const monday=mondays[index]||inferGridMonday(index,tables,mondays);
    if(!monday){unrecognised+=7;continue}
    for(let day=1;day<=7;day++){
      const kind=gridLabel(table.shifts[day]);
      if(kind==='off')continue;
      const date=shiftDate(monday,day-1);
      if(!hours[kind]){unrecognised++;reviewDates.push(date);continue}
      shifts.push({date,start:hours[kind][0],end:hours[kind][1]});
    }
  }
  return {...mergeSchedules([{shifts,unrecognised,usedYear:true,usedHours:shifts.length>0}]),reviewDates};
}

const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function confirmWeekday(date,segment){
  const weekLabel=segment.match(/^\s*([a-z]+)\s+(\d{1,2})\s+/i);
  const weekday=weekdays.indexOf(weekLabel?.[1].toLowerCase());
  const week=Number(weekLabel?.[2]);
  if(!date||weekday<0||week<1||week>53||!week)return date;
  const expected=weekMonday(Number(date.slice(0,4)),week);
  expected.setDate(expected.getDate()+(weekday+6)%7);
  const result=localDate(expected);
  const distance=Math.abs(+expected-+new Date(date+'T12:00:00'));
  return distance<=4*86400_000?result:date;
}

export function parseWorkSchedule(text,{year,team=2,hours=shiftHours,allowLabels=true}={}){
  const lines=text.normalize('NFKC').split(/\r?\n/).map(raw=>raw.replace(/[|_]/g,' ').replace(/\bO(?=\d{2}\s)/gi,'').trim());
  const years=new Set([...text.matchAll(/\b20\d{2}\b/g)].map(match=>match[0]));
  const fallback=years.size===1?[...years][0]:year;
  const shifts=[];
  let unrecognised=0,usedYear=false,usedHours=false,missingYear=false,pendingDate='',gridDates=[];
  const getDate=match=>{
    if(!match[1]&&!match[6]&&!match[9]&&fallback)usedYear=true;
    if(!match[1]&&!match[6]&&!match[9]&&!fallback)missingYear=true;
    return readDate(match,fallback);
  };
  const add=(date,segment,allowShift=true)=>{
    const entries=readTimes(segment);
    const kind=allowShift&&allowLabels?labels(segment)[0]?.name:undefined;
    if(kind==='off')return;
    if(!date||entries.length>2){if(entries.length||kind)unrecognised++;return}
    if(entries.length){shifts.push({date,start:entries[0],end:entries[1]||''});return}
    if(hours[kind]){
      usedHours=true;
      shifts.push({date,start:hours[kind][0],end:hours[kind][1]});
    }
  };
  for(const line of lines){
    if(!line){pendingDate='';continue}
    const matches=dateTokens(line);
    if(matches.length>=5){
      gridDates=matches.map(getDate);
      pendingDate='';
      continue;
    }
    const teamMatch=line.match(/^team\s*([1-9])\b/i);
    if(teamMatch&&gridDates.length){
      if(Number(teamMatch[1])===Number(team)){
        const cells=labels(line.slice(teamMatch[0].length));
        if(gridDates.length===7&&cells.length===7){
          for(const [index,cell] of cells.entries())add(gridDates[index],cell.name);
        }else unrecognised++;
      }
      continue;
    }
    if(matches.length){
      gridDates=[];
      pendingDate='';
      for(const [index,match] of matches.entries()){
        const date=getDate(match);
        const segment=line.slice(match.index+match[0].length,matches[index+1]?.index);
        if(readTimes(segment).length||labels(segment).length)add(confirmWeekday(date,segment),segment);
        else if(index===matches.length-1)pendingDate=date;
      }
    }else if(!gridDates.length){
      if(pendingDate||readTimes(line).length)add(pendingDate,line,Boolean(pendingDate));
      pendingDate='';
    }
  }
  return mergeSchedules([{shifts,unrecognised,usedYear,usedHours,missingYear}]);
}

function shiftDuration(date,start,end){
  if(!end)return null;
  if(end===start)throw Error('Start and end times must differ.');
  const startAt=new Date(date+'T'+start);
  const endDate=new Date(date+'T12:00:00');
  if(end<start)endDate.setDate(endDate.getDate()+1);
  const endAt=new Date(localDate(endDate)+'T'+end);
  if(endAt.getHours()!==Number(end.slice(0,2))||endAt.getMinutes()!==Number(end.slice(3)))throw Error('The end time does not exist on that date.');
  return (+endAt-+startAt)/60_000;
}

export function workShiftPlan({date,start,end}){
  if(!date||!start)throw Error('Enter the shift date and start time.');
  const clock=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if(!clock.test(start)||(end&&!clock.test(end)))throw Error('Enter valid shift times.');
  return validatePlan({
    title:'Work shift',description:'',category:'Work',kind:'event',priority:'medium',
    date,time:start,duration:shiftDuration(date,start,end)
  });
}

export async function workShiftID(userID,dueAt){
  const input=new TextEncoder().encode(JSON.stringify(['daymark-work-shift',userID,dueAt]));
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',input)).slice(0,16);
  bytes[6]=(bytes[6]&15)|128;
  bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
