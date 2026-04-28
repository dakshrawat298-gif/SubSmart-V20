// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BillingHub} from "../src/BillingHub.sol";

/// @title  Deploy
/// @notice Forge broadcast script for deploying BillingHub to any EVM chain.
///
/// Required environment variables (set in contracts/.env, never committed):
///   PRIVATE_KEY           — 0x-prefixed private key of the deployer EOA.
///   AMOY_RPC_URL          — Polygon Amoy JSON-RPC endpoint.
///   POLYGONSCAN_API_KEY   — Polygonscan API key (needed for --verify).
///
/// Usage — see the step-by-step guide in docs/4_DEPLOYMENT.md.
contract Deploy is Script {
    function run() external {
        // ----------------------------------------------------------------
        // 1. Load deployer key from environment (never hardcoded).
        // ----------------------------------------------------------------
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer   = vm.addr(deployerPk);

        // ----------------------------------------------------------------
        // 2. For the testnet deployment the deployer's own address acts as
        //    the protocol treasury.  On mainnet, replace this with a
        //    dedicated multisig / governance address before running.
        // ----------------------------------------------------------------
        address treasury = deployer;

        console2.log("=== SubSmart BillingHub deployment ===");
        console2.log("Deployer  :", deployer);
        console2.log("Treasury  :", treasury);
        console2.log("Chain ID  :", block.chainid);

        // ----------------------------------------------------------------
        // 3. Broadcast all transactions signed by deployerPk.
        // ----------------------------------------------------------------
        vm.startBroadcast(deployerPk);

        BillingHub hub = new BillingHub(treasury);

        vm.stopBroadcast();

        // ----------------------------------------------------------------
        // 4. Log the deployed address — copy this into your .env.local as
        //    NEXT_PUBLIC_BILLING_HUB_ADDRESS_AMOY=<address>
        // ----------------------------------------------------------------
        console2.log("----------------------------------------------");
        console2.log("BillingHub deployed at:", address(hub));
        console2.log("----------------------------------------------");
        console2.log("Add to frontend .env.local:");
        console2.log(
            string.concat(
                "NEXT_PUBLIC_BILLING_HUB_ADDRESS_AMOY=",
                vm.toString(address(hub))
            )
        );
    }
}
