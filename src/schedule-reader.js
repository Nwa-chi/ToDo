import {readRosterGrid,rosterTextRegions,withRosterPhoto} from './roster-photo.js';
import {mergeSchedules,parseRosterGrid,parseWorkSchedule} from './work-schedule.js';

const root='/schedule/';
const pdfModule=root+'pdf.min.mjs';
const ocrModule=root+'tesseract.mjs';
const photoTypes=new Set(['png','jpg','jpeg','webp']);

async function recognisePage(worker,image){
  const {data}=await worker.recognize(image);
  return data.text;
}

function pdfLines(items){
  const rows=[];
  const words=items.filter(item=>item.str?.trim()).sort((a,b)=>b.transform[5]-a.transform[5]);
  for(const item of words){
    const baseline=item.transform[5];
    if(!rows.length||Math.abs(rows.at(-1).baseline-baseline)>3)rows.push({baseline,words:[]});
    rows.at(-1).words.push(item);
  }
  return rows.map(row=>row.words.sort((a,b)=>a.transform[4]-b.transform[4]).map(item=>item.str).join(' ')).join('\n');
}

async function readPDF(file,getWorker,onProgress){
  const pdf=await import(pdfModule);
  pdf.GlobalWorkerOptions.workerSrc=root+'pdf.worker.min.mjs';
  const task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWasm:false});
  try{
    const document=await task.promise;
    if(document.numPages>12)throw Error('Choose a PDF of 12 pages or fewer.');
    const pages=[];
    for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
      onProgress(`Reading PDF page ${pageNumber} of ${document.numPages}…`);
      const page=await document.getPage(pageNumber);
      const text=pdfLines((await page.getTextContent()).items);
      if(text.trim()){
        pages.push(text);
      }else{
        const base=page.getViewport({scale:1});
        const viewport=page.getViewport({scale:Math.min(2.5,2200/Math.max(base.width,base.height))});
        const canvas=globalThis.document.createElement('canvas');
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        try{
          await page.render({canvasContext:canvas.getContext('2d'),canvas,viewport}).promise;
          pages.push(await recognisePage(await getWorker(),canvas));
        }finally{canvas.width=canvas.height=0}
      }
      page.cleanup();
    }
    return pages.join('\n\n');
  }finally{await task.destroy()}
}

export async function readSchedule(file,onProgress,options={}){
  if(!file.size||file.size>10*1024*1024)throw Error('Choose a non-empty file up to 10 MB.');
  const type=file.name.split('.').at(-1).toLowerCase();
  if(type==='csv'||type==='txt')return parseWorkSchedule(await file.text(),options);
  if(type!=='pdf'&&!photoTypes.has(type))throw Error('Choose a JPG, PNG, WebP, PDF, CSV or text file.');

  let worker,gridReading=false;
  async function getWorker(){
    if(!worker){
      const {default:{createWorker}}=await import(ocrModule);
      worker=await new Promise((resolve,reject)=>{
        createWorker(['eng','nld'],1,{
          corePath:root+'tesseract-core-lstm.wasm.js',workerPath:root+'worker.min.js',
          langPath:root,workerBlobURL:false,errorHandler:reject,
          logger:progress=>{
            if(!gridReading&&progress.status==='recognizing text')onProgress(`Reading the image… ${Math.round(progress.progress*100)}%`);
          }
        }).then(resolve,reject);
      });
      await worker.setParameters({tessedit_pageseg_mode:'6'});
    }
    return worker;
  }
  try{
    if(type==='pdf')return parseWorkSchedule(await readPDF(file,getWorker,onProgress),options);
    return await withRosterPhoto(file,async photo=>{
      const ocr=await getWorker();
      const tables=await readRosterGrid(
        photo,options.team||2,
        async (image,output)=>{
          if(!gridReading){
            gridReading=true;
            await ocr.reinitialize('eng');
            await ocr.setParameters({tessedit_pageseg_mode:'6'});
          }
          return (await ocr.recognize(image,{},output)).data;
        },
        (first,last,total)=>onProgress(`Reading roster weeks ${first}–${last} of ${total}…`)
      );
      if(tables.length){
        const grid=parseRosterGrid(tables,options);
        if(grid.shifts.length||grid.missingYear)return grid;
      }
      const regions=rosterTextRegions(photo);
      if(regions.length){
        const results=[];
        for(const region of regions){
          results.push(parseWorkSchedule(await recognisePage(ocr,region),options));
          region.width=region.height=0;
        }
        const merged=mergeSchedules(results.filter(result=>result.shifts.length||result.missingYear));
        if(merged.shifts.length||merged.missingYear)return merged;
      }
      return parseWorkSchedule(await recognisePage(ocr,photo),options);
    });
  }finally{await worker?.terminate()}
}
