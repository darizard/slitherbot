import authRouter from './routes/auth.js'
import alertsRouter from './routes/alerts.js'
import cssRouter from './routes/css.js'
import demoRouter from './routes/demo.js'
import eventsRouter from './routes/events.js'
import jsRouter from './routes/js.js'
import publicRouter from './routes/public.js'
import slitherRouter from './routes/slither.js'
import { Express } from 'express'

export default addRoutes

export function addRoutes(app: Express) {
    app.use('/slither/alerts', alertsRouter)
    app.use('/slither/auth', authRouter)
    app.use('/slither/css', cssRouter)
    app.use('/slither/demo', demoRouter)
    app.use('/slither/event', eventsRouter)
    app.use('/slither/js', jsRouter)
    app.use('/slither/public', publicRouter)
    app.use('/slither', slitherRouter)
}