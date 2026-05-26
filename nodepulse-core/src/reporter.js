'use strict';

const chalk = require('chalk');

const ICONS = {
  pass: chalk.green('✓'),
  warn: chalk.yellow('⚠'),
  fail: chalk.red('✗'),
  arrow: chalk.dim('→'),
  bullet: chalk.dim('•'),
};

/**
 * Prints a full debug session report to the console.
 */
function printSessionReport(session) {
  const { metadata, initialRequest, executionLog } = session;

  console.log('');
  console.log(chalk.bold.cyan('━'.repeat(60)));
  console.log(chalk.bold.cyan('  NODEPULSE DEBUG SESSION'));
  console.log(chalk.bold.cyan('━'.repeat(60)));
  console.log('');

  // Metadata
  console.log(chalk.bold('  Flow ID:    ') + chalk.white(metadata.flowId));
  console.log(chalk.bold('  Route:      ') + chalk.white(metadata.route));
  console.log(
    chalk.bold('  Status:     ') + formatStatusCode(metadata.statusCode)
  );
  console.log(chalk.bold('  Timestamp:  ') + chalk.dim(metadata.timestamp));
  console.log('');

  // Initial Request
  console.log(chalk.bold.underline('  Initial Request'));
  console.log(
    `    ${ICONS.bullet} Method: ${chalk.yellow(initialRequest.method)}`
  );
  console.log(`    ${ICONS.bullet} URL: ${chalk.dim(initialRequest.url)}`);
  if (
    initialRequest.body &&
    Object.keys(initialRequest.body).length > 0
  ) {
    console.log(
      `    ${ICONS.bullet} Body: ${chalk.dim(JSON.stringify(initialRequest.body, null, 2).split('\n').join('\n    '))}`
    );
  }
  console.log('');

  // Execution Log
  console.log(chalk.bold.underline('  Execution Log'));
  console.log('');

  const totalDuration = executionLog.reduce(
    (sum, s) => sum + (s.durationMs || 0),
    0
  );
  const bottleneckThreshold = totalDuration * 0.4;

  executionLog.forEach((step, i) => {
    const isBottleneck = step.durationMs >= bottleneckThreshold;
    const hasError = !!step.error;
    const icon = hasError ? ICONS.fail : isBottleneck ? ICONS.warn : ICONS.pass;
    const stepNum = chalk.dim(`[${i + 1}]`);
    const typeLabel = formatType(step.type);
    const duration = formatDuration(step.durationMs, isBottleneck);

    console.log(`    ${icon} ${stepNum} ${typeLabel} ${chalk.bold(step.name)}`);
    console.log(`       ${ICONS.arrow} Duration: ${duration}`);

    if (hasError) {
      console.log(`       ${ICONS.arrow} Error: ${chalk.red(step.error)}`);
    }

    if (isBottleneck && !hasError) {
      console.log(
        `       ${ICONS.arrow} ${chalk.yellow.bold('BOTTLENECK')} — This step took ${Math.round((step.durationMs / totalDuration) * 100)}% of total time`
      );
    }

    console.log('');
  });

  // Summary
  console.log(chalk.bold.cyan('━'.repeat(60)));
  console.log(
    chalk.bold(
      `  Total Steps: ${executionLog.length}  |  Total Duration: ${formatDuration(totalDuration, false)}`
    )
  );

  const bottlenecks = executionLog.filter(
    (s) => s.durationMs >= bottleneckThreshold
  );
  if (bottlenecks.length > 0) {
    console.log(
      chalk.yellow.bold(
        `  ⚠ ${bottlenecks.length} bottleneck(s) detected`
      )
    );
  }

  const errors = executionLog.filter((s) => s.error);
  if (errors.length > 0) {
    console.log(chalk.red.bold(`  ✗ ${errors.length} error(s) found`));
  }

  console.log(chalk.bold.cyan('━'.repeat(60)));
  console.log('');
}

