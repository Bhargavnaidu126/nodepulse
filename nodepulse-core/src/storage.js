'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = '.nodepulse/sessions';
let sessionDir = null;

/**
 * Initializes the storage directory.
 * @param {string} [baseDir] - Project root directory. Defaults to process.cwd().
 */
function initStorage(baseDir) {
  const base = baseDir || process.cwd();
  sessionDir = path.join(base, DEFAULT_DIR);
  fs.mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

/**
 * Returns the current session directory path.
 */
function getSessionDir() {
  if (!sessionDir) {
    initStorage();
  }
  return sessionDir;
}

/**
 * Saves a debug session to disk as a JSON file.
 * Uses async write to avoid blocking the response.
 * @param {object} session - The debug session object from schema.
 * @returns {Promise<string>} - The file path where the session was saved.
 */
async function saveSession(session) {
  const dir = getSessionDir();
  const flowId = session.metadata.flowId;
  const filePath = path.join(dir, `${flowId}.json`);

  const data = JSON.stringify(session, null, 2);
  await fs.promises.writeFile(filePath, data, 'utf8');
  return filePath;
}

/**
 * Loads a debug session from disk by its flow ID.
 * Synchronous for fast access during replay.
 * @param {string} flowId
 * @returns {object|null}
 */
function loadSession(flowId) {
  const dir = getSessionDir();
  const filePath = path.join(dir, `${flowId}.json`);

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Lists all saved session flow IDs.
 * @returns {string[]}
 */
function listSessions() {
  const dir = getSessionDir();
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch {
    return [];
  }
}

/**
 * Deletes a session file by flow ID.
 * @param {string} flowId
 * @returns {boolean}
 */
function deleteSession(flowId) {
  const dir = getSessionDir();
  const filePath = path.join(dir, `${flowId}.json`);
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  initStorage,
  getSessionDir,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
};
