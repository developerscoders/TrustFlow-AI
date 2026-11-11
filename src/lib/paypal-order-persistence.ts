export type PayPalOrderResult={id:string;status:string};
export type PaymentRecord={id:string;paypalOrderId:string;dealId:string;amount:number;currency:string;status:string;agreementVersion:number;attempt:number|null;paypalSellerEmail?:string|null;paypalSellerMerchantId?:string|null};
export type PaymentCreateData={dealId:string;paypalOrderId:string;paypalSellerEmail:string;paypalSellerMerchantId:string;captureId:string;amount:number;currency:string;status:'CREATED';agreementVersion:number;attempt:number};

export class PaymentPersistenceError extends Error{
  constructor(message:string,readonly prismaCode:string|null,options?:ErrorOptions){super(message,options);this.name='PaymentPersistenceError'}
}

function prismaCode(error:unknown):string|null{
  if(!error||typeof error!=='object')return null;
  const code=(error as {code?:unknown}).code;
  return typeof code==='string'?code:null;
}
function prismaTarget(error:unknown):string|null{
  if(!error||typeof error!=='object')return null;
  const target=(error as {meta?:{target?:unknown}}).meta?.target;
  if(typeof target==='string')return target.slice(0,160);
  if(Array.isArray(target))return target.filter((part):part is string=>typeof part==='string').join(',').slice(0,160)||null;
  return null;
}

export async function createAndPersistPayPalOrder(input:{
  dealId:string;buyerId:string;providerId:string;title:string;amount:number;currency:string;payeeEmail:string;payeeMerchantId:string;agreementVersion:number;attempt:number;
},deps:{
  createPayPalOrder:(input:{dealId:string;title:string;amount:number;currency:string;expectedMerchantEmail:string;expectedMerchantId:string;requestId:string})=>Promise<PayPalOrderResult>;
  createPayment:(data:PaymentCreateData)=>Promise<PaymentRecord>;
  findPaymentByPayPalOrderId:(paypalOrderId:string)=>Promise<PaymentRecord|null>;
}){
  const requestId=`trustflow-order-${input.dealId}-v${input.agreementVersion}-a${input.attempt}-m${input.payeeMerchantId}`;
  const order=await deps.createPayPalOrder({
    dealId:input.dealId,title:input.title,amount:input.amount,currency:input.currency,
    expectedMerchantEmail:input.payeeEmail,expectedMerchantId:input.payeeMerchantId,requestId,
  });
  if(!order.id)throw new Error('PayPal did not return an order ID.');

  const paymentData:PaymentCreateData={
    dealId:input.dealId,paypalOrderId:order.id,paypalSellerEmail:input.payeeEmail.toLowerCase(),paypalSellerMerchantId:input.payeeMerchantId,captureId:`pending:${order.id}`,amount:input.amount,currency:input.currency,
    status:'CREATED',agreementVersion:input.agreementVersion,attempt:input.attempt,
  };
  try{
    const payment=await deps.createPayment(paymentData);
    return {order,payment,reused:false};
  }catch(createError){
    const code=prismaCode(createError);
    console.error('[TrustFlow][payment] Prisma Payment.create failed after PayPal order creation',{
      prismaCode:code||'UNKNOWN',prismaTarget:prismaTarget(createError),dealId:input.dealId,buyerId:input.buyerId,providerId:input.providerId,
      paypalOrderId:order.id,agreementVersion:input.agreementVersion,
    });
    let existing:PaymentRecord|null;
    try{existing=await deps.findPaymentByPayPalOrderId(order.id)}
    catch(lookupError){
      console.error('[TrustFlow][payment] Payment idempotency lookup failed',{
        prismaCode:prismaCode(lookupError)||'UNKNOWN',dealId:input.dealId,paypalOrderId:order.id,
      });
      throw new PaymentPersistenceError(`PayPal order ${order.id} exists, but local persistence failed (Prisma ${code||'UNKNOWN'}); idempotency lookup also failed.`,code,{cause:createError});
    }
    if(existing){
      const matches=existing.dealId===input.dealId&&existing.amount===input.amount&&existing.currency===input.currency&&existing.agreementVersion===input.agreementVersion&&existing.paypalSellerEmail?.toLowerCase()===input.payeeEmail.toLowerCase()&&existing.paypalSellerMerchantId===input.payeeMerchantId;
      if(matches)return {order,payment:existing,reused:true};
      throw new PaymentPersistenceError(`PayPal order ${order.id} is already recorded against different deal terms; checkout was stopped.`,code,{cause:createError});
    }
    throw new PaymentPersistenceError(`PayPal order ${order.id} was created but could not be recorded (Prisma ${code||'UNKNOWN'}). Retry checkout safely.`,code,{cause:createError});
  }
}
