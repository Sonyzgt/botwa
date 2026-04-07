import { createWalletClient, createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);
import { base } from 'viem/chains';
import { ClawncherClaimer, ClawnchReader, ClawnchPortfolio } from '@clawnch/clawncher-sdk';
import { config } from '../config.js';
import { log } from './utils.js';
import fs from 'fs';

export const claimAllFees = async () => {
    let wallets = [];
    try {
        wallets = JSON.parse(fs.readFileSync('wallets.json', 'utf8'));
    } catch (e) {
        log.warn("Could not read wallets.json, scanning only main wallet.");
    }

    let csvTokens = [];
    try {
        const lines = fs.readFileSync('deployed_tokens.csv', 'utf8').trim().split('\n');
        if (lines.length > 1) {
            csvTokens = lines.slice(1).map(line => {
                const cols = [];
                let cur = '', inQ = false;
                for (let i = 0; i < line.length; i++) {
                    if (line[i] === '"') { inQ = !inQ; continue; }
                    if (line[i] === ',' && !inQ) { cols.push(cur); cur = ''; continue; }
                    cur += line[i];
                }
                cols.push(cur);
                return {
                    wallet: (cols[2] || '').toLowerCase(),
                    token: cols[3] || ''
                };
            }).filter(t => t.token && t.wallet);
        }
    } catch (e) {
        log.warn("Could not read deployed_tokens.csv");
    }

    const mainPk = config.mainPrivateKey.startsWith('0x') ? config.mainPrivateKey : `0x${config.mainPrivateKey}`;
    const allAccounts = [ { account: privateKeyToAccount(mainPk), pk: mainPk } ];
    
    // Add all registered wallets
    for (const w of wallets) {
        if (w.privateKey) {
            const pk = w.privateKey.startsWith('0x') ? w.privateKey : `0x${w.privateKey}`;
            allAccounts.push({ account: privateKeyToAccount(pk), pk });
        }
    }

    const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });
    const reader = new ClawnchReader({ publicClient, network: 'mainnet' });
    const portfolio = new ClawnchPortfolio({ publicClient, network: 'mainnet' });

    let totalRewardsAll = 0n;
    const rewardedAddresses = [];

    log.info(`Scanning ${allAccounts.length} wallets for rewards...`);

    for (const { account, pk } of allAccounts) {
        try {
            log.info(`\n🔍 Checking Wallet: ${account.address}`);
            let discovered = [];
            try { discovered = await portfolio.discoverTokens(account.address); } catch(e) {}
            
            const myCsv = csvTokens.filter(t => t.wallet === account.address.toLowerCase()).map(t => t.token);
            const tokensToScan = [...new Set([...discovered, ...myCsv])];

            if (tokensToScan.length === 0) {
                log.info(`   └─ No claimable tokens discovered or deployed.`);
                continue;
            }

            let walletTotal = 0n;
            
            for (const token of tokensToScan) {
                const fees = await reader.getAvailableFees(account.address, token);
                if (fees > 0n) {
                    walletTotal += fees;
                    log.info(`   ├─ Found ${formatEther(fees)} ETH in token ${token}`);
                    try {
                        const cmd = `clawncher fees claim ${token} --network mainnet --private-key ${pk} --fee-owner ${account.address}`;
                        const { stdout } = await execPromise(cmd);
                        log.success(`   ├─ Claimed successfully!`);
                    } catch (err) {
                        log.error(`   ├─ Failed claim via CLI: ${err.message.split('\n')[0]}`);
                    }
                } else {
                    log.info(`   ├─ Token ${token}: 0 ETH`);
                }
            }

            if (walletTotal > 0n) {
                log.success(`   └─ Total claimed for this wallet: ${formatEther(walletTotal)} ETH`);
                totalRewardsAll += walletTotal;
                rewardedAddresses.push({
                    address: account.address,
                    amount: walletTotal
                });
            }
            
        } catch (error) {
            log.error(`Portfolio check failed for ${account.address}: ${error.message}`);
        }
    }

    log.info("\n========================================");
    if (rewardedAddresses.length > 0) {
        log.success(`Reward Scan Complete! Found rewards on ${rewardedAddresses.length} addresses:`);
        for (const r of rewardedAddresses) {
            log.info(`- ${r.address}: ${formatEther(r.amount)} ETH`);
        }
    } else {
        log.info("No rewards found on any address.");
    }
    log.success(`TOTAL REWARDS CLAIMED: ${formatEther(totalRewardsAll)} ETH`);
    log.info("========================================\n");
};
