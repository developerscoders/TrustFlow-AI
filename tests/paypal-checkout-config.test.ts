import test from 'node:test';
import assert from 'node:assert/strict';
import {paypalClientIdsMatch,resolvePayPalCheckoutConfiguration,paypalPayeeMatchesConfiguredMerchant} from '../src/lib/paypal-checkout-config';

const merchantEmail='sb-zmzrt53291888@business.example.com';
const merchantId='NS6Z437VVRNUS';

test('Standard checkout accepts only the configured Business app owner',()=>{
 const env={PAYPAL_INTEGRATION_MODE:'standard',PAYPAL_STANDARD_MERCHANT_EMAIL:merchantEmail,PAYPAL_STANDARD_MERCHANT_ID:merchantId};
 assert.deepEqual(resolvePayPalCheckoutConfiguration(merchantEmail,env),{ok:true,mode:'standard',merchantEmail,merchantId});
 const mismatch=resolvePayPalCheckoutConfiguration('sb-fbtxh53750364@personal.example.com',env);
 assert.equal(mismatch.ok,false);
 if(!mismatch.ok)assert.equal(mismatch.code,'PAYPAL_SELLER_MISMATCH');
});

test('Multiparty is explicitly blocked until TrustFlow completes PayPal partner onboarding',()=>{
 const config=resolvePayPalCheckoutConfiguration(merchantEmail,{PAYPAL_INTEGRATION_MODE:'multiparty'});
 assert.equal(config.ok,false);
 if(!config.ok)assert.equal(config.code,'PAYPAL_MULTIPARTY_NOT_CONFIGURED');
});

test('returned payee must match both configured Business email and merchant ID',()=>{
 const payee={email_address:merchantEmail,merchant_id:merchantId};
 assert.equal(paypalPayeeMatchesConfiguredMerchant(payee,merchantEmail,merchantId),true);
 assert.equal(paypalPayeeMatchesConfiguredMerchant(payee,merchantEmail,'V8BG7ZQ6VZ6JS'),false);
 assert.equal(paypalPayeeMatchesConfiguredMerchant({email_address:'sb-fbtxh53750364@personal.example.com',merchant_id:merchantId},merchantEmail,merchantId),false);
 assert.equal(paypalPayeeMatchesConfiguredMerchant({email_address:merchantEmail},merchantEmail,merchantId),false);
});

test('browser SDK and REST API must use the same Sandbox app client ID',()=>{
 assert.equal(paypalClientIdsMatch(' sandbox-app ','sandbox-app'),true);
 assert.equal(paypalClientIdsMatch('browser-app','server-app'),false);
 assert.equal(paypalClientIdsMatch('','server-app'),false);
});
