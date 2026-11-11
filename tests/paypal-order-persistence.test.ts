import test from 'node:test';
import assert from 'node:assert/strict';
import {createAndPersistPayPalOrder,type PaymentCreateData,type PaymentRecord} from '../src/lib/paypal-order-persistence';

const input={dealId:'6af346878e177d97a70b89eb',buyerId:'6af223ec0b383686eec41077',providerId:'6af223ec0b383686eec41088',title:'Website delivery',amount:55500,currency:'USD',payeeEmail:'provider@example.com',payeeMerchantId:'NS6Z437VVRNUS',agreementVersion:1,attempt:1};
const record=(data:PaymentCreateData):PaymentRecord=>({id:'6af346878e177d97a70b8999',...data});

test('persists a PayPal order as CREATED with correct deal terms and verified seller identity',async()=>{
 let sent:unknown,created:PaymentCreateData|undefined;
 const result=await createAndPersistPayPalOrder(input,{
  createPayPalOrder:async data=>{sent=data;return{id:'ORDER-OK',status:'CREATED'}},
  createPayment:async data=>{created=data;return record(data)},
  findPaymentByPayPalOrderId:async()=>null,
 });
 assert.equal(result.order.id,'ORDER-OK');
 assert.equal(result.payment.status,'CREATED');
 assert.equal(created?.dealId,input.dealId);
 assert.equal(created?.captureId,'pending:ORDER-OK');
 assert.equal(created?.amount,input.amount);
 assert.equal(created?.currency,input.currency);
 assert.equal(created?.agreementVersion,input.agreementVersion);
 assert.equal(created?.status,'CREATED');
 assert.equal((sent as {expectedMerchantEmail:string}).expectedMerchantEmail,input.payeeEmail);
 assert.equal((sent as {expectedMerchantId:string}).expectedMerchantId,input.payeeMerchantId);
 assert.equal(created?.paypalSellerEmail,input.payeeEmail);
 assert.equal(created?.paypalSellerMerchantId,input.payeeMerchantId);
});

test('database failure after PayPal creation surfaces the Prisma code and does not mark payment completed',async()=>{
 const original=console.error,logged:unknown[][]=[];console.error=(...args:unknown[])=>{logged.push(args)};
 try{
  await assert.rejects(createAndPersistPayPalOrder(input,{
   createPayPalOrder:async()=>({id:'ORDER-DB-FAIL',status:'CREATED'}),
   createPayment:async()=>{throw Object.assign(new Error('unique captureId collision'),{code:'P2002',meta:{target:'Payment_captureId_key'}})},
   findPaymentByPayPalOrderId:async()=>null,
  }),error=>{
   assert.match((error as Error).message,/Prisma P2002/);
   assert.equal((error as {prismaCode?:string}).prismaCode,'P2002');
   return true;
  });
  assert.equal((logged[0]?.[1] as {prismaTarget?:string})?.prismaTarget,'Payment_captureId_key');
 }finally{console.error=original}
});

test('retry after an unrecorded PayPal order reuses the stable PayPal idempotency key',async()=>{
 const original=console.error;console.error=()=>{};
 try{
  const requestIds:string[]=[];let persisted:PaymentRecord|null=null;let paypalCreates=0;
  const deps={
   createPayPalOrder:async(data:{requestId:string})=>{requestIds.push(data.requestId);paypalCreates++;return{id:'ORDER-RETRY-SAME',status:'CREATED'}},
   createPayment:async(data:PaymentCreateData)=>{persisted=record(data);return persisted},
   findPaymentByPayPalOrderId:async()=>persisted,
  };
  await assert.rejects(createAndPersistPayPalOrder(input,{
   ...deps,createPayment:async()=>{throw Object.assign(new Error('temporary MongoDB outage'),{code:'P1001'})},
  }),/Prisma P1001/);
  const retry=await createAndPersistPayPalOrder(input,deps);
  assert.equal(requestIds.length,2);
  assert.equal(requestIds[0],requestIds[1]);
  assert.equal(paypalCreates,2);
  assert.equal(retry.order.id,'ORDER-RETRY-SAME');
  assert.equal(retry.payment.paypalOrderId,'ORDER-RETRY-SAME');
  assert.equal(retry.payment.status,'CREATED');
 }finally{console.error=original}
});

test('a recovered PayPal order is reused only when it matches the same deal terms',async()=>{
  const expected=record({dealId:input.dealId,paypalOrderId:'ORDER-RECOVERED',paypalSellerEmail:input.payeeEmail,paypalSellerMerchantId:input.payeeMerchantId,captureId:'pending:ORDER-RECOVERED',amount:input.amount,currency:input.currency,status:'CREATED',agreementVersion:input.agreementVersion,attempt:input.attempt});
 const original=console.error;console.error=()=>{};
 try{
  const result=await createAndPersistPayPalOrder(input,{
   createPayPalOrder:async()=>({id:'ORDER-RECOVERED',status:'CREATED'}),
   createPayment:async()=>{throw Object.assign(new Error('duplicate write response'),{code:'P2002'})},
   findPaymentByPayPalOrderId:async()=>expected,
  });
  assert.equal(result.reused,true);
  assert.equal(result.payment.id,expected.id);
 }finally{console.error=original}
});
