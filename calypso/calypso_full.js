const axios = require('axios');
const { Decimal } = require('decimal.js');
const fs = require('fs').promises;
const path = require('path');
const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');

// Define the assets and their initial values
const ASSETS = {
    "USDC": { "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "decimals": 6, "allocation": new Decimal('0.3') },
    "JTO": { "mint": "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", "decimals": 9, "allocation": new Decimal('0.1') },
    "WIF": { "mint": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", "decimals": 6, "allocation": new Decimal('0.0') },
    "SOL": { "mint": "So11111111111111111111111111111111111111112", "decimals": 9, "allocation": new Decimal('0.3') },
    "JUP": { "mint": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "decimals": 6, "allocation": new Decimal('0.1') },
    "JLP": {"mint": "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", "decimals": 6, "allocation": new Decimal('0.2') },
};

const TOKEN_IDS = {
    "SOL": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    "JUP": "0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
    "JTO": "b43660a5f790c69354b0729a5ef9d50d68f1df92107540210b9cccba1f947cc2",
    "WIF": "4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc",
    "JLP": "c811abc82b4bad1f9bd711a2773ccaa935b03ecef974236942cec5e0eb845a3a",
};

const RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key=API";
const KEYPAIR_PATH = "/Users/hogyzen12/.config/solana/C1PsoU8EPqheU3kv7Gzp6tAoj6UZ5Srtzm4S2f26zss.json";
const REBALANCE_THRESHOLD = new Decimal('0.0042');
const CHECK_INTERVAL = 60;

const STASH_THRESHOLD = new Decimal('10'); // $10 threshold for stashing
const STASH_AMOUNT = new Decimal('1'); // $1 to stash
const STASH_ADDRESS = new web3.PublicKey("StAshdD7TkoNrWqsrbPTwRjCdqaCfMgfVCwKpvaGhuC");
const USDC_MINT = new web3.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
// Add these new constants
const DOUBLE_STASH_THRESHOLD = STASH_THRESHOLD.mul(2);
let lastStashValue = null; // To store the portfolio value at the last stash event
let initialPortfolioValue = null; // To store the initial portfolio value
const connection = new web3.Connection(RPC_ENDPOINT);

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function getWalletAddressFromKeypairPath(keypairPath) {
    return path.basename(keypairPath, path.extname(keypairPath));
}

function printTrades(trades) {
    log("\nExecuting the following trades:");
    log("-".repeat(70));
    log("From   To     From Amount      To Amount      Value ($)");
    log("-".repeat(70));
    for (const trade of trades) {
        log(`${trade.from.padEnd(6)} ${trade.to.padEnd(6)} ${trade.fromAmount.toFixed(6).padStart(15)} ${trade.toAmount.toFixed(6).padStart(15)} ${trade.amount.toFixed(2).padStart(12)}`);
    }
    log("-".repeat(70));
}

async function getWalletBalances(walletAddress) {
    log("Fetching wallet balances...");
    try {
        const response = await axios.post(RPC_ENDPOINT, {
            jsonrpc: "2.0",
            id: "my-id",
            method: "getAssetsByOwner",
            params: {
                ownerAddress: walletAddress,
                page: 1,
                limit: 1000,
                displayOptions: {
                    showFungible: true,
                    showNativeBalance: true
                }
            }
        });

        const data = response.data;

        if ('error' in data) {
            throw new Error(`API Error: ${data.error.message}`);
        }

        if (!('result' in data)) {
            throw new Error("Unexpected API response format");
        }

        const balances = Object.fromEntries(
            Object.keys(ASSETS).map(asset => [asset, new Decimal('0')])
        );

        for (const item of data.result.items) {
            for (const [asset, details] of Object.entries(ASSETS)) {
                if (item.id === details.mint) {
                    const balance = new Decimal(item.token_info.balance).div(new Decimal(10).pow(details.decimals));
                    balances[asset] = balance;
                    break;
                }
            }
        }

        if ('nativeBalance' in data.result) {
            const solLamports = new Decimal(data.result.nativeBalance.lamports);
            balances['SOL'] = solLamports.div(new Decimal(10).pow(ASSETS['SOL'].decimals));
        }

        log("Wallet balances fetched successfully");
        return balances;
    } catch (error) {
        log(`Error fetching wallet balances: ${error.message}`);
        throw error;
    }
}

async function getPrices() {
    log("Fetching asset prices...");
    try {
        const url = "https://hermes.pyth.network/v2/updates/price/latest";
        const params = new URLSearchParams(
            Object.values(TOKEN_IDS).map(id => ['ids[]', id])
        );
        params.append('parsed', 'true');

        const response = await axios.get(url, { params });
        const data = response.data;

        const prices = {};
        for (const item of data.parsed) {
            const token = Object.keys(TOKEN_IDS).find(key => TOKEN_IDS[key] === item.id);
            const price = new Decimal(item.price.price).mul(new Decimal(10).pow(item.price.expo));
            prices[token] = price;
        }

        prices["USDC"] = new Decimal('1.0');

        log("Asset prices fetched successfully");
        return prices;
    } catch (error) {
        log(`Error fetching asset prices: ${error.message}`);
        throw error;
    }
}

function calculatePortfolioValue(balances, prices) {
    const totalValue = Object.keys(ASSETS).reduce((total, asset) => {
        return total.add(balances[asset].mul(prices[asset]));
    }, new Decimal(0));

    const usdcValue = balances['USDC'].mul(prices['USDC']);

    return { totalValue, usdcValue };
}

function calculateRebalanceAmounts(balances, prices, totalValue) {
    const rebalanceAmounts = {};

    for (const asset of Object.keys(ASSETS)) {
        const currentValue = balances[asset].mul(prices[asset]);
        const targetValue = totalValue.mul(ASSETS[asset].allocation);
        const targetAmount = targetValue.div(prices[asset]);
        const rebalanceAmount = targetAmount.minus(balances[asset]);
        rebalanceAmounts[asset] = rebalanceAmount.toDecimalPlaces(6, Decimal.ROUND_DOWN);
    }

    return rebalanceAmounts;
}

function printSwaps(swaps) {
    log("\nExecuting the following swaps:");
    log("-".repeat(40));
    log("From   To     Amount      Value ($)");
    log("-".repeat(40));
    for (const swap of swaps) {
        log(`${swap.from.padEnd(6)} ${swap.to.padEnd(6)} ${swap.amount.toFixed(6).padStart(12)} ${swap.value.toFixed(2).padStart(12)}`);
    }
    log("-".repeat(40));
}

function printPortfolio(balances, prices, totalValue) {
    log("\nCurrent Portfolio:");
    log("------------------");
    log("Asset  Balance      Value ($)   Allocation  Target");
    log("-".repeat(57));
    for (const asset of Object.keys(ASSETS)) {
        const balance = balances[asset];
        const value = balance.mul(prices[asset]);
        const allocation = value.div(totalValue).mul(100);
        const targetAllocation = ASSETS[asset].allocation.mul(100);
        log(`${asset.padEnd(6)} ${balance.toFixed(3).padStart(12)} ${value.toFixed(2).padStart(12)} ${allocation.toFixed(2).padStart(11)}% ${targetAllocation.toFixed(2).padStart(8)}%`);
    }
    log("-".repeat(57));
    log(`${"Total".padEnd(6)} ${" ".repeat(12)} ${totalValue.toFixed(2).padStart(12)} ${"100.00%".padStart(11)} ${"100.00%".padStart(8)}`);
}

async function getJupiterSwapInstructions(fromAccountPublicKey, inputMint, outputMint, amountLamports, slippageBps = 100) {
    log(`Getting Jupiter swap instructions for ${inputMint} to ${outputMint}...`);
    try {
        const quoteURL = `https://quote-api.jup.ag/v6/quote?onlyDirectRoutes=true&inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
        const quoteResponse = await axios.get(quoteURL);

        const swapInstructionsURL = 'https://quote-api.jup.ag/v6/swap-instructions';
        const body = {
            userPublicKey: fromAccountPublicKey.toString(),
            quoteResponse: quoteResponse.data,
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 0,
            dynamicComputeUnitLimit: true,
        };

        const response = await axios.post(swapInstructionsURL, body);

        if (response.status !== 200) {
            throw new Error(`Failed to get swap instructions: ${response.statusText}`);
        }

        log("Jupiter swap instructions fetched successfully");
        return response.data;
    } catch (error) {
        log(`Error getting Jupiter swap instructions: ${error.message}`);
        throw error;
    }
}

function createTransactionInstruction(instructionData) {
    const { programId, accounts, data } = instructionData;
    return new web3.TransactionInstruction({
        programId: new web3.PublicKey(programId),
        keys: accounts.map(acc => ({
            pubkey: new web3.PublicKey(acc.pubkey),
            isSigner: acc.isSigner,
            isWritable: acc.isWritable
        })),
        data: Buffer.from(data, 'base64'),
    });
}

async function createSwapTransaction(fromAccount, inputAsset, outputAsset, amount) {
    log(`Creating swap transaction for ${inputAsset} to ${outputAsset}...`);
    try {
        const inputMint = ASSETS[inputAsset].mint;
        const outputMint = ASSETS[outputAsset].mint;
        const amountLamports = amount.mul(new Decimal(10).pow(ASSETS[inputAsset].decimals)).toFixed(0);

        const swapInstructionsResponse = await getJupiterSwapInstructions(fromAccount.publicKey, inputMint, outputMint, amountLamports);

        const blockhash = await connection.getLatestBlockhash();
        const transaction = new web3.Transaction();
        transaction.recentBlockhash = blockhash.blockhash;
        transaction.feePayer = fromAccount.publicKey;

        swapInstructionsResponse.computeBudgetInstructions.forEach(instructionData => {
            transaction.add(createTransactionInstruction(instructionData));
        });

        swapInstructionsResponse.setupInstructions.forEach(instructionData => {
            transaction.add(createTransactionInstruction(instructionData));
        });

        transaction.add(createTransactionInstruction(swapInstructionsResponse.swapInstruction));

        if (swapInstructionsResponse.cleanupInstruction) {
            transaction.add(createTransactionInstruction(swapInstructionsResponse.cleanupInstruction));
        }

        transaction.sign(fromAccount);
        log("Swap transaction created successfully");
        return transaction;
    } catch (error) {
        log(`Error creating swap transaction: ${error.message}`);
        throw error;
    }
}

async function createTipTransaction(fromAccount, stashAmount = null) {
    log("Creating tip and stash transaction...");
    try {
        const tipAndStashTransaction = new web3.Transaction();
        const blockhash = await connection.getLatestBlockhash();

        tipAndStashTransaction.recentBlockhash = blockhash.blockhash;
        tipAndStashTransaction.feePayer = fromAccount.publicKey;

        // Add tip transfers
        tipAndStashTransaction.add(
            web3.SystemProgram.transfer({
                fromPubkey: fromAccount.publicKey,
                toPubkey: new web3.PublicKey("juLesoSmdTcRtzjCzYzRoHrnF8GhVu6KCV7uxq7nJGp"),
                lamports: 100_000,
            }),
            web3.SystemProgram.transfer({
                fromPubkey: fromAccount.publicKey,
                toPubkey: new web3.PublicKey("DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL"),
                lamports: 100_000,
            })
        );

        // Add stash transfer if stashAmount is provided
        if (stashAmount) {
            // Find the from token account (USDC account of the sender)
            const fromTokenAccount = await splToken.getAssociatedTokenAddress(
                USDC_MINT,
                fromAccount.publicKey
            );

            // Find or create the to token account (USDC account of the receiver)
            const toTokenAccount = await splToken.getAssociatedTokenAddress(
                USDC_MINT,
                STASH_ADDRESS
            );

            // Check if the receiver's token account exists
            const receiverAccountInfo = await connection.getAccountInfo(toTokenAccount);
            if (receiverAccountInfo === null) {
                // If the account doesn't exist, add instruction to create it
                tipAndStashTransaction.add(
                    splToken.createAssociatedTokenAccountInstruction(
                        fromAccount.publicKey,
                        toTokenAccount,
                        STASH_ADDRESS,
                        USDC_MINT
                    )
                );
            }

            // Convert stashAmount to USDC token amount (considering 6 decimals for USDC)
            const stashTokenAmount = stashAmount.mul(new Decimal(10).pow(ASSETS['USDC'].decimals)).toFixed(0);

            // Add the token transfer instruction
            tipAndStashTransaction.add(
                splToken.createTransferInstruction(
                    fromTokenAccount,
                    toTokenAccount,
                    fromAccount.publicKey,
                    BigInt(stashTokenAmount)
                )
            );
        }

        tipAndStashTransaction.sign(fromAccount);
        log("Tip and stash transaction created successfully");
        return tipAndStashTransaction;
    } catch (error) {
        log(`Error creating tip and stash transaction: ${error.message}`);
        throw error;
    }
}


async function sendBundle(transactions) {
    log("Sending transaction bundle...");
    try {
        const encodedTransactions = transactions.map(tx => bs58.encode(tx.serialize()));
        const bundleData = {
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [encodedTransactions]
        };

        const response = await axios.post('https://mainnet.block-engine.jito.wtf/api/v1/bundles', bundleData, {
            headers: { 'Content-Type': 'application/json' }
        });
        log("Transaction bundle sent successfully");
        return response.data.result;
    } catch (error) {
        if (error.response) {
            log(`Error sending bundle: ${error.message}`);
            log(`Response status: ${error.response.status}`);
            log(`Response data: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            log(`Error sending bundle: No response received`);
            log(`Request: ${JSON.stringify(error.request)}`);
        } else {
            log(`Error sending bundle: ${error.message}`);
        }
        throw new Error("Failed to send bundle. Check logs for details.");
    }
}

async function executeStashAndRebalance(rebalanceAmounts, prices, fromAccount, totalValue, usdcValue, delta) {
    log("Executing stash and rebalance operation...");
    let stashAmount = STASH_AMOUNT;
    let doubleStashTriggered = false;

    if (delta.gte(DOUBLE_STASH_THRESHOLD)) {
        doubleStashTriggered = true;
        stashAmount = STASH_AMOUNT.mul(2);
        log("Double stash threshold reached.");
    }

    try {
        // Print stash operation
        log(`Stashing $${stashAmount} USDC to ${STASH_ADDRESS}`);

        // Print trades before creating transactions
        const trades = [];
        for (const [asset, amount] of Object.entries(rebalanceAmounts)) {
            if (asset !== "USDC" && amount.abs().gt(new Decimal('0.01'))) {
                const tradeValue = amount.abs().mul(prices[asset]);
                if (amount.gt(0)) {
                    trades.push({
                        from: "USDC",
                        to: asset,
                        amount: tradeValue,
                        fromAmount: tradeValue,
                        toAmount: amount
                    });
                } else {
                    trades.push({
                        from: asset,
                        to: "USDC",
                        amount: tradeValue,
                        fromAmount: amount.abs(),
                        toAmount: tradeValue
                    });
                }
            }
        }

        if (trades.length > 0) {
            printTrades(trades);
        } else {
            log("No trades needed for rebalancing after stash.");
        }

        // Create stash transaction
        const stashTransaction = await createTipTransaction(fromAccount, stashAmount);

        // Create rebalance transactions
        const swapTransactions = await createRebalanceTransactions(rebalanceAmounts, prices, fromAccount);

        // Combine all transactions
        const allTransactions = [...swapTransactions, stashTransaction];

        // Send the bundle
        const bundleId = await sendBundle(allTransactions);
        log(`Bundle submitted with ID: ${bundleId}`);
        log(`Stashed $${stashAmount} to ${STASH_ADDRESS}`);
        log(`Processed ${swapTransactions.length} swap(s) and 1 stash transaction.`);

        // Wait for 15 seconds before checking the result
        log("Waiting for 15 seconds before verifying the transactions...");
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Verify the transactions
        const updatedBalances = await getWalletBalances(fromAccount.publicKey.toString());
        const updatedPrices = await getPrices();
        const { totalValue: updatedTotalValue } = calculatePortfolioValue(updatedBalances, updatedPrices);

        log("\nUpdated portfolio after stash and rebalance:");
        printPortfolio(updatedBalances, updatedPrices, updatedTotalValue);

        // Check if the rebalance was successful
        const newAllocations = Object.fromEntries(
            Object.keys(ASSETS).map(asset => [
                asset,
                updatedBalances[asset].mul(updatedPrices[asset]).div(updatedTotalValue)
            ])
        );

        const rebalanceSuccessful = Object.entries(newAllocations).every(
            ([asset, alloc]) => alloc.minus(ASSETS[asset].allocation).abs().lte(REBALANCE_THRESHOLD)
        );

        if (rebalanceSuccessful) {
            log("Stash and rebalance operation was successful.");
            // Update lastStashValue and initialPortfolioValue
            lastStashValue = updatedTotalValue;
            initialPortfolioValue = updatedTotalValue;
            log(`Updated last stash value to: $${lastStashValue.toFixed(2)}`);
            log(`Reset initial portfolio value to: $${initialPortfolioValue.toFixed(2)}`);

            if (doubleStashTriggered) {
                log("Double stash completed.");
            }
        } else {
            log("Stash and rebalance operation may not have been fully successful. Please check the updated portfolio.");
        }

    } catch (error) {
        log(`Failed to execute stash and rebalance: ${error.message}`);
    }
}

async function executeRebalance(rebalanceAmounts, prices, fromAccount, totalValue, usdcValue) {
    log("Executing rebalance operation...");
    try {
        // Print trades before creating transactions
        const trades = [];
        for (const [asset, amount] of Object.entries(rebalanceAmounts)) {
            if (asset !== "USDC" && amount.abs().gt(new Decimal('0.01'))) {
                const tradeValue = amount.abs().mul(prices[asset]);
                if (amount.gt(0)) {
                    trades.push({
                        from: "USDC",
                        to: asset,
                        amount: tradeValue,
                        fromAmount: tradeValue,
                        toAmount: amount
                    });
                } else {
                    trades.push({
                        from: asset,
                        to: "USDC",
                        amount: tradeValue,
                        fromAmount: amount.abs(),
                        toAmount: tradeValue
                    });
                }
            }
        }

        if (trades.length > 0) {
            printTrades(trades);
        } else {
            log("No trades needed for rebalancing.");
            return;
        }

        const swapTransactions = await createRebalanceTransactions(rebalanceAmounts, prices, fromAccount);
        
        // Create tip transaction
        const tipTransaction = await createTipTransaction(fromAccount);

        // Combine swap transactions with tip transaction
        const allTransactions = [...swapTransactions, tipTransaction];

        // Send the bundle
        const bundleId = await sendBundle(allTransactions);
        log(`Bundle submitted with ID: ${bundleId}`);
        log(`Processed ${swapTransactions.length} swap(s) and 1 tip transaction.`);

        // Wait for 15 seconds before checking the result
        log("Waiting for 15 seconds before verifying the transactions...");
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Verify the transactions
        const updatedBalances = await getWalletBalances(fromAccount.publicKey.toString());
        const updatedPrices = await getPrices();
        const { totalValue: updatedTotalValue } = calculatePortfolioValue(updatedBalances, updatedPrices);

        log("\nUpdated portfolio after rebalancing:");
        printPortfolio(updatedBalances, updatedPrices, updatedTotalValue);

        // Check if the rebalance was successful
        const newAllocations = Object.fromEntries(
            Object.keys(ASSETS).map(asset => [
                asset,
                updatedBalances[asset].mul(updatedPrices[asset]).div(updatedTotalValue)
            ])
        );

        const rebalanceSuccessful = Object.entries(newAllocations).every(
            ([asset, alloc]) => alloc.minus(ASSETS[asset].allocation).abs().lte(REBALANCE_THRESHOLD)
        );

        if (rebalanceSuccessful) {
            log("Rebalance operation was successful.");
        } else {
            log("Rebalance operation may not have been fully successful. Please check the updated portfolio.");
        }

    } catch (error) {
        log(`Failed to execute rebalance: ${error.message}`);
    }
}

async function createRebalanceTransactions(rebalanceAmounts, prices, fromAccount) {
    const swapTransactions = [];

    for (const [asset, amount] of Object.entries(rebalanceAmounts)) {
        if (asset !== "USDC" && amount.abs().gt(new Decimal('0.01'))) {
            if (amount.gt(0)) {
                const usdcAmount = amount.mul(prices[asset]).toDecimalPlaces(6, Decimal.ROUND_DOWN);
                swapTransactions.push(await createSwapTransaction(fromAccount, "USDC", asset, usdcAmount));
            } else if (amount.lt(0)) {
                swapTransactions.push(await createSwapTransaction(fromAccount, asset, "USDC", amount.abs()));
            }
        }
    }

    return swapTransactions;
}

async function rebalancePortfolio() {
    const walletAddress = getWalletAddressFromKeypairPath(KEYPAIR_PATH);
    log(`Wallet address: ${walletAddress}`);

    try {
        const keypairData = await fs.readFile(KEYPAIR_PATH, { encoding: 'utf8' });
        const secretKey = Uint8Array.from(JSON.parse(keypairData));
        const fromAccount = web3.Keypair.fromSecretKey(secretKey);

        while (true) {
            try {
                log("\n--- Starting portfolio check ---");
                const balances = await getWalletBalances(walletAddress);
                log("Balances fetched successfully");

                const prices = await getPrices();
                log("Prices fetched successfully");

                const { totalValue, usdcValue } = calculatePortfolioValue(balances, prices);
                log(`Total portfolio value: $${totalValue.toFixed(2)}`);

                // Initialize initialPortfolioValue if it hasn't been set
                if (initialPortfolioValue === null) {
                    initialPortfolioValue = totalValue;
                    log(`Initialized initial portfolio value to: $${initialPortfolioValue.toFixed(2)}`);
                }

                // Calculate DELTA
                const delta = initialPortfolioValue ? totalValue.minus(initialPortfolioValue) : new Decimal(0);
                log(`Current DELTA: $${delta.toFixed(2)}`);

                printPortfolio(balances, prices, totalValue);

                const rebalanceAmounts = calculateRebalanceAmounts(balances, prices, totalValue);
                log("Rebalance amounts calculated");

                const currentAllocations = Object.fromEntries(
                    Object.keys(ASSETS).map(asset => [
                        asset,
                        balances[asset].mul(prices[asset]).div(totalValue)
                    ])
                );

                const needRebalance = Object.entries(currentAllocations).some(
                    ([asset, alloc]) => alloc.minus(ASSETS[asset].allocation).abs().gt(REBALANCE_THRESHOLD)
                );

                // Check for stashing first, independent of rebalancing needs
                if (lastStashValue && (delta.gte(STASH_THRESHOLD) || delta.lte(STASH_THRESHOLD.neg()))) {
                    log("Stashing threshold reached. Executing stash operation.");
                    await executeStashAndRebalance(rebalanceAmounts, prices, fromAccount, totalValue, usdcValue, delta);
                } else if (needRebalance) {
                    log("\nRebalancing needed. Executing rebalance operation.");
                    await executeRebalance(rebalanceAmounts, prices, fromAccount, totalValue, usdcValue);
                } else {
                    log("\nPortfolio is balanced and no stashing needed.");
                }

                // Update lastStashValue if it hasn't been set yet
                if (lastStashValue === null) {
                    lastStashValue = totalValue;
                    log(`Initialized last stash value to: $${lastStashValue.toFixed(2)}`);
                }

            } catch (error) {
                log(`An error occurred during the portfolio check: ${error.message}`);
                if (error.response) {
                    log(`Response data: ${JSON.stringify(error.response.data)}`);
                    log(`Response status: ${error.response.status}`);
                    log(`Response headers: ${JSON.stringify(error.response.headers)}`);
                }
            }

            log(`\nWaiting ${CHECK_INTERVAL} seconds before next check...`);
            await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL * 1000));
        }
    } catch (error) {
        log(`Failed to read keypair file: ${error.message}`);
    }
}

// Start the rebalancing process
rebalancePortfolio().catch(error => {
    log(`Fatal error in rebalancePortfolio: ${error.message}`);
    process.exit(1);
});