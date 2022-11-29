// ################################
//  EVENTS
// ################################

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
export const TRANSFER_SINGLE_TOPIC = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62'
export const TRANSFER_BATCH_TOPIC = '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb'

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

// ################################
//  ERC-1155
// ################################

export const ERC1155_BALANCE_OF_ITEM = {
    constant: true,
    inputs: [
        { name: 'account', type: 'address' },
        { name: 'id', type: 'uint256' }
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
        { name: 'ids', type: 'uint256[]' }
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
        { name: 'approved', type: 'bool' }
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
        { name: 'operator', type: 'address' }
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