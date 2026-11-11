import test from 'node:test';
import assert from 'node:assert/strict';
import {createPayPalOrder,verifyPayPalWebhook} from '../src/lib/paypal';
const names=['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID'] as const;
test('invalid PayPal webhook signatures are rejected through the provider verification API',async()=>{
 const previous=names.map(name=>process.env[name]),oldFetch=globalThis.fetch;
 process.env.PAYPAL_CLIENT_ID='sandbox-client';process.env.PAYPAL_CLIENT_SECRET='sandbox-secret';process.env.PAYPAL_WEBHOOK_ID='webhook-id';
 let calls=0;
 globalThis.fetch=(async(input:RequestInfo|URL)=>{calls++;const url=String(input);if(url.endsWith('/v1/oauth2/token'))return new Response(JSON.stringify({access_token:'test-token',expires_in:300}),{status:200});return new Response(JSON.stringify({verification_status:'FAILURE'}),{status:200})}) as typeof fetch;
 try{
  const headers=new Headers({'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.paypal.com/cert','paypal-transmission-id':'transmission','paypal-transmission-sig':'invalid','paypal-transmission-time':'2026-11-10T00:00:00Z'});
  assert.equal(await verifyPayPalWebhook(headers,{id:'event-1',event_type:'PAYMENT.CAPTURE.COMPLETED'}),false);
  assert.equal(calls,2);
 }finally{globalThis.fetch=oldFetch;names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index]})}
});
test('missing PayPal transmission headers fail closed',async()=>{
 const previous=names.map(name=>process.env[name]);process.env.PAYPAL_CLIENT_ID='sandbox-client';process.env.PAYPAL_CLIENT_SECRET='sandbox-secret';process.env.PAYPAL_WEBHOOK_ID='webhook-id';
 try{assert.equal(await verifyPayPalWebhook(new Headers(),{}),false)}finally{names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index]})}
});

test('Standard PayPal order leaves the payee unset so the REST app owner receives funds, not the buyer',async()=>{
 const oldFetch=globalThis.fetch;let requestHeaders:Headers|undefined,requestBody:any;
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url.endsWith('/v1/oauth2/token'))return new Response(JSON.stringify({access_token:'test-token',expires_in:300}),{status:200});
  requestHeaders=new Headers(init?.headers);requestBody=JSON.parse(String(init?.body||'{}'));
  return new Response(JSON.stringify({id:'ORDER-TEST',status:'CREATED',purchase_units:[{payee:{email_address:'sb-zmzrt53291888@business.example.com',merchant_id:'NS6Z437VVRNUS'}}]}),{status:201});
 }) as typeof fetch;
 const oldClient=process.env.PAYPAL_CLIENT_ID,oldSecret=process.env.PAYPAL_CLIENT_SECRET;process.env.PAYPAL_CLIENT_ID='client';process.env.PAYPAL_CLIENT_SECRET='secret';
 try{const order=await createPayPalOrder({dealId:'deal-1',title:'Design delivery',amount:12345,currency:'USD',expectedMerchantEmail:'sb-zmzrt53291888@business.example.com',expectedMerchantId:'NS6Z437VVRNUS',requestId:'stable-order-key'});assert.equal(order.id,'ORDER-TEST');assert.equal(requestBody.intent,'CAPTURE');assert.equal(requestBody.purchase_units[0].amount.value,'123.45');assert.equal('payee' in requestBody.purchase_units[0],false);assert.equal(JSON.stringify(requestBody).includes('sb-fbtxh53750364@personal.example.com'),false);assert.equal((requestHeaders?.get('PayPal-Request-Id')||'').length,32)}
 finally{globalThis.fetch=oldFetch;if(oldClient===undefined)delete process.env.PAYPAL_CLIENT_ID;else process.env.PAYPAL_CLIENT_ID=oldClient;if(oldSecret===undefined)delete process.env.PAYPAL_CLIENT_SECRET;else process.env.PAYPAL_CLIENT_SECRET=oldSecret}
});

test('PayPal order fails closed when the returned Business merchant ID does not match',async()=>{
 const oldFetch=globalThis.fetch,oldClient=process.env.PAYPAL_CLIENT_ID,oldSecret=process.env.PAYPAL_CLIENT_SECRET;
 globalThis.fetch=(async(input:RequestInfo|URL)=>String(input).endsWith('/v1/oauth2/token')?new Response(JSON.stringify({access_token:'test-token',expires_in:300}),{status:200}):new Response(JSON.stringify({id:'ORDER-MISMATCH',status:'CREATED',purchase_units:[{payee:{email_address:'sb-zmzrt53291888@business.example.com',merchant_id:'V8BG7ZQ6VZ6JS'}}]}),{status:201})) as typeof fetch;
 process.env.PAYPAL_CLIENT_ID='client';process.env.PAYPAL_CLIENT_SECRET='secret';
 try{await assert.rejects(createPayPalOrder({dealId:'deal-1',title:'Design delivery',amount:12345,currency:'USD',expectedMerchantEmail:'sb-zmzrt53291888@business.example.com',expectedMerchantId:'NS6Z437VVRNUS',requestId:'merchant-mismatch'}),error=>{assert.equal((error as {issue?:string}).issue,'PAYEE_MERCHANT_MISMATCH');return true})}
 finally{globalThis.fetch=oldFetch;if(oldClient===undefined)delete process.env.PAYPAL_CLIENT_ID;else process.env.PAYPAL_CLIENT_ID=oldClient;if(oldSecret===undefined)delete process.env.PAYPAL_CLIENT_SECRET;else process.env.PAYPAL_CLIENT_SECRET=oldSecret}
});
