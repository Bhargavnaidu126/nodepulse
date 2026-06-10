'use strict';

const { nodepulse, cleanup } = require('./middleware');
const { contextMiddleware, getStore, getSession, appendStep, getStorage } = require('./context');
const { createSession, createStep, generateFlowId } = require('./schema');
const { installHttpInterceptor, uninstallHttpInterceptor } = require('./interceptors/http');
const { interceptMongoose, interceptPg, uninstallDbInterceptors } = require('./interceptors/database');
const { trackFunction } = require('./interceptors/function');
const { initStorage, saveSession, loadSession, listSessions, deleteSession } = require('./storage');
const { getMode, isReplayMode, isRecordMode } = require('./mode');
const { printSessionReport, printDiffReport } = require('./reporter');

module.exports = {
  // Main middleware
  nodepulse,
  cleanup,

  // Context
  contextMiddleware,
  getStore,
  getSession,
  appendStep,
  getStorage,

  // Schema
  createSession,
  createStep,
  generateFlowId,

  // Interceptors
  installHttpInterceptor,
  uninstallHttpInterceptor,
  interceptMongoose,
  interceptPg,
  uninstallDbInterceptors,
  trackFunction,

  // Storage
  initStorage,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,

  // Mode
  getMode,
  isReplayMode,
  isRecordMode,

  // Reporter
  printSessionReport,
  printDiffReport,
};
