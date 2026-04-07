import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';
import { config, loadWallets } from '../config/index.js';
import { log } from '../utils/logger.js';

export const checkAllWallets = async () => {
    const wallets = loadWallets();
    const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });
    
    log.step('Checking Wallet status and balances...');

    for (const [index, wallet] of wallets.entries()) {
        try {
            const balance = await publicClient.getBalance({ address: wallet.address });
            const eth = formatEther(balance);
            
            const statusIcon = wallet.apiKey ? '📝 REGISTERED' : '❌ UNREGISTERED';
            const logType = parseFloat(eth) > 0 ? 'success' : 'info';
            
            log[logType](`[${index + 1}] ${wallet.address.slice(0, 10)}... | ${eth.slice(0, 6)} ETH | ${statusIcon}`);
        } catch (err) {
            log.error(`Failed to check ${wallet.address}: ${err.message}`);
        }
    }
    log.success('Wallet check complete.');
};
