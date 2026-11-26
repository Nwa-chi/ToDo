const minute=60_000;

export function agendaTiming(due,now=Date.now()){
  if(!Number.isFinite(due))return {color:'',label:'',next:Infinity};
  const redAt=due-10*minute;
  if(now>=redAt)return {color:'red',label:'Due within 10 minutes or past due',next:Infinity};
  if(now>=due-60*minute)return {color:'yellow',label:'Within one hour of the scheduled time',next:redAt};
  if(now>=due-180*minute)return {color:'green',label:'Within three hours of the scheduled time',next:due-60*minute};
  return {color:'',label:'',next:due-180*minute};
}
