// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/Voting.sol";

contract VotingTest is Test {
    Voting voting;

    address gov = address(0xA11CE);
    address alice = address(0xB0B);
    address bob = address(0xCA7);
    address carol = address(0xD09);
    address contractor = address(0xE1F);

    bytes32 constant PROBLEM = keccak256("problem-1");

    function setUp() public {
        vm.prank(gov);
        voting = new Voting();
    }

    function _toUnderProgress() internal {
        vm.startPrank(gov);
        voting.moveToUnderProgress(PROBLEM);
        voting.assignContractor(PROBLEM, contractor);
        vm.stopPrank();
    }

    function testQuadraticCostScalesWithTotal() public {
        vm.prank(alice);
        voting.vote(PROBLEM, 3);

        assertEq(voting.creditsOf(alice), 91);
        assertEq(voting.getUserVotes(alice, PROBLEM), 3);

        vm.prank(alice);
        voting.vote(PROBLEM, 2);

        assertEq(voting.creditsOf(alice), 75);
        assertEq(voting.getTotalVotes(PROBLEM), 5);
    }

    function testCreditsDoNotRefillWhenSpent() public {
        vm.prank(alice);
        voting.vote(PROBLEM, 10);

        assertEq(voting.creditsOf(alice), 0);

        vm.prank(alice);
        vm.expectRevert("insufficient credits");
        voting.vote(PROBLEM, 1);
    }

    function testCreditsRefillOnNewRound() public {
        vm.prank(alice);
        voting.vote(PROBLEM, 10);
        assertEq(voting.creditsOf(alice), 0);

        vm.prank(gov);
        voting.newRound();

        assertEq(voting.creditsOf(alice), 100);
        assertEq(voting.getUserVotes(alice, PROBLEM), 0);
        assertEq(voting.getTotalVotes(PROBLEM), 0);
    }

    function testOnlyOwnerCanClosePhase() public {
        vm.prank(alice);
        vm.expectRevert("not owner");
        voting.moveToUnderProgress(PROBLEM);
    }

    function testVotingClosedAfterPhaseMove() public {
        vm.prank(gov);
        voting.moveToUnderProgress(PROBLEM);

        vm.prank(alice);
        vm.expectRevert("voting closed");
        voting.vote(PROBLEM, 1);
    }

    function testContractorCanStartCompletionVoting() public {
        _toUnderProgress();

        vm.prank(contractor);
        voting.startCompletionVoting(PROBLEM);

        assertEq(uint256(voting.getPhase(PROBLEM)), uint256(Voting.Phase.CompletionVoting));
    }

    function testStrangerCannotStartCompletionVoting() public {
        _toUnderProgress();

        vm.prank(alice);
        vm.expectRevert("not allowed");
        voting.startCompletionVoting(PROBLEM);
    }

    function testContractorCannotVoteOnOwnWork() public {
        _toUnderProgress();
        vm.prank(contractor);
        voting.startCompletionVoting(PROBLEM);

        vm.prank(contractor);
        vm.expectRevert("contractor cannot vote");
        voting.voteCompletion(PROBLEM, true);
    }

    function testDoubleCompletionVoteRejected() public {
        _toUnderProgress();
        vm.prank(contractor);
        voting.startCompletionVoting(PROBLEM);

        vm.prank(alice);
        voting.voteCompletion(PROBLEM, true);

        vm.prank(alice);
        vm.expectRevert("already voted");
        voting.voteCompletion(PROBLEM, false);
    }

    function testCannotCloseBeforeQuorum() public {
        _toUnderProgress();
        vm.prank(contractor);
        voting.startCompletionVoting(PROBLEM);

        vm.prank(alice);
        voting.voteCompletion(PROBLEM, true);

        vm.prank(gov);
        vm.expectRevert("quorum not reached");
        voting.closeCompletionVoting(PROBLEM);
    }

    function testApprovedWhenQuorumAndMajorityReached() public {
        _toUnderProgress();
        vm.prank(contractor);
        voting.startCompletionVoting(PROBLEM);

        vm.prank(alice);
        voting.voteCompletion(PROBLEM, true);
        vm.prank(bob);
        voting.voteCompletion(PROBLEM, true);
        vm.prank(carol);
        voting.voteCompletion(PROBLEM, false);

        vm.prank(gov);
        voting.closeCompletionVoting(PROBLEM);

        assertEq(uint256(voting.getPhase(PROBLEM)), uint256(Voting.Phase.Completed));
    }

    function testExpiredWindowWithoutQuorumFails() public {
        _toUnderProgress();
        vm.prank(contractor);
        voting.startCompletionVoting(PROBLEM);

        vm.warp(block.timestamp + 4 days);

        voting.closeCompletionVoting(PROBLEM);

        assertEq(uint256(voting.getPhase(PROBLEM)), uint256(Voting.Phase.Failed));
    }

    function testCannotVoteAfterWindowCloses() public {
        _toUnderProgress();
        vm.prank(contractor);
        voting.startCompletionVoting(PROBLEM);

        vm.warp(block.timestamp + 4 days);

        vm.prank(alice);
        vm.expectRevert("window closed");
        voting.voteCompletion(PROBLEM, true);
    }

    function testVotesAreIsolatedPerProblem() public {
        bytes32 other = keccak256("problem-2");

        vm.startPrank(alice);
        voting.vote(PROBLEM, 4);
        voting.vote(other, 4);
        vm.stopPrank();

        assertEq(voting.creditsOf(alice), 68);
        assertEq(voting.getTotalVotes(PROBLEM), 4);
        assertEq(voting.getTotalVotes(other), 4);
    }
}
