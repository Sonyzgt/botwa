import { ethers } from 'ethers';
import { config } from '../config.js';
import { log, sleep } from './utils.js';
import fs from 'fs';
import inquirer from 'inquirer';

const CLAWNCH_TOKEN = "0xa1F72459dfA10BAD200Ac160eCd78C6b77a747be";
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)"
];

const ETH_AMOUNT = "0.0025";     // 0.0025 ETH per wallet
const CLAWNCH_AMOUNT = "105.0";  // 105 CLAWNCH per wallet

export const distributeFunds = async () => {
    const wallets = JSON.parse(fs.readFileSync('wallets.json', 'utf8'));
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const adminWallet = new ethers.Wallet(config.mainPrivateKey, provider);
    const clawnchContract = new ethers.Contract(CLAWNCH_TOKEN, ERC20_ABI, adminWallet);

    log.info(`Checking Admin balances...`);
    const balanceEth = await provider.getBalance(adminWallet.address);
    const balanceClawnch = await clawnchContract.balanceOf(adminWallet.address);
    
    log.info(`Admin: ${ethers.formatEther(balanceEth)} ETH | ${ethers.formatUnits(balanceClawnch, 18)} CLAWNCH`);

    let nonce = await provider.getTransactionCount(adminWallet.address, 'pending');
    log.info(`Initial Pending Nonce: ${nonce}`);

    let activeWallets = wallets.filter((w, i) => {
        w.originalIndex = i;
        return w.status !== 'CLAWNCH_FUNDED' && w.status !== 'FUNDED' && w.status !== 'REGISTERED' && w.status !== 'DEPLOYED';
    });

    if (activeWallets.length === 0) {
        log.info("No wallets need funding.");
        return;
    }

    const { startIndex } = await inquirer.prompt([{
        type: 'input',
        name: 'startIndex',
        message: `Total wallets needing funds: ${activeWallets.length}. Start from which index? (0-${activeWallets.length - 1}):`,
        default: '0',
        validate: val => !isNaN(val) && val >= 0 && val < activeWallets.length || 'Invalid index'
    }]);

    activeWallets = activeWallets.slice(parseInt(startIndex));

    const shareClawnch = balanceClawnch / BigInt(activeWallets.length);

    log.info(`Each wallet will receive: ${ethers.formatUnits(shareClawnch, 18)} CLAWNCH`);
    
    if (shareClawnch < ethers.parseUnits("100", 18)) {
        log.warn(`Warning: Each wallet will get less than 100 CLAWNCH. Registration might fail.`);
    }

    for (const [index, walletData] of activeWallets.entries()) {
        log.info(`[${parseInt(startIndex) + index + 1}/${activeWallets.length + parseInt(startIndex)}] Funding ${walletData.address} (Wallet #${walletData.originalIndex})...`);

        try {
            const feeData = await provider.getFeeData();
            const gasParams = {
                maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 15n) / 10n, // 50% boost
                maxFeePerGas: (feeData.maxFeePerGas * 15n) / 10n,
                nonce: nonce++
            };

            // Send CLAWNCH Only
            log.info(`Sending ${ethers.formatUnits(shareClawnch, 18)} CLAWNCH...`);
            const clawnchTx = await clawnchContract.transfer(
                walletData.address,
                shareClawnch,
                gasParams
            );
            log.info(`Tx sent: ${clawnchTx.hash}`);

            await clawnchTx.wait(1);
            log.success(`Token Funded to ${walletData.address}`);
            
            walletData.status = 'CLAWNCH_FUNDED';
            fs.writeFileSync('wallets.json', JSON.stringify(wallets, null, 4));
            
            await sleep(10000); // 10s delay - stay slow/safe
        } catch (error) {
            log.error(`Failed to fund ${walletData.address}: ${error.message}`);
            await sleep(15000);
            nonce = await provider.getTransactionCount(adminWallet.address, 'pending');
        }
    }
};
