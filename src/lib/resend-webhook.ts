import {Webhook} from 'svix';
export function verifyResendWebhookSignature(input:{rawBody:string;id:string;timestamp:string;signature:string;secret:string;nowSeconds?:number}){
 const {rawBody,id,timestamp,signature,secret}=input,seconds=Number(timestamp),now=input.nowSeconds??Date.now()/1000;
 if(!id||!timestamp||!signature||!secret||!Number.isFinite(seconds)||Math.abs(now-seconds)>300)return false;
 try{new Webhook(secret).verify(rawBody,{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':signature});return true}catch{return false}
}