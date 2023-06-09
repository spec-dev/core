// ################################
//  EVENTS
// ################################

export const TRANSFER_EVENT_NAME = 'Transfer'
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export const TRANSFER_SINGLE_EVENT_NAME = 'TransferSingle'
export const TRANSFER_SINGLE_TOPIC =
    '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62'

export const TRANSFER_BATCH_EVENT_NAME = 'TransferBatch'
export const TRANSFER_BATCH_TOPIC =
    '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb'
export const BATCH_TRANSFER_INPUTS = [
    {
        name: 'operator',
        type: 'address',
    },
    {
        name: 'from',
        type: 'address',
    },
    {
        name: 'to',
        type: 'address',
    },
    {
        name: 'ids',
        type: 'uint256[]',
    },
    {
        name: 'values',
        type: 'uint256[]',
    },
]

export const WETH_DEPOSIT_TOPIC =
    '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c'
export const WETH_WITHDRAWAL_TOPIC =
    '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65'

export const METADATA_UPDATE_TOPIC =
    '0xf8e1a15aba9398e019f0b49df1a4fde98ee17ae345cb5f6b5e2c27f5033e8ce7'
export const BATCH_METADATA_UPDATE_TOPIC =
    '0x6bd5c950a8d8df17f772f5af37cb3655737899cbf903264b9795592da439661c'
export const PROXY_UPGRADED_TOPIC =
    '0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b'

export const specialErc20BalanceAffectingAbis = {
    [WETH_DEPOSIT_TOPIC]: {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'dst',
                type: 'address',
            },
            {
                indexed: false,
                name: 'wad',
                type: 'uint256',
            },
        ],
        name: 'Deposit',
        type: 'event',
        signature: WETH_DEPOSIT_TOPIC,
        addressIndex: 0,
    },
    [WETH_WITHDRAWAL_TOPIC]: {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'src',
                type: 'address',
            },
            {
                indexed: false,
                name: 'wad',
                type: 'uint256',
            },
        ],
        name: 'Withdrawal',
        type: 'event',
        signature: WETH_WITHDRAWAL_TOPIC,
        addressIndex: 0,
    },
}

// ################################
//  ERC-20
// ################################

export const ERC20_NAME_ITEM = {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
    signature: '0x06fdde03',
}

export const ERC20_SYMBOL_ITEM = {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
    signature: '0x95d89b41',
}

export const ERC20_DECIMALS_ITEM = {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
    signature: '0x313ce567',
}

export const ERC20_TOTAL_SUPPLY_ITEM = {
    constant: true,
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
    signature: '0x18160ddd',
}

export const ERC20_BALANCE_OF_ITEM = {
    constant: true,
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
    signature: '0x70a08231',
}

export const ERC20_APPROVE_ITEM = {
    constant: false,
    inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
    signature: '0x095ea7b3',
}

export const ERC20_ALLOWANCE_ITEM = {
    constant: true,
    inputs: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
    signature: '0xdd62ed3e',
}

export const ERC20_TRANSFER_ITEM = {
    constant: false,
    inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
    signature: '0xa9059cbb',
}

export const ERC20_TRANSFER_FROM_ITEM = {
    constant: false,
    inputs: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
    signature: '0x23b872dd',
}

export const erc20RequiredFunctionItems = [
    ERC20_TOTAL_SUPPLY_ITEM,
    ERC20_BALANCE_OF_ITEM,
    ERC20_APPROVE_ITEM,
    ERC20_ALLOWANCE_ITEM,
    ERC20_TRANSFER_ITEM,
    ERC20_TRANSFER_FROM_ITEM,
]

// ################################
//  ERC-721
// ################################

export const ERC721_BALANCE_OF_ITEM = {
    constant: true,
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
    signature: '0x70a08231',
}

export const ERC721_OWNER_OF_ITEM = {
    constant: true,
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
    signature: '0x6352211e',
}

export const ERC721_TRANSFER_ITEM = {
    constant: false,
    inputs: [
        { name: 'to', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
    signature: '0xa9059cbb',
}

export const ERC721_TRANSFER_FROM_ITEM = {
    constant: false,
    inputs: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
    signature: '0x23b872dd',
}

export const ERC721_APPROVE_ITEM = {
    constant: false,
    inputs: [
        { name: 'to', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
    signature: '0x095ea7b3',
}

export const ERC721_NAME_ITEM = {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
    signature: '0x06fdde03',
}

export const ERC721_SYMBOL_ITEM = {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
    signature: '0x95d89b41',
}

export const ERC721_TOKEN_URI_ITEM = {
    constant: true,
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
    signature: '0xc87b56dd',
}

export const ERC721_TOTAL_SUPPLY_ITEM = {
    constant: true,
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
    signature: '0x18160ddd',
}

// ################################
//  ERC-1155
// ################################

export const ERC1155_BALANCE_OF_ITEM = {
    constant: true,
    inputs: [
        { name: 'account', type: 'address' },
        { name: 'id', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
    signature: '0x00fdd58e',
}

export const ERC1155_BALANCE_OF_BATCH_ITEM = {
    constant: true,
    inputs: [
        { name: 'accounts', type: 'address[]' },
        { name: 'ids', type: 'uint256[]' },
    ],
    name: 'balanceOfBatch',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
    signature: '0x4e1273f4',
}

export const ERC1155_SET_APPROVAL_FOR_ALL_ITEM = {
    constant: false,
    inputs: [
        { name: 'operator', type: 'address' },
        { name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
    signature: '0xa22cb465',
}

export const ERC1155_IS_APPROVED_FOR_ALL_ITEM = {
    constant: true,
    inputs: [
        { name: 'account', type: 'address' },
        { name: 'operator', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
    signature: '0xe985e9c5',
}

export const ERC1155_SAFE_TRANSFER_FROM_ITEM = {
    constant: false,
    inputs: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'id', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
        { name: 'data', type: 'bytes' },
    ],
    name: 'safeTransferFrom',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
    signature: '0xf242432a',
}

export const ERC1155_SAFE_BATCH_TRANSFER_FROM_ITEM = {
    constant: false,
    inputs: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'ids', type: 'uint256[]' },
        { name: 'amounts', type: 'uint256[]' },
        { name: 'data', type: 'bytes' },
    ],
    name: 'safeBatchTransferFrom',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
    signature: '0x2eb2c2d6',
}

export const ERC1155_URI_ITEM = {
    constant: true,
    inputs: [{ name: 'id', type: 'uint256' }],
    name: 'uri',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
    signature: '0x0e89341c',
}

export const erc1155RequiredFunctionItems = [
    ERC1155_BALANCE_OF_ITEM,
    ERC1155_BALANCE_OF_BATCH_ITEM,
    ERC1155_SET_APPROVAL_FOR_ALL_ITEM,
    ERC1155_IS_APPROVED_FOR_ALL_ITEM,
    ERC1155_SAFE_TRANSFER_FROM_ITEM,
    ERC1155_SAFE_BATCH_TRANSFER_FROM_ITEM,
]
