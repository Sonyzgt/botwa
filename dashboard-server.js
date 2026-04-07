import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AutoDeployer } from './src/core/deployer.js';
import { checkAllWallets } from './src/core/checker.js';
import { distributeFunds } from './src/core/distributor.js';
import { deployBulkTokens } from './src/core/deployer_basic.js';
import { claimAllSubWalletFees } from './src/core/claimer.js';
import { setupWallets } from './src/core/setup.js';
import { sweepAll } from './src/core/sweeper.js';
import { config } from './src/config/index.js';
import { blockchainService } from './src/services/blockchain.js';
import { formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { logEmitter } from './src/utils/logger.js';
import { readDeployedTokens } from './src/utils/csv.js';
import { stopSignal } from './src/utils/stopSignal.js';
import { initProxies } from './src/utils/proxyManager.js';

// Initialize Proxies early to avoid dependency race condition
initProxies();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.resolve(__dirname, 'deployed_tokens.csv');
const execAsync = promisify(exec);

const readCSV = readDeployedTokens;

const dexCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const fetchDexScreener = async (addrs) => {
    if (!addrs.length) return [];
    
    const now = Date.now();
    const toFetch = [];
    const results = [];

    for (const addr of addrs) {
        const cached = dexCache.get(addr.toLowerCase());
        if (cached && (now - cached.timestamp < CACHE_TTL)) {
            results.push(cached.data);
        } else {
            toFetch.push(addr);
        }
    }

    if (toFetch.length > 0) {
        const chunks = [];
        for (let i = 0; i < toFetch.length; i += 30)
            chunks.push(toFetch.slice(i, i + 30));
            
        const apiResults = await Promise.all(chunks.map(async chunk => {
            try {
                const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`);
                if (!res.ok) return [];
                const data = await res.json();
                return data.pairs || [];
            } catch { return []; }
        }));

        const flatPairs = apiResults.flat();
        for (const pair of flatPairs) {
            const addr = pair.baseToken?.address?.toLowerCase();
            if (addr) {
                dexCache.set(addr, { data: pair, timestamp: now });
                results.push(pair);
            }
        }
    }

    return results;
};

let deployerInstance = null;
let sseClients = [];

logEmitter.on('log', (logObj) => {
    const msg = `data: ${JSON.stringify({ type: 'log', ...logObj })}\n\n`;
    sseClients.forEach(client => client.write(msg));
});

logEmitter.on('progress', (progObj) => {
    const msg = `data: ${JSON.stringify({ type: 'progress', ...progObj })}\n\n`;
    sseClients.forEach(client => client.write(msg));
});

// Central Command Handler
const processCommand = async (command) => {
    stopSignal.reset();
    if (command === 'start loop') {
        if (deployerInstance && deployerInstance.isRunning) throw new Error('Loop is already running');
        deployerInstance = new AutoDeployer();
        deployerInstance.start().catch(err => logEmitter.emit('log', { level: 'error', msg: `Loop crashed: ${err.message}` }));
        logEmitter.emit('log', { level: 'info', msg: 'System: Deploy Loop Started' });
        return { status: 'Loop started' };
    } else if (command === 'stop loop') {
        if (!deployerInstance || !deployerInstance.isRunning) throw new Error('Loop is not running');
        deployerInstance.stop();
        logEmitter.emit('log', { level: 'warn', msg: 'System: Deploy Loop Stopped' });
        return { status: 'Loop stopped' };
    } else if (command === 'register') {
        const { authService } = await import('./src/services/auth.js');
        authService.registerAll().catch(e => logEmitter.emit('log', { level: 'error', msg: e.message }));
        return { status: 'Registering agents...' };
    } else if (command === 'check') {
        checkAllWallets().catch(e => logEmitter.emit('log', { level: 'error', msg: e.message }));
        return { status: 'Checking wallets...' };
    } else if (command.startsWith('setup')) {
        const parts = command.split(' ');
        const count = parseInt(parts[1], 10) || 60;
        const append = parts[2] === 'true';
        setupWallets(count, append);
        return { status: `${append ? 'Added' : 'Generated'} ${count} wallets` };
    } else if (command === 'sweep') {
        sweepAll().catch(e => logEmitter.emit('log', { level: 'error', msg: e.message }));
        return { status: 'Sweep started...' };
    } else if (command === 'claim') {
        claimAllSubWalletFees().catch(e => logEmitter.emit('log', { level: 'error', msg: e.message }));
        return { status: 'Claiming fees...' };
    } else if (command.startsWith('fund ')) {
        const parts = command.split(' ');
        const asset = parts[1] || 'ETH';
        const amount = parts[2] || '0.00001';
        distributeFunds(asset, amount, config.adminPrivateKey).catch(e => logEmitter.emit('log', { level: 'error', msg: e.message }));
        return { status: `Funding ${amount} ${asset}...` };
    } else if (command.startsWith('deploy-all ')) {
        const startFrom = parseInt(command.split(' ')[1], 10) || 1;
        const wallets = loadWallets();
        deployBulkTokens(wallets.length, startFrom - 1).catch(e => logEmitter.emit('log', { level: 'error', msg: e.message }));
        return { status: `Bulk deploy from agent ${startFrom}...` };
    } else if (command === 'deploy-one') {
        logEmitter.emit('log', { level: 'info', msg: 'Single Agent Deploy: Please use the CLI for manual selection for now.' });
        return { status: 'Manual deploy requested' };
    }
    throw new Error(`Unknown command: ${command}`);
};

const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.writeHead(204); res.end(); return;
    }

    // SSE Endpoint
    if (req.url === '/api/logs') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        sseClients.push(res);
        req.on('close', () => sseClients = sseClients.filter(c => c !== res));
        return;
    }

    // Command Endpoints
    if (req.method === 'POST' && (req.url === '/api/command' || req.url === '/api/ai-command')) {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');
            try {
                const data = JSON.parse(body);
                if (req.url === '/api/ai-command') {
                    const { nlpService } = await import('./src/services/nlp.js');
                    const { commands, reply } = await nlpService.translate(data.text);
                    
                    // Emit the AI's reply to logs
                    logEmitter.emit('log', { level: 'info', msg: `🤖 AI: ${reply}` });
                    
                    const executionDetails = [];
                    for(const cmd of commands) {
                        try {
                            const result = await processCommand(cmd);
                            executionDetails.push(result);
                        } catch (e) {
                            logEmitter.emit('log', { level: 'error', msg: `AI Fail: ${cmd} -> ${e.message}` });
                        }
                    }
                    res.writeHead(200); res.end(JSON.stringify({ status: 'AI process finished', reply, commands, details: executionDetails }));
                } else {
                    const result = await processCommand(data.command);
                    res.writeHead(200); res.end(JSON.stringify(result));
                }
            } catch (e) {
                res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // Stop Signal Endpoint
    if (req.method === 'POST' && req.url === '/api/stop') {
        stopSignal.stop();
        if (deployerInstance) deployerInstance.stop();
        logEmitter.emit('log', { level: 'warn', msg: '‼ SYSTEM: EMERGENCY STOP SIGNAL SENT TO ALL PROCESSES' });
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(200); res.end(JSON.stringify({ status: 'Stop signaled' }));
        return;
    }

    // Token Data
    if (req.url === '/api/tokens') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        try {
            const rows = readCSV();
            const addrs = [...new Set(rows.map(r => r.tokenAddress))];
            const pairs = await fetchDexScreener(addrs);
            const pairMap = {};
            for (const p of pairs) {
                const a = p.baseToken?.address?.toLowerCase();
                if (!a) continue;
                if (!pairMap[a] || (p.volume?.h24 || 0) > (pairMap[a].volume?.h24 || 0)) pairMap[a] = p;
            }
            const result = rows.map((r, i) => {
                const pair = pairMap[r.tokenAddress.toLowerCase()];
                return {
                    index: i + 1,
                    agentName: r.agentName,
                    walletAddress: r.walletAddress,
                    tokenAddress: r.tokenAddress,
                    tokenName: r.tokenName || pair?.baseToken?.name || r.tokenAddress.slice(0, 8) + '...',
                    tokenSymbol: r.tokenSymbol || pair?.baseToken?.symbol || '—',
                    deployedAt: r.timestamp,
                    price: pair?.priceUsd || null,
                    volume24h: pair?.volume?.h24 || 0,
                    liquidity: pair?.liquidity?.usd || 0,
                    priceChange24h: pair?.priceChange?.h24 || 0,
                    txns24h: (pair?.txns?.h24?.buys || 0) + (pair?.txns?.h24?.sells || 0),
                    dexUrl: pair?.url || `https://dexscreener.com/base/${r.tokenAddress}`,
                };
            }).reverse();
            res.writeHead(200); res.end(JSON.stringify(result));
        } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // Claim Fee
    if (req.url.startsWith('/api/claim-fee')) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const wallet = urlObj.searchParams.get('wallet');
            const token = urlObj.searchParams.get('token');
            
            if (!wallet || !token) {
                res.writeHead(400); res.end(JSON.stringify({ error: 'Missing wallet or token address' }));
                return;
            }

            const { loadWallets } = await import('./src/config/index.js');
            const wallets = loadWallets();
            const w = wallets.find(w => w.address.toLowerCase() === wallet.toLowerCase());
            
            if (!w || !w.privateKey) {
                res.writeHead(404); res.end(JSON.stringify({ error: 'Private key not found for this wallet' }));
                return;
            }

            const adminAddress = config.adminWallet || privateKeyToAccount(config.adminPrivateKey).address;
            logEmitter.emit('log', { level: 'info', msg: `Claiming fees for ${token.slice(0,8)}...` });
            
            // Execute: clawncher fees claim <tokenAddress> --network mainnet --private-key <privateKey> --fee-owner <adminAddress>
            const cmd = `clawncher fees claim ${token} --network mainnet --private-key ${w.privateKey} --fee-owner ${adminAddress}`;
            const { stdout, stderr } = await execAsync(cmd);
            const output = (stdout + '\n' + stderr).trim();
            
            res.writeHead(200); res.end(JSON.stringify({ output }));
        } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: e.message, output: (e.stdout || '') + (e.stderr || '') }));
        }
        return;
    }

    // Admin Stats
    if (req.url === '/api/admin-stats') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        try {
            const adminAddress = config.adminWallet || privateKeyToAccount(config.adminPrivateKey).address;
            const bals = await blockchainService.getBalances(adminAddress);
            res.writeHead(200); res.end(JSON.stringify({
                eth: formatEther(bals.eth),
                clawnch: formatEther(bals.clawnch)
            }));
        } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // Wallet PK
    if (req.url.startsWith('/api/wallet-pk/')) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        try {
            const address = req.url.split('/').pop().toLowerCase();
            const walletsPath = path.join(__dirname, 'wallets.json');
            if (fs.existsSync(walletsPath)) {
                const wallets = JSON.parse(fs.readFileSync(walletsPath, 'utf8'));
                const wallet = wallets.find(w => w.address.toLowerCase() === address);
                res.writeHead(200); res.end(JSON.stringify({ privateKey: wallet ? wallet.privateKey : null }));
            } else {
                res.writeHead(404); res.end(JSON.stringify({ error: 'wallets.json not found' }));
            }
        } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // Check Fee
    if (req.url.startsWith('/api/check-fee')) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const wallet = urlObj.searchParams.get('wallet');
            const token = urlObj.searchParams.get('token');
            
            if (!wallet || !token) {
                res.writeHead(400); res.end(JSON.stringify({ error: 'Missing wallet or token address' }));
                return;
            }

            logEmitter.emit('log', { level: 'info', msg: `Checking fees for ${wallet.slice(0,8)} on ${token.slice(0,8)}...` });
            
            const { stdout, stderr } = await execAsync(`clawncher fees check ${wallet} -t ${token}`);
            const output = (stdout + '\n' + stderr).trim();
            
            res.writeHead(200); res.end(JSON.stringify({ output }));
        } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: e.message, output: e.stdout + e.stderr }));
        }
        return;
    }

    // Static Files
    const htmlPath = path.join(__dirname, 'dashboard.html');
    if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(htmlPath, 'utf8'));
    } else {
        res.writeHead(404); res.end('Dashboard Not Found');
    }
});

const PORT = process.env.PORT || 3001;
server.on('error', e => {
    if (e.code === 'EADDRINUSE') { console.error(`\n❌ Port ${PORT} in use.\n`); process.exit(1); }
});
server.listen(PORT, () => {
    console.log(`\n🚀 Clank Dashboard AI-Enabled → http://localhost:${PORT}`);
    console.log(`   Data source: deployed_tokens.csv\n`);
});
