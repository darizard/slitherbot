import { createPool } from 'mysql2';
import { Kysely, MysqlDialect } from 'kysely';
import { mysql as mysqlConfig } from '../config.js';

import { UserTable, User, NewUser, UserUpdate } from './models/users.js';

// "Dialect" for hooking up Kysely to a MySQL database. Uses mysql2 under the hood.
const dialect = new MysqlDialect({
    pool: createPool({
        database: mysqlConfig.database,
        host: mysqlConfig.host,
        user: mysqlConfig.user,
        password: mysqlConfig.password,
        connectionLimit: 10
    })
});

// Exported to make queries
export const db = new Kysely<Database>({
    dialect
});

// List of tables in our Database
interface Database {
    Users: UserTable;
}

// Context types for convenience in queries
export interface UserContext {
    User: User,
    NewUser: NewUser,
    UserUpdate: UserUpdate
}