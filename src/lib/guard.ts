import {currentUser} from './auth';import {db} from './db';
export async function participantDeal(id:string){const u=await currentUser();if(!u)return {user:null,deal:null};const deal=await db.deal.findFirst({where:{id,OR:[{buyerId:u.id},{providerId:u.id}]}});return {user:u,deal};}
