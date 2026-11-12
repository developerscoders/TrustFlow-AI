import test from 'node:test';
import assert from 'node:assert/strict';
import {minorUnits,verifyCompletedOrder,validWebhookCapture} from '../src/lib/payment-verification';
import {captureApprovedPayPalOrder} from '../src/lib/paypal-capture';
const payment={orderId:'ORDER-1',dealId:'deal123',amount:12500,currency:'USD'};
const order=(overrides:any={})=>({id:'ORDER-1',status:'COMPLETED',purchase_units:[{custom_id:'deal123',reference_id:'deal123',amount:{currency_code:'USD',value:'125.00'},payments:{captures:[{id:'CAP-1',status:'COMPLETED',amount:{currency_code:'USD',value:'125.00'}}]}}],...overrides});
test('server amount conversion uses exact minor units',()=>{assert.equal(minorUnits('125.00'),12500);assert.ok(Number.isNaN(minorUnits('125.001')));assert.ok(Number.isNaN(minorUnits('125')))});
test('capture is accepted only for the exact completed order, deal, amount and currency',()=>{assert.equal(verifyCompletedOrder(order(),payment,'CAP-1'),true);assert.equal(verifyCompletedOrder(order({id:'OTHER'}),payment,'CAP-1'),false);assert.equal(verifyCompletedOrder(order({status:'APPROVED'}),payment,'CAP-1'),false);const wrongAmount=order();wrongAmount.purchase_units[0].payments.captures[0].amount.value='124.99';assert.equal(verifyCompletedOrder(wrongAmount,payment,'CAP-1'),false);const wrongCurrency=order();wrongCurrency.purchase_units[0].amount.currency_code='EUR';assert.equal(verifyCompletedOrder(wrongCurrency,payment,'CAP-1'),false)});
test('invalid capture IDs and non-completed captures are rejected',()=>{assert.equal(verifyCompletedOrder(order(),payment,'OTHER'),false);const pending=order();pending.purchase_units[0].payments.captures[0].status='PENDING';assert.equal(verifyCompletedOrder(pending,payment,'CAP-1'),false)});
test('Standard Checkout verification does not depend on provider email or merchant ID',()=>{
 assert.equal(verifyCompletedOrder(order(),payment,'CAP-1'),true);
 assert.equal(verifyCompletedOrder(order(),{...payment,paypalSellerEmail:null,paypalSellerMerchantId:null},'CAP-1'),true);
 const noPayee=order();delete noPayee.purchase_units[0].payee;
 assert.equal(verifyCompletedOrder(noPayee,payment,'CAP-1'),true);
});
test('an approved Sandbox buyer order is captured once and reconciled server-side',async()=>{
 let captureCalls=0;
 const approved={id:'ORDER-1',status:'APPROVED'};
 const completed=order();
 const result=await captureApprovedPayPalOrder(approved,'ORDER-1','capture-key',{
  captureOrder:async(orderId,requestId)=>{captureCalls++;assert.equal(orderId,'ORDER-1');assert.equal(requestId,'capture-key');return completed},
  getOrder:async()=>{throw new Error('unexpected reconciliation')},
 });
 assert.equal(captureCalls,1);
 assert.equal(verifyCompletedOrder(result,payment,'CAP-1'),true);
});
test('webhook capture must match stored order, amount, currency and completed status',()=>{const event={event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'CAP-1',status:'COMPLETED',supplementary_data:{related_ids:{order_id:'ORDER-1'}},amount:{currency_code:'USD',value:'125.00'}}};assert.equal(validWebhookCapture(event,payment),true);assert.equal(validWebhookCapture({...event,resource:{...event.resource,amount:{currency_code:'EUR',value:'125.00'}}},payment),false);assert.equal(validWebhookCapture({...event,resource:{...event.resource,status:'PENDING'}},payment),false)});
