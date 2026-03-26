// core imports
import https from 'https'
import fs from 'fs'

// running services
import eventsubclient from './services/eventsubclient.js'
import wsserver from './services/wsserver.js'
import { app } from './app.js'
import { router as slitherRouter } from './routes/slither.js'
import { validateAndRefreshUserAccessTokens } from './services/twitchauth.js'

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
	await eventsubclient.initialize()
	runServices()

})

async function runServices() {

	validateAndRefreshUserAccessTokens()
	setInterval(() => {
		validateAndRefreshUserAccessTokens()
	}, 60 * 60 * 1000) // Validate tokens every hour

}
