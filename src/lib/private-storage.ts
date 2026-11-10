import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {isIP} from 'node:net';
const root=()=>process.env.TRUSTFLOW_PRIVATE_UPLOAD_DIR||path.join(process.cwd(),'.trustflow-uploads');
const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf','text/plain']);
const dangerous=/\.(exe|dll|com|bat|cmd|ps1|sh|js|mjs|cjs|html?|svg|jar|msi|scr|php|py|rb|vbs|apk|dmg)$/i;
function sniff(bytes:Buffer,mime:string){
 if(mime==='image/jpeg')return bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]));
 if(mime==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==='image/webp')return bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(mime==='application/pdf')return bytes.subarray(0,5).toString()==='%PDF-';
 if(mime==='text/plain')return !bytes.subarray(0,Math.min(bytes.length,4096)).includes(0);
 return false;
}
export function validateEvidenceUrl(raw:string){
 let u:URL;try{u=new URL(raw)}catch{return false}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return false;
 const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host==='metadata.google.internal')return false;
 if(isIP(host)){
  const parts=host.split('.').map(Number);
  if(host.includes(':')){if(host==='::1'||host.startsWith('fe80:')||host.startsWith('fc')||host.startsWith('fd'))return false;}
  else if(parts[0]===10||parts[0]===127||parts[0]===0||parts[0]>=224||parts[0]===169&&parts[1]===254||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168)return false;
 }
 return true;
}
export async function storeEvidenceFile(file:{name:string;type:string;base64:string}){
 if(process.env.NODE_ENV==='production'&&!process.env.TRUSTFLOW_PRIVATE_UPLOAD_DIR)throw new Error('PRIVATE_STORAGE_CONFIGURATION_REQUIRED');
 if(!allowed.has(file.type)||dangerous.test(file.name))throw new Error('UNSUPPORTED_FILE_TYPE');
 const encoded=file.base64.replace(/^data:[^,]*;base64,/,'');
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new Error('INVALID_FILE_ENCODING');
 const bytes=Buffer.from(encoded,'base64');
 if(!bytes.length||bytes.length>4*1024*1024||!sniff(bytes,file.type))throw new Error('INVALID_FILE_CONTENT_OR_SIZE');
 const id=randomUUID(),storageKey=`${id}.bin`;
 await mkdir(root(),{recursive:true,mode:0o700});
 await writeFile(path.join(root(),storageKey),bytes,{flag:'wx',mode:0o600});
 return {id,storageKey,filename:path.basename(file.name).slice(0,160),contentType:file.type,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function readEvidenceFile(storageKey:string){
 if(!/^[0-9a-f-]{36}\.bin$/i.test(storageKey))throw new Error('INVALID_STORAGE_KEY');
 return readFile(path.join(root(),storageKey));
}
