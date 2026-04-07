import fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { ClawnchApiDeployer } from '@clawnch/clawncher-sdk';
import { config } from './config.js';
import { log, validatePrivateKey } from './lib/utils.js';

const register = async () => {
    console.log(chalk.magenta.bold('========================================'));
    console.log(chalk.cyan.bold('      CLAWNCHER AGENT REGISTRATION      '));
    console.log(chalk.magenta.bold('========================================\n'));

    let privateKey = config.adminPrivateKey;
    
    if (privateKey && validatePrivateKey(privateKey)) {
        log.info(`Using private key from ${chalk.yellow('.env (ADMIN_PRIVATE_KEY)')}`);
    } else if (fs.existsSync('admin_key.txt')) {
        privateKey = fs.readFileSync('admin_key.txt', 'utf8').trim();
        log.info(`Using private key from ${chalk.yellow('admin_key.txt')}`);
    } else {
        const answers = await inquirer.prompt([
            {
                type: 'password',
                name: 'key',
                message: 'Enter your main wallet private key to register (or save it in .env):',
                validate: (val) => validatePrivateKey(val) || 'Invalid private key format'
            }
        ]);
        privateKey = answers.key;
    }

    const { name, description } = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Enter agent name:',
            default: 'MyPremiumAgent'
        },
        {
            type: 'input',
            name: 'description',
            message: 'Enter agent description:',
            default: 'An automated token deployment agent'
        }
    ]);

    const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
    const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(config.rpcUrl)
    });

    const publicClient = createPublicClient({
        chain: base,
        transport: http(config.rpcUrl)
    });

    log.info('Registering agent on Base Mainnet...');

    try {
        const { apiKey } = await ClawnchApiDeployer.register({
            wallet: walletClient,
            publicClient: publicClient,
        }, {
            name: name,
            wallet: account.address,
            description: description,
        });

        console.log('\n' + chalk.green.bold('🎉 REGISTRATION SUCCESSFUL!'));
        console.log(chalk.cyan('----------------------------------------'));
        console.log(chalk.white('Your API Key: ') + chalk.yellow.bold(apiKey));
        console.log(chalk.cyan('----------------------------------------'));
        console.log(chalk.gray('\nCopy this key and paste it into .env as CLAWNCH_API_KEY.'));
    } catch (error) {
        log.error(`Registration failed: ${error.message}`);
    }
};

register();
