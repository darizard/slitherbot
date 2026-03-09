import type { Config } from 'kysely-codegen'

const config = {
    overrides: {
        columns: {
            'Users.scopes': 'string[]'
        }
    }
} satisfies Config

export default config