'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const { createSession, createStep } = require('./schema');

const storage = new AsyncLocalStorage();

/**
 * Express middleware that initializes a debug session context for each request.
 * Must be applied before any route handlers.
 */
function contextMiddleware(options = {}) {
  const { flowIdHeader = 'x-flow-id', generateId } = options;

  return (req, res, next) => {
    const flowId =
      req.headers[flowIdHeader] ||
      (generateId ? generateId(req) : undefined);

    const session = createSession({
      flowId,
      method: req.method,
      url: req.originalUrl || req.url,
      headers: req.headers,
      body: req.body,
      query: req.query,
    });

    const store = {
      session,
      startTime: process.hrtime.bigint(),
    };

    storage.run(store, () => {
      res.on('finish', () => {
        const st = storage.getStore();
        if (st) {
          st.session.metadata.statusCode = res.statusCode;
        }
      });
      next();
    });
  };
}

/**
 * Returns the current store (session + metadata) from AsyncLocalStorage.
 */
function getStore() {
  return storage.getStore() || null;
}

/**
 * Returns the current session from AsyncLocalStorage.
 */
function getSession() {
  const store = getStore();
  return store ? store.session : null;
}

/**
 * Appends a step to the current session's execution log.
 */
function appendStep(stepData) {
  const session = getSession();
  if (!session) return null;
  const step = createStep(stepData);
  session.executionLog.push(step);
  return step;
}

/**
 * Gets the raw AsyncLocalStorage instance (for advanced usage / CLI replay).
 */
function getStorage() {
  return storage;
}

module.exports = {
  contextMiddleware,
  getStore,
  getSession,
  appendStep,
  getStorage,
};
