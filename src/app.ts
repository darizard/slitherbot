// core packages
import express from 'express'
import https from 'https'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join as pathJoin } from 'path'

// running services
import eventsubclient from './services/eventsubclient.js'
import wsserver from './websocket/wsserver.js'

// API routes
import testroutes from './routes/test.js'
import twitchroutes from './routes/twitch.js'

// credentials (need SQL and SSL here)
import { ssl as sslConfig } from './config.js'

//-----EXECUTE-----
main();

//-----FUNCTIONS-----
function main() {
	const __filename = fileURLToPath(import.meta.url)
	const __dirname = dirname(__filename)

	// express app setup
	const app = express()
	app.set('view engine', 'ejs') // set EJS as view engine
	app.set('views', pathJoin(__dirname, 'views')) // set views directory for EJS templates
	
	app.use('/test', testroutes.router)
	app.use('/twitch', twitchroutes.router)

	// SSL Credentials to start server
	const options = {
		key: fs.readFileSync(sslConfig.privateKeyPath),
		cert: fs.readFileSync(sslConfig.certificatePath)
	}

	// create HTTP server
	const httpServer = https.createServer(options, app)
	// initialize WebSocket server with the HTTP server
	wsserver.init(httpServer)
	// listen!
	httpServer.listen(8080, () => {
		console.log('HTTPS Server running on port 8080')
	})
	eventsubclient.connect()
}