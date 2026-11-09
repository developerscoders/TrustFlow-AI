import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPayPalWebhook} from '../src/lib/paypal';
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
