'use strict';

const { contextMiddleware, getStore, getSession } = require('./context');
const { installHttpInterceptor, uninstallHttpInterceptor } = require('./interceptors/http');
const { initStorage, saveSession } = require('./storage');
const { printSessionReport } = require('./reporter');
const { getMode } = require('./mode');

/**
 * Main NodePulse middleware for Express.
 * Combines context tracking, interception, and session saving.
 *
 * @param {object} options
 * @param {string} [options.baseDir] - Project root for .nodepulse/ folder
 * @param {boolean} [options.printReport=true] - Print session report after each request
 * @param {boolean} [options.saveToFile=true] - Save session JSON to disk
 * @param {string} [options.flowIdHeader='x-flow-id'] - Custom header for flow ID
 * @param {function} [options.generateId] - Custom flow ID generator
 * @param {function} [options.shouldIntercept] - Filter which requests to intercept
 */
function nodepulse(options = {}) {
  const {
    baseDir,
    printReport = true,
    saveToFile = true,
    flowIdHeader,
    generateId,
    shouldIntercept,
  } = options;

  // Initialize storage
  initStorage(baseDir);

  // Install HTTP interceptors
  installHttpInterceptor();

  // Create the context middleware
  const ctxMiddleware = contextMiddleware({ flowIdHeader, generateId });

  return (req, res, next) => {
    // Optionally skip interception for certain requests
    if (shouldIntercept && !shouldIntercept(req)) {
      return next();
    }

    ctxMiddleware(req, res, () => {
      // Hook into res.on('finish') to save the session
      res.on('finish', async () => {
        const store = getStore();
        if (!store) return;

        const session = store.session;
        const mode = getMode();

        if (saveToFile) {
          try {
            // In replay mode, save with a _replay suffix
            const sessionToSave = mode === 'REPLAY'
              ? { ...session, metadata: { ...session.metadata, flowId: session.metadata.flowId + '_replay' } }
              : session;
            const filePath = await saveSession(sessionToSave);
            if (printReport) {
              console.log(
                `\n  Session saved: ${filePath}`
              );
            }
          } catch (err) {
            console.error('NodePulse: Failed to save session:', err.message);
          }
        }

        if (printReport && mode === 'RECORD') {
          printSessionReport(session);
        }
      });

      next();
    });
  };
}

/**
 * Cleanup function to uninstall all interceptors.
 */
function cleanup() {
  uninstallHttpInterceptor();
}

module.exports = { nodepulse, cleanup };
