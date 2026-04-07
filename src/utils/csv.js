import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.resolve(process.cwd(), 'deployed_tokens.csv');
const HEADER = 'timestamp,agentName,walletAddress,tokenAddress,tokenName,tokenSymbol\n';
const MAX_TOKENS = 2000;

export const pruneCSV = () => {
    try {
        if (!fs.existsSync(CSV_PATH)) return;
        const data = fs.readFileSync(CSV_PATH, 'utf8');
        const lines = data.trim().split('\n');
        if (lines.length <= MAX_TOKENS + 1) return; // +1 for header

        const header = lines[0];
        const lastTokens = lines.slice(-(MAX_TOKENS));
        const newData = [header, ...lastTokens].join('\n') + '\n';
        
        fs.writeFileSync(CSV_PATH, newData, 'utf8');
        console.log(`[CSV] Pruned to last ${MAX_TOKENS} tokens.`);
    } catch (err) {
        console.error('Cannot prune CSV:', err.message);
    }
};

export const appendDeployedToken = ({ agentName, walletAddress, tokenAddress, tokenName, tokenSymbol }) => {
    try {
        if (!fs.existsSync(CSV_PATH)) {
            fs.writeFileSync(CSV_PATH, HEADER, 'utf8');
        }
        const ts = new Date().toISOString();
        const row = `${ts},"${agentName}","${walletAddress}","${tokenAddress}","${tokenName}","${tokenSymbol}"\n`;
        fs.appendFileSync(CSV_PATH, row, 'utf8');
        
        // Auto-prune if file gets too large (e.g. 10% overflow)
        const stats = fs.statSync(CSV_PATH);
        if (stats.size > 1024 * 500) { // Check if > 500KB as a crude trigger
            pruneCSV();
        }
    } catch (err) {
        console.error('Cannot write to CSV:', err.message);
    }
};

export const readDeployedTokens = () => {
    if (!fs.existsSync(CSV_PATH)) return [];
    const lines = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n');
    if (lines.length <= 1) return []; // header only
    
    // Safety slice to ensure we only process at most MAX_TOKENS even if file hasn't been pruned yet
    const dataLines = lines.slice(1).slice(-MAX_TOKENS);
    
    return dataLines.map((line, idx) => {
        const cols = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') { inQ = !inQ; }
            else if (line[i] === ',' && !inQ) { cols.push(cur); cur = ''; }
            else { cur += line[i]; }
        }
        cols.push(cur);
        
        const addr = (cols[3] || '').trim();
        // console.log(`[CSV] Row ${idx+1} parsed: ${addr}`);
        
        return {
            timestamp: cols[0] || '',
            agentName: cols[1] || '',
            walletAddress: cols[2] || '',
            tokenAddress: addr,
            tokenName: cols[4] || '',
            tokenSymbol: cols[5] || '',
        };
    }).filter(r => r.tokenAddress && r.tokenAddress !== 'Success' && r.tokenAddress.startsWith('0x'));
};
