import {NextRequest,NextResponse} from 'next/server';

const sessionCookie='trustflow_session';

export function middleware(req:NextRequest){
  const {pathname,search}=req.nextUrl;

  // A cookie's presence is not proof that its server-side session is valid.
  // Always allow the auth pages to render so an expired/stale cookie cannot
  // create a /login -> /dashboard -> /login redirect loop.
  if(pathname==='/login'||pathname==='/register')return NextResponse.next();

  const hasSession=!!req.cookies.get(sessionCookie)?.value;
  const protectedPage=pathname==='/dashboard'||pathname.startsWith('/deals')||pathname.startsWith('/notifications');
  if(protectedPage&&!hasSession){
    const url=new URL('/login',req.url);
    url.searchParams.set('next',pathname+search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config={matcher:['/','/dashboard','/login','/register','/deals/:path*','/notifications/:path*']};
