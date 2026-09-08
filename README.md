# PlayHex moderation

List last chat messages and nicknames, take moderation action to moderate a chat message and/or block player chat.

## Install

- Install dependencies: `npm install`
- Start the dev server: `npm run dev`, then go to `http://localhost:3001`
  - The server watches for file changes and restarts automatically
  - You can override the port with `PORT=8080 npm run dev`
- In your playhex `.env`, allow cors by adding moderation app url, and add a moderator password (admin password works too):

```
CORS_ALLOWED_ORIGINS=http://localhost:3001
MODERATOR_PASSWORD=myPassword
```

Now you can moderate your PlayHex instance, logins are:

- **API base Url**: your PlayHex instance (e.g `http://localhost:3001`)
- **Moderator API key**: your moderator password from .env (e.g `myPassword`)

Dates when messages, new accounts and avatars have been marked as seen are stored on the server
(and no longer in the browser local storage), so they stay synchronized between all your devices.

On the "Tournaments featuring" page, editing or canceling a tournament goes through the admin API,
so you must be logged in with the **admin** password (`ADMIN_PASSWORD` in .env) and not the moderator one.

## Screenshots

All last chat messages from any are listed, so moderators can easily review all new messages at once:

![Last messages list](screenshots/last-messages.png)

If a message needs moderation action, moderator can display a warning to the player with the moderation reason,
and also block player chat for a period. Past warning and chat blocks are also displayed to the moderator.

![Last messages list](screenshots/take-action.png)

Last nicknames are also listed.

![Last messages list](screenshots/last-nicknames.png)
