#!/usr/bin/env node
'use strict';

const path = require('path');
const http = require('http');
const chalk = require('chalk');

// Save original fetch/http before any interceptors are installed
const nativeFetch = globalThis.fetch;
const nativeHttpRequest = http.request;
const {
  loadSession,
  listSessions,
  initStorage,
  saveSession,
} = require('../src/storage');
const { printSessionReport, printDiffReport } = require('../src/reporter');

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log('');
  console.log(chalk.bold.cyan('  NodePulse CLI'));
  console.log('');
  console.log(chalk.bold('  Usage:'));
  console.log('    nodepulse replay <FLOW_ID>    Replay a recorded session');
  console.log('    nodepulse list                List all recorded sessions');
  console.log('    nodepulse view <FLOW_ID>      View a recorded session');
  console.log('    nodepulse delete <FLOW_ID>    Delete a recorded session');
  console.log('');
  console.log(chalk.bold('  Options:'));
  console.log('    --port <port>       Port for replay server (default: 3000)');
  console.log('    --app <path>        Path to Express app entry file');
  console.log('    --dir <path>        Project directory (default: cwd)');
  console.log('');
}

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

async function main() {
  const baseDir = getArg('--dir') || process.cwd();
  initStorage(baseDir);

  switch (command) {
    case 'replay':
      await handleReplay(baseDir);
      break;
    case 'list':
      handleList();
      break;
    case 'view':
      handleView();
      break;
    case 'delete':
      handleDelete();
      break;
    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;
    default:
      console.log(chalk.red(`  Unknown command: ${command || '(none)'}`));
      printUsage();
      process.exit(1);
  }
}

async function handleReplay(baseDir) {
  const flowId = args[1];
  if (!flowId) {
    console.log(chalk.red('  Error: Please provide a FLOW_ID'));
    console.log('  Usage: nodepulse replay <FLOW_ID>');
    process.exit(1);
  }

  const originalSession = loadSession(flowId);
  if (!originalSession) {
    console.log(chalk.red(`  Error: Session "${flowId}" not found`));
    console.log('  Available sessions:');
    listSessions().forEach((id) => console.log(`    - ${id}`));
    process.exit(1);
  }

  console.log('');
  console.log(chalk.bold.cyan('  ▶ Starting Replay...'));
  console.log(chalk.dim(`    Flow ID: ${flowId}`));
  console.log(
    chalk.dim(`    Route:   ${originalSession.metadata.route}`)
  );
  console.log('');

  // Set replay mode
  process.env.NODEPULSE_MODE = 'REPLAY';
  process.env.NODEPULSE_REPLAY_FLOW_ID = flowId;

  const port = parseInt(getArg('--port') || '0', 10) || 0;
  const appPath = getArg('--app');

  if (!appPath) {
    console.log(
      chalk.red(
        '  Error: Please specify the app entry file with --app <path>'
      )
    );
    console.log('  Example: nodepulse replay PAY_789 --app ./server.js');
    process.exit(1);
  }

  const resolvedAppPath = path.resolve(baseDir, appPath);

  let app;
  try {
    app = require(resolvedAppPath);
  } catch (err) {
    console.log(chalk.red(`  Error: Failed to load app from ${resolvedAppPath}`));
    console.log(chalk.red(`  ${err.message}`));
    process.exit(1);
  }

  // Start the server
  const server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(port, () => {
      const actualPort = server.address().port;
      console.log(
        chalk.dim(`    Server started on port ${actualPort}`)
      );
      resolve(actualPort);
    });
  });

  const actualPort = server.address().port;

  // Construct the request from saved session
  const { initialRequest } = originalSession;
  const requestUrl = `http://localhost:${actualPort}${initialRequest.url}`;

  console.log(
    chalk.dim(
      `    Replaying: ${initialRequest.method} ${initialRequest.url}`
    )
  );
  console.log('');

  try {
    // Build clean headers — exclude hop-by-hop and size headers that
    // would conflict with the replayed body
    const skipHeaders = new Set([
      'host', 'content-length', 'transfer-encoding', 'connection',
      'keep-alive', 'upgrade',
    ]);
    const cleanHeaders = {};
    for (const [k, v] of Object.entries(initialRequest.headers || {})) {
      if (!skipHeaders.has(k.toLowerCase())) {
        cleanHeaders[k] = v;
      }
    }
    cleanHeaders['x-flow-id'] = flowId;

    const fetchOptions = {
      method: initialRequest.method,
      headers: cleanHeaders,
    };

    if (
      initialRequest.body &&
      ['POST', 'PUT', 'PATCH'].includes(initialRequest.method)
    ) {
      fetchOptions.body = JSON.stringify(initialRequest.body);
      fetchOptions.headers['content-type'] = 'application/json';
    }

    const response = await nativeFetch(requestUrl, fetchOptions);
    const responseBody = await response.text();

    console.log(
      chalk.bold(`  Response Status: `) +
        (response.status >= 200 && response.status < 300
          ? chalk.green(response.status)
          : chalk.red(response.status))
    );

    try {
      const parsed = JSON.parse(responseBody);
      console.log(
        chalk.bold('  Response Body: ') +
          chalk.dim(JSON.stringify(parsed, null, 2))
      );
    } catch {
      console.log(
        chalk.bold('  Response Body: ') + chalk.dim(responseBody)
      );
    }

    console.log('');

    // Wait a moment for async operations to complete
    await new Promise((r) => setTimeout(r, 200));

    // Load the replay session that was just created
    const replaySession = loadSession(flowId + '_replay');
    if (replaySession) {
      printDiffReport(originalSession, replaySession);
    } else {
      // If no separate replay session, print the original for reference
      console.log(
        chalk.dim(
          '  (Replay session data was merged into the original context)'
        )
      );
      printSessionReport(originalSession);
    }
  } catch (err) {
    console.log(chalk.red(`  Replay request failed: ${err.message}`));
  } finally {
    server.close();
    process.env.NODEPULSE_MODE = '';
    process.env.NODEPULSE_REPLAY_FLOW_ID = '';
  }
}

