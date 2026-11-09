import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {rateLimit,retryDelay} from '../src/lib/security';

describe('security helpers',()=>{
  it('enforces a per-key request limit within the window',()=>{
    const key=`test:${Date.now()}:${Math.random()}`;
    assert.equal(rateLimit(key,2,60_000),true);
    assert.equal(rateLimit(key,2,60_000),true);
    assert.equal(rateLimit(key,2,60_000),false);
  });
  it('uses bounded exponential retry delays',()=>{
    assert.equal(retryDelay(1),60_000);
    assert.equal(retryDelay(2),120_000);
    assert.equal(retryDelay(20),60*60_000);
  });
});
