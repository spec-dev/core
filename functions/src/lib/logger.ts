class Logger {
    info(...args) {
        console.log(...args)
    }
    warn(...args) {
        console.warn(...args)
    }
    error(...args) {
        console.error(...args)
    }
}

const logger: Logger = new Logger()

export default logger
