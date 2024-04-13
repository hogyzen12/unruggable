# Unruggable Setup Guide

Welcome to the Unruggable. 
This will guide you in setting up Unruggable on your computer and beginning your self custody journey on Solana.

## Prerequisites

Before we begin, make sure you have the following:

- Internet connection
- 3 minutes of free time

Unruggable is compatible with nearly any Operating System, Windows, MacOS or Linux.
WSL2 will be needed if you will be using Windows. 
WSL2 is a Linux environment within Windows, developed and supported by Microsoft.

#### Step 0: Windows Users only, ignore if MacOs or Ubuntu

Install WSL2 following the Microsoft Guide in the link below, an alternative resource is also provided:
--------------------------------------------------------------------
https://learn.microsoft.com/en-us/windows/wsl/install
--------------------------------------------------------------------
https://www.omgubuntu.co.uk/how-to-install-wsl2-on-windows-10
--------------------------------------------------------------------

**TL;DR - if u lazy to read**
Get WSL2 on your Windows PC.
Open up Powershell (start button, search powershell, right click, open as administrator).
Once open simply paste:
wsl --install
and press enter.

Follow any Instructions and then launch Ubuntu, by typing Ubuntu in the windows menu.

#### Step 1: Setting Up Unruggable

Open up a terminal. 

- **Windows**: Open windows menu and search for Ubuntu and open it. (This is what you installed in Step 0)
- **macOS**: Use Spotlight search (`Cmd + Space`), type "Terminal", and press Enter.
- **Linux**: Press `Ctrl + Alt + T` or search for "Terminal" in your applications menu.

Once the terminal is open, paste each command below into the terminal and press enter.

1. **Clone the Unruggable Repository**:
   ```bash
   git clone https://github.com/hogyzen12/unruggable
   ```
2. **Launch Unruggable**:
   ```bash
   cd unruggable && chmod u+x unruggable.sh && ./unruggable.sh
   ```
## Usage

After installation, you can run Unruggable in your terminal simply by typing:

```bash
unruggable
```

## Demo
**CALYPSO**
#### Integrations: Executing JUP swaps with Jito
![CALYPSO](https://shdw-drive.genesysgo.net/3UgjUKQ1CAeaecg5CWk88q9jGHg8LJg9MAybp4pevtFz/calypso.gif)

**HERMES**
#### Integrations: Executing transfers swaps with Jito
![CALYPSO](https://shdw-drive.genesysgo.net/3UgjUKQ1CAeaecg5CWk88q9jGHg8LJg9MAybp4pevtFz/HERMES.gif)


#### Option 0: Receive
![0 - Receive](https://shdw-drive.genesysgo.net/3UgjUKQ1CAeaecg5CWk88q9jGHg8LJg9MAybp4pevtFz/rec.gif)

#### Option 2: Send Tokens
![2 - Send Tokens](https://shdw-drive.genesysgo.net/3UgjUKQ1CAeaecg5CWk88q9jGHg8LJg9MAybp4pevtFz/sendTokens.gif)

#### Option 3: Display and Send NFTs
![3 - Create New Wallet](https://shdw-drive.genesysgo.net/3UgjUKQ1CAeaecg5CWk88q9jGHg8LJg9MAybp4pevtFz/NFTs.gif)

#### Option 4: Display Available Wallets and Switch
![4 - Display Available Wallets and Switch](https://shdw-drive.genesysgo.net/3UgjUKQ1CAeaecg5CWk88q9jGHg8LJg9MAybp4pevtFz/switch.gif)

#### Option 5: Stake SOL
![4 - Display Available Wallets and Switch](https://shdw-drive.genesysgo.net/3UgjUKQ1CAeaecg5CWk88q9jGHg8LJg9MAybp4pevtFz/stakoor.gif)

#### Option 7: New wallet Keygen
- **Vanity**:
![71 - Create New Wallet](https://shdw-drive.genesysgo.net/3UgjUKQ1CAeaecg5CWk88q9jGHg8LJg9MAybp4pevtFz/vanity.gif)

- **Mnemonic**:
![72 - Create New Wallet](https://shdw-drive.genesysgo.net/3UgjUKQ1CAeaecg5CWk88q9jGHg8LJg9MAybp4pevtFz/menmonic.gif)

#### Option 8: Set Custom RPC
![8 - Switch RPC](https://shdw-drive.genesysgo.net/3UgjUKQ1CAeaecg5CWk88q9jGHg8LJg9MAybp4pevtFz/RPC.gif)

