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
import twitchroutes from './routes/twitch.js'
import cssroutes from './routes/css.js'
import jsroutes from './routes/js.js'

// credentials (need SQL and SSL here)
import { ssl as sslConfig } from './config.js'
import { collapseTextChangeRangesAcrossMultipleVersions } from 'typescript'

//-----EXECUTE-----
main();

//-----FUNCTIONS-----
function main() {
	const __filename = fileURLToPath(import.meta.url)
	const __dirname = dirname(__filename)

	// Express app setup
	const app = express()
	app.set('view engine', 'ejs') // set EJS as view engine
	app.set('views', pathJoin(__dirname, 'views')) // set views directory for EJS templates
	
	// Define Routes
	app.use('/twitch/css', cssroutes.router)
	app.use('/twitch/js', jsroutes.router)
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

	// Listen!
	httpServer.listen(8080, () => {
		console.log('HTTPS Server running on port 8080')
	})

	// Connect to Twitch's EventSub service
	eventsubclient.connect()
}