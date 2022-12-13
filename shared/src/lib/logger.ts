import Bugsnag from '@bugsnag/js'
import config from './config'
import { ev } from './utils/env'

const useBS = !!config.BUGSNAG_API_KEY
const bsConfig =
    useBS && ev('CHAIN_ID')
        ? {
              onError: (event) => {
                  event.addMetadata('chain', { id: ev('CHAIN_ID') })
              },
          }
        : {}
useBS &&
    Bugsnag.start({
        apiKey: config.BUGSNAG_API_KEY,
        ...bsConfig,
    })

class Logger {
    info(...args) {
        console.log(...args)
    }

    warn(...args) {
        console.warn(...args)
    }

    error(...args) {
        console.error(...args)
        useBS && Bugsnag.notify(args.join(' '))
    }
}

const logger = new Logger()

export default logger
