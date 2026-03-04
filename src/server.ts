// core imports
import https from 'https'
import fs from 'fs'

// running services
import eventsubclient from './services/eventsubclient.js'
import wsserver from './websocket/wsserver.js'
import { app } from './app.js'
import { router as twitchRouter } from './routes/twitch.js'

// credentials (need SQL and SSL here)
import { ssl as sslConfig } from './config.js'

// SSL Credentials to start server
const options = {
	key: fs.readFileSync(sslConfig.privateKeyPath),
	cert: fs.readFileSync(sslConfig.certificatePath)
}

// create HTTP server
const httpServer = https.createServer(options, app)

// initialize WebSocket server with the HTTP server
wsserver.init(httpServer)

// Listen!
httpServer.listen(8080, async () => {
	console.log('HTTPS Server running on port 8080')
	await eventsubclient.connect(twitchRouter)
})