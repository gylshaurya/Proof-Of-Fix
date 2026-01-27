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
    address public government;
    IVoting public voting;

    struct Escrow {
        address contractor;
        uint256 total;
        uint256 released;
        bool exists;
    }

    mapping(bytes32 => Escrow) public escrows;

    event EscrowCreated(bytes32 indexed id, address contractor, uint256 amount);
    event AdvanceReleased(bytes32 indexed id, uint256 amount);
    event FinalReleased(bytes32 indexed id, uint256 amount);
    event EscrowFailed(bytes32 indexed id);

    modifier onlyGov() {
        require(msg.sender == government, "gov only");
        _;
    }

    constructor(address _voting, address _government) {
        voting = IVoting(_voting);
        government = _government;
    }

    receive() external payable {}

    function createEscrow(bytes32 id, address contractor)
        external
        payable
        onlyGov
    {
        require(!escrows[id].exists, "exists");

        escrows[id] = Escrow(contractor, msg.value, 0, true);

        uint256 advance = msg.value / 2;
        escrows[id].released = advance;
        payable(contractor).transfer(advance);

        emit EscrowCreated(id, contractor, msg.value);
        emit AdvanceReleased(id, advance);
    }

    function finalize(bytes32 id) external onlyGov {
        Escrow storage e = escrows[id];
        require(e.exists, "missing");

        IVoting.Phase phase = voting.getPhase(id);

        if (phase == IVoting.Phase.Completed) {
            uint256 remaining = e.total - e.released;
            e.released = e.total;
            payable(e.contractor).transfer(remaining);
            emit FinalReleased(id, remaining);
        } else if (phase == IVoting.Phase.Failed) {
            emit EscrowFailed(id);
        }
    }
}
