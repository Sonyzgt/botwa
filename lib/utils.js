import chalk from 'chalk';
import readline from 'readline';

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

export const log = {
    state: { hasRendered: false, lineCount: 0 },
    
    emit: (msg, colored) => {
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
        console.log(colored);
    },

    info: (msg) => log.emit(msg, chalk.blue('ℹ ') + msg),
    success: (msg) => log.emit(msg, chalk.green('✔ ') + msg),
    warn: (msg) => log.emit(msg, chalk.yellow('⚠ ') + msg),
    error: (msg) => log.emit(msg, chalk.red('✖ ') + msg),

    renderDeploy: (data) => {
        const { deployed, skipped, progress, status, startTime } = data;
        const spinner = chalk.magenta(spinnerFrames[spinnerIndex]);
        const elapsed = Math.floor((Date.now() - (startTime || Date.now())) / 1000);
        
        const width = 30;
        const completedSize = Math.round((progress / 100) * width);
        const remainingSize = width - completedSize;
        const progressBar = chalk.green('█').repeat(completedSize) + chalk.gray('░').repeat(remainingSize);

        const lines = [
            chalk.cyan.bold('\n🚀 Clank Deployment System (Legacy)'),
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
    },
    wallet: (addr) => chalk.cyan(addr)
};

export const validatePrivateKey = (key) => {
    const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
    return /^[a-fA-F0-9]{64}$/.test(cleanKey);
};
