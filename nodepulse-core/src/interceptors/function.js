'use strict';

const { getSession, appendStep } = require('../context');
const { getMode } = require('../mode');
const { loadSession } = require('../storage');

/**
 * Wraps a function so its execution is tracked in the debug session.
 * Works for both sync and async functions.
 *
 * @param {string} name - Human-readable name for the function
 * @param {function} fn - The function to wrap
 * @returns {function} - The wrapped function
 */
function trackFunction(name, fn) {
  return async function (...args) {
    const session = getSession();
    if (!session) {
      return fn.apply(this, args);
    }

    const mode = getMode();
    const stepName = name || fn.name || 'anonymous';

    if (mode === 'REPLAY') {
      const flowId = session.metadata.flowId;
      const savedSession = loadSession(flowId);
      const step = savedSession
        ? savedSession.executionLog.find(
            (s) => s.type === 'function' && s.name === stepName
          )
        : null;

      const startTime = process.hrtime.bigint();

      if (step) {
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1e6;

        appendStep({
          type: 'function',
          name: stepName,
          durationMs: Math.round(durationMs * 100) / 100,
          recordedResponse: step.recordedResponse,
        });

        if (step.error) {
          throw new Error(step.error);
        }

        return step.recordedResponse;
      }

      // No recorded data, run the real function
      return fn.apply(this, args);
    }

    // RECORD mode
    const startTime = process.hrtime.bigint();
    try {
      const result = await fn.apply(this, args);
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      appendStep({
        type: 'function',
        name: stepName,
        durationMs: Math.round(durationMs * 100) / 100,
        recordedResponse: safeClone(result),
      });

      return result;
    } catch (err) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      appendStep({
        type: 'function',
        name: stepName,
        durationMs: Math.round(durationMs * 100) / 100,
        error: err.message,
      });

      throw err;
    }
  };
}

function safeClone(data) {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return String(data);
  }
}

module.exports = { trackFunction };
