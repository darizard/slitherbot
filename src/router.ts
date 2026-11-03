import slitherRouter from './routes/slither.js'
import cssRouter from './routes/css.js'
import jsRouter from './routes/js.js'
import { Express } from 'express'

export default addRoutes

export function addRoutes(app: Express) {
    app.use('/slither', slitherRouter)
    app.use('/slither/css', cssRouter)
    app.use('/slither/js', jsRouter)
}