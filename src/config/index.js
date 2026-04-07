import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const WALLETS_PATH = path.resolve(process.cwd(), 'wallets.json');

export const config = {
    rpcUrl: process.env.RPC_URL || 'https://mainnet.base.org',
    adminPrivateKey: process.env.ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY,
    clawnchToken: '0xa1F72459dfA10BAD200Ac160eCd78C6b77a747be', // $CLAWNCH
    openaiApiKey: process.env.OPENAI_API_KEY,
};

export const loadWallets = () => {
    if (!fs.existsSync(WALLETS_PATH)) return [];
    try {
        return JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
    } catch (err) {
        console.error('Error loading wallets.json:', err.message);
        return [];
    }
};

const PROXIES_PATH = path.resolve(process.cwd(), 'proxies.txt');

export const loadProxies = () => {
    if (!fs.existsSync(PROXIES_PATH)) return [];
    try {
        const content = fs.readFileSync(PROXIES_PATH, 'utf8');
        return content.split('\n')
            .map(p => p.trim())
            .filter(p => p && !p.startsWith('#'))
            .map(p => {
                // If it's already a full URL, return as is
                if (p.includes('://')) return p;
                
                // If it matches ip:port:user:pass format
                const parts = p.split(':');
                if (parts.length === 4) {
                    const [ip, port, user, pass] = parts;
                    return `http://${user}:${pass}@${ip}:${port}`;
                }
                
                // Default to http prefix
                return `http://${p}`;
            });
    } catch (err) {
        return [];
    }
};

export const saveWallets = (wallets) => {
    fs.writeFileSync(WALLETS_PATH, JSON.stringify(wallets, null, 4));
};
