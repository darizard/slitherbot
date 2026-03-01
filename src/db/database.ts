import { Kysely, MysqlDialect } from 'kysely'
import { DB } from 'kysely-codegen'
import { createPool } from 'mysql2'
import { mysql as mysqlConfig } from '../config.js'

// Exported to make queries
export const db = new Kysely<DB>({
    dialect: new MysqlDialect({
        pool: createPool({
            database: mysqlConfig.database,
            host: mysqlConfig.host,
            user: mysqlConfig.user,
            password: mysqlConfig.password,
            connectionLimit: 10
        })
    })
})