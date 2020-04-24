import {EventEmitter} from 'events';
import ansiEscapes from 'ansi-escapes';
import chalk from 'chalk';
import {DevScript} from '../config';

function getStateString(workerState: any, isWatch: boolean) {
  if (workerState.state) {
    if (Array.isArray(workerState.state)) {
      return chalk[workerState.state[1]](workerState.state[0]);
    }
    return chalk.dim(workerState.state);
  }
  if (workerState.done) {
    return workerState.error ? chalk.red('FAILED') : chalk.green('DONE');
  }
  if (workerState.config.watch && isWatch) {
    return chalk.dim('WATCHING');
  }
  return chalk.dim('RUNNING');
}

const WORKER_BASE_STATE = {done: false, error: null, output: ''};

export function paint(
  bus: EventEmitter,
  registeredWorkers: [string, DevScript][],
  isWatch: boolean,
) {
  let consoleOutput = '';
  let hasBeenCleared = false;
  let missingWebModule: null | string = null;
  const allWorkerStates: any = {};

  for (const [workerId, config] of registeredWorkers) {
    allWorkerStates[workerId] = {...WORKER_BASE_STATE, config};
  }

  function repaint() {
    process.stdout.write(ansiEscapes.clearTerminal);
    process.stdout.write(`${chalk.bold('☶ Snowpack')}\n\n`);
    // Dashboard
    for (const [workerId, config] of registeredWorkers) {
      const workerState = allWorkerStates[workerId];
      const dotLength = 24 - workerId.length;
      const dots = ''.padEnd(dotLength, '.');
      const stateStr = getStateString(workerState, isWatch);
      process.stdout.write(`  ${workerId}${chalk.dim(dots)}[${stateStr}]\n`);
    }
    process.stdout.write('\n');
    for (const [workerId, config] of registeredWorkers) {
      const workerState = allWorkerStates[workerId];
      if (workerState && workerState.output) {
        const chalkFn = Array.isArray(workerState.error) ? chalk.red : chalk;
        process.stdout.write(`${chalkFn.underline.bold('▼ ' + workerId)}\n\n`);
        process.stdout.write(
          workerState.output
            ? '  ' + workerState.output.trim().replace(/\n/gm, '\n  ')
            : hasBeenCleared
            ? chalk.dim('  Output cleared.')
            : chalk.dim('  No output, yet.'),
        );
        process.stdout.write('\n\n');
      }
    }
    if (consoleOutput) {
      process.stdout.write(`${chalk.underline.bold('▼ Console')}\n\n`);
      process.stdout.write(
        consoleOutput
          ? '  ' + consoleOutput.trim().replace(/\n/gm, '\n  ')
          : hasBeenCleared
          ? chalk.dim('  Output cleared.')
          : chalk.dim('  No output, yet.'),
      );
      process.stdout.write('\n\n');
    }
    if (missingWebModule) {
      process.stdout.write(`${chalk.red.underline.bold('▼ Snowpack')}\n\n`);
      process.stdout.write(
        `  ${chalk.bold(missingWebModule)} could not be found in your web_modules directory!\n\n`,
      );
      process.stdout.write(`  If this is a package:\n`);
      process.stdout.write(`    - Add it to your set of "webDependencies".\n`);
      process.stdout.write(`  If this is a file within a package:\n`);
      process.stdout.write(
        `    - Install the package with npm, and then add "${missingWebModule}" to your Snowpack "entrypoints".\n`,
      );
      process.stdout.write(`  If no packages are loading correctly:\n`);
      process.stdout.write(`    - Your web_modules directory may not be mounted correctly.\n`);
      process.stdout.write('\n\n');
    }
    const overallStatus: any = Object.values(allWorkerStates).reduce(
      (result: any, {done, error}: any) => {
        return {
          done: result.done && done,
          error: result.error || error,
        };
      },
    );
    if (overallStatus.error) {
      process.stdout.write(`${chalk.underline.red.bold('▼ Result')}\n\n`);
      process.stdout.write('  ⚠️  Finished, with errors.');
      process.stdout.write('\n\n');
      process.exit(1);
    } else if (overallStatus.done) {
      process.stdout.write(`${chalk.underline.green.bold('▶ Build Complete!')}\n\n`);
    }
  }

  bus.on('WORKER_MSG', ({id, msg}) => {
    allWorkerStates[id].output += msg;
    repaint();
  });
  bus.on('WORKER_UPDATE', ({id, state}) => {
    allWorkerStates[id].state = state || allWorkerStates[id].state;
    repaint();
  });
  bus.on('WORKER_COMPLETE', ({id, error}) => {
    allWorkerStates[id].done = true;
    allWorkerStates[id].error = allWorkerStates[id].error || error;
    repaint();
  });
  bus.on('WORKER_RESET', ({id}) => {
    allWorkerStates[id] = {...WORKER_BASE_STATE, config: allWorkerStates[id].config};
    repaint();
  });
  bus.on('CONSOLE', ({level, args}) => {
    consoleOutput += `[${level}] ${args.join(' ')}\n`;
    repaint();
  });
  bus.on('NEW_SESSION', () => {
    if (consoleOutput) {
      consoleOutput = ``;
      hasBeenCleared = true;
      missingWebModule = null;
      repaint();
    }
  });
  bus.on('MISSING_WEB_MODULE', ({specifier}) => {
    missingWebModule = specifier;
    repaint();
  });

  // const rl = readline.createInterface({
  //   input: process.stdin,
  //   output: process.stdout,
  // });
  // rl.on('line', (input) => {
  //   for (const [workerId, config] of registeredWorkers) {
  //     if (!allWorkerStates[workerId].done && !allWorkerStates[workerId].state) {
  //       allWorkerStates[workerId].output = '';
  //     }
  //   }
  //   hasBeenCleared = true;
  //   repaint();
  // });

  // unmountDashboard = render(<App bus={bus} registeredWorkers={registeredWorkers} />).unmount;
  repaint();
}