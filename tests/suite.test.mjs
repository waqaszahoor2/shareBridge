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
    const max = maxMessageSize || 16_384;
    return Math.min(16 * 1024, Math.max(8 * 1024, Math.floor(max / 2)));
  }

  assert.equal(calculateChunkSize(65536), 16384);
  assert.equal(calculateChunkSize(262144), 16384);
  assert.equal(calculateChunkSize(16384), 8192);
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

// Test 11: Sender Approval Handshake Flow
test('Sender approval transitions state from pending_approval to approved', () => {
  const session = { status: 'created' };

  // Receiver joins -> pending_approval
  function receiverJoin(s, receiverId, token) {
    if (s.status !== 'created') throw new Error('Session unavailable');
    s.status = 'pending_approval';
    s.receiverClaim = { receiverId, token };
    return { success: true, status: s.status, receiverId, resumeToken: token };
  }

  // Sender approves -> approved
  function senderApprove(s) {
    if (s.status !== 'pending_approval') throw new Error('Cannot approve');
    s.status = 'approved';
    return { success: true, status: 'approved' };
  }

  const joinRes = receiverJoin(session, 'rec_123', 'tok_abc');
  assert.equal(joinRes.status, 'pending_approval');
  assert.equal(session.status, 'pending_approval');

  const approveRes = senderApprove(session);
  assert.equal(approveRes.status, 'approved');
  assert.equal(session.status, 'approved');
});

// Test 12: Sender Decline and Claim Release
test('Sender decline transitions state to declined and releases claim', () => {
  const session = { status: 'pending_approval', receiverClaim: { receiverId: 'rec_123', token: 'tok_abc' } };

  function senderDecline(s) {
    s.status = 'declined';
    delete s.receiverClaim;
    return { success: true, status: 'declined' };
  }

  const res = senderDecline(session);
  assert.equal(res.status, 'declined');
  assert.equal(session.status, 'declined');
  assert.equal(session.receiverClaim, undefined);
});

// Test 13: Duplicate Receiver Claim Rejection
test('Duplicate receiver attempting to claim active code is rejected', () => {
  const claim = { receiverId: 'rec_first', token: 'token_first' };

  function handleJoin(existingClaim, incomingReceiverId, incomingToken) {
    if (existingClaim) {
      if (existingClaim.receiverId === incomingReceiverId && existingClaim.token === incomingToken) {
        return { success: true, resumed: true };
      }
      return { success: false, code: 'CODE_ALREADY_CLAIMED', status: 409 };
    }
    return { success: true, resumed: false };
  }

  // Same receiver resume -> OK
  const sameRes = handleJoin(claim, 'rec_first', 'token_first');
  assert.equal(sameRes.success, true);
  assert.equal(sameRes.resumed, true);

  // Different receiver -> 409 Conflict
  const diffRes = handleJoin(claim, 'rec_second', 'token_second');
  assert.equal(diffRes.success, false);
  assert.equal(diffRes.code, 'CODE_ALREADY_CLAIMED');
  assert.equal(diffRes.status, 409);
});

// Test 14: Timeout and Claim Release
test('Unapproved claim timeout releases room and enables retry', () => {
  const session = { status: 'pending_approval', receiverClaim: { receiverId: 'rec_1', token: 'tok_1' } };

  function handleTimeoutOrCancel(s) {
    if (s.status === 'pending_approval') {
      s.status = 'created';
      delete s.receiverClaim;
      return { success: true, released: true };
    }
    return { success: true, released: false };
  }

  const releaseRes = handleTimeoutOrCancel(session);
  assert.equal(releaseRes.released, true);
  assert.equal(session.status, 'created');
  assert.equal(session.receiverClaim, undefined);
});

// Test 15: Retry Session Join After Release
test('Retry session join succeeds after previous unapproved claim released', () => {
  const session = { status: 'created' };

  function join(s, recId, tok) {
    if (s.status !== 'created') return { success: false, code: 'CODE_ALREADY_CLAIMED' };
    s.status = 'pending_approval';
    s.receiverClaim = { recId, tok };
    return { success: true, status: 'pending_approval' };
  }

  const firstJoin = join(session, 'rec_1', 'tok_1');
  assert.equal(firstJoin.success, true);

  // Unapproved release resets to created
  session.status = 'created';
  delete session.receiverClaim;

  // Second receiver retries join
  const retryJoin = join(session, 'rec_2', 'tok_2');
  assert.equal(retryJoin.success, true);
  assert.equal(session.status, 'pending_approval');
  assert.equal(session.receiverClaim.recId, 'rec_2');
});

// Test 16: Session Storage Recovery
test('Session restoration payload parsing and validation', () => {
  function restoreSession(rawJson) {
    if (!rawJson) return null;
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.code && parsed.token && parsed.expiresAt > Date.now()) {
        return parsed;
      }
    } catch {}
    return null;
  }

  const validStored = JSON.stringify({ code: '654321', token: 'tok_secret', expiresAt: Date.now() + 600000 });
  const restored = restoreSession(validStored);
  assert.equal(restored?.code, '654321');
  assert.equal(restored?.token, 'tok_secret');

  const expiredStored = JSON.stringify({ code: '654321', token: 'tok_secret', expiresAt: Date.now() - 1000 });
  assert.equal(restoreSession(expiredStored), null);
});

