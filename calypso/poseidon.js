const web3 = require("@solana/web3.js");
const axios = require("axios");
const bs58 = require("bs58");
const fs = require('fs').promises;

const connection = new web3.Connection("https://damp-fabled-panorama.solana-mainnet.quiknode.pro/186133957d30cece76e7cd8b04bce0c5795c164e/");

async function getJupiterSwapInstructions(fromAccountPublicKey, inputMint, outputMint, amountLamports, slippageBps = 200) {
    const quoteURL = `https://quote-api.jup.ag/v6/quote?onlyDirectRoutes=true&inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
    const quoteResponse = await axios.get(quoteURL).then(res => res.data);

    const swapInstructionsURL = 'https://quote-api.jup.ag/v6/swap-instructions';
    const body = {
        userPublicKey: fromAccountPublicKey.toString(),
        quoteResponse: quoteResponse,
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: 0,
        dynamicComputeUnitLimit: true,
    };

    const response = await axios.post(swapInstructionsURL, body, {
        headers: { 'Content-Type': 'application/json' },
    });

    if (!response.data) {
        throw new Error(`Failed to get swap instructions: ${response.statusText}`);
    }

    return response.data;
}

async function createSwapTransaction(fromAccount, inputMint, outputMint, amountLamports, slippageBps) {
    const swapInstructionsResponse = await getJupiterSwapInstructions(fromAccount.publicKey, inputMint, outputMint, amountLamports, slippageBps);

    const transaction = new web3.Transaction();
    const blockhash = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash.blockhash;
    transaction.feePayer = fromAccount.publicKey;

    // Add compute budget instructions
    swapInstructionsResponse.computeBudgetInstructions.forEach(instructionData => {
        transaction.add(createTransactionInstruction(instructionData));
    });

    // Add setup instructions
    swapInstructionsResponse.setupInstructions.forEach(instructionData => {
        transaction.add(createTransactionInstruction(instructionData));
    });

    // Add the main swap instruction
    transaction.add(createTransactionInstruction(swapInstructionsResponse.swapInstruction));

    // Add cleanup instructions if any
    if (swapInstructionsResponse.cleanupInstruction) {
        transaction.add(createTransactionInstruction(swapInstructionsResponse.cleanupInstruction));
    }

    transaction.sign(fromAccount);
    return transaction.serialize();
}

// Helper function to create a TransactionInstruction from raw instruction data
function createTransactionInstruction(instructionData) {
    const { programId, accounts, data } = instructionData;
    return new web3.TransactionInstruction({
        programId: new web3.PublicKey(programId),
        keys: accounts.map(acc => ({
            pubkey: new web3.PublicKey(acc.pubkey),
            isSigner: acc.isSigner,
            isWritable: acc.isWritable
        })),
        data: Buffer.from(data, 'base64'), // Assuming the data is base64 encoded
    });
}

async function createTipTransaction(fromAccount, tipAccount1, tipAccount2, amountLamports) {
    const transaction = new web3.Transaction();
    const blockhash = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash.blockhash;
    transaction.feePayer = fromAccount.publicKey;

    transaction.add(
        web3.SystemProgram.transfer({
            fromPubkey: fromAccount.publicKey,
            toPubkey: new web3.PublicKey(tipAccount1),
            lamports: amountLamports
        }),
        web3.SystemProgram.transfer({
            fromPubkey: fromAccount.publicKey,
            toPubkey: new web3.PublicKey(tipAccount2),
            lamports: amountLamports
        })
    );

    transaction.sign(fromAccount);
    return transaction.serialize();
}

async function sendBundle(transactions) {
    const encodedTransactions = transactions.map(tx => bs58.encode(tx));
    console.log(encodedTransactions);
    const bundleData = {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [encodedTransactions]
    };

    try {
        const response = await axios.post('https://mainnet.block-engine.jito.wtf/api/v1/bundles', bundleData, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data.result;
    } catch (error) {
        console.error("Error sending bundle:", error);
        throw new Error("Failed to send bundle.");
    }
}

async function main() {
    const keypairPath = '/Users/hogyzen12/.config/solana/6tBou5MHL5aWpDy6cgf3wiwGGK2mR8qs68ujtpaoWrf2.json';
    const keypairData = await fs.readFile(keypairPath, { encoding: 'utf8' });
    const secretKey = Uint8Array.from(JSON.parse(keypairData));
    const fromAccount = web3.Keypair.fromSecretKey(secretKey);

    // Prepare parameters for the swap transaction
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL mint
    const outputMint = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'; // juicySOL mint
    const amountLamports = 100000000; // Amount of lamports to swap (0.1 SOL)
    const slippageBps = 200; // Slippage tolerance

    const swapTxSerialized = await createSwapTransaction(fromAccount, inputMint, outputMint, amountLamports, slippageBps);

    // Tip transaction
    const tipAccount1 = "juLesoSmdTcRtzjCzYzRoHrnF8GhVu6KCV7uxq7nJGp";
    const tipAccount2 = "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL";
    const tipTxSerialized = await createTipTransaction(fromAccount, tipAccount1, tipAccount2, 10000); // 0.01 SOL to each tip account

    const bundleId = await sendBundle([swapTxSerialized, tipTxSerialized]);
    console.log(`Bundle submitted with ID: ${bundleId}`);
}

main().catch(console.error);
