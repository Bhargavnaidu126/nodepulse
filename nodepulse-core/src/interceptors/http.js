'use strict';

const http = require('http');
const https = require('https');
const { getSession, appendStep } = require('../context');
const { getMode } = require('../mode');
const { loadSession } = require('../storage');

let originalHttpRequest = null;
let originalHttpsRequest = null;
let originalFetch = null;
let installed = false;

/**
 * Installs HTTP/HTTPS and global fetch interceptors.
 */
function installHttpInterceptor() {
  if (installed) return;
  installed = true;

  originalHttpRequest = http.request;
  originalHttpsRequest = https.request;

  http.request = createRequestInterceptor(originalHttpRequest, 'http');
  https.request = createRequestInterceptor(originalHttpsRequest, 'https');

  if (typeof globalThis.fetch === 'function') {
    originalFetch = globalThis.fetch;
    globalThis.fetch = interceptedFetch;
  }
}

/**
 * Removes all installed interceptors.
 */
function uninstallHttpInterceptor() {
  if (!installed) return;
  installed = false;

  if (originalHttpRequest) http.request = originalHttpRequest;
  if (originalHttpsRequest) https.request = originalHttpsRequest;
  if (originalFetch) globalThis.fetch = originalFetch;

  originalHttpRequest = null;
  originalHttpsRequest = null;
  originalFetch = null;
}

function createRequestInterceptor(originalFn, protocol) {
  return function interceptedRequest(...args) {
    const session = getSession();
    if (!session) {
      return originalFn.apply(this, args);
    }

    const mode = getMode();
    const options = parseRequestArgs(args);
    const stepName = `${options.method || 'GET'} ${protocol}://${options.hostname || options.host || 'localhost'}${options.path || '/'}`;

    if (mode === 'REPLAY') {
      return handleReplayHttp(session, stepName, originalFn, args);
    }

    // RECORD mode
    const startTime = process.hrtime.bigint();
    const req = originalFn.apply(this, args);

    const originalEmit = req.emit.bind(req);
    const chunks = [];

    req.emit = function (event, ...eventArgs) {
      if (event === 'response') {
        const res = eventArgs[0];
        const resChunks = [];
        const origResEmit = res.emit.bind(res);

        res.emit = function (resEvent, ...resEventArgs) {
          if (resEvent === 'data') {
            resChunks.push(resEventArgs[0]);
          }
          if (resEvent === 'end') {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1e6;
            let body;
            try {
              body = JSON.parse(Buffer.concat(resChunks).toString());
            } catch {
              body = Buffer.concat(resChunks).toString();
            }

            appendStep({
              type: 'external_api',
              name: stepName,
              durationMs: Math.round(durationMs * 100) / 100,
              recordedResponse: {
                statusCode: res.statusCode,
                headers: res.headers,
                body,
              },
            });
          }
          return origResEmit(resEvent, ...resEventArgs);
        };
      }
      return originalEmit(event, ...eventArgs);
    };

    return req;
  };
}

function handleReplayHttp(session, stepName, originalFn, args) {
  const { PassThrough } = require('stream');
  const { EventEmitter } = require('events');

  const flowId = session.metadata.flowId;
  const savedSession = loadSession(flowId);
  const step = savedSession
    ? savedSession.executionLog.find(
        (s) => s.type === 'external_api' && s.name === stepName
      )
    : null;

  const startTime = process.hrtime.bigint();
  const fakeReq = new EventEmitter();
  fakeReq.end = function () {};
  fakeReq.write = function () {};
  fakeReq.abort = function () {};
  fakeReq.destroy = function () {};
  fakeReq.on = fakeReq.addListener;

  process.nextTick(() => {
    if (step && step.recordedResponse) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      appendStep({
        type: 'external_api',
        name: stepName,
        durationMs: Math.round(durationMs * 100) / 100,
        recordedResponse: step.recordedResponse,
      });

      const fakeRes = new PassThrough();
      fakeRes.statusCode = step.recordedResponse.statusCode || 200;
      fakeRes.headers = step.recordedResponse.headers || {};
      fakeReq.emit('response', fakeRes);

      const body =
        typeof step.recordedResponse.body === 'string'
          ? step.recordedResponse.body
          : JSON.stringify(step.recordedResponse.body);
      fakeRes.emit('data', Buffer.from(body));
      fakeRes.emit('end');
    } else {
      fakeReq.emit(
        'error',
        new Error(`No recorded response found for: ${stepName}`)
      );
    }
  });

  return fakeReq;
}

async function interceptedFetch(input, init) {
  const session = getSession();
  if (!session) {
    return originalFetch(input, init);
  }

  const mode = getMode();
  const url = typeof input === 'string' ? input : input.url;
  const method = (init && init.method) || 'GET';
  const stepName = `fetch ${method} ${url}`;

  if (mode === 'REPLAY') {
    return handleReplayFetch(session, stepName);
  }

  // RECORD mode
  const startTime = process.hrtime.bigint();
  const response = await originalFetch(input, init);
  const endTime = process.hrtime.bigint();
  const durationMs = Number(endTime - startTime) / 1e6;

  const cloned = response.clone();
  let body;
  try {
    body = await cloned.json();
  } catch {
    body = await cloned.text();
  }

  appendStep({
    type: 'external_api',
    name: stepName,
    durationMs: Math.round(durationMs * 100) / 100,
    recordedResponse: {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    },
  });

  return response;
}

async function handleReplayFetch(session, stepName) {
  const flowId = session.metadata.flowId;
  const savedSession = loadSession(flowId);
  const step = savedSession
    ? savedSession.executionLog.find(
        (s) => s.type === 'external_api' && s.name === stepName
      )
    : null;

  const startTime = process.hrtime.bigint();

  if (step && step.recordedResponse) {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    appendStep({
      type: 'external_api',
      name: stepName,
      durationMs: Math.round(durationMs * 100) / 100,
      recordedResponse: step.recordedResponse,
    });

    const body =
      typeof step.recordedResponse.body === 'string'
        ? step.recordedResponse.body
        : JSON.stringify(step.recordedResponse.body);

    return new Response(body, {
      status: step.recordedResponse.statusCode || 200,
      headers: step.recordedResponse.headers || {},
    });
  }

  throw new Error(`No recorded response found for: ${stepName}`);
}

function parseRequestArgs(args) {
  if (typeof args[0] === 'string') {
    try {
      const url = new URL(args[0]);
      return {
        method: (args[1] && args[1].method) || 'GET',
        hostname: url.hostname,
        path: url.pathname + url.search,
      };
    } catch {
      return { method: 'GET', hostname: 'localhost', path: args[0] };
    }
  }
  if (args[0] instanceof URL) {
    return {
      method: (args[1] && args[1].method) || 'GET',
      hostname: args[0].hostname,
      path: args[0].pathname + args[0].search,
    };
  }
  return args[0] || {};
}

module.exports = { installHttpInterceptor, uninstallHttpInterceptor };
