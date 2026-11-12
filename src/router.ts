import authRouter from './routes/auth.js'
import alertsRouter from './routes/alerts.js'
import cssRouter from './routes/css.js'
import eventsRouter from './routes/events.js'
import jsRouter from './routes/js.js'
import mediaRouter from './routes/public.js'
import slitherRouter from './routes/slither.js'
import { Express } from 'express'

export default addRoutes

export function addRoutes(app: Express) {
    app.use('/slither/alerts', alertsRouter)
    app.use('/slither/auth', authRouter)
    app.use('/slither/css', cssRouter)
    app.use('/slither/event', eventsRouter)
    app.use('/slither/js', jsRouter)
    app.use('/slither/public', mediaRouter)
    app.use('/slither', slitherRouter)
}