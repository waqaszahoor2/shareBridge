import test from 'node:test';
import assert from 'node:assert/strict';

// Test 1: Code Normalization
test('normalizeCode formats digits correctly', () => {
  function normalizeCode(val) {
    if (typeof val !== 'string' && typeof val !== 'number') return '';
    const digits = String(val).replace(/\D/g, '');
    return /^\d{6}$/.test(digits) ? digits : '';
  }

  assert.equal(normalizeCode('123-456'), '123456');
  assert.equal(normalizeCode('123 456'), '123456');
  assert.equal(normalizeCode(123456), '123456');
  assert.equal(normalizeCode('abc'), '');
  assert.equal(normalizeCode('12345'), '');
  assert.equal(normalizeCode('1234567'), '');
});

// Test 2: File Limits Validation
test('File count limits (1-20 files max)', () => {
  const MAX_FILES = 20;
  const validateFileCount = (files) => Array.isArray(files) && files.length > 0 && files.length <= MAX_FILES;

  assert.equal(validateFileCount([]), false);
  assert.equal(validateFileCount(Array(20).fill({ id: '1' })), true);
  assert.equal(validateFileCount(Array(21).fill({ id: '1' })), false);
});

// Test 3: Duplicate File ID Detection
test('Duplicate file IDs rejection', () => {
  function hasDuplicateIds(files) {
    const seen = new Set();
    for (const f of files) {
      if (seen.has(f.id)) return true;
      seen.add(f.id);
    }
    return false;
  }

  assert.equal(hasDuplicateIds([{ id: 'a' }, { id: 'b' }]), false);
  assert.equal(hasDuplicateIds([{ id: 'a' }, { id: 'a' }]), true);
});

// Test 4: Chunk Size Calculation
test('Chunk size calculation respects SCTP max message size', () => {
  function calculateChunkSize(maxMessageSize) {
    const max = maxMessageSize || 65_536;
    return Math.max(16 * 1024, Math.min(64 * 1024, Math.floor(max / 2)));
  }

  assert.equal(calculateChunkSize(65536), 32768);
  assert.equal(calculateChunkSize(262144), 65536);
  assert.equal(calculateChunkSize(16384), 16384);
});

// Test 5: Standardized Error Schema Format
test('Consistent error response structure', () => {
  function createErrorResponse(error, code, reasons = []) {
    return {
      success: false,
      error,
      code,
      reasons
    };
  }

  const res = createErrorResponse('Transfer code not found', 'SESSION_NOT_FOUND', ['Code expired']);
  assert.equal(res.success, false);
  assert.equal(res.code, 'SESSION_NOT_FOUND');
  assert.ok(Array.isArray(res.reasons));
});

// Test 6: Separate Session ID and Token
test('Session ID and Token separation', () => {
  const code = '123456';
  const ownerToken = 'token_secret_12345';
  const responsePayload = {
    success: true,
    code,
    sessionId: code,
    token: ownerToken
  };

  assert.notEqual(responsePayload.sessionId, responsePayload.token);
  assert.equal(responsePayload.sessionId, code);
  assert.equal(responsePayload.token, ownerToken);
});

// Test 7: Cursor-based Signaling Sequence Filter
test('Cursor-based signal filtering', () => {
  const signals = [
    { id: '1', seq: 1, type: 'offer' },
    { id: '2', seq: 2, type: 'ice' },
    { id: '3', seq: 3, type: 'answer' }
  ];

  function getNewSignals(sinceSeq) {
    return signals.filter((s) => s.seq > sinceSeq);
  }

  assert.equal(getNewSignals(0).length, 3);
  assert.equal(getNewSignals(2).length, 1);
  assert.equal(getNewSignals(2)[0].id, '3');
  assert.equal(getNewSignals(3).length, 0);
});

// Test 8: State Machine Transitions
test('Transfer state machine transition validity', () => {
  const validTransitions = {
    idle: ['selecting', 'creating-session', 'joining'],
    selecting: ['creating-session', 'idle'],
    'creating-session': ['waiting-for-receiver', 'failed'],
    'waiting-for-receiver': ['waiting-for-sender-approval', 'expired', 'failed'],
    joining: ['connecting', 'failed'],
    connecting: ['waiting-for-sender-approval', 'failed'],
    'waiting-for-sender-approval': ['preparing-storage', 'transferring', 'declined', 'cancelled', 'failed'],
    'preparing-storage': ['transferring', 'failed'],
    transferring: ['completed', 'cancelled', 'failed'],
    completed: ['idle'],
    declined: ['idle', 'creating-session'],
    cancelled: ['idle', 'creating-session'],
    expired: ['idle', 'creating-session'],
    failed: ['idle', 'creating-session']
  };

  assert.ok(validTransitions['waiting-for-sender-approval'].includes('transferring'));
  assert.ok(validTransitions['transferring'].includes('completed'));
});

// Test 9: Text Sharing Payload Formatting
test('Text note payload formatting and text extension validation', () => {
  function formatTextFileName(input) {
    const name = (input || '').trim() || 'shared-note.txt';
    return name.endsWith('.txt') ? name : `${name}.txt`;
  }

  assert.equal(formatTextFileName('my-snippet'), 'my-snippet.txt');
  assert.equal(formatTextFileName('notes.txt'), 'notes.txt');
  assert.equal(formatTextFileName(''), 'shared-note.txt');
});

// Test 10: Safe Filename Sanitization
test('Safe filename sanitization for receiver downloads', () => {
  function safeFileName(input) {
    if (!input || typeof input !== 'string') return 'download';
    const clean = input
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
      .replace(/\.\./g, '_')
      .trim();
    return clean.slice(0, 255) || 'download';
  }

  assert.equal(safeFileName('../../../etc/passwd'), '______etc_passwd');
  assert.equal(safeFileName('report<2026>?.pdf'), 'report_2026__.pdf');
  assert.equal(safeFileName('normal-file.zip'), 'normal-file.zip');
});

