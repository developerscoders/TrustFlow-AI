import {Suspense} from 'react';import {AuthForm} from '@/components/auth-form';export default function Login(){return <Suspense fallback={null}><AuthForm mode="login"/></Suspense>}
