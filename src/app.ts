// core packages
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join as pathJoin } from 'path'

// API routes
import slitherRoutes from './routes/slither.js'
import cssRoutes from './routes/css.js'
import jsRoutes from './routes/js.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Express app setup
const app = express()
app.set('view engine', 'ejs') // set EJS as view engine
app.set('views', pathJoin(__dirname, 'views')) // set views directory for EJS templates

// Define Routes
app.use('/slither/css', cssRoutes.router)
app.use('/slither/js', jsRoutes.router)
app.use('/slither', slitherRoutes.router)

export { app }