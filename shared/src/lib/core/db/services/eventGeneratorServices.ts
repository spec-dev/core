import { EventGenerator, EventGeneratorParentType } from '../entities/EventGenerator'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'

const eventGenerators = () => CoreDB.getRepository(EventGenerator)

export async function createEventGenerator(
    parentId: number,
    discriminator: EventGeneratorParentType,
    name: string,
    url: string
): Promise<EventGenerator> {
    const eventGenerator = new EventGenerator()
    eventGenerator.uid = uuid4()
    eventGenerator.parentId = parentId
    eventGenerator.discriminator = discriminator
    eventGenerator.name = name
    eventGenerator.url = url

    try {
        await eventGenerators().save(eventGenerator)
    } catch (err) {
        logger.error(
            `Error creating EventGenerator(name=${name}) for ${discriminator}(id=${parentId}): ${err}`
        )
        throw err
    }

    return eventGenerator
}
