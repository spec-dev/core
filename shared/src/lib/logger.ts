import Bugsnag from '@bugsnag/js'
import config from './config'
import chalk from 'chalk'
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
        console.log(this._prefix(), ...args)
    }

    warn(...args) {
        console.warn(this._prefix(), chalk.yellow(...args))
    }

    error(...args) {
        console.error(this._prefix(), chalk.red(...args))
        useBS && Bugsnag.notify(args.join(' '))
    }

    notify(...args) {
        this.info(...args)
        useBS && Bugsnag.notify(args.join(' '))
    }

    _prefix(): string {
        return chalk.gray(new Date().toISOString())
    }
}

const logger = new Logger()

export default logger
