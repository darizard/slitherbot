// core packages
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join as pathJoin } from 'path'
import cookieParser from 'cookie-parser'

// API routes
import addRoutes from './router.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Express app setup
const app = express()
app.set('view engine', 'ejs') // set EJS as view engine
app.set('views', pathJoin(__dirname, 'views')) // set views directory for EJS templates

app.use(cookieParser())

// Define Routes
addRoutes(app)

export { app }