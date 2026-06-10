'use strict';

const crypto = require('crypto');

/**
 * Creates a new debug session object for a given request.
 */
function createSession({ flowId, method, url, headers, body, query }) {
  return {
    metadata: {
      flowId: flowId || generateFlowId(),
      timestamp: new Date().toISOString(),
      route: `${method} ${url}`,
      statusCode: null,
    },
    initialRequest: {
      method,
      url,
      headers: sanitizeHeaders(headers),
      body: body || null,
      query: query || {},
    },
    executionLog: [],
  };
}

/**
 * Creates a single execution step entry.
 */
function createStep({ type, name, durationMs, recordedResponse, error }) {
  return {
    type,
    name,
    durationMs: durationMs || 0,
    recordedResponse: recordedResponse !== undefined ? recordedResponse : null,
    error: error || null,
    timestamp: new Date().toISOString(),
  };
}

function generateFlowId() {
  const prefix = 'FLOW';
  const id = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}_${id}`;
}

function sanitizeHeaders(headers) {
  if (!headers) return {};
  const sanitized = { ...headers };
  const sensitiveKeys = ['authorization', 'cookie', 'x-api-key'];
  for (const key of sensitiveKeys) {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

module.exports = { createSession, createStep, generateFlowId, sanitizeHeaders };
