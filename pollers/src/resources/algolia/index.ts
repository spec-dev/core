import { NamespaceModel } from './namespaceModel';
import { ContractModel } from './contractModel';
import { EventVersionModel } from './eventVersionModel';
import { LiveObjectVersionModel } from './liveObjectVersionModel';

export const resourceInstances = [new NamespaceModel(), new ContractModel(), new EventVersionModel(), new LiveObjectVersionModel()]