import test from 'node:test';
import assert from 'node:assert/strict';
import {canInitiatePayment,canReadDeal,canSubmitEvidence} from '../src/lib/workflow-authorization';
test('only the authenticated buyer can initiate payment after both signatures',()=>{const buyerApprovedAt=new Date(),providerApprovedAt=new Date();assert.equal(canInitiatePayment('buyer','buyer',buyerApprovedAt,providerApprovedAt),true);assert.equal(canInitiatePayment('provider','buyer',buyerApprovedAt,providerApprovedAt),false);assert.equal(canInitiatePayment('buyer','buyer',buyerApprovedAt,null),false)});
test('only the authenticated provider can submit after agreement approval',()=>{const approved=new Date();assert.equal(canSubmitEvidence('provider','provider',approved,approved),true);assert.equal(canSubmitEvidence('buyer','provider',approved,approved),false);assert.equal(canSubmitEvidence('provider','provider',approved,null),false)});
test('deal data is visible only to its buyer or provider',()=>{assert.equal(canReadDeal('buyer','buyer','provider'),true);assert.equal(canReadDeal('provider','buyer','provider'),true);assert.equal(canReadDeal('stranger','buyer','provider'),false)});
