# Use the official Node.js image as base image
FROM node:16

RUN addgroup -S nonroot \
    && adduser -S nonroot -G nonroot

USER nonroot

# Install pnpm globally
RUN npm install --ignore-scripts -g pnpm

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app/

RUN git init

## Bundle app source
COPY ./src /usr/src/app

# Install app dependencies
RUN pnpm install --ignore-scripts

# Expose the port on which the app will run
EXPOSE 3000

# Command to run the application
CMD sh -c "npm run build && npm run copyKeys && npm run start"
