const web3 = require("@solana/web3.js");
const axios = require("axios");
const bs58 = require("bs58");
const fs = require('fs').promises;
const splToken = require("@solana/spl-token");

const connection = new web3.Connection("https://damp-fabled-panorama.solana-mainnet.quiknode.pro/186133957d30cece76e7cd8b04bce0c5795c164e/");

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

async function createPaymentTx(amountToken, tokenMintAddress, tokenDecimals, destinationAddress, keypairPath) {
  const lamportsPerSol = web3.LAMPORTS_PER_SOL;
  const keypairData = await fs.readFile(keypairPath, { encoding: 'utf8' });
  const secretKey = Uint8Array.from(JSON.parse(keypairData));
  const fromAccount = web3.Keypair.fromSecretKey(secretKey);

  const toAccount = new web3.PublicKey(destinationAddress);
  const blockhash = await connection.getLatestBlockhash();
  // Ensure amountToken and tokenDecimals are treated as integers
  amountToken = parseInt(amountToken, 10);
  tokenDecimals = parseInt(tokenDecimals, 10);
  // Determine units based on amountToken and tokenDecimals
  const computeUnits = (amountToken === 1 && tokenDecimals === 0) ? 29900 : 9900;
  const config = {
    compute: computeUnits,
    microLamports: 100000,
  };
  const computePriceIx = web3.ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: config.microLamports,
  });
  const computeLimitIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
    units: config.compute,
  });

  let instructions = [
    computePriceIx,
    computeLimitIx,
  ]

  // SPL Token transfer
  const tokenMint = new web3.PublicKey(tokenMintAddress);
  //Get the associated token accounts for sender and receiver
  const fromAssociatedTokenAccountPubkey = await splToken.getAssociatedTokenAddress(tokenMint, fromAccount.publicKey);
  const toAssociatedTokenAccountPubkey = await splToken.getAssociatedTokenAddress(tokenMint,toAccount);
  const fromTokenBalance = await connection.getTokenAccountBalance(fromAssociatedTokenAccountPubkey);
  
  // Check if the account already exists
  const accountInfo = await connection.getAccountInfo(toAssociatedTokenAccountPubkey);
  if (!accountInfo) {
    // The account does not exist, so create the instruction to initialize it
    instructions.push(
      splToken.createAssociatedTokenAccountInstruction(
        fromAccount.publicKey, // Payer of the transaction
        toAssociatedTokenAccountPubkey,
        toAccount,
        tokenMint,
      ),
    );
  }

  const amount = amountToken * Math.pow(10, tokenDecimals);

  instructions.push(
    splToken.createTransferInstruction(
      fromAssociatedTokenAccountPubkey,
      toAssociatedTokenAccountPubkey,
      fromAccount.publicKey,
      amount,
      [],
      splToken.TOKEN_PROGRAM_ID
    )
  );

  // Adding tipping and Jito here
  instructions.push(
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

  /* const transaction = new web3.Transaction({
    feePayer: fromAccount.publicKey,
    recentBlockhash: (await connection.getRecentBlockhash()).blockhash
  }).add(...instructions);
  
  // Sign the transaction with the sender's private key
  transaction.sign(fromAccount);
  
  try {
    // Send and confirm the transaction
    const txid = await web3.sendAndConfirmTransaction(connection, transaction, [fromAccount]);
    console.log(`Transaction ID: ${txid}`);
    return txid;
  } catch (error) {
    console.error('Error sending transaction:', error);
  } */

  const messageV0 = new web3.TransactionMessage({
    payerKey: fromAccount.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new web3.VersionedTransaction(messageV0);
  transaction.sign([fromAccount]);
  const rawTransaction = transaction.serialize();

  const txid = await sendTransactionJito(rawTransaction);
  console.log(`Transaction ID: ${txid}`);
  return txid;
}

// Assuming the command line arguments are in the order:
// <amountToken> <tokenMintAddress> <destinationAddress> <keypairPath>
const args = process.argv.slice(2);
if (args.length < 5) {
  console.log("Usage: node scriptName.js <amountToken> <tokenMintAddress> <tokenDecimals> <destinationAddress> <keypairPath>");
  process.exit(1);
}

const amountToken = parseFloat(args[0]);
const tokenMintAddress = args[1];
const tokenDecimals = args[2];
const destinationAddress = args[3];
const keypairPath = args[4];

// Validate amountToken
if (isNaN(amountToken) || amountToken <= 0) {
  console.error("Invalid token amount. Please enter a positive number.");
  process.exit(1);
}

// Validate tokenMintAddress
if (!web3.PublicKey.isOnCurve(tokenMintAddress)) {
  console.error("Invalid token mint address.");
  process.exit(1);
}

// Validate destinationAddress
if (!web3.PublicKey.isOnCurve(destinationAddress)) {
  console.error("Invalid destination address.");
  process.exit(1);
}

// Run the function and catch any errors
createPaymentTx(amountToken, tokenMintAddress, tokenDecimals, destinationAddress, keypairPath).catch(console.error);

