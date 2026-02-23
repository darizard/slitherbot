// Types for Kysely database models
import {
    ColumnType,
    Generated,
    Insertable,
    JSONColumnType,
    Selectable,
    Updateable
} from 'kysely';

// Schema definition for 'User' table
export interface UserTable {
    channel_id: ColumnType<string, string, never>;
    access_token: ColumnType<string, string>;
    refresh_token: ColumnType<string, string>;
    scopes: JSONColumnType<string[], string[]>;
    expires_in: ColumnType<number>;
    obtainment_timestamp: ColumnType<number, number>;
}

// Define types for Select, Insert, and Update queries
export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;