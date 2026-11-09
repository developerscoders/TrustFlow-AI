import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword} from '../src/lib/password';

describe('password hashing',()=>{
  it('stores a salted hash and verifies the original password',async()=>{
    const first=await hashPassword('correct horse battery staple');
    const second=await hashPassword('correct horse battery staple');
    assert.notEqual(first,second,'each password hash should use a fresh salt');
    assert.equal(await verifyPassword('correct horse battery staple',first),true);
    assert.equal(await verifyPassword('incorrect password',first),false);
  });
  it('rejects malformed stored hashes',async()=>{
    assert.equal(await verifyPassword('password','not-a-valid-hash'),false);
  });
});
