import dotenv from 'dotenv';
dotenv.config();

export const config = {
    clawnchApiKey: process.env.CLAWNCH_API_KEY || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    
    // Main Wallet (Deployer & Sweeping Target)
    mainPrivateKey: process.env.ADMIN_PRIVATE_KEY || "",
    mainWalletAddress: process.env.MAIN_WALLET_ADDRESS || "",

    // Network Settings (Base Mainnet)
    rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",
    chainId: 8453,
    
    // Files
    walletsFile: "wallets.json",
    resultsFile: "results.csv",
    
    // Contracts
    wethAddress: "0x4200000000000000000000000000000000000006",
    
    // Delays
    minDelay: 2000,
    maxDelay: 5000
};