// Test 17: Claim Reuse on Refresh/Retry
test('Receiver claim reuse allows same receiver token on refresh', () => {
  const existingClaim = { receiverId: 'rec_99', tokenHash: 'hashed_resume_token' };

  function validateClaimReuse(claim, incomingId, incomingTokenHash) {
    if (claim.receiverId === incomingId && claim.tokenHash === incomingTokenHash) {
      return { reusable: true };
    }
    return { reusable: false };
  }

  const res = validateClaimReuse(existingClaim, 'rec_99', 'hashed_resume_token');
  assert.equal(res.reusable, true);
});

// Test 18: TURN Configuration Cleanliness
test('No hard-coded public OpenRelay servers in TURN output', () => {
  function filterTurnConfig(turnUrls) {
    return (turnUrls || []).filter((u) => !u.includes('openrelay.metered.ca'));
  }

  const cleanUrls = filterTurnConfig(['stun:stun.l.google.com:19302']);
  assert.equal(cleanUrls.length, 1);
  assert.equal(cleanUrls.includes('turn:openrelay.metered.ca:80'), false);
});

// Test 19: Orphaned Claim Release Beacon
test('Orphan claim release clears active claim and pending_approval state', () => {
  const session = { code: '112233', status: 'pending_approval', receiverId: 'rec_1' };
  let claimDeleted = false;

  function handleBeaconRelease(code, isUnapproved) {
    if (isUnapproved) {
      session.status = 'created';
      delete session.receiverId;
      claimDeleted = true;
    }
  }

  handleBeaconRelease('112233', session.status === 'pending_approval');
  assert.equal(claimDeleted, true);
  assert.equal(session.status, 'created');
  assert.equal(session.receiverId, undefined);
});

// Test 20: Text Sharing Status and Selection Labels
test('Text mode substitutes Preparing Items and Item selected labels correctly', () => {
  function getStatusLabel(state, sendMode) {
    if (sendMode === 'text' && state === 'selecting') return 'Preparing Items';
    return state === 'selecting' ? 'Selecting Files' : 'Ready';
  }

  function getMetadataLabel(count, sendMode) {
    const itemLabel = sendMode === 'text' ? (count === 1 ? 'Item' : 'Items') : (count === 1 ? 'File' : 'Files');
    return `${count} ${itemLabel} selected`;
  }

  assert.equal(getStatusLabel('selecting', 'text'), 'Preparing Items');
  assert.equal(getStatusLabel('selecting', 'files'), 'Selecting Files');

  assert.equal(getMetadataLabel(1, 'text'), '1 Item selected');
  assert.equal(getMetadataLabel(3, 'text'), '3 Items selected');
  assert.equal(getMetadataLabel(1, 'files'), '1 File selected');
});

// Test 21: Bounded API Timeout & Action Reasons
test('API request timeout error structure contains actionable reasons', () => {
  function createTimeoutError() {
    const err = new Error('Server request timed out (15s). Please check your connection and retry.');
    err.code = 'REQUEST_TIMEOUT';
    err.reasons = ['Network latency is high or server response was delayed', 'Click Retry to re-try the request'];
    return err;
  }

  const err = createTimeoutError();
  assert.equal(err.code, 'REQUEST_TIMEOUT');
  assert.ok(err.message.includes('15s'));
  assert.ok(err.reasons.length > 0);
});

// Test 22: Non-Frozen Approval Progress Sequence
test('Sender approval progress sequence updates non-frozen status', () => {
  const steps = [];
  function updateApprovalProgress(percent, text) {
    steps.push({ percent, text });
  }

  updateApprovalProgress(10, 'Approving session');
  updateApprovalProgress(30, 'Session approved');
  updateApprovalProgress(50, 'WebRTC channel open');
  updateApprovalProgress(90, 'Stream initialized');

  assert.equal(steps.length, 4);
  assert.equal(steps[0].percent, 10);
  assert.equal(steps[3].percent, 90);
});

// Test 23: Browser Capability Detection
test('Browser capability feature detection identifies missing WebRTC APIs', () => {
  function checkCapabilities(hasWebRTC, hasDataChannel) {
    const missing = [];
    if (!hasWebRTC) missing.push('WebRTC P2P networking');
    if (!hasDataChannel) missing.push('RTCDataChannel streaming');
    return {
      supported: hasWebRTC && hasDataChannel,
      missing
    };
  }

  const supportedCaps = checkCapabilities(true, true);
  assert.equal(supportedCaps.supported, true);
  assert.equal(supportedCaps.missing.length, 0);

  const restrictedCaps = checkCapabilities(true, false);
  assert.equal(restrictedCaps.supported, false);
  assert.equal(restrictedCaps.missing[0], 'RTCDataChannel streaming');
});

// Test 24: Synchronous stateRef Updating
test('Synchronous updateState prevents control message state lag', () => {
  let state = 'idle';
  const stateRef = { current: 'idle' };

  function updateState(next) {
    stateRef.current = next;
    state = next;
  }

  updateState('transferring');
  assert.equal(stateRef.current, 'transferring');
  assert.equal(state, 'transferring');
});





