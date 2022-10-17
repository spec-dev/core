import config from './config'
import {
    logger,
    StringKeyMap,
    StringMap,
    saveAbis,
    Abi,
    sleep,
    toChunks,
} from '../../shared'
import fetch from 'cross-fetch'
import { parse } from 'node-html-parser'

const addressesPerPage = 25
const totalRecentlyVerifiedAddresses = 500

class AbiTracker {

    frontPageAddresses: string[] = []

    async run() {
        // Fetch abis for the all recently verified contracts.
        await this._upsertAllLatestVerifiedAbis()

        // Start cron job that re-pulls front page addresses and upserts abis when diffs occur.
        setInterval(
            () => this._checkFrontPageForNewAddresses(),
            config.POLL_FRONT_PAGE_INTERVAL,
        )
    }

    async _upsertAllLatestVerifiedAbis() {
        logger.info('Fetching all recently verified contract addresses...')

        this.frontPageAddresses = (await this._fetchEtherscanVerifiedContractsPageAddresses()) || []
        if (!this.frontPageAddresses.length) {
            logger.error('No front page addresses found...')
            return
        }

        const totalPages = totalRecentlyVerifiedAddresses / addressesPerPage
        const nonFrontPageAddresses = []

        let pageNumber = 2
        while (pageNumber <= totalPages) {
            const pageAddresses = (await this._fetchEtherscanVerifiedContractsPageAddresses(pageNumber)) || []
            if (!pageAddresses.length) {
                logger.error(`No addresses found on page ${pageNumber}...`)
                pageNumber++
                continue
            }
            pageNumber++
            nonFrontPageAddresses.push(...pageAddresses)
        }

        const allLatestVerifiedAddresses = [
            ...this.frontPageAddresses,
            ...nonFrontPageAddresses,
        ]

        logger.info('Fetching / upserting ABIs for all recently verified contract addresses...')

        await this._upsertAbisForAddresses(allLatestVerifiedAddresses)
    }

    async _checkFrontPageForNewAddresses() {
        logger.info('Checking front page for new addresses...')

        const frontPageAddresses = (await this._fetchEtherscanVerifiedContractsPageAddresses()) || []
        if (!frontPageAddresses.length) {
            logger.error('No front page addresses found...')
            return
        }
        
        const storedFrontPageAddressesSet = new Set(this.frontPageAddresses)
        const newAddresses = frontPageAddresses.filter(addr => !storedFrontPageAddressesSet.has(addr))
        if (!newAddresses.length) {
            logger.info('No change.')
            return
        }

        logger.info(`${newAddresses.length} new addresses on front-page.`)
        this.frontPageAddresses = frontPageAddresses
        await this._upsertAbisForAddresses(newAddresses)
    }

    async _fetchEtherscanVerifiedContractsPageAddresses(pageNumber: number = 1, attempt: number = 1): Promise<string[] | null> {
        const abortController = new AbortController()
        const abortTimer = setTimeout(() => {
            logger.warn('Aborting due to timeout.')
            abortController.abort()
        }, 20000)
        let resp, error
        try {
            resp = await fetch(
                `https://etherscan.io/contractsVerified/${pageNumber}`,
                {
                    signal: abortController.signal,
                    headers: {
                        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
                        'cookie': 'ASP.NET_SessionId=loa53vy15uci55vdew45i4cn; __cflb=02DiuFnsSsHWYH8WqVXbZzkeTrZ6gtmGUnUMV4ZqgKaCc; _ga=GA1.2.2116816403.1665967300; _gid=GA1.2.1601611006.1665967300; __cf_bm=NJ3ZUwA7wyHiVGzBgBDXdIV0UDe4TWmRgZUwqm9Bw4U-1665967300-0-ASlcAi2Mt/QK1qoNfTJFilV3v35nS7XQ2lcMa66EME9gFPAaYt6jiummtJMbEui5WNuYUYLCqKWoPMrj9DRePqylzbHr+Ve9JKVLmaiu6XSPtxc1bTtcAEzgOmqbqXZZAw==',
                        'accept': "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
                        'accept-language': "en-US,en;q=0.9",
                        'accept-encoding': "gzip, deflate, br",
                        'upgrade-insecure-requests': "1",
                        "sec-fetch-dest": "document",
                        "sec-fetch-mode": "navigate",
                        "sec-fetch-site": "none",
                        "sec-fetch-user": "?1",
                        'sec-ch-ua': '"Chromium";v="106", "Google Chrome";v="106", "Not;A=Brand";v="99"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"macOS"',
                        'cache-control': 'no-cache',
                        'pragma': 'no-cache'
                    }
                }
            )
        } catch (err) {
            error = err
        }
        clearTimeout(abortTimer)
    
        if (error || resp?.status !== 200) {
            logger.error(`[Attempt ${attempt}] Error fetching contracts verified page from etherscan for page ${pageNumber}: ${error || resp?.status}`)
            if (attempt <= 3) {
                await sleep(200)
                return this._fetchEtherscanVerifiedContractsPageAddresses(pageNumber, attempt + 1)
            }
            return null
        }

        let body
        try {
            body = await resp.text()
        } catch (err) {
            logger.error(
                `Error reading text response for page ${pageNumber}: ${err}`
            )
            return null
        }

        if (!body) return null

        return this._parseContractAddressesFromEtherscanPage(body, pageNumber)
    }

