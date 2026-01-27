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
    }

    address public owner;

    mapping(bytes32 => Problem) public problems;
    mapping(address => uint256) public credits;
    mapping(address => mapping(bytes32 => uint256)) public userVotes;
    mapping(bytes32 => mapping(address => bool)) public completionVoted;

    uint256 public constant INITIAL_CREDITS = 100;
    uint256 public currentRound;
    mapping(address => uint256) public lastRoundCredited;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function _bootstrap(address user) internal {
        if (lastRoundCredited[user] < currentRound || credits[user] == 0) {
            credits[user] = INITIAL_CREDITS;
            lastRoundCredited[user] = currentRound;
        }
    }

    function _ensure(bytes32 id) internal {
        if (!problems[id].exists) {
            problems[id] = Problem(true, Phase.InitialVoting, 0, 0, 0);
        }
    }

    function vote(bytes32 id, uint256 additionalVotes) external {
        require(additionalVotes > 0, "invalid");
        _bootstrap(msg.sender);
        _ensure(id);

        Problem storage p = problems[id];
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

    function moveToUnderProgress(bytes32 id) external {
        _ensure(id);
        require(problems[id].phase == Phase.InitialVoting, "bad phase");
        problems[id].phase = Phase.UnderProgress;
    }

    function startCompletionVoting(bytes32 id) external {
        _ensure(id);
        require(problems[id].phase == Phase.UnderProgress, "bad phase");
        problems[id].phase = Phase.CompletionVoting;
    }

    function closeCompletionVoting(bytes32 id) external {
        require(problems[id].phase == Phase.CompletionVoting, "bad phase");
        problems[id].phase =
            problems[id].yesVotes > problems[id].noVotes
                ? Phase.Completed
                : Phase.Failed;
    }

    function voteCompletion(bytes32 id, bool solved) external {
        Problem storage p = problems[id];
        require(p.exists && p.phase == Phase.CompletionVoting, "bad");
        require(!completionVoted[id][msg.sender], "already voted");

        completionVoted[id][msg.sender] = true;
        solved ? p.yesVotes++ : p.noVotes++;
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

    function getPhase(bytes32 id) external view returns (Phase) {
        return problems[id].phase;
    }
}
