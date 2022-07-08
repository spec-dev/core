import AbstractIndexer from '../AbstractIndexer';

class EthereumIndexer extends AbstractIndexer {

    async perform() {
        await Promise.all([
            this._indexTransactionsPath(),
            this._indexTracesPath()
        ])
    }

    async _indexTransactionsPath() {
        
    }

    async _indexTracesPath() {

    }
}

export default EthereumIndexer