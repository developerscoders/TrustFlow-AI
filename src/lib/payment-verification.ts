export type PaymentExpectation={orderId:string;dealId:string;amount:number;currency:string;paypalSellerEmail?:string|null;paypalSellerMerchantId?:string|null};
export function minorUnits(value:unknown):number{
 if(typeof value!=='string'||!/^\d+\.\d{2}$/.test(value))return Number.NaN;
 const [whole,fraction]=value.split('.');
 return Number(whole)*100+Number(fraction);
}
function matchingOrderUnit(order:any,payment:PaymentExpectation){
 if(!order||order.id!==payment.orderId)return null;
 return order.purchase_units?.find((item:any)=>item.custom_id===payment.dealId||item.reference_id===payment.dealId)||null;
}
export function verifyOrderTerms(order:any,payment:PaymentExpectation){
 const unit=matchingOrderUnit(order,payment);
 return Boolean(unit&&unit.amount?.currency_code===payment.currency&&minorUnits(unit.amount?.value)===payment.amount);
}
export function verifyCompletedCapture(capture:any,payment:PaymentExpectation){
 return Boolean(capture&&capture.status==='COMPLETED'&&typeof capture.id==='string'&&capture.id.length>0&&capture.supplementary_data?.related_ids?.order_id===payment.orderId&&capture.amount?.currency_code===payment.currency&&minorUnits(capture.amount?.value)===payment.amount);
}
export function validWebhookCapture(event:any,payment:PaymentExpectation){
 return event?.event_type==='PAYMENT.CAPTURE.COMPLETED'&&verifyCompletedCapture(event.resource,payment);
}
export function verifyCompletedOrder(order:any,payment:PaymentExpectation,captureId?:string){
 if(!order||order.id!==payment.orderId||order.status!=='COMPLETED'||!verifyOrderTerms(order,payment))return false;
 const unit=matchingOrderUnit(order,payment);
 const captures=unit?.payments?.captures;
 const capture=captureId?captures?.find((item:any)=>item.id===captureId):captures?.find((item:any)=>item.status==='COMPLETED');
 return Boolean(capture&&capture.status==='COMPLETED'&&capture.id&&capture.amount?.currency_code===payment.currency&&minorUnits(capture.amount?.value)===payment.amount);
}
