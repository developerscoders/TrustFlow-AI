import {randomUUID,createHash} from 'node:crypto';

const apiBase=()=>process.env.PAYPAL_ENV==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
export const paypalConfigured=()=>Boolean(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET);
type TokenCache={value:string;expiresAt:number};
let tokenCache:TokenCache|undefined;
async function accessToken():Promise<string>{
 if(!paypalConfigured())throw new Error('PayPal credentials are not configured.');
 if(tokenCache&&tokenCache.expiresAt>Date.now()+30_000)return tokenCache.value;
 const auth=Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
 const response=await fetch(`${apiBase()}/v1/oauth2/token`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',cache:'no-store'});
 if(!response.ok)throw new Error(`PayPal OAuth failed (${response.status}).`);
 const body=await response.json() as {access_token:string;expires_in:number};
 tokenCache={value:body.access_token,expiresAt:Date.now()+body.expires_in*1000};return body.access_token;
}
export async function paypalRequest<T=any>(path:string,method='GET',body?:unknown,requestId?:string):Promise<T>{
 const token=await accessToken();const headers:Record<string,string>={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 if(requestId)headers['PayPal-Request-Id']=requestId;
 const response=await fetch(`${apiBase()}${path}`,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),cache:'no-store'});
 const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{data={message:'Invalid PayPal response'}};
 if(!response.ok){const issue=data?.details?.[0]?.issue||data?.name||'PAYPAL_ERROR';throw new Error(`PayPal ${issue} (${response.status}).`)}
 return data as T;
}
export async function createPayPalOrder(input:{dealId:string;title:string;amount:number;currency:string;requestId?:string}){
 const requestId=createHash('sha256').update(input.requestId||randomUUID()).digest('hex').slice(0,32);\n return paypalRequest<{id:string;status:string}>('/v2/checkout/orders','POST',{intent:'CAPTURE',purchase_units:[{reference_id:input.dealId,custom_id:input.dealId,description:input.title.slice(0,127),amount:{currency_code:input.currency,value:(input.amount/100).toFixed(2)}}]},requestId);
}
export async function capturePayPalOrder(orderId:string,requestId:string){
 return paypalRequest<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,'POST',{},requestId);
}
export async function getPayPalOrder(orderId:string){return paypalRequest<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);}
export async function verifyPayPalWebhook(headers:Headers,event:unknown){
 if(!process.env.PAYPAL_WEBHOOK_ID)throw new Error('PAYPAL_WEBHOOK_ID is not configured.');
 const required=['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'] as const;
 const values=Object.fromEntries(required.map(name=>[name,headers.get(name)]));
 if(required.some(name=>!values[name]))return false;
 const result=await paypalRequest<{verification_status:string}>('/v1/notifications/verify-webhook-signature','POST',{auth_algo:values['paypal-auth-algo'],cert_url:values['paypal-cert-url'],transmission_id:values['paypal-transmission-id'],transmission_sig:values['paypal-transmission-sig'],transmission_time:values['paypal-transmission-time'],webhook_id:process.env.PAYPAL_WEBHOOK_ID,webhook_event:event});
 return result.verification_status==='SUCCESS';
}
