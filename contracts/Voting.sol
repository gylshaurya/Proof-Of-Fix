// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Voting {

    enum Phase {
        InitialVoting,
        UnderProgress,
        CompletionVoting,
        Completed,
        Failed
    }

    struct Problem {
        bool exists;
        Phase phase;
        uint256 totalVotes;
        uint256 yesVotes;
        uint256 noVotes;
        address contractor;
    }

    address public owner;

    mapping(bytes32 => Problem) public problems;
    mapping(address => uint256) public credits;
    mapping(address => uint256) public creditRound;
    mapping(address => mapping(bytes32 => uint256)) public userVotes;
    mapping(bytes32 => mapping(address => bool)) public completionVoted;

    uint256 public constant INITIAL_CREDITS = 100;
    uint256 public currentRound;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        currentRound = 1;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    function _syncCredits(address user) internal {
        if (creditRound[user] < currentRound) {
            creditRound[user] = currentRound;
            credits[user] = INITIAL_CREDITS;
        }
    }

    function _ensure(bytes32 id) internal returns (Problem storage p) {
        p = problems[id];
        if (!p.exists) {
            p.exists = true;
            p.phase = Phase.InitialVoting;
        }
    }

    function vote(bytes32 id, uint256 additionalVotes) external {
        require(additionalVotes > 0, "invalid vote count");

        _syncCredits(msg.sender);
        Problem storage p = _ensure(id);
        require(p.phase == Phase.InitialVoting, "voting closed");

        uint256 currentVotes = userVotes[msg.sender][id];
        uint256 newTotal = currentVotes + additionalVotes;
        uint256 cost = (newTotal * newTotal) - (currentVotes * currentVotes);

        require(credits[msg.sender] >= cost, "insufficient credits");

        credits[msg.sender] -= cost;
        userVotes[msg.sender][id] = newTotal;
        p.totalVotes += additionalVotes;
    }

    function newRound() external onlyOwner {
        currentRound++;
    }

    function moveToUnderProgress(bytes32 id) external onlyOwner {
        Problem storage p = _ensure(id);
        require(p.phase == Phase.InitialVoting, "bad phase");
        p.phase = Phase.UnderProgress;
    }

    function assignContractor(bytes32 id, address contractor) external onlyOwner {
        require(contractor != address(0), "zero address");
        Problem storage p = problems[id];
        require(p.exists && p.phase == Phase.UnderProgress, "bad phase");
        p.contractor = contractor;
    }

    function startCompletionVoting(bytes32 id) external {
        Problem storage p = problems[id];
        require(p.exists && p.phase == Phase.UnderProgress, "bad phase");
        require(msg.sender == owner || msg.sender == p.contractor, "not allowed");
        p.phase = Phase.CompletionVoting;
    }

    function closeCompletionVoting(bytes32 id) external onlyOwner {
        Problem storage p = problems[id];
        require(p.phase == Phase.CompletionVoting, "bad phase");
        p.phase = p.yesVotes > p.noVotes ? Phase.Completed : Phase.Failed;
    }

    function voteCompletion(bytes32 id, bool solved) external {
        Problem storage p = problems[id];
        require(p.exists && p.phase == Phase.CompletionVoting, "not open");
        require(!completionVoted[id][msg.sender], "already voted");
        require(msg.sender != p.contractor, "contractor cannot vote");

        completionVoted[id][msg.sender] = true;

        if (solved) {
            p.yesVotes++;
        } else {
            p.noVotes++;
        }
    }

    function creditsOf(address user) external view returns (uint256) {
        if (creditRound[user] < currentRound) return INITIAL_CREDITS;
        return credits[user];
    }

    function getTotalVotes(bytes32 id) external view returns (uint256) {
        return problems[id].totalVotes;
    }

    function getUserVotes(address user, bytes32 id) external view returns (uint256) {
        return userVotes[user][id];
    }

    function getCompletionVotes(bytes32 id) external view returns (uint256, uint256) {
        return (problems[id].yesVotes, problems[id].noVotes);
    }

    function hasVotedCompletion(bytes32 id, address user) external view returns (bool) {
        return completionVoted[id][user];
    }

    function getPhase(bytes32 id) external view returns (Phase) {
        return problems[id].phase;
    }
}
