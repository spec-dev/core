create or replace view tokens.weth_balance as
select * from tokens.erc20_balance where 
    (chain_id = '1' and token_address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2') or
    (chain_id = '5' and token_address = '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6');