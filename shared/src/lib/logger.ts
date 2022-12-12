import Bugsnag from '@bugsnag/js'
import config from './config'

const useBS = !!config.BUGSNAG_API_KEY
useBS && Bugsnag.start(config.BUGSNAG_API_KEY)

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
