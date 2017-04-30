# SYNOPSIS
An airdrop clone

# AVATAR
Add an image at ~/avatar

# BUILD

You need to rebuild for latest electron

# RUN
To run the app, use the bin in the `node_modules` directory.

```bash
./node_modules/.bin/electron ./index.js
```

or run with nodemon to restart on changes

```bash
./node_modules/.bin/nodemon ./node_modules/.bin/electron ./index.js
```

which is also wrapped with

```bash
npm start
```
