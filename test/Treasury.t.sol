// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/Treasury.sol";
import "../contracts/Voting.sol";

contract RejectingContractor {
    receive() external payable {
        revert("nope");
    }
}

contract TreasuryTest is Test {
    Voting voting;
    Treasury treasury;

    address gov = address(0xA11CE);
    address alice = address(0xB0B);
    address bob = address(0xCA7);
    address carol = address(0xD09);
    address contractor = address(0xE1F);

    bytes32 constant PROBLEM = keccak256("problem-1");

    function setUp() public {
        vm.startPrank(gov);
        voting = new Voting();
        treasury = new Treasury(address(voting), gov);
        vm.stopPrank();

        vm.deal(gov, 100 ether);
    }

    function _openCompletionVoting() internal {
        vm.startPrank(gov);
        voting.moveToUnderProgress(PROBLEM);
        voting.assignContractor(PROBLEM, contractor);
        vm.stopPrank();

        vm.prank(contractor);
        voting.startCompletionVoting(PROBLEM);
    }

    function _approve(bool solved) internal {
        vm.prank(alice);
        voting.voteCompletion(PROBLEM, solved);
        vm.prank(bob);
        voting.voteCompletion(PROBLEM, solved);

        vm.prank(gov);
        voting.closeCompletionVoting(PROBLEM);
    }

    function testCreateEscrowPaysHalfUpFront() public {
        vm.prank(gov);
        treasury.createEscrow{value: 10 ether}(PROBLEM, contractor);

        assertEq(contractor.balance, 5 ether);
        assertEq(treasury.lockedBalance(), 5 ether);
        assertEq(address(treasury).balance, 5 ether);
    }

    function testOnlyGovCanCreateEscrow() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert("gov only");
        treasury.createEscrow{value: 1 ether}(PROBLEM, contractor);
    }

    function testDuplicateEscrowRejected() public {
        vm.startPrank(gov);
        treasury.createEscrow{value: 4 ether}(PROBLEM, contractor);
        vm.expectRevert("escrow exists");
        treasury.createEscrow{value: 4 ether}(PROBLEM, contractor);
        vm.stopPrank();
    }

    function testFinalizeReleasesRemainderWhenApproved() public {
        vm.prank(gov);
        treasury.createEscrow{value: 10 ether}(PROBLEM, contractor);

        _openCompletionVoting();
        _approve(true);

        vm.prank(gov);
        treasury.finalize(PROBLEM);

        assertEq(contractor.balance, 10 ether);
        assertEq(treasury.lockedBalance(), 0);
    }

    function testFinalizeRefundsGovernmentWhenRejected() public {
        uint256 govStart = gov.balance;

        vm.prank(gov);
        treasury.createEscrow{value: 10 ether}(PROBLEM, contractor);

        _openCompletionVoting();
        _approve(false);

        vm.prank(gov);
        treasury.finalize(PROBLEM);

        assertEq(contractor.balance, 5 ether);
        assertEq(gov.balance, govStart - 5 ether);
        assertEq(address(treasury).balance, 0);
    }

    function testFinalizeIsNotRepeatable() public {
        vm.prank(gov);
        treasury.createEscrow{value: 10 ether}(PROBLEM, contractor);

        _openCompletionVoting();
        _approve(true);

        vm.startPrank(gov);
        treasury.finalize(PROBLEM);
        vm.expectRevert("already settled");
        treasury.finalize(PROBLEM);
        vm.stopPrank();
    }

    function testFinalizeRejectedWhileVotingOpen() public {
        vm.prank(gov);
        treasury.createEscrow{value: 10 ether}(PROBLEM, contractor);

        _openCompletionVoting();

        vm.prank(gov);
        vm.expectRevert("not resolved");
        treasury.finalize(PROBLEM);
    }

    function testPayoutWorksForContractWallets() public {
        address wallet = address(new RejectingContractor());

        vm.prank(gov);
        vm.expectRevert("transfer failed");
        treasury.createEscrow{value: 2 ether}(PROBLEM, wallet);
    }

    function testSweepOnlyTakesUnlockedFunds() public {
        vm.prank(gov);
        treasury.createEscrow{value: 10 ether}(PROBLEM, contractor);

        vm.deal(address(this), 3 ether);
        (bool ok, ) = address(treasury).call{value: 3 ether}("");
        assertTrue(ok);

        assertEq(treasury.available(), 3 ether);

        vm.prank(gov);
        treasury.sweep(carol);

        assertEq(carol.balance, 3 ether);
        assertEq(address(treasury).balance, 5 ether);
    }
}
