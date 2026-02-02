// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IVoting {
    enum Phase {
        InitialVoting,
        UnderProgress,
        CompletionVoting,
        Completed,
        Failed
    }

    function getPhase(bytes32 id) external view returns (Phase);
}

contract Treasury {

    struct Escrow {
        address contractor;
        uint256 total;
        uint256 released;
        bool exists;
        bool settled;
    }

    address public government;
    IVoting public voting;

    uint256 public lockedBalance;

    mapping(bytes32 => Escrow) public escrows;

    event EscrowCreated(bytes32 indexed id, address contractor, uint256 amount);
    event AdvanceReleased(bytes32 indexed id, uint256 amount);
    event FinalReleased(bytes32 indexed id, uint256 amount);
    event EscrowFailed(bytes32 indexed id, uint256 refunded);
    event VotingUpdated(address indexed voting);
    event GovernmentUpdated(address indexed government);
    event Swept(address indexed to, uint256 amount);

    uint256 private locked = 1;

    modifier onlyGov() {
        require(msg.sender == government, "gov only");
        _;
    }

    modifier nonReentrant() {
        require(locked == 1, "reentrant");
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address _voting, address _government) {
        require(_voting != address(0) && _government != address(0), "zero address");
        voting = IVoting(_voting);
        government = _government;
    }

    receive() external payable {}

    function setVoting(address _voting) external onlyGov {
        require(_voting != address(0), "zero address");
        voting = IVoting(_voting);
        emit VotingUpdated(_voting);
    }

    function transferGovernment(address _government) external onlyGov {
        require(_government != address(0), "zero address");
        government = _government;
        emit GovernmentUpdated(_government);
    }

    function createEscrow(bytes32 id, address contractor)
        external
        payable
        onlyGov
        nonReentrant
    {
        require(!escrows[id].exists, "escrow exists");
        require(contractor != address(0), "zero address");
        require(msg.value > 1 wei, "amount too small");

        uint256 advance = msg.value / 2;

        escrows[id] = Escrow(contractor, msg.value, advance, true, false);
        lockedBalance += msg.value - advance;

        emit EscrowCreated(id, contractor, msg.value);
        emit AdvanceReleased(id, advance);

        _send(contractor, advance);
    }

    function finalize(bytes32 id) external onlyGov nonReentrant {
        Escrow storage e = escrows[id];
        require(e.exists, "no escrow");
        require(!e.settled, "already settled");

        IVoting.Phase phase = voting.getPhase(id);
        require(
            phase == IVoting.Phase.Completed || phase == IVoting.Phase.Failed,
            "not resolved"
        );

        uint256 remaining = e.total - e.released;
        e.released = e.total;
        e.settled = true;
        lockedBalance -= remaining;

        if (phase == IVoting.Phase.Completed) {
            emit FinalReleased(id, remaining);
            _send(e.contractor, remaining);
        } else {
            emit EscrowFailed(id, remaining);
            _send(government, remaining);
        }
    }

    function sweep(address to) external onlyGov nonReentrant {
        require(to != address(0), "zero address");
        uint256 amount = address(this).balance - lockedBalance;
        require(amount > 0, "nothing to sweep");
        emit Swept(to, amount);
        _send(to, amount);
    }

    function available() external view returns (uint256) {
        return address(this).balance - lockedBalance;
    }

    function _send(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "transfer failed");
    }
}
