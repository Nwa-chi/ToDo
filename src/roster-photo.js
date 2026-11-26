import {gridLabel} from './work-schedule.js';

const columnWidth=154;
const rowHeight=48;

function canvas(width,height){
  const result=document.createElement('canvas');
  result.width=width;
  result.height=height;
  return result;
}

export async function withRosterPhoto(file,read){
  const image=await createImageBitmap(file);
  try{
    const scale=Math.min(1,2200/Math.max(image.width,image.height));
    const source=canvas(Math.round(image.width*scale),Math.round(image.height*scale));
    const context=source.getContext('2d',{willReadFrequently:true});
    context.fillStyle='#fff';
    context.fillRect(0,0,source.width,source.height);
    context.drawImage(image,0,0,source.width,source.height);
    return await read(source);
  }finally{image.close()}
}

function grayscale(source){
  const {data}=source.getContext('2d').getImageData(0,0,source.width,source.height);
  const gray=new Uint8Array(source.width*source.height);
  for(let i=0;i<gray.length;i++)gray[i]=(data[4*i]*3+data[4*i+1]*6+data[4*i+2])/10;
  return gray;
}

function contrastCrop(source,left,top,right,bottom,scale){
  const result=canvas(Math.round((right-left)*scale),Math.round((bottom-top)*scale));
  const context=result.getContext('2d');
  context.drawImage(source,left,top,right-left,bottom-top,0,0,result.width,result.height);
  const pixels=context.getImageData(0,0,result.width,result.height);
  const data=pixels.data;
  for(let i=0;i<data.length;i+=4)data[i]=data[i+1]=data[i+2]=(data[i]*3+data[i+1]*6+data[i+2])/10<165?0:255;
  context.putImageData(pixels,0,0);
  return result;
}

export function rosterTextRegions(source){
  const {width,height}=source;
  if(height>width*2.3){
    const sections=Math.ceil(height/600);
    return Array.from({length:sections},(_,i)=>contrastCrop(
      source,width*.08,Math.max(0,i*height/sections-30),
      width-4,Math.min(height,(i+1)*height/sections+30),2.5
    ));
  }
  if(width<height*1.45)return [];

  const gray=grayscale(source);
  const ink=new Uint16Array(width);
  for(let x=0;x<width;x++)for(let y=8;y<height;y++)if(gray[y*width+x]<145)ink[x]++;
  let start=0,blank=0;
  const groups=[];
  for(let x=0;x<=width;x++){
    blank=ink[x]>2?0:blank+1;
    if(blank===Math.round(width*.033)||x===width){
      const end=x-blank+1;
      if(end-start>width*.07&&end-start<width*.32)groups.push([Math.max(0,start-8),Math.min(width,end+8)]);
      start=x+1;
    }else if(blank>Math.round(width*.033))start=x+1;
  }
  if(groups.length<2||groups.length>6)return [];
  return groups.map(([left,right])=>contrastCrop(source,left,0,right,height,2));
}

function ruledPanels(gray,width,height){
  const sampleHalf=width*.145;
  const tables=[];
  let series=0;
  for(let side=0;side<2;side++){
    series++;
    const middle=width*(side+.5)/2;
    const best=new Float32Array(height);
    const slopes=new Float32Array(height);
    const sampleStep=Math.max(4,Math.round(width/267));
    for(let angle=-45;angle<=45;angle++){
      const slope=angle*.002;
      const offsets=[];
      for(let x=Math.ceil(middle-sampleHalf);x<middle+sampleHalf;x+=sampleStep){
        offsets.push(x+Math.round(slope*(x-middle))*width);
      }
      for(let y=1;y<height-1;y++){
        let ink=0;
        const row=y*width;
        for(const offset of offsets)if(gray[row+offset]<105)ink++;
        const score=ink/offsets.length;
        if(score>best[y]){best[y]=score;slopes[y]=slope}
      }
    }
    const lines=[];
    for(let y=4;y<height-4;y++){
      if(best[y]<.73||lines.at(-1)?.y>=y-4)continue;
      if(best.subarray(y-4,y+5).some(score=>score>best[y]))continue;
      lines.push({y,slope:slopes[y]});
    }
    for(let i=1;i<lines.length;i++){
      const top=lines[i-1],bottom=lines[i],span=bottom.y-top.y;
      if(span<height*.065||span>height*.155)continue;
      const bounds=[];
      for(const line of [top,bottom]){
        const dark=x=>gray[Math.round(line.y+line.slope*(x-middle))*width+x]<124;
        const first=Math.ceil(side*width/2)+10,last=Math.floor((side+1)*width/2)-10;
        const edges=[];
        let ink=0;
        for(let x=first-9;x<=last+9;x++){
          if(dark(x))ink++;
          if(x>=first+10&&dark(x-19))ink--;
          if(x>=first+9&&x<=last+9&&ink>=12)edges.push(x-9);
        }
        if(edges.at(-1)-edges[0]>width*.26)bounds.push([edges[0],edges.at(-1)]);
      }
      if(bounds.length===2){
        const previous=tables.at(-1);
        if(previous?.middle===middle&&top.y-previous.top.y>1.4*((previous.bottom.y-previous.top.y+span)/2))series++;
        tables.push({middle,top,bottom,bounds,series});
      }
    }
  }
  return tables;
}

