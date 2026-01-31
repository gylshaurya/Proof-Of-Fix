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
        uint256 round;
        uint256 totalVotes;
        uint256 yesVotes;
        uint256 noVotes;
        uint64 completionDeadline;
        address contractor;
    }

    uint256 public constant INITIAL_CREDITS = 100;
    uint64 public constant COMPLETION_WINDOW = 3 days;

    address public owner;
    uint256 public currentRound;
    uint256 public completionQuorum;

    mapping(bytes32 => Problem) public problems;
    mapping(address => uint256) public credits;
    mapping(address => uint256) public creditRound;

    mapping(uint256 => mapping(address => mapping(bytes32 => uint256))) private roundVotes;
    mapping(uint256 => mapping(bytes32 => mapping(address => bool))) private roundCompletionVoted;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        currentRound = 1;
        completionQuorum = 2;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    function setCompletionQuorum(uint256 quorum) external onlyOwner {
        require(quorum > 0, "zero quorum");
        completionQuorum = quorum;
    }

    function newRound() external onlyOwner {
        currentRound++;
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
            p.round = currentRound;
            return p;
        }

        if (p.round < currentRound) {
            p.round = currentRound;
            p.phase = Phase.InitialVoting;
            p.totalVotes = 0;
            p.yesVotes = 0;
            p.noVotes = 0;
            p.completionDeadline = 0;
            p.contractor = address(0);
        }
    }

    function vote(bytes32 id, uint256 additionalVotes) external {
        require(additionalVotes > 0, "invalid vote count");

        _syncCredits(msg.sender);
        Problem storage p = _ensure(id);
        require(p.phase == Phase.InitialVoting, "voting closed");

        uint256 currentVotes = roundVotes[currentRound][msg.sender][id];
        uint256 newTotal = currentVotes + additionalVotes;
        uint256 cost = (newTotal * newTotal) - (currentVotes * currentVotes);

        require(credits[msg.sender] >= cost, "insufficient credits");

        credits[msg.sender] -= cost;
        roundVotes[currentRound][msg.sender][id] = newTotal;
        p.totalVotes += additionalVotes;

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
        p.completionDeadline = uint64(block.timestamp) + COMPLETION_WINDOW;
    }

    function voteCompletion(bytes32 id, bool solved) external {
        Problem storage p = problems[id];
        require(p.exists && p.phase == Phase.CompletionVoting, "not open");
        require(block.timestamp < p.completionDeadline, "window closed");
        require(!roundCompletionVoted[currentRound][id][msg.sender], "already voted");
        require(msg.sender != p.contractor, "contractor cannot vote");

        roundCompletionVoted[currentRound][id][msg.sender] = true;

        if (solved) {
            p.yesVotes++;
        } else {
            p.noVotes++;
        }

    }

    function closeCompletionVoting(bytes32 id) external {
        Problem storage p = problems[id];
        require(p.phase == Phase.CompletionVoting, "bad phase");

        uint256 castVotes = p.yesVotes + p.noVotes;
        bool expired = block.timestamp >= p.completionDeadline;

        require(expired || msg.sender == owner, "not allowed");
        require(expired || castVotes >= completionQuorum, "quorum not reached");

        bool approved = castVotes >= completionQuorum && p.yesVotes > p.noVotes;
        p.phase = approved ? Phase.Completed : Phase.Failed;

    }

    function creditsOf(address user) external view returns (uint256) {
        if (creditRound[user] < currentRound) return INITIAL_CREDITS;
        return credits[user];
    }

    function getTotalVotes(bytes32 id) external view returns (uint256) {
        Problem storage p = problems[id];
        if (p.round < currentRound) return 0;
        return p.totalVotes;
    }

    function getUserVotes(address user, bytes32 id) external view returns (uint256) {
        return roundVotes[currentRound][user][id];
    }

    function getCompletionVotes(bytes32 id) external view returns (uint256, uint256) {
        Problem storage p = problems[id];
        if (p.round < currentRound) return (0, 0);
        return (p.yesVotes, p.noVotes);
    }

    function hasVotedCompletion(bytes32 id, address user) external view returns (bool) {
        return roundCompletionVoted[currentRound][id][user];
    }

    function getPhase(bytes32 id) external view returns (Phase) {
        Problem storage p = problems[id];
        if (p.round < currentRound) return Phase.InitialVoting;
        return p.phase;
    }

    function getCompletionDeadline(bytes32 id) external view returns (uint64) {
        return problems[id].completionDeadline;
    }
}
