import { ethers } from 'ethers';
import { config } from '../config.js';
import { log, sleep } from './utils.js';
import fs from 'fs';

const CLAWNCH_TOKEN = "0xa1F72459dfA10BAD200Ac160eCd78C6b77a747be";
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)"
];

export const sweepAllSubWallets = async (customKeys = []) => {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const adminWallet = new ethers.Wallet(config.mainPrivateKey, provider);
    const targetAddress = adminWallet.address;

    log.info(`Connecting to RPC: ${config.rpcUrl}...`);
    try {
        const network = await provider.getNetwork();
        log.info(`Connected to Network ID: ${network.chainId}`);
        
        // Verify contract exists
        const code = await provider.getCode(CLAWNCH_TOKEN);
        if (code === '0x') {
            throw new Error("CLAWNCH Token contract not found on this network! Check your RPC.");
        }
    } catch (e) {
        log.error(`Network verification failed: ${e.message}`);
        return;
    }

    let wallets = [];
    try {
        wallets = JSON.parse(fs.readFileSync('wallets.json', 'utf8'));
    } catch (e) {}

    const allKeys = [...new Set([
        ...wallets.map(w => w.privateKey),
        ...customKeys
    ])].filter(k => k);

    log.info(`Scanning ${allKeys.length} wallets for funds...`);

    for (const key of allKeys) {
        let subAddress = "Unknown";
        try {
            const wallet = new ethers.Wallet(key, provider);
            subAddress = wallet.address;

            if (subAddress.toLowerCase() === targetAddress.toLowerCase()) continue;

            // 1. Check ETH balance first (needed for any action)
            const ethBal = await provider.getBalance(subAddress);
            
            // 2. Check CLAWNCH
            const clawnchContract = new ethers.Contract(CLAWNCH_TOKEN, ERC20_ABI, wallet);
            let tokenBal = 0n;
            try {
                tokenBal = await clawnchContract.balanceOf(subAddress);
            } catch (err) {
                log.warn(`[${subAddress}] Could not fetch token balance: ${err.message}`);
            }

            if (tokenBal > 0n) {
                log.info(`[${subAddress}] Found ${ethers.formatUnits(tokenBal, 18)} CLAWNCH`);
                
                if (ethBal < ethers.parseEther("0.00002")) {
                    log.warn(`[${subAddress}] ETH too low to pay gas ($${ethers.formatEther(ethBal)}). Token trapped.`);
                } else {
                    const tx = await clawnchContract.transfer(targetAddress, tokenBal);
                    log.info(`[${subAddress}] Token sweep tx: ${tx.hash}`);
                    await tx.wait();
                    log.success(`[${subAddress}] Tokens recovered!`);
                }
            }

            // 3. Sweep ETH
            if (ethBal > ethers.parseEther("0.0001")) {
                const feeData = await provider.getFeeData();
                const gasLimit = 21000n;
                const gasCost = (feeData.maxFeePerGas || ethers.parseUnits("1", "gwei")) * gasLimit;
                
                if (ethBal > gasCost) {
                    const sendAmount = ethBal - gasCost;
                    const tx = await wallet.sendTransaction({
                        to: targetAddress,
                        value: sendAmount,
                        gasLimit
                    });
                    await tx.wait();
                    log.success(`[${subAddress}] ETH recovered!`);
                }
            }
        } catch (error) {
            log.error(`[${subAddress}] Processing failed: ${error.message.split('(')[0]}`);
        }
        await sleep(500); // Tiny delay to not spam RPC
    }
};
