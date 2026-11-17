import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient,AuthApiError,AuthRetryableFetchError} from '@supabase/supabase-js';
import {isSignedOutError} from '../src/auth-errors.js';

test('a fresh visit is signed out without making a network request',async()=>{
  let requests=0;
  const client=createClient('https://example.supabase.co','test-publishable-key',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async()=>{requests++;throw Error('Unexpected request');}}
  });
  const {data,error}=await client.auth.getUser();
  assert.equal(data.user,null);
  assert.equal(error.name,'AuthSessionMissingError');
  assert.equal(isSignedOutError(error),true);
  assert.equal(requests,0);
});

test('network, server and unrelated bad-request errors remain visible failures',()=>{
  for(const error of [
    new AuthRetryableFetchError('Failed to fetch',0),
    new AuthApiError('Service unavailable',503,'unexpected_failure'),
    new AuthApiError('Bad request',400,'validation_failed'),
    new AuthApiError('Too many requests',429,'over_request_rate_limit'),
    new TypeError('Failed to fetch')
  ])assert.equal(isSignedOutError(error),false,error.message);
  assert.equal(isSignedOutError(null),false);
});

test('a rejected session returns to sign-in rather than showing private plans',()=>{
  assert.equal(isSignedOutError(new AuthApiError('Invalid token',401,'bad_jwt')),true);
  assert.equal(isSignedOutError(new AuthApiError('Session forbidden',403,'user_banned')),true);
});
