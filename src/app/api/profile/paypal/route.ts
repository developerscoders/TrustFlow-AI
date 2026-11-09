import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {mutationError,rateLimit} from '@/lib/security';
const input=z.object({paypalMerchantEmail:z.string().trim().email().max(254)});
export async function PATCH(req:Request){
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!rateLimit('paypal-profile:'+user.id,5))return NextResponse.json({error:'Too many changes. Try again later.'},{status:429});
 let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
 const value=input.safeParse(raw);if(!value.success)return NextResponse.json({error:'Enter a valid PayPal merchant account email.'},{status:400});
 const updated=await db.user.update({where:{id:user.id},data:{paypalMerchantEmail:value.data.paypalMerchantEmail.toLowerCase()}});
 return NextResponse.json({paypalMerchantEmail:updated.paypalMerchantEmail});
}
