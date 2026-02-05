// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../contracts/Voting.sol";
import "../contracts/Treasury.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address government = vm.envAddress("GOVERNMENT_ADDRESS");

        vm.startBroadcast(pk);

        Voting voting = new Voting();
        Treasury treasury = new Treasury(address(voting), government);

        vm.stopBroadcast();

        console.log("VOTING_ADDRESS", address(voting));
        console.log("TREASURY_ADDRESS", address(treasury));
        console.log("DEPLOY_BLOCK", block.number);
    }
}
