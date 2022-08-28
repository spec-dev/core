import { Entity, PrimaryColumn, Column, Index } from 'typeorm'
import schemas from '../../schemas'
import { decamelize } from 'humps'

export enum EthTraceType {
    Call = 'call',
    Create = 'create',
    Suicide = 'suicide',
    Reward = 'reward',
    Genesis = 'genesis',
    DAOFork = 'daofork',
}

export enum EthCallType {
    Call = 'call',
    Callcode = 'callcode',
    Delegatecall = 'delegatecall',
    Staticcall = 'staticcall',
}

export enum EthRewardType {
    Block = 'block',
    Uncle = 'uncle',
}

export enum EthTraceStatus {
    Failure = 0,
    Success = 1,
}

/**
 * An Ethereum Trace
 */
@Entity('traces', { schema: schemas.ETHEREUM })
export class EthTrace {
    // Primary key with the following calculated value:
    // * For transaction-scoped traces --> {trace_type}_{transaction_hash}_{trace_address}
    // * For block-scoped traces --> {trace_type}_{block_hash}_{index_within_block}
    @PrimaryColumn('varchar', { length: 200 })
    id: string

    // This trace's transaction hash.
    @Column('varchar', { name: 'transaction_hash', length: 70, nullable: true })
    transactionHash: string

    // The index of this trace's transaction in this block.
    @Column('int2', { name: 'transaction_index', nullable: true })
    transactionIndex: number

    // Address of the sender, null when trace_type is genesis or reward.
    @Column('varchar', { length: 50, nullable: true })
    from: string

    // Address of the receiver if trace_type is call, address of new contract
    // or null if trace_type is create, beneficiary address if trace_type is suicide,
    // miner address if trace_type is reward, shareholder address if trace_type is genesis,
    // WithdrawDAO address if trace_type is daofork.
    @Column('varchar', { length: 50, nullable: true })
    to: string

    // Value transferred in Wei.
    @Column('varchar', { nullable: true, length: 40 })
    value: string

    // The data sent along with the message call.
    @Column('varchar', { nullable: true })
    input: string

    // The output of the message call, bytecode of contract when trace_type is create.
    @Column('varchar', { nullable: true })
    output: string

    // One of call, create, suicide, reward, genesis, daofork.
    @Column('varchar', { name: 'trace_type', length: 20 })
    traceType: EthTraceType

    // One of call, callcode, delegatecall, staticcall.
    @Column('varchar', { name: 'call_type', length: 20, nullable: true })
    callType: EthCallType

    // One of block, uncle.
    @Column('varchar', { name: 'reward_type', length: 20, nullable: true })
    rewardType: EthRewardType

    // The number of subtraces.
    @Column('int8', { nullable: true })
    subtraces: number

    // Comma separated list of trace address in call tree.
    @Column('varchar', { name: 'trace_address', nullable: true })
    traceAddress: string

    // Index of trace in block (only works if traces were originally ordered correctly which is the case for Parity traces).
    @Column('int2', { name: 'trace_index' })
    traceIndex: number

    // Error if message call failed. This field doesn't contain top-level trace errors.
    @Column('varchar', { nullable: true })
    error: string

    // 1 (success) or 0 (failure).
    @Column('int2', { nullable: true })
    status: EthTraceStatus

    // Gas provided with the message call.
    @Column('varchar', { length: 40, nullable: true })
    gas: string

    // Gas used by the message call.
    @Column('varchar', { name: 'gas_used', length: 40, nullable: true })
    gasUsed: string

    // The hash of the block this trace was included in.
    @Column('varchar', { name: 'block_hash', length: 70 })
    blockHash: string

    // The number of the block this trace was included in.
    @Index()
    @Column('int8', {
        name: 'block_number',
        transformer: {
            to: (value) => value,
            from: (value) => parseInt(value),
        },
    })
    blockNumber: number

    // Timestamp of when this trace's block was collated.
    @Column('timestamptz', { name: 'block_timestamp' })
    blockTimestamp: Date

    traceAddressList: number[]
}

export const fullTraceUpsertConfig = (trace: EthTrace): string[][] => {
    const conflictCols = ['id']
    const nonColKeys = ['traceAddressList']
    const updateCols = Object.keys(trace)
        .filter((key) => !nonColKeys.includes(key))
        .map(decamelize)
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
