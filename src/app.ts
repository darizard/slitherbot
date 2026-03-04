// core packages
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join as pathJoin } from 'path'

// API routes
import twitchroutes from './routes/twitch.js'
import cssroutes from './routes/css.js'
import jsroutes from './routes/js.js'

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

export { app }