    _parseContractAddressesFromEtherscanPage(body: any, pageNumber: number): string[] | null {
        let tableBody
        try {
            const root = parse(body)
            tableBody = root.querySelector('#ContentPlaceHolder1_mainrow tbody')
            if (!tableBody) return null
        } catch (err) {
            logger.error(`Error parsing tbody from page ${pageNumber}: ${err}`)
            return null
        }

        const tableRows = tableBody.childNodes.filter(n => n.rawTagName === 'tr')
        if (!tableRows.length) return null

        const addresses = tableRows.map(tr => {
            const addressLink = tr.querySelector('td:first-child > a')
            return addressLink ? addressLink.innerText?.toLowerCase() : null
        }).filter(v => !!v)

        if (addresses.length !== addressesPerPage) {
            logger.error(`Only found $${addresses.length}/${addressesPerPage} on page ${pageNumber}...`)
        }

        return addresses
    }

    async _upsertAbisForAddresses(addresses: string[]) {
        const abisMap = await this._fetchAbis(addresses)
        await this._saveAbis(abisMap)
    }

    async _fetchAbis(addresses: string[]): Promise<StringKeyMap> {
        logger.info(`Fetching ABIs for ${addresses.length} addresses...`)
        const chunks = toChunks(addresses, 5)

        const results = []
        for (let i = 0; i < chunks.length; i++) {
            logger.info(`Chunk ${i + 1} / ${chunks.length}`)
            results.push(...(await this._groupFetchAbisFromEtherscan(chunks[i])))
        }

        const abisMap = {}
        for (let i = 0; i < addresses.length; i++) {
            const abi = results[i]
            const address = addresses[i]
            if (!abi) continue
            abisMap[address] = abi
        }
        return abisMap
    }

    async _groupFetchAbisFromEtherscan(addresses: string[]): Promise<string[]> {        
        const abiPromises = []

        let i = 0
        while (i < addresses.length) {
            await sleep(200)
            abiPromises.push(this._fetchAbiFromEtherscan(addresses[i]))
            i++
        }

        return await Promise.all(abiPromises)
    }

    async _fetchAbiFromEtherscan(address: string, attempt: number = 1): Promise<Abi | null> {   
        const abortController = new AbortController()
        const abortTimer = setTimeout(() => {
            logger.warn('Aborting due to timeout.')
            abortController.abort()
        }, 20000)
        let resp, error
        try {
            resp = await fetch(
                `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=G5XVJA5D97W4FYZID6ZIFU4F5C5FG6YM99`, 
                { 
                    signal: abortController.signal,
                }
            )
        } catch (err) {
            error = err
        }
        clearTimeout(abortTimer)
    
        if (error || resp?.status !== 200) {
            logger.error(`[Attempt ${attempt}] Error fetching ABI from etherscan for address ${address}: ${error || resp?.status}`)
            if (attempt <= 3) {
                await sleep(500)
                return this._fetchAbiFromEtherscan(address, attempt + 1)
            }
            return null
        }

        let data: StringKeyMap = {}
        try {
            data = await resp.json()
        } catch (err) {
            logger.error(
                `Error parsing json response while fetching ABI from etherscan for address ${address}: ${err}`
            )
            return null
        }

        if (data.status != 1 || !data.result) {
            if (data.result?.toLowerCase()?.includes('rate limit')) {
                await sleep(500)
                return this._fetchAbiFromEtherscan(address, attempt)
            }
            logger.info(`No abi for ${address}`)
            return null
        }

        let abi = null
        try {
            abi = JSON.parse(data.result) as Abi
        } catch (err) {
            logger.error(`Error parsing JSON ABI from etherscan for address ${address}: ${err}`)
            return null
        }

        return abi
    }

    async _saveAbis(abisMap: StringKeyMap) {
        const stringified: StringMap = {}

        for (const address in abisMap) {
            const abi = abisMap[address]
            const abiStr = this._stringifyAbi(address, abi)
            if (!abiStr) continue
            stringified[address] = abiStr
        }
        const numAbisToSave = Object.keys(stringified).length
        if (!numAbisToSave) {
            return
        }

        logger.info(`Saving ${numAbisToSave} ABIs...`)

        if (!(await saveAbis(stringified))) {
            logger.error(`Failed to save ABI batch.`)
            return
        }
    }

    _stringifyAbi(address: string, abi: Abi): string | null {
        if (!abi) return null
        let abiStr
        try {
            abiStr = JSON.stringify(abi)
        } catch (err) {
            logger.error(`Error stringifying abi for ${address}: ${abi} - ${err}`)
            return null
        }
        return abiStr
    }
}

export default AbiTracker