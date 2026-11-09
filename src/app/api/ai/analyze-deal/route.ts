import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeDeal } from '@/lib/ai';
const input=z.object({description:z.string().min(20).max(10000),amount:z.number().int().positive().max(100000000)});
export async function POST(req:Request){try{const value=input.parse(await req.json());return NextResponse.json(await analyzeDeal(value.description,value.amount));}catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'Please provide a deal description and valid amount.'},{status:400});return NextResponse.json({error:'AI analysis is unavailable. Check provider configuration.'},{status:503});}}
