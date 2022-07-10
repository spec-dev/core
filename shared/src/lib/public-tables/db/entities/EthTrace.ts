import { Entity, PrimaryColumn, Column } from 'typeorm'
import schemas from '../../schemas'

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

    // Blockchain id.
    @Column('int2', { name: 'chain_id' })
    chainId: number

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
    @Column('int8', { nullable: true })
    value: number

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

    // Error if message call failed. This field doesn't contain top-level trace errors.
    @Column('varchar', { nullable: true })
    error: string

    // 1 (success) or 0 (failure).
    @Column('int2', { nullable: true })
    status: EthTraceStatus
    
    // Gas provided with the message call.
    @Column('int8', { nullable: true })
    gas: number

    // Gas used by the message call.
    @Column('int8', { name: 'gas_used', nullable: true })
    gasUsed: number
 
    // The hash of the block this trace was included in.
    @Column('varchar', { name: 'block_hash', length: 70 })
    blockHash: string

    // The number of the block this trace was included in.
    @Column('int8', { name: 'block_number' })
    blockNumber: number

    // Unix timestamp of when this trace's block was collated.
    @Column('timestamp', { name: 'block_timestamp' })
    blockTimestamp: Date

    // Whether this trace's block was uncled.
    @Column({ default: false })
    uncled: boolean
}