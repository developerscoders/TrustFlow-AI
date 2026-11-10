import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabaseUnavailableMessage } from '../src/lib/database-errors';

test('explains when DATABASE_URL is missing', () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    assert.match(getDatabaseUnavailableMessage(), /DATABASE_URL is not configured/i);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test('explains MongoDB authentication failures without exposing credentials', () => {
  assert.match(
    getDatabaseUnavailableMessage({ errorCode: 'P1000' }),
    /rejected the database credentials/i,
  );
});

test('explains MongoDB connectivity failures', () => {
  assert.match(
    getDatabaseUnavailableMessage({ errorCode: 'P1001' }),
    /Cannot reach MongoDB Atlas/i,
  );
});

test('explains malformed MongoDB connection strings', () => {
  assert.match(
    getDatabaseUnavailableMessage({ errorCode: 'P1013' }),
    /DATABASE_URL is malformed/i,
  );
});
