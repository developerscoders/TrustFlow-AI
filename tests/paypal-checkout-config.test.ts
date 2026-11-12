import test from 'node:test';
import assert from 'node:assert/strict';
import {paypalClientIdsMatch,resolvePayPalCheckoutConfiguration} from '../src/lib/paypal-checkout-config';

test('Standard Checkout works without merchant email or merchant ID configuration',()=>{
 assert.deepEqual(resolvePayPalCheckoutConfiguration(undefined,{}),{ok:true,mode:'standard'});
 assert.deepEqual(resolvePayPalCheckoutConfiguration('any-provider@example.com',{}),{ok:true,mode:'standard'});
 assert.deepEqual(resolvePayPalCheckoutConfiguration(undefined,{PAYPAL_INTEGRATION_MODE:'standard'}),{ok:true,mode:'standard'});
});

test('Multiparty remains blocked until TrustFlow completes PayPal partner onboarding',()=>{
 const config=resolvePayPalCheckoutConfiguration(undefined,{PAYPAL_INTEGRATION_MODE:'multiparty'});
 assert.equal(config.ok,false);
 if(!config.ok)assert.equal(config.code,'PAYPAL_MULTIPARTY_NOT_CONFIGURED');
});

test('browser SDK and REST API must use the same Sandbox app client ID',()=>{
 assert.equal(paypalClientIdsMatch(' sandbox-app ','sandbox-app'),true);
 assert.equal(paypalClientIdsMatch('browser-app','server-app'),false);
 assert.equal(paypalClientIdsMatch('','server-app'),false);
});
