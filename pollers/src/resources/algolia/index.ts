import { NamespaceModel } from './namespaceModel';
import { ContractModel } from './contractModel';
import { LiveObjectVersionModel } from './liveObjectVersionModel';

export const resourceInstances = [new LiveObjectVersionModel(), new ContractModel(), new NamespaceModel()]