function drawGridCell(pixels,gray,width,height,table,row,col,xOffset,yOffset,retry=false){
  const {middle,top,bottom,bounds}=table;
  const threshold=retry?147:132;
  for(let y=5;y<rowHeight-5;y++){
    const v=(row+(retry ? .11 : .16)+(retry ? .76 : .68)*(y-5)/(rowHeight-11))/6;
    const left=bounds[0][0]*(1-v)+bounds[1][0]*v;
    const right=bounds[0][1]*(1-v)+bounds[1][1]*v;
    for(let x=11;x<columnWidth-11;x++){
      const fraction=(col+(retry ? .115 : .065)+(retry ? .81 : .87)*(x-11)/(columnWidth-23))/8;
      const sx=Math.round(left+(right-left)*fraction);
      const y1=top.y+top.slope*(sx-middle);
      const y2=bottom.y+bottom.slope*(sx-middle);
      const sy=Math.round(y1+(y2-y1)*v);
      if(sy<0||sy>=height||gray[sy*width+sx]>threshold)continue;
      const offset=((yOffset+y)*pixels.width+xOffset+x)*4;
      pixels.data[offset]=pixels.data[offset+1]=pixels.data[offset+2]=0;
    }
  }
}

function wordRows(tsv,columns,rows){
  const cells=Array.from({length:rows},()=>Array.from({length:columns},()=>[]));
  for(const row of (tsv||'').split('\n')){
    const fields=row.split('\t');
    if(fields[0]!=='5'||!fields[11]?.trim())continue;
    const x=Number(fields[6])+Number(fields[8])/2;
    const y=Number(fields[7])+Number(fields[9])/2;
    cells[Math.floor(y/rowHeight)]?.[Math.floor(x/columnWidth)]?.push(fields[11]);
  }
  return cells.map(row=>row.map(words=>words.join(' ')));
}

function montage(columns,rows,draw){
  const result=canvas(columns*columnWidth,rows*rowHeight);
  const context=result.getContext('2d');
  const pixels=context.createImageData(result.width,result.height);
  pixels.data.fill(255);
  draw(pixels);
  context.putImageData(pixels,0,0);
  return result;
}

export async function readRosterGrid(source,team,recognize,onProgress=()=>{}){
  const {width,height}=source;
  if(width<800||width<height*1.15||width>height*1.7)return [];
  const gray=grayscale(source);
  const tables=ruledPanels(gray,width,height);
  if(tables.length<3)return [];
  const result=[];
  const teamRow=Number(team)+1;
  for(let i=0;i<tables.length;i+=4){
    const batch=tables.slice(i,i+4);
    onProgress(i+1,i+batch.length,tables.length);
    const sheet=montage(8,batch.length*2,pixels=>{
      for(const [index,table] of batch.entries())for(const [line,row] of [1,teamRow].entries()){
        for(let col=0;col<8;col++)drawGridCell(pixels,gray,width,height,table,row,col,col*columnWidth,(index*2+line)*rowHeight);
      }
    });
    const {tsv}=await recognize(sheet,{tsv:true});
    sheet.width=sheet.height=0;
    const cells=wordRows(tsv,8,batch.length*2);
    const unreadable=[];
    for(const [index,table] of batch.entries()){
      const row={series:table.series,dates:cells[2*index],shifts:cells[2*index+1]};
      result.push(row);
      for(let col=1;col<=7;col++)if(!gridLabel(row.shifts[col]))unreadable.push({table,row,col});
    }
    if(unreadable.length){
      const columns=4;
      const rows=Math.ceil(unreadable.length/columns);
      const retry=montage(columns,rows,pixels=>{
        for(const [index,{table,col}] of unreadable.entries()){
          drawGridCell(pixels,gray,width,height,table,teamRow,col,index%columns*columnWidth,Math.floor(index/columns)*rowHeight,true);
        }
      });
      const second=await recognize(retry,{tsv:true});
      retry.width=retry.height=0;
      const guesses=wordRows(second.tsv,columns,rows).flat();
      for(const [index,{row,col}] of unreadable.entries())if(gridLabel(guesses[index]))row.shifts[col]=guesses[index];
    }
  }
  return result;
}
