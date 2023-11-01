import { NamespaceModel } from './namespaceModel';
import { ContractModel } from './contractModel';
import { LiveObjectVersionModel } from './liveObjectVersionModel';
import { EventModel } from './eventModel';

export const resourceInstances = [new LiveObjectVersionModel(), new ContractModel(), new NamespaceModel(), new EventModel()]