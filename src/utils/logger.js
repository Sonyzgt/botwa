import chalk from 'chalk';
import EventEmitter from 'events';
import readline from 'readline';

export const logEmitter = new EventEmitter();

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

const isTTY = process.stdout.isTTY;

const emitLog = (level, msg, coloredMsg) => {
    // Clear current professional block before logging
    if (isTTY && log.state && log.state.hasRendered) {
        readline.moveCursor(process.stdout, 0, -log.state.lineCount);
        for (let i = 0; i < log.state.lineCount; i++) {
            readline.clearLine(process.stdout, 0);
            process.stdout.write('\n');
        }
        readline.moveCursor(process.stdout, 0, -log.state.lineCount);
        log.state.hasRendered = false;
    }

    if (isTTY) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
    }
    console.log(coloredMsg);
    logEmitter.emit('log', { level, msg, timestamp: Date.now() });
};

export const log = {
    state: { hasRendered: false, lineCount: 0 },
    info: (msg) => emitLog('info', msg, chalk.cyan(`ℹ ${msg}`)),
    success: (msg) => emitLog('success', msg, chalk.green(`✔ ${msg}`)),
    warn: (msg) => emitLog('warn', msg, chalk.yellow(`⚠ ${msg}`)),
    error: (msg) => emitLog('error', msg, chalk.red(`✖ ${msg}`)),
    step: (msg) => emitLog('step', msg, chalk.magenta.bold(`\n➤ ${msg}`)),
    
    // New Professional Render Method
    renderDeploy: (data) => {
        const { deployed, skipped, progress, status, startTime } = data;
        const spinner = chalk.magenta(spinnerFrames[spinnerIndex]);
        const timeNow = Date.now();
        const elapsed = Math.floor((timeNow - (startTime || timeNow)) / 1000);
        
        // Emit to dashboard
        logEmitter.emit('progress', { ...data, elapsed });

        // On non-TTY (Railway), we only log the status occasionally to avoid infinite list
        if (!isTTY) {
             // Optional: log status to Railway console every 10s or on big changes
             // For now, we skip renderDeploy in non-TTY because dashboard handles it.
             return;
        }
        
        // Progress Bar Calculation
        const width = 30;
        const completedSize = Math.round((progress / 100) * width);
        const remainingSize = width - completedSize;
        const progressBar = chalk.green('█').repeat(completedSize) + chalk.gray('░').repeat(remainingSize);

        const lines = [
            chalk.cyan.bold('\n🚀 Clank Deployment System'),
            chalk.gray('──────────────────────────────────────────────────'),
            `⏳ ${chalk.white('Active Process')} ${chalk.gray(`(Elapsed: ${elapsed}s)`)}`,
            chalk.gray('──────────────────────────────────────────────────'),
            '',
            `${chalk.blue('Deploy total :')} ${chalk.yellow.bold(deployed)} ${chalk.green('🔄')}`,
            `${chalk.blue('Skip total   :')} ${chalk.red.bold(skipped)} ${chalk.yellow('⏭️')}`,
            '',
            `[${progressBar}] ${chalk.bold(progress)}%`,
            '',
            `${chalk.cyan('Status :')} ${status} ${spinner}`,
            chalk.gray('──────────────────────────────────────────────────')
        ];

        if (log.state.hasRendered) {
            readline.moveCursor(process.stdout, 0, -log.state.lineCount);
        }

        lines.forEach(line => {
            readline.clearLine(process.stdout, 0);
            process.stdout.write(line + '\n');
        });

        log.state.hasRendered = true;
        log.state.lineCount = lines.length;
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
    },

    clear: () => {
        if (!isTTY) return;
        if (log.state.hasRendered) {
            readline.moveCursor(process.stdout, 0, -log.state.lineCount);
            for (let i = 0; i < log.state.lineCount; i++) {
                readline.clearLine(process.stdout, 0);
                process.stdout.write('\n');
            }
            readline.moveCursor(process.stdout, 0, -log.state.lineCount);
            log.state.hasRendered = false;
        }
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
    }
};
