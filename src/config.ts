import dotenv from 'dotenv'

export { appConfig, twitchConfig, sslConfig, mysqlConfig, jwtConfig, wsConfig }

const parseString = (v: string | undefined, name: string) => v ? String(v) : undefined
const parseNumber = (v: string | undefined) => v ? Number(v) : undefined

dotenv.config({ path: `/opt/slitherbot/src/config/paths` })
dotenv.config({ path: getEnvVar('SECURE_ENV_PATH', parseString) })

const appConfig = {
    appPath: getEnvVar('APP_PATH', parseString)
}

const twitchConfig = {
    clientId: getEnvVar('TWITCH_CLIENT_ID', parseString),
    clientSecret: getEnvVar('TWITCH_CLIENT_SECRET', parseString),
    eventsubSecret: getEnvVar('TWITCH_EVENTSUB_SECRET', parseString)
}

const sslConfig = {
    privateKeyPath: getEnvVar('SSL_PRIVATE_KEY_PATH', parseString),
    certificatePath: getEnvVar('SSL_CERTIFICATE_PATH', parseString),
    hostName: getEnvVar('HOST_NAME', parseString)
}

const mysqlConfig = {
    host: getEnvVar('DB_HOST', parseString),
    user: getEnvVar('DB_USER', parseString),
    port: getEnvVar('DB_PORT', parseNumber),
    password: getEnvVar('DB_PASSWORD', parseString),
    database: getEnvVar('DB_NAME', parseString),
    databaseUrl: getEnvVar('DB_URL', parseString)
}

const jwtConfig = {
    refreshSecret: getEnvVar('JWT_REFRESH_SECRET', parseString),
    accessSecret: getEnvVar('JWT_ACCESS_SECRET', parseString)
}

const wsConfig = {
    controllerSecret: getEnvVar('CONTROLLER_WEBSOCKET_SECRET', parseString),
    alertsSecret: getEnvVar('ALERTS_WEBSOCKET_SECRET', parseString)
}

// Gets an environment variable with the given name and casts it to the correct type.
// Uses the primitive constructor for String or Number to parse how the value should
// be stored.
function getEnvVar<T>(varName: string, parser: (value: string | undefined, name: string) => T) {
    const val = parser(process.env[varName], varName)
    if(!val) throw new Error(`EnvVarUndefined: ${varName}`)
    return val
}

// TODO: Add Result Pattern elements to error handling across the application. Decide how to
// distribute this code throughout the various components of the app. Might be advisable to
// implement the full app refactor first, separating the routes, services, middleware etc

// type Result<S, E extends {reason: string}> = [E, null] | [null, S]

// function ok<S>(data: S): Result<S, never> {
//     return [null, data]
// }

// function err<const R extends string, E extends { reason: R }>(error: E): Result<never, E> {
//     return [error, null]
// }