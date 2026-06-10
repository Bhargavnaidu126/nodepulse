'use strict';

const { getSession, appendStep } = require('../context');
const { getMode } = require('../mode');
const { loadSession } = require('../storage');

let mongoosePatched = false;
let pgPatched = false;
const originalMethods = new Map();

/**
 * Patches Mongoose to intercept all query executions.
 * Call this after requiring mongoose but before executing queries.
 */
function interceptMongoose(mongoose) {
  if (mongoosePatched) return;
  mongoosePatched = true;

  const Query = mongoose.Query;
  const originalExec = Query.prototype.exec;
  originalMethods.set('mongoose.exec', originalExec);

  Query.prototype.exec = async function (...args) {
    const session = getSession();
    if (!session) {
      return originalExec.apply(this, args);
    }

    const mode = getMode();
    const op = this.op || 'query';
    const modelName =
      (this.model && this.model.modelName) || 'UnknownModel';
    const stepName = `mongoose.${modelName}.${op}`;
    const filter = this.getFilter ? this.getFilter() : {};

    if (mode === 'REPLAY') {
      return handleReplayDb(session, stepName);
    }

    // RECORD mode
    const startTime = process.hrtime.bigint();
    try {
      const result = await originalExec.apply(this, args);
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      appendStep({
        type: 'database',
        name: stepName,
        durationMs: Math.round(durationMs * 100) / 100,
        recordedResponse: {
          operation: op,
          model: modelName,
          filter,
          result: safeSerialize(result),
        },
      });

      return result;
    } catch (err) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      appendStep({
        type: 'database',
        name: stepName,
        durationMs: Math.round(durationMs * 100) / 100,
        error: err.message,
      });

      throw err;
    }
  };
}

/**
 * Patches the `pg` (node-postgres) Client to intercept queries.
 */
function interceptPg(pgClient) {
  if (pgPatched) return;
  pgPatched = true;

  const originalQuery = pgClient.prototype.query;
  originalMethods.set('pg.query', originalQuery);

  pgClient.prototype.query = async function (...args) {
    const session = getSession();
    if (!session) {
      return originalQuery.apply(this, args);
    }

    const mode = getMode();
    const queryText =
      typeof args[0] === 'string' ? args[0] : args[0]?.text || 'unknown';
    const stepName = `pg.query: ${queryText.slice(0, 80)}`;

    if (mode === 'REPLAY') {
      return handleReplayDb(session, stepName);
    }

    // RECORD mode
    const startTime = process.hrtime.bigint();
    try {
      const result = await originalQuery.apply(this, args);
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      appendStep({
        type: 'database',
        name: stepName,
        durationMs: Math.round(durationMs * 100) / 100,
        recordedResponse: {
          rowCount: result.rowCount,
          rows: safeSerialize(result.rows),
        },
      });

      return result;
    } catch (err) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      appendStep({
        type: 'database',
        name: stepName,
        durationMs: Math.round(durationMs * 100) / 100,
        error: err.message,
      });

      throw err;
    }
  };
}

/**
 * Restores original methods for both mongoose and pg.
 */
function uninstallDbInterceptors(mongoose, pgClient) {
  if (mongoose && originalMethods.has('mongoose.exec')) {
    mongoose.Query.prototype.exec = originalMethods.get('mongoose.exec');
    mongoosePatched = false;
  }
  if (pgClient && originalMethods.has('pg.query')) {
    pgClient.prototype.query = originalMethods.get('pg.query');
    pgPatched = false;
  }
  originalMethods.clear();
}

function handleReplayDb(session, stepName) {
  const flowId = session.metadata.flowId;
  const savedSession = loadSession(flowId);
  const step = savedSession
    ? savedSession.executionLog.find(
        (s) => s.type === 'database' && s.name === stepName
      )
    : null;

  const startTime = process.hrtime.bigint();

  if (step) {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    appendStep({
      type: 'database',
      name: stepName,
      durationMs: Math.round(durationMs * 100) / 100,
      recordedResponse: step.recordedResponse,
    });

    if (step.error) {
      throw new Error(step.error);
    }

    return step.recordedResponse?.result ?? step.recordedResponse;
  }

  throw new Error(`No recorded DB response found for: ${stepName}`);
}

function safeSerialize(data) {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return String(data);
  }
}

module.exports = {
  interceptMongoose,
  interceptPg,
  uninstallDbInterceptors,
};
