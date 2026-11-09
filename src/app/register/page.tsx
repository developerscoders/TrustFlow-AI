import {Suspense} from 'react';import {AuthForm} from '@/components/auth-form';export default function Register(){return <Suspense fallback={null}><AuthForm mode="register"/></Suspense>}
