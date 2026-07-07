# Slither Twitch Helper - v0.1

Slither is a remote-hosted Twitch alerts handling application. It currently features the ability to listen to Twitch EventSub events and display an alert according to event type in a browser, similar to StreamElements or StreamLabs.

v0.1 implements alert display and configuration, EventSub integration and maintenance, and secure authentication in all layers of the stack.

Thanks for looking. :\)

## A Note on LLM Usage

This project was developed partially with assistance from an LLM.

### What the LLM provided:
- The occasional code snippet--fewer than half a dozen--especially examples of how to use a package or API in the face of confusing or cumbersome documentation. Occasionally, the code the LLM generated made it directly into the project source
- Explanations about packages, frameworks, software patterns, and common project structures, and how they might apply to a project of Slither's scale and scope
- Assistance understanding TypeScript configuration (yes, this gets its own mention)
- Security analyses

### What the LLM did NOT provide:
- Entire functions, services, classes, types, endpoints, or source files
- Data structure decisions
- Database design
- Front-end modules
- Authentication and security implementation details
- Hosting, web server, and reverse proxy implementation

## Future Plans

- Live alert testing / previews on stream
- Alert queueing
- Support for all different custom channel point rewards

## Features

- 🎉 Real-time Twitch alerts via EventSub events:
  - Bits received
  - Channel Point Rewards redeemed or updated
  - Viewer follows the channel
  - Hype Train start/end
  - Incoming raids
  - New, Continued, and Gifted subscriptions
- 🔒 Secure multi-layer authentication with OAuth 2.0 and server-issued JWTs
- ⚡ Low-latency WebSocket delivery
- 🖥️ Easy integration with most streaming software
- ⚙️ Dashboard interface for instant alert configuration

## Tech Stack

- Apache2 Web Server with SSL and Reverse Proxy
- MySQL relational database
- Type-safe Kysely SQL query builder
- Pure TypeScript--no raw JavaScript source files
- Node.js backend services
- Express.js routes and middleware
- EJS for HTML templating and server data ingestion
- Vanilla CSS styling

### Project Structure

```
public/             # Static assets
    └── css/        # Front-end styling
resources/          # Media used to play alerts
src/                # Server code
├── classes/        # Custom classes for abstraction
├── client/         # Front-end TypeScript files
├── db/             # Database and Kysely config
    └── queries/    # DB Queries
├── middleware/     # Express.js middleware
├── routes/         # Route controllers
├── services/       # Business logic
├── types/          # TypeScript type definitions
└── views/          # EJS templates
    └── slither/    # Twitch-related pages
```

## License

This project is licensed under the MIT License - see [LICENSE.md](LICENSE.md) for details.

## Acknowledgments

- [Twitch](https://dev.twitch.tv) for their EventSub API and friendly documentation
- [Kysely](https://kysely.dev/) for supporting TypeScript on the DB side
- [Twurple](https://twurple.js.org) for their excellent Twitch API wrapper that initially helped this project get started!