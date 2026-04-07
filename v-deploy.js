import chalk from 'chalk';
import readline from 'readline';

/**
 * CONFIGURATION & STATE
 */
const state = {
    deployed: 0,
    skipped: 0,
    progress: 0,
    status: 'Initializing...',
    startTime: Date.now(),
    spinnerIndex: 0,
    isComplete: false
};

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const statuses = [
    'Initializing modules...',
    'Connecting to mainnet...',
    'Generating token metadata...',
    'Uploading images to IPFS...',
    'Approving gas funds...',
    'Broadcasting transaction...',
    'Verifying contract signature...',
    'Finalizing deployment...'
];

/**
 * UTILS
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatTime = (ms) => {
    const sec = Math.floor(ms / 1000);
    return `${sec}s`;
};

const generateProgressBar = (percent, width = 30) => {
    const completedSize = Math.round((percent / 100) * width);
    const remainingSize = width - completedSize;
    const completed = chalk.green('█').repeat(completedSize);
    const remaining = chalk.gray('░').repeat(remainingSize);
    return `[${completed}${remaining}] ${chalk.bold(percent)}%`;
};

/**
 * RENDER ENGINE
 * Uses readline to update a fixed block of lines
 */
const render = () => {
    // We will render 10 lines of output. 
    // To update, we move the cursor back up 10 lines.
    const outputLines = [];
    const spinner = chalk.magenta(spinnerFrames[state.spinnerIndex]);
    const elapsed = formatTime(Date.now() - state.startTime);

    outputLines.push(chalk.cyan.bold('\n🚀 Starting professional deployment sequence...'));
    outputLines.push(chalk.gray('──────────────────────────────────────────────────'));
    outputLines.push(`⏳ ${chalk.white('Processing...')} ${chalk.gray(`(Elapsed: ${elapsed})`)}`);
    outputLines.push(chalk.gray('──────────────────────────────────────────────────'));
    outputLines.push('');
    outputLines.push(`${chalk.blue('Deploy total :')} ${chalk.yellow.bold(state.deployed)} ${chalk.green('🔄')}`);
    outputLines.push(`${chalk.blue('Skip total   :')} ${chalk.red.bold(state.skipped)} ${chalk.yellow('⏭️')}`);
    outputLines.push('');
    outputLines.push(generateProgressBar(state.progress));
    outputLines.push('');
    outputLines.push(`${chalk.cyan('Status :')} ${state.status} ${spinner}`);
    outputLines.push(chalk.gray('──────────────────────────────────────────────────'));

    // Move cursor to start of current block (assuming we've printed this before)
    if (state.hasRendered) {
        readline.moveCursor(process.stdout, 0, -outputLines.length);
    }

    // Print all lines
    outputLines.forEach(line => {
        readline.clearLine(process.stdout, 0);
        process.stdout.write(line + '\n');
    });

    state.hasRendered = true;
};

/**
 * ANIMATION & SIMULATION
 */
const startAnimations = () => {
    setInterval(() => {
        if (state.isComplete) return;
        state.spinnerIndex = (state.spinnerIndex + 1) % spinnerFrames.length;
        render();
    }, 80);
};

const runSimulation = async () => {
    console.clear();
    startAnimations();

    // Simulation steps
    while (state.progress < 100) {
        // Random incremental progress
        state.progress += Math.floor(Math.random() * 5) + 1;
        if (state.progress > 100) state.progress = 100;

        // Change status periodically
        if (state.progress % 12 === 0) {
            state.status = statuses[Math.floor(Math.random() * statuses.length)];
        }

        // Randomly simulate a "Deploy" or "Skip"
        if (Math.random() > 0.8) {
            if (Math.random() > 0.3) {
                state.deployed++;
                state.status = chalk.green('✔ Deploy Successful!');
            } else {
                state.skipped++;
                state.status = chalk.yellow('⚠ Skipping (Rate limited)');
            }
        }

        await sleep(Math.floor(Math.random() * 300) + 200);
        render();
    }

    state.isComplete = true;
    state.status = chalk.green.bold('CLEAN DEPLOYMENT FINISHED! ✅');
    render();
    process.stdout.write('\n' + chalk.magenta.bold('Process exit. Happy Coding!\n\n'));
    process.exit(0);
};

// Catch Ctrl+C to clean exit
process.on('SIGINT', () => {
    process.stdout.write('\n\n' + chalk.red('Deployment aborted by user.') + '\n');
    process.exit(0);
});

runSimulation();