/**
 * Prints a diff report comparing a recorded session against a replayed session.
 */
function printDiffReport(originalSession, replaySession) {
  console.log('');
  console.log(chalk.bold.magenta('━'.repeat(60)));
  console.log(chalk.bold.magenta('  NODEPULSE REPLAY DIFF'));
  console.log(chalk.bold.magenta('━'.repeat(60)));
  console.log('');

  console.log(
    chalk.bold('  Flow ID: ') +
      chalk.white(originalSession.metadata.flowId)
  );
  console.log(
    chalk.bold('  Route:   ') +
      chalk.white(originalSession.metadata.route)
  );
  console.log('');

  console.log(
    chalk.bold(
      `  ${'Step'.padEnd(40)} ${'Original'.padEnd(12)} ${'Replay'.padEnd(12)} ${'Diff'.padEnd(12)}`
    )
  );
  console.log(chalk.dim('  ' + '─'.repeat(76)));

  const maxLen = Math.max(
    originalSession.executionLog.length,
    replaySession.executionLog.length
  );

  let totalOriginal = 0;
  let totalReplay = 0;

  for (let i = 0; i < maxLen; i++) {
    const orig = originalSession.executionLog[i];
    const replay = replaySession.executionLog[i];

    const name = (orig?.name || replay?.name || 'unknown').slice(0, 38);
    const origMs = orig?.durationMs || 0;
    const replayMs = replay?.durationMs || 0;
    const diffMs = replayMs - origMs;

    totalOriginal += origMs;
    totalReplay += replayMs;

    const diffStr =
      diffMs > 0
        ? chalk.red(`+${diffMs.toFixed(1)}ms`)
        : diffMs < 0
          ? chalk.green(`${diffMs.toFixed(1)}ms`)
          : chalk.dim('0ms');

    const origStr = `${origMs.toFixed(1)}ms`;
    const replayStr = `${replayMs.toFixed(1)}ms`;
    const isBottleneck =
      origMs > 0 && Math.abs(diffMs) / origMs > 0.5;
    const icon = isBottleneck
      ? diffMs > 0
        ? ICONS.warn
        : ICONS.pass
      : ICONS.bullet;

    console.log(
      `  ${icon} ${name.padEnd(38)} ${origStr.padEnd(12)} ${replayStr.padEnd(12)} ${diffStr}`
    );
  }

  console.log(chalk.dim('  ' + '─'.repeat(76)));

  const totalDiff = totalReplay - totalOriginal;
  const totalDiffStr =
    totalDiff > 0
      ? chalk.red(`+${totalDiff.toFixed(1)}ms`)
      : totalDiff < 0
        ? chalk.green(`${totalDiff.toFixed(1)}ms`)
        : chalk.dim('0ms');

  console.log(
    chalk.bold(
      `  ${'TOTAL'.padEnd(40)} ${totalOriginal.toFixed(1).toString().padEnd(10)}ms ${totalReplay.toFixed(1).toString().padEnd(10)}ms ${totalDiffStr}`
    )
  );

  console.log('');
  console.log(chalk.bold.magenta('━'.repeat(60)));
  console.log('');
}

function formatStatusCode(code) {
  if (!code) return chalk.dim('N/A');
  if (code >= 200 && code < 300) return chalk.green(code);
  if (code >= 300 && code < 400) return chalk.yellow(code);
  return chalk.red(code);
}

function formatType(type) {
  const colors = {
    database: chalk.blue,
    external_api: chalk.magenta,
    function: chalk.cyan,
  };
  const colorFn = colors[type] || chalk.white;
  return colorFn(`[${type}]`);
}

function formatDuration(ms, isBottleneck) {
  const str = `${ms.toFixed(1)}ms`;
  if (isBottleneck) return chalk.red.bold(str);
  if (ms > 100) return chalk.yellow(str);
  return chalk.green(str);
}

module.exports = { printSessionReport, printDiffReport };
