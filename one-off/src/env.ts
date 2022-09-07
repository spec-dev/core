export const ev = (name, fallback = null) =>
    process.env.hasOwnProperty(name) ? process.env[name] : fallback

export const specEnvs = {
    LOCAL: 'local',
    STAGING: 'staging',
    PROD: 'prod',
}