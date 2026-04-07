// One-time script to seed deployed_tokens.csv from wallets.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, 'deployed_tokens.csv');
const WALLETS_PATH = path.join(__dirname, 'wallets.json');

const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
const header = 'timestamp,agentName,walletAddress,tokenAddress,tokenName,tokenSymbol\n';

// Read existing CSV to avoid duplicates
let existing = new Set();
if (fs.existsSync(CSV_PATH)) {
    const lines = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n').slice(1);
    lines.forEach(l => { const parts = l.split(','); if (parts[3]) existing.add(parts[3].replace(/"/g, '')); });
} else {
    fs.writeFileSync(CSV_PATH, header);
}

let added = 0;
for (const w of wallets) {
    if (w.tokenAddress && !existing.has(w.tokenAddress)) {
        const ts = new Date().toISOString();
        const row = `${ts},"${w.agentName || ''}","${w.address}","${w.tokenAddress}","${w.tokenName || ''}","${w.tokenSymbol || ''}"\n`;
        fs.appendFileSync(CSV_PATH, row);
        added++;
    }
}
console.log(`✅ Seeded ${added} token(s) from wallets.json → deployed_tokens.csv`);
