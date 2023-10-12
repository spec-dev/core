export class AlgoliaModel {

    get resourceName(): string {
        return 'Must be implemented in child class'
    }

    get idType(): string {
        throw 'Must be implemented in child class'
    }
}