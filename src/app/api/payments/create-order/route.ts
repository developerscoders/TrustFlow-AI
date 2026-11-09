import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {createPayPalOrder,paypalConfigured} from '@/lib/paypal';
import {audit} from '@/lib/events';
import {mutationError,rateLimit} from '@/lib/security';
import {canInitiatePayment} from '@/lib/workflow-authorization';
const input=z.object({dealId:z.string().min(1).max(100)});
export async function POST(req:Request){
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!rateLimit(`payment-order:${user.id}`,10))return NextResponse.json({error:'Too many payment requests.'},{status:429});
 if(!paypalConfigured())return NextResponse.json({error:'PayPal Sandbox configuration required.',configured:false},{status:503});
 let body:unknown;try{body=await req.json()}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
 const value=input.safeParse(body);if(!value.success)return NextResponse.json({error:'Invalid deal.'},{status:400});
 try{
  const deal=await db.deal.findFirst({where:{id:value.data.dealId,buyerId:user.id},include:{agreement:true,provider:{select:{paypalMerchantEmail:true}}}});
  if(!deal)return NextResponse.json({error:'Deal not found or you are not the buyer.'},{status:404});
  if(!canInitiatePayment(user.id,deal.buyerId,deal.agreement?.buyerApprovedAt,deal.agreement?.providerApprovedAt))return NextResponse.json({error:'Both parties must approve the agreement first.'},{status:409});
  if(!deal.providerId||!deal.provider?.paypalMerchantEmail)return NextResponse.json({error:'The provider must configure a PayPal receiving account before checkout. TrustFlow does not collect or hold the payment.'},{status:409});
  const existing=await db.payment.findFirst({where:{dealId:deal.id,agreementVersion:deal.agreement.version},orderBy:{createdAt:'desc'}});
  if(existing&&existing.status!=='FAILED'&&existing.status!=='CANCELLED')return NextResponse.json({id:existing.paypalOrderId,amount:existing.amount,currency:existing.currency,status:existing.status,reused:true});
  if(existing?.status==='FAILED'&&existing.failureReason!=='PAYMENT.CAPTURE.DENIED')return NextResponse.json({error:'This PayPal attempt requires review before another charge can be initiated.'},{status:409});
  const attempt=(existing?.attempt||0)+1;
  const requestKey=`trustflow-order-${deal.id}-v${deal.agreement.version}-a${attempt}`;
  const order=await createPayPalOrder({dealId:deal.id,title:deal.title,amount:deal.amount,currency:deal.currency,payeeEmail:deal.provider.paypalMerchantEmail,requestId:requestKey});
  if(!order.id)throw new Error('PayPal did not return an order ID.');
  let payment;
  try{payment=await db.payment.create({data:{dealId:deal.id,paypalOrderId:order.id,amount:deal.amount,currency:deal.currency,status:'CREATED',agreementVersion:deal.agreement.version,attempt}})}
  catch{const duplicate=await db.payment.findUnique({where:{paypalOrderId:order.id}});if(!duplicate)throw new Error('PayPal order was created but could not be recorded. Retry checkout.');payment=duplicate}
  await audit(deal.id,'PAYMENT_INITIATED','PayPal checkout order created.',user.name,user.id,{type:'PAYMENT',id:payment.id});
  return NextResponse.json({id:order.id,amount:payment.amount,currency:payment.currency},{status:201});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not create PayPal order.'},{status:502})}
}
