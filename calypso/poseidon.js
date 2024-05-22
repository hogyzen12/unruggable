const web3 = require("@solana/web3.js");
const axios = require("axios");
const bs58 = require("bs58");
const fs = require('fs').promises;

// Create a connection to the Solana network
const connection = new web3.Connection("https://damp-fabled-panorama.solana-mainnet.quiknode.pro/186133957d30cece76e7cd8b04bce0c5795c164e/");

// Function to get swap quote
async function getSwapQuote(inputMint, outputMint, amount) {
    try {
        const apiUrl = 'https://api.sanctum.so/v1/swap/quote';
        const params = {
            input: inputMint,
            outputLstMint: outputMint,
            amount: amount,
            mode: 'ExactIn'
        };

        const response = await axios.get(apiUrl, { params });
        
        if (response.status === 200) {
            return response.data;
        } else {
            throw new Error(`Failed to get swap quote. Status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error fetching swap quote:', error.message);
        throw error;
    }
}

// Function to submit the swap transaction
async function getSwapTransaction(quote, fromAccount, inputMint, connection) {
    try {
        const apiUrl = 'https://api.sanctum.so/v1/swap';
        
        // Prepare the transaction request body using inputMint dynamically
        const txRequestBody = {
            amount: quote.inAmount,
            dstLstAcc: null,
            input: inputMint, // Use the inputMint from the command line
            mode: "ExactIn",
            outputLstMint: quote.feeMint,
            priorityFee: {
                "Auto": {
                    "max_unit_price_micro_lamports": 3000,
                    "unit_limit": 1000000
                }
            },
            quotedAmount: quote.outAmount,
            signer: fromAccount.publicKey.toString(),
            srcAcc: null,
            swapSrc: quote.swapSrc
        };

        console.log('Transaction Request Body:', JSON.stringify(txRequestBody, null, 2));

        const response = await axios.post(apiUrl, txRequestBody, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const txEncoded = response.data.tx;
        console.log('Encoded Transaction:', txEncoded);

        // Deserialize the transaction
        const swapTransactionBuf = Buffer.from(txEncoded, 'base64');
        const transaction = web3.VersionedTransaction.deserialize(swapTransactionBuf);

        // Sign the transaction with the array of signers
        transaction.sign([fromAccount]);
        let swapTransaction = transaction.serialize();
        return swapTransaction
    } catch (error) {
        console.error('Error fetching transaction:', error.message);
    }
}

async function createTipTransaction(fromAccount, tipAccount1, tipAccount2, amountLamports) {
    const tipTransaction = new web3.Transaction();
    tipTransaction.feePayer = fromAccount.publicKey;
    const blockhash = await connection.getLatestBlockhash();
    tipTransaction.recentBlockhash = blockhash.blockhash;
    tipTransaction.feePayer = fromAccount.publicKey;

    tipTransaction.add(
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

    tipTransaction.sign(fromAccount);
    return tipTransaction.serialize();
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


// Main function to process command line arguments and execute the swap
async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 4) {
        console.error('Usage: node poseidon.js <inputMint> <outputMint> <amount> <keypairPath>');
        process.exit(1);
    }

    const [inputMint, outputMint, amount, keypairPath] = args;
    
    try {
        const keypairData = await fs.readFile(keypairPath, { encoding: 'utf8' });
        const secretKey = Uint8Array.from(JSON.parse(keypairData));
        const fromAccount = web3.Keypair.fromSecretKey(secretKey);

        const quote = await getSwapQuote(inputMint, outputMint, amount);
        console.log('Swap Quote:', quote);

        // Use the quote to submit the transaction
        const swapTxSerialized = await getSwapTransaction(quote, fromAccount, inputMint, connection);
        // Tip transaction
        const tipAccount1 = "juLesoSmdTcRtzjCzYzRoHrnF8GhVu6KCV7uxq7nJGp";
        const tipAccount2 = "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL";
        const tipTxSerialized = await createTipTransaction(fromAccount, tipAccount1, tipAccount2, 10000); // 0.01 SOL to each tip account

        const bundleId = await sendBundle([swapTxSerialized, tipTxSerialized]);
        console.log(`Bundle submitted with ID: ${bundleId}`);

    } catch (error) {
        console.error('Failed to execute swap:', error.message);
    }
}

// Run the main function
main();

tokens = [
    'LAinEtNLgpmCP9Rvsf5Hn8W6EhNiKLZQti1xfWMLy6X',
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    'fpSoL8EJ7UA5yJxFKWk1MFiWi35w8CbH36G5B9d7DsV',
    'pathdXw4He1Xk3eX84pDdDZnGKEme3GivBamGCVPZ5a',
    'iceSdwqztAQFuH6En49HWwMxwthKMnGzLFQcMN3Bqhj',
    'jucy5XJ76pHVvtPZb5TKRcGQExkwit2P5s4vY8UzmpC',
    '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm',
    'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v',
    'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A',        
    'BonK1YhkXEGLZzwtcvRTip3gAL9nCeQD7ppZBLXhtTs',
    'GRJQtWwdJmp5LLpy8JWjPgn5FnLyqSJGNhn5ZnCTFUwM',
    'Comp4ssDzXcLeu2MnLuGNNFC4cmLPMng8qWHPvzAMU1h',
    'HUBsveNpjo5pWqNkH57QzxjQASdTVXcSK7bVKTSZtcSX',        
    'picobAEvs6w7QEknPce34wAE4gknZA9v5tTonnmHYdX',
    'Dso1bDeDjCQxTrWHqUUi63oBvV7Mdm6WaobLbQ7gnPQ',
    'LnTRntk2kTfWEY6cVB8K9649pgJbt6dJLS1Ns1GZCWg',
    'phaseZSfPxTDBpiVb96H4XFSD8xHeHxZre5HerehBJG',
    'pumpkinsEq8xENVZE6QgTS93EN4r9iKvNxNALS1ooyp',
    'pWrSoLAhue6jUxUkbWgmEy5rD9VJzkFmvfTDV5KgNuu',
    'CgnTSoL3DgY9SFHxcLj6CgCgKKoTBr6tp4CPAEWy25DE',
    'So11111111111111111111111111111111111111112'
]