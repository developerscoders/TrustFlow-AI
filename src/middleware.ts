import {NextRequest,NextResponse} from 'next/server';
const sessionCookie='trustflow_session';
export function middleware(req:NextRequest){const hasSession=!!req.cookies.get(sessionCookie)?.value;const {pathname,search}=req.nextUrl;if((pathname==='/login'||pathname==='/register')&&hasSession)return NextResponse.redirect(new URL('/dashboard',req.url));if((pathname==='/'||pathname==='/dashboard'||pathname.startsWith('/deals')||pathname.startsWith('/notifications'))&&!hasSession){const url=new URL('/login',req.url);url.searchParams.set('next',pathname+search);return NextResponse.redirect(url)}return NextResponse.next()}
export const config={matcher:['/','/dashboard','/login','/register','/deals/:path*','/notifications/:path*']};