function handleList() {
  const sessions = listSessions();
  if (sessions.length === 0) {
    console.log(chalk.dim('  No sessions found.'));
    return;
  }

  console.log('');
  console.log(chalk.bold.cyan('  Recorded Sessions'));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  sessions.forEach((id) => {
    const session = loadSession(id);
    if (session) {
      const steps = session.executionLog.length;
      const route = session.metadata.route;
      const status = session.metadata.statusCode;
      console.log(
        `  ${chalk.bold(id)} ${chalk.dim(route)} ${chalk.dim(`[${status}]`)} ${chalk.dim(`${steps} steps`)}`
      );
    } else {
      console.log(`  ${chalk.bold(id)}`);
    }
  });

  console.log('');
}

function handleView() {
  const flowId = args[1];
  if (!flowId) {
    console.log(chalk.red('  Error: Please provide a FLOW_ID'));
    process.exit(1);
  }

  const session = loadSession(flowId);
  if (!session) {
    console.log(chalk.red(`  Error: Session "${flowId}" not found`));
    process.exit(1);
  }

  printSessionReport(session);
}

function handleDelete() {
  const flowId = args[1];
  if (!flowId) {
    console.log(chalk.red('  Error: Please provide a FLOW_ID'));
    process.exit(1);
  }

  const { deleteSession } = require('../src/storage');
  if (deleteSession(flowId)) {
    console.log(chalk.green(`  Deleted session: ${flowId}`));
  } else {
    console.log(chalk.red(`  Error: Could not delete session "${flowId}"`));
  }
}

main().catch((err) => {
  console.error(chalk.red(`  Fatal error: ${err.message}`));
  process.exit(1);
});
