# SYNOPSIS
An airdrop clone

# AVATAR
Add an image at ~/avatar

# BUILD

You need to rebuild for latest electron

```bash
node-gyp rebuild --target=1.6.6 --arch=x64 --dist-url="https://atom.io/download/atom-shell" --abi=53
```

# RUN
To run the app, use the bin in the `node_modules` directory.

```bash
/node_modules/.bin/electron ./index.js
```

