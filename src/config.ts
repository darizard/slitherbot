import dotenv from 'dotenv'

export { twitch, ssl, mysql, jwt }

// environment setup
dotenv.config()
const twitch = {
    clientId: String(process.env.TWITCH_CLIENT_ID),
    clientSecret: String(process.env.TWITCH_CLIENT_SECRET),
    eventsubSecret: String(process.env.TWITCH_EVENTSUB_SECRET)
}
const ssl = {
    privateKeyPath: String(process.env.SSL_PRIVATE_KEY_PATH),
    certificatePath: String(process.env.SSL_CERTIFICATE_PATH),
    hostName: String(process.env.HOST_NAME)
}
const mysql = {
    host: String(process.env.HOST),
    port: Number(process.env.PORT),
    user: String(process.env.USER),
    password: String(process.env.PASSWORD),
    database: String(process.env.DATABASE)
}
const jwt = {
    secret: String(process.env.JWT_SECRET)
}