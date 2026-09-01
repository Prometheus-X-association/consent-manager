# ---------------------------------------------------------------------------
# Production image for the Visions consent-manager.
#
# Unlike a dev image, this compiles TypeScript at BUILD time (not at container
# startup) and runs the compiled output as a non-root user (uid/gid 10100), so
# it works under a hardened deployment (runAsNonRoot + readOnlyRootFilesystem).
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Stage 1: pack the `contract-agent` tarball from the public GitHub repo.
#
# `contract-agent` lives in a subdirectory of a public repo and is referenced
# from package.json as `file:./vendor/contract-agent.tgz`. The subdirectory
# commits its own dist/ and declares "files": ["dist"], so `npm pack` yields a
# complete, installable tarball with no build step.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS contract-agent-builder

ARG CONTRACT_AGENT_REPO=https://github.com/VisionsOfficial/contract-consent-agent
ARG CONTRACT_AGENT_REF=v1.0.0-beta.3
ARG CONTRACT_AGENT_SUBDIR=contract-agent

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /out \
 && git clone --depth 1 --branch "${CONTRACT_AGENT_REF}" \
      "${CONTRACT_AGENT_REPO}" /tmp/contract-consent-agent \
 && cd "/tmp/contract-consent-agent/${CONTRACT_AGENT_SUBDIR}" \
 && npm pack --pack-destination /out \
 && mv /out/*.tgz /out/contract-agent.tgz

# ---------------------------------------------------------------------------
# Stage 2: install dependencies and compile the app (tsc -> dist).
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
ENV MONGOMS_DISABLE_POSTINSTALL=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# the contract-agent tarball referenced from package.json, in place before install
COPY --from=contract-agent-builder /out/contract-agent.tgz ./vendor/contract-agent.tgz

# install deps first (cached unless package.json changes); the `postinstall`
# hook sets a git hooks path, so a git repo must exist
COPY package.json ./
RUN git init -q \
 && npm install --unsafe-perm

# app sources, then compile to dist/
COPY . .
RUN npm run build

# runtime signing keys (the app reads them from dist/src/config/keys at runtime)
RUN npm run generatePrivateKey \
 && npm run generateAES \
 && npm run generatePublicKey \
 && npm run copyKeys

# setupEnvironment() insists a .env file exists; dotenv does NOT override real
# environment variables, so a placeholder satisfies the check while all config
# comes from the container environment (k8s).
RUN printf '# configuration is provided via the container environment (k8s)\n' > .env

# ---------------------------------------------------------------------------
# Stage 3: slim runtime - compiled app, non-root, read-only-fs friendly.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /usr/src/app

# non-root user matching the chart securityContext (runAsUser/fsGroup 10100)
RUN groupadd -g 10100 app \
 && useradd -u 10100 -g 10100 -m -s /usr/sbin/nologin app

COPY --from=build --chown=10100:10100 /usr/src/app /usr/src/app

USER 10100
EXPOSE 3000
CMD ["node", "dist/src/index.js"]
