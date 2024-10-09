const web3 = require("@solana/web3.js");
const axios = require("axios");
const bs58 = require("bs58");
const fs = require('fs').promises;
const fetch = require('node-fetch'); // Ensure node-fetch is installed

const connection = new web3.Connection("https://damp-fabled-panorama.solana-mainnet.quiknode.pro/APIKEY/");

async function sendTransactionJito(serializedTransaction) {
    const encodedTx = bs58.encode(serializedTransaction);
    const jitoURL = "https://mainnet.block-engine.jito.wtf/api/v1/transactions";
    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [encodedTx],
    };

    try {
        const response = await axios.post(jitoURL, payload, {
            headers: { "Content-Type": "application/json" },
        });
        return response.data.result;
    } catch (error) {
        console.error("Error:", error);
        throw new Error("cannot send!");
    }
}

async function getJupiterSwapInstructions(fromAccountPublicKey, inputMint, outputMint, amountLamports, slippageBps = 100) {
    const quoteURL = `https://quote-api.jup.ag/v6/quote?onlyDirectRoutes=true&inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
    const quoteResponse = await (await fetch(quoteURL)).json();

    const swapInstructionsURL = 'https://quote-api.jup.ag/v6/swap-instructions';
    const body = {
        userPublicKey: fromAccountPublicKey.toString(),
        quoteResponse: quoteResponse,
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: 0,
        dynamicComputeUnitLimit: true,
    };

    const response = await fetch(swapInstructionsURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Failed to get swap instructions: ${response.statusText}`);
    }

    return response.json();
}

async function createPaymentTx(inputMint, outputMint, amountLamports, slippageBps, keypairPath) {
    const keypairData = await fs.readFile(keypairPath, { encoding: 'utf8' });
    const secretKey = Uint8Array.from(JSON.parse(keypairData));
    const fromAccount = web3.Keypair.fromSecretKey(secretKey);

    

    // Get Jupiter swap instructions
    const swapInstructionsResponse = await getJupiterSwapInstructions(fromAccount.publicKey, inputMint, outputMint, amountLamports, slippageBps);
    //console.log(swapInstructionsResponse)
    // Construct transaction with swap instructions and tip transfers
    const blockhash = await connection.getLatestBlockhash();
    const transaction = new web3.Transaction();
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

    // Add tip transfers
    transaction.add(
        web3.SystemProgram.transfer({
            fromPubkey: fromAccount.publicKey,
            toPubkey: new web3.PublicKey("juLesoSmdTcRtzjCzYzRoHrnF8GhVu6KCV7uxq7nJGp"), // Unruggable tip account
            lamports: 100_000, // tip
        }),
        web3.SystemProgram.transfer({
            fromPubkey: fromAccount.publicKey,
            toPubkey: new web3.PublicKey("DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL"), // Jito tip account
            lamports: 100_000, // tip
        }),
    );

    transaction.sign(fromAccount); // Sign the transaction
    const rawTransaction = transaction.serialize();
    const txid = await sendTransactionJito(rawTransaction);
    console.log(`Transaction ID: ${txid}`);
    return txid;
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

// Process command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
    console.log("Usage: node script.js <inputMint> <outputMint> <amountLamports> [slippageBps]");
    process.exit(1);
}

const [inputMint, outputMint, amountLamports, slippageBps = 500, keypairPath] = args;

// Validate amount
if (isNaN(amountLamports) || amountLamports <= 0) {
    console.error("Invalid amount. Please enter a positive number.");
    process.exit(1);
}

// Run the function and catch any errors
createPaymentTx(inputMint, outputMint, parseInt(amountLamports), slippageBps, keypairPath).catch(console.error);