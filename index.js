#!/usr/bin/env node
import { showMainMenu } from './src/cli/menu.js';

// Global Error Handling
process.on('uncaughtException', (err) => {
    console.error('\n[UNCAUGHT EXCEPTION]', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('\n[UNHANDLED REJECTION]', reason);
});

showMainMenu();
