import inquirer from 'inquirer';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { NekosAPI } from 'nekosapi';

const nekos = new NekosAPI();

// Import existing modules
import { generateWallets } from './lib/generator.js';
import { distributeFunds } from './lib/distributor.js';
import { registerAgentsBulk } from './lib/registrar.js';
import { deployBulkTokens } from './lib/deployer.js';
import { claimAllFees } from './lib/claim.js';
import { sweepAllSubWallets } from './lib/sweeper.js';
import { log } from './lib/utils.js';

dotenv.config();

const execPromise = promisify(exec);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MODES = {
    SAFE: { name: 'Safe Mode (8–15s)', min: 8000, max: 15000 },
    NORMAL: { name: 'Normal Mode (3–5s)', min: 3000, max: 5000 },
    BRUTAL: { name: 'Brutal Mode (1–2s)', min: 1000, max: 2000 }
};

let currentMode = MODES.SAFE;
const API_KEY = process.env.CLAWNCH_API_KEY || 'YOUR_API_KEY';

/**
 * DEXSCREENER TOKEN NAME SCRAPER
 * Step 1: Fetch top boosted token addresses from /token-boosts/top/v1
 * Step 2: Get actual name/symbol from /tokens/v1/{chainId}/{addresses}
 */
let cachedTokens = [];

const fetchDexScreenerTokens = async () => {
    try {
        const boostRes = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
        if (!boostRes.ok) throw new Error(`Boost API HTTP ${boostRes.status}`);
        const boosts = await boostRes.json();

        const byChain = {};
        for (const b of boosts) {
            if (!byChain[b.chainId]) byChain[b.chainId] = [];
            byChain[b.chainId].push(b.tokenAddress);
        }

        const allTokens = [];

        for (const [chainId, addresses] of Object.entries(byChain)) {
            const batch = addresses.slice(0, 30).join(',');
            try {
                const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chainId}/${batch}`);
                if (!res.ok) continue;
                const pairs = await res.json();

                for (const pair of pairs) {
                    if (pair.baseToken?.name && pair.baseToken?.symbol) {
                        allTokens.push({
                            name: pair.baseToken.name,
                            symbol: pair.baseToken.symbol,
                            image: pair.info?.imageUrl || ''
                        });
                    }
                }
            } catch (e) { continue; }
        }

        const seen = new Set();
        return allTokens.filter(t => {
            const key = t.symbol.toUpperCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return t.name.length <= 32 && t.symbol.length <= 10;
        });
    } catch (err) {
        console.error(`DexScreener fetch failed: ${err.message}`);
        return [];
    }
};

const generateRandomMeta = async () => {
    // Refill cache if empty
    if (cachedTokens.length === 0) {
        cachedTokens = await fetchDexScreenerTokens();
    }

    // Pick a random token from cache
    if (cachedTokens.length > 0) {
        const idx = Math.floor(Math.random() * cachedTokens.length);
        const token = cachedTokens.splice(idx, 1)[0];
        let imageUrl = token.image;
        if (!imageUrl) {
            try {
                const img = await nekos.getRandomImage();
                if (img && img.url) imageUrl = img.url;
            } catch (e) {}
        }
        if (!imageUrl) imageUrl = `https://avatar.vercel.sh/${token.symbol}.png`;
        return { name: token.name, symbol: token.symbol, image: imageUrl };
    }

    // Fallback
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomStr = (len) => Array.from({ length: len }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    const symbol = randomStr(4);
    if (!imageUrl) imageUrl = `https://avatar.vercel.sh/${symbol}.png`;
    return { name: `Token${randomStr(6)}`, symbol, image: imageUrl };
};

const startAutoDeployLoop = async () => {
    console.log(chalk.green.bold(`\n🚀 Starting Infinite Auto Deploy [Mode: ${currentMode.name}]...`));
    let count = 0;
    let skipped = 0;
    const startTime = Date.now();
    const deployState = {
        deployed: 0,
        skipped: 0,
        progress: 0,
        status: 'Initializing...',
        startTime
    };

    while (true) {
        const meta = await generateRandomMeta();
        const delay = Math.floor(Math.random() * (currentMode.max - currentMode.min + 1) + currentMode.min);

        deployState.status = `Deploying ${meta.name}...`;
        deployState.progress = 0;
        log.renderDeploy(deployState);

        try {
            const command = `clawncher deploy --api-key ${API_KEY} --name "${meta.name}" --symbol "${meta.symbol}" --image "${meta.image}" --network mainnet`;
            await execPromise(command);
            count++;
            log.success(`Deployed: ${meta.name} [Total: ${count}]`);
        } catch (error) {
            skipped++;
            log.error(`Deploy failed: ${meta.name}`);
        }

        deployState.deployed = count;
        deployState.skipped = skipped;

        // Dynamic wait countdown
        for (let i = delay; i > 0; i -= 100) {
            deployState.status = `Next in ${(i / 1000).toFixed(1)}s`;
            deployState.progress = Math.min(100, Math.floor(((delay - i) / delay) * 100));
            log.renderDeploy(deployState);
            await sleep(100);
        }
    }
};

const selectMode = async () => {
    const { modeKey } = await inquirer.prompt([{
        type: 'list',
        name: 'modeKey',
        message: 'Select Auto-Deploy Speed:',
        choices: Object.keys(MODES).map(k => ({ name: MODES[k].name, value: k }))
    }]);
    currentMode = MODES[modeKey];
    log.success(`Mode set to: ${currentMode.name}`);
};

const mainMenu = async () => {
    while (true) {
        console.log(chalk.magenta.bold('\n========================================'));
        console.log(chalk.cyan.bold('   CLANK - UNIFIED MULTI-AGENT CLI      '));
        console.log(chalk.magenta.bold('========================================'));

        const { choice } = await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'choice',
                message: 'Select Action:',
                choices: [
                    { name: '1. Register Agents (Phase 3)', value: 'register' },
                    { name: '2. Distributor (Phase 2 - Funding)', value: 'fund' },
                    { name: '3. Start Auto Deploy (Infinite Loop)', value: 'auto' },
                    { name: '4. Claim All Fees', value: 'claim' },
                    { name: '5. Setup (Phase 1 - 60 Wallets)', value: 'setup' },
                    { name: '6. Sweep (Recover Funds)', value: 'sweep' },
                    { name: '7. Select Auto-Deploy Mode', value: 'mode' },
                    new inquirer.Separator(),
                    { name: 'Exit', value: 'exit' }
                ]
            }
        ]);

        try {
            switch (choice) {
                case 'register': await registerAgentsBulk(); break;
                case 'fund': await distributeFunds(); break;
                case 'auto': await startAutoDeployLoop(); break;
                case 'claim': await claimAllFees(); break;
                case 'setup': await generateWallets(60); break;
                case 'sweep': await sweepAllSubWallets(); break;
                case 'mode': await selectMode(); break;
                case 'exit': process.exit(0);
            }
        } catch (err) {
            log.error(`Error: ${err.message}`);
        }
        
        await sleep(1000);
    }
};

mainMenu();
