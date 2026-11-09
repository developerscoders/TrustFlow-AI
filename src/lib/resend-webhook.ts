import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyResendWebhookSignature(input:{rawBody:string;id:string;timestamp:string;signature:string;secret:string;nowSeconds?:number}){
 const {rawBody,id,timestamp,signature,secret}=input,now=input.nowSeconds??Date.now()/1000,seconds=Number(timestamp);
 if(!id||!timestamp||!signature||!secret||!Number.isFinite(seconds)||Math.abs(now-seconds)>300)return false;
 try{
  const key=Buffer.from(secret.replace(/^whsec_/,''),'base64');
  if(!key.length)return false;
  const expected=Buffer.from(createHmac('sha256',key).update(`${id}.${timestamp}.${rawBody}`).digest('base64'));
  return signature.split(' ').some(part=>{const [version,value]=part.split(',');if(version!=='v1'||!value)return false;const supplied=Buffer.from(value);return supplied.length===expected.length&&timingSafeEqual(supplied,expected)});
 }catch{return false}
}