import { Entity, PrimaryColumn, Column } from 'typeorm'
import { currentChainSchema } from '../../../utils/chainIds'
import { decamelize } from 'humps'

export enum EvmTraceType {
    Call = 'call',
    Create = 'create',
    Suicide = 'suicide',
    Reward = 'reward',
    Genesis = 'genesis',
    DAOFork = 'daofork',
}

export enum EvmCallType {
    Call = 'call',
    Callcode = 'callcode',
    Delegatecall = 'delegatecall',
    Staticcall = 'staticcall',
}

export enum EvmRewardType {
    Block = 'block',
    Uncle = 'uncle',
}

export enum EvmTraceStatus {
    Failure = 0,
    Success = 1,
}

/**
 * An EVM Trace.
 */
@Entity('traces', { schema: currentChainSchema() })
export class EvmTrace {
    // Primary key with the following calculated value:
    // * For transaction-scoped traces --> {trace_type}_{transaction_hash}_{trace_address}
    // * For block-scoped traces --> {trace_type}_{block_hash}_{index_within_block}
    @PrimaryColumn('varchar')
    id: string

    // This trace's transaction hash.
    @Column('varchar', { name: 'transaction_hash', length: 70, nullable: true })
    transactionHash: string

    // The index of this trace's transaction in this block.
    @Column({ name: 'transaction_index', nullable: true })
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
    @Column('varchar', { nullable: true })
    value: string

    // The data sent along with the message call.
    @Column('varchar', { nullable: true })
    input: string

    // The output of the message call, bytecode of contract when trace_type is create.
    @Column('varchar', { nullable: true })
    output: string

    // Name of the contract function executed.
    @Column('varchar', { name: 'function_name', nullable: true })
    functionName: string

    // Arguments provided to the contract function.
    @Column('json', { name: 'function_args', nullable: true })
    functionArgs: object[]

    // Contract function outputs.
    @Column('json', { name: 'function_outputs', nullable: true })
    functionOutputs: object[]

    // One of call, create, suicide, reward, genesis, daofork.
    @Column('varchar', { name: 'trace_type', length: 20 })
    traceType: EvmTraceType

    // One of call, callcode, delegatecall, staticcall.
    @Column('varchar', { name: 'call_type', length: 20, nullable: true })
    callType: EvmCallType

    // One of block, uncle.
    @Column('varchar', { name: 'reward_type', length: 20, nullable: true })
    rewardType: EvmRewardType

    // The number of subtraces.
    @Column('int8', { nullable: true })
    subtraces: number

    // Comma separated list of trace address in call tree.
    @Column('varchar', { name: 'trace_address', nullable: true })
    traceAddress: string

    // Index of trace in block (only works if traces were originally ordered correctly which is the case for Parity traces).
    @Column({ name: 'trace_index' })
    traceIndex: number

    @Column({ name: 'trace_index_is_per_tx', nullable: true })
    traceIndexIsPerTx: boolean

    // Error if message call failed. This field doesn't contain top-level trace errors.
    @Column('varchar', { nullable: true })
    error: string

    // 1 (success) or 0 (failure).
    @Column('int2', { nullable: true })
    status: EvmTraceStatus

    // Gas provided with the message call.
    @Column('varchar', { nullable: true })
    gas: string

    // Gas used by the message call.
    @Column('varchar', { name: 'gas_used', nullable: true })
    gasUsed: string

    // The hash of the block this trace was included in.
    @Column('varchar', { name: 'block_hash', length: 70 })
    blockHash: string

    // The number of the block this trace was included in.
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

export const fullEvmTraceUpsertConfig = (trace: EvmTrace): string[][] => {
    const conflictCols = ['id']
    const nonColKeys = ['traceAddressList']
    const updateCols = Object.keys(trace)
        .filter((key) => !nonColKeys.includes(key))
        .map(decamelize)
        .filter((col) => !conflictCols.includes(col))
    return [updateCols, conflictCols]
}
