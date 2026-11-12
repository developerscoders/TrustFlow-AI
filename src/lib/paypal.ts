import {randomUUID,createHash} from 'node:crypto';

const apiBase=()=>process.env.PAYPAL_ENV==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
export const paypalConfigured=()=>Boolean(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET);
export class PayPalRequestError extends Error{
 constructor(message:string,readonly stage:'oauth'|'api',readonly status:number,readonly issue:string){super(message);this.name='PayPalRequestError'}
}
type TokenCache={value:string;expiresAt:number};
let tokenCache:TokenCache|undefined;
async function accessToken():Promise<string>{
 if(!paypalConfigured())throw new Error('PayPal credentials are not configured.');
 if(tokenCache&&tokenCache.expiresAt>Date.now()+30_000)return tokenCache.value;
 const auth=Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
 let response:Response;
 try{response=await fetch(`${apiBase()}/v1/oauth2/token`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',cache:'no-store',signal:AbortSignal.timeout(15_000)})}
 catch{throw new PayPalRequestError('Could not connect to PayPal to authorize checkout. Check server network access and try again.','oauth',0,'PAYPAL_NETWORK_ERROR')}
 if(!response.ok){const status=response.status;const issue=status===401?'INVALID_CLIENT_CREDENTIALS':`OAUTH_HTTP_${status}`;throw new PayPalRequestError(status===401?'PayPal rejected the server credentials. Confirm PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are a matching Sandbox pair.':`PayPal OAuth failed (${status}).`,'oauth',status,issue)}
 let body:{access_token:string;expires_in:number};
 try{body=await response.json() as {access_token:string;expires_in:number}}
 catch{throw new PayPalRequestError('PayPal returned an invalid authorization response.','oauth',502,'INVALID_OAUTH_RESPONSE')}
 if(!body.access_token||!Number.isFinite(body.expires_in))throw new PayPalRequestError('PayPal returned an incomplete authorization response.','oauth',502,'INVALID_OAUTH_RESPONSE');
 tokenCache={value:body.access_token,expiresAt:Date.now()+body.expires_in*1000};return body.access_token;
}
export async function paypalRequest<T=any>(path:string,method='GET',body?:unknown,requestId?:string):Promise<T>{
 const token=await accessToken();const headers:Record<string,string>={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 if(requestId)headers['PayPal-Request-Id']=requestId;
 let response:Response;
 try{response=await fetch(`${apiBase()}${path}`,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(20_000)})}
 catch{throw new PayPalRequestError('Could not connect to PayPal to create the checkout order. Check server network access and try again.','api',0,'PAYPAL_NETWORK_ERROR')}
 const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{data={message:'Invalid PayPal response'}};
 if(!response.ok){const issue=String(data?.details?.[0]?.issue||data?.name||'PAYPAL_ERROR').replace(/[^A-Z0-9_ -]/gi,'').slice(0,100);throw new PayPalRequestError(`PayPal rejected the checkout order: ${issue} (${response.status}).`,'api',response.status,issue)}
 return data as T;
}
export async function createPayPalOrder(input:{dealId:string;title:string;amount:number;currency:string;requestId?:string}){
 const requestId=createHash('sha256').update(input.requestId||randomUUID()).digest('hex').slice(0,32);
 // Deliberately omit purchase_units[].payee: PayPal routes this Standard
 // Checkout order to the Business account that owns PAYPAL_CLIENT_ID.
 return paypalRequest<{id:string;status:string;purchase_units?:Array<{payee?:{email_address?:string;merchant_id?:string}}>} >('/v2/checkout/orders','POST',{intent:'CAPTURE',purchase_units:[{reference_id:input.dealId,custom_id:input.dealId,description:input.title.slice(0,127),amount:{currency_code:input.currency,value:(input.amount/100).toFixed(2)}}]},requestId);
}
export async function capturePayPalOrder(orderId:string,requestId:string){
 const idempotencyKey=createHash('sha256').update(requestId).digest('hex').slice(0,32);
 return paypalRequest<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,'POST',{},idempotencyKey);
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
