FROM node:22-alpine AS build
RUN apk add --no-cache build-base python3
RUN npm install -g pnpm@11.24.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json server.mjs invite.mjs reset.mjs smoke.mjs ./
ENV NODE_ENV=production
ENV PDS_PORT=3000
ENV PDS_DATA_DIRECTORY=/data
ENV PDS_BLOBSTORE_DISK_LOCATION=/data/blobs
VOLUME /data
EXPOSE 3000
CMD ["node", "server.mjs"]
