import inquirer from 'inquirer';
import { AutoDeployer, MODES } from '../core/deployer.js';
import { claimAllSubWalletFees } from '../core/claimer.js';
import { log } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';
import { loadWallets, loadProxies } from '../config/index.js';
import { blockchainService } from '../services/blockchain.js';
import { formatEther } from 'viem';
import { appendDeployedToken } from '../utils/csv.js';

const deployer = new AutoDeployer();

export const showMainMenu = async () => {
    while (true) {
        let choice;
        try {
            const res = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'choice',
                    message: 'Select Action',
                    choices: [
                        { name: '1. Register Agents (Sign Up)', value: 'register' },
                        { name: '2. Wallet Check (Balance & Status)', value: 'check' },
                        { name: '3. Distributor (Fund Sub-Wallets)', value: 'fund' },
                        { name: '4. Deploy Tokens (Agent / Pick / Loop)', value: 'deploy-menu' },
                        { name: '5. Claim All Fees (Revenue)', value: 'claim' },
                        { name: '6. Setup (Generate 60 Wallets)', value: 'setup' },
                        { name: '7. Sweep (Recover Funds)', value: 'sweep' },
                        { name: '8. Send Token (Manual Transfer)', value: 'send' },
                        new inquirer.Separator(),
                        { name: 'Exit', value: 'exit' }
                    ]
                }
            ]);
            choice = res.choice;
        } catch (err) {
            if (err.name === 'ExitPromptError') process.exit(0);
            log.error(`Prompt Error: ${err.message}`);
            break;
        }

        if (choice === 'deploy-menu') {
            const { deployType } = await inquirer.prompt([{
                type: 'rawlist',
                name: 'deployType',
                message: 'Select Deployment Type:',
                choices: [
                    { name: '1. deploy (agent) - Single Agent', value: 'deploy-one' },
                    { name: '2. deploy (pick) - From Agent X to 60', value: 'deploy-all' },
                    { name: '3. deploy (loop) - Infinite loop 1 to 60', value: 'auto' },
                    { name: 'Back', value: 'back' }
                ]
            }]);

            if (deployType === 'back') {
                continue; // Back to main menu
            }
            
            // Overwrite choice so the switch statement below handles it
            choice = deployType;
        }

        try {
            switch (choice) {
                case 'deploy-one': {
                    const deployWallets = loadWallets();
                    if (deployWallets.length === 0) {
                        log.error('No wallets found in wallets.json!');
                        break;
                    }

                    log.info('Fetching live balances...');
                    const deployChoices = await Promise.all(deployWallets.map(async (w, i) => {
                        try {
                            const bals = await blockchainService.getBalances(w.address);
                            return {
                                name: `[${i + 1}] ${w.address.slice(0, 10)}... | ${formatEther(bals.eth).slice(0, 7)} ETH | (${w.agentName || 'Bot'})`,
                                value: i
                            };
                        } catch (e) {
                            return { name: `[${i + 1}] ${w.address} | Error`, value: i };
                        }
                    }));

                    const { selectedIdx } = await inquirer.prompt([{
                        type: 'rawlist',
                        name: 'selectedIdx',
                        message: 'Select wallet to deploy from:',
                        choices: deployChoices
                    }]);

                    const targetWallet = deployWallets[selectedIdx];
                    if (!targetWallet.apiKey) {
                        log.error('Agent not registered! Please register first.');
                        break;
                    }

                    if (targetWallet.lastDeployedAt && (Date.now() - targetWallet.lastDeployedAt) < 3600000) {
                        log.warn(`Agent ${targetWallet.agentName} has already deployed in the last hour. Please pick another agent or wait.`);
                        break;
                    }

                    const { getAiMetadata } = await import('../services/ai.js');
                    const meta = await getAiMetadata();
                    log.info(`Launching with agent: ${targetWallet.agentName} | Token: ${meta.name} (${meta.symbol})`);

                    const { clawncherService } = await import('../services/clawncher.js');
                    const { saveWallets } = await import('../config/index.js');
                    const { waitForAvailableProxy, markProxyCooldown } = await import('../utils/proxyManager.js');
                    
                    let launched = false;
                    while (!launched) {
                        const proxy1 = await waitForAvailableProxy();
                        if (proxy1) log.info(`Using proxy: ${proxy1}`);
                        try {
                            const out = await clawncherService.deploy(
                                targetWallet.apiKey, targetWallet.privateKey,
                                meta.name, meta.symbol, meta.image, proxy1
                            );
                            log.success(`Launch successful! Token: ${out.slice(0, 66)}`);
                            launched = true;
                            
                            // Save timestamp
                            targetWallet.lastDeployedAt = Date.now();
                            saveWallets(deployWallets);
                            
                            if (proxy1) markProxyCooldown(proxy1);
                            
                            try {
                                appendDeployedToken({ agentName: targetWallet.agentName, walletAddress: targetWallet.address, tokenAddress: out.trim(), tokenName: meta.name, tokenSymbol: meta.symbol });
                            } catch (_) {}
                        } catch (err) {
                            const msg = err.message.toLowerCase();
                            if (msg.includes('rate limit') && msg.includes('per ip') && proxy1) {
                                log.warn(`Per-IP rate limit! Burnt proxy for 1 hour... Rotating.`);
                                markProxyCooldown(proxy1);
                            } else if (msg.includes('rate limit') && msg.includes('per agent')) {
                                log.error(`Per-Agent limit! Agent ${targetWallet.agentName} sudah deploy dalam 1 jam ini.`);
                                targetWallet.lastDeployedAt = Date.now();
                                saveWallets(deployWallets);
                                break;
                            } else if (msg.includes('rate limit') && proxy1) {
                                log.warn(`Rate limit! Burnt proxy for 1 hour... Rotating.`);
                                markProxyCooldown(proxy1);
                            } else {
                                log.error(`Launch failed: ${err.message}`);
                                break;
                            }
                        }
                    }
                    break;
                }

                case 'auto':
                    await deployer.start();
                    break;
                case 'check':
                    const { checkAllWallets } = await import('../core/checker.js');
                    await checkAllWallets();
                    break;
                case 'fund':
                    const fundWallets = loadWallets();
                    const { adminPrivateKey } = await import('../config/index.js').then(m => m.config);
                    
                    const { fundAsset } = await inquirer.prompt([{
                        type: 'rawlist',
                        name: 'fundAsset',
                        message: 'Select asset to distribute',
                        choices: [
                            { name: 'ETH', value: 'ETH' },
                            { name: 'CLAWNCH', value: 'CLAWNCH' }
                        ]
                    }]);

                    const defaultAmount = fundAsset === 'CLAWNCH' ? '200' : '0.00001'; // 0.00001 ETH ≈ 0.03$ safe for gas
                    const { fundAmount } = await inquirer.prompt([{
                        type: 'input',
                        name: 'fundAmount',
                        message: `Masukkan jumlah ${fundAsset} per wallet:`,
                        default: defaultAmount
                    }]);

                    const { startDist } = await inquirer.prompt([{
                        type: 'confirm',
                        name: 'startDist',
                        message: `ARE YOU SURE? Send ${fundAmount} ${fundAsset} to ALL 60 wallets?`,
                        default: false
                    }]);

                    if (startDist) {
                        const { distributeFunds } = await import('../core/distributor.js');
                        await distributeFunds(fundAsset, fundAmount, adminPrivateKey);
                    }
                    break;
                case 'deploy-all': {
                    const allWallets = loadWallets();
                    const total = allWallets.length;

                    const { startFromAnswer } = await inquirer.prompt([{
                        type: 'input',
                        name: 'startFromAnswer',
                        message: `Mulai deploy dari agent ke berapa? (1-${total}):`,
                        default: '1',
                        validate: v => (Number(v) >= 1 && Number(v) <= total) || `Masukkan angka antara 1 dan ${total}`
                    }]);
                    const startFrom = parseInt(startFromAnswer, 10);

                    const { confirmDeploy } = await inquirer.prompt([{
                        type: 'confirm',
                        name: 'confirmDeploy',
                        message: `Baiklah, kita akan memulai deploy dari agent ke-${startFrom} sampai ke-${total} (${total - startFrom + 1} agent). Lanjutkan?`,
                        default: false
                    }]);

                    if (confirmDeploy) {
                        const { deployBulkTokens } = await import('../core/deployer_basic.js');
                        await deployBulkTokens(total, startFrom - 1);
                    } else {
                        log.warn('Deploy All dibatalkan.');
                    }
                    break;
                }
                case 'send':
                    const wallets = loadWallets();
                    if (wallets.length === 0) {
                        log.error('No wallets found in wallets.json!');
                        break;
                    }

                    log.info('Fetching live balances for selection menu...');
                    const sendChoices = await Promise.all(wallets.map(async (w, i) => {
                        try {
                            const bals = await blockchainService.getBalances(w.address);
                            const eth = formatEther(bals.eth).slice(0, 7);
                            const claw = formatEther(bals.clawnch).slice(0, 7);
                            return {
                                name: `[${i + 1}] ${w.address.slice(0, 10)}... | ETH (${eth}) | CLAWNCH (${claw})`,
                                value: i
                            };
                        } catch (err) {
                            return { name: `[${i + 1}] ${w.address} | Error`, value: i };
                        }
                    }));

                    const { walletIndex } = await inquirer.prompt([
                        {
                            type: 'rawlist',
                            name: 'walletIndex',
                            message: 'Select wallet',
                            choices: sendChoices
                        }
                    ]);

                    const selectedWallet = wallets[walletIndex];
                    const selectedBals = await blockchainService.getBalances(selectedWallet.address);
                    const ethStr = formatEther(selectedBals.eth);
                    const clawStr = formatEther(selectedBals.clawnch);

                    log.info(`Selected: ${selectedWallet.address} | Balance: ${ethStr} ETH | ${clawStr} CLAWNCH`);

                    const { asset } = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'asset',
                            message: 'Select token',
                            choices: [
                                { name: `ETH (${ethStr})`, value: 'ETH' },
                                { name: `CLAWNCH (${clawStr})`, value: 'CLAWNCH' }
                            ]
                        }
                    ]);

                    const { recipient, amount } = await inquirer.prompt([
                        { type: 'input', name: 'recipient', message: 'Enter recipient address:' },
                        { type: 'input', name: 'amount', message: 'Enter amount:' }
                    ]);

                    const { confirm } = await inquirer.prompt([
                        { type: 'confirm', name: 'confirm', message: 'Confirm transfer?', default: false }
                    ]);

                    if (confirm) {
                        log.info('Executing transfer...');
                        try {
                            const tx = asset === 'ETH'
                                ? await blockchainService.transferEth(selectedWallet.privateKey, recipient, amount)
                                : await blockchainService.transferToken(selectedWallet.privateKey, recipient, amount);
                            log.success(`Transfer berhasil! Hash: ${tx.hash || tx}`);
                        } catch (err) {
                            log.error(`Transfer gagal: ${err.message}`);
                        }
                    } else {
                        log.warn('Transfer dibatalkan.');
                    }
                    break;
                case 'exit':
                    process.exit(0);
            }
        } catch (err) {
            if (err.name === 'ExitPromptError') {
                log.warn('Operation cancelled by user.');
            } else {
                log.error(`Error: ${err.message}`);
            }
        }

        await sleep(1000);
    }
};
