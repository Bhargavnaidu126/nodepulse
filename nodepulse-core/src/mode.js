'use strict';

/**
 * Determines the current operating mode of NodePulse.
 * Modes: 'RECORD' (default) or 'REPLAY'
 */
function getMode() {
  return process.env.NODEPULSE_MODE === 'REPLAY' ? 'REPLAY' : 'RECORD';
}

function isReplayMode() {
  return getMode() === 'REPLAY';
}

function isRecordMode() {
  return getMode() === 'RECORD';
}

module.exports = { getMode, isReplayMode, isRecordMode };
