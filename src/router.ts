import slitherRoutes from './routes/slither.js'
import cssRoutes from './routes/css.js'
import jsRoutes from './routes/js.js'
import { Express } from 'express'

export default addRoutes;

export function addRoutes(app: Express) {
    app.use('/slither', slitherRoutes.router)
    app.use('/slither/css', cssRoutes.router)
    app.use('/slither/js', jsRoutes.router)
}