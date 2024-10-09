#!/bin/bash

# Define the address and API key
ADDRESS="6tBou5MHL5aWpDy6cgf3wiwGGK2mR8qs68ujtpaoWrf2"
API_KEY="5adcfebf-b520-4bcd-92ee-b4861e5e7b5b"

# Define the output file name based on the address
OUTPUT_FILE="${ADDRESS}_transactions.json"

# Make the curl request and save the response to the output file
#curl -L "https://api.helius.xyz/v0/addresses/${ADDRESS}/transactions?api-key=${API_KEY}" -o ${OUTPUT_FILE}

# Parse the transactions, filter by feePayer, sort by timestamp, and display the required fields
cat ${OUTPUT_FILE} | jq -r --arg ADDRESS "$ADDRESS" '
    .[] | select(.feePayer == $ADDRESS)
    "\(.description)\n\(.signature)\n----"
